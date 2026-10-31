import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { runWorkerOnce } from '../modules/jobs/worker.js';
import { createRegistry } from '../providers/registry.js';
import { LocalStorage } from '../modules/storage/local.js';
import { fixtureTTS, fixtureSTT } from '../providers/fixture/index.js';
import { resetDb, closeDb } from '../db/test-utils.js';

const disposers: Array<() => Promise<void>> = [];

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'aural-assets-'));
  const storage = new LocalStorage(root, 'test');
  const registry = createRegistry({ tts: [fixtureTTS], stt: [fixtureSTT], defaultTts: 'fixture' });
  const server = buildServer({ registry, storage });
  disposers.push(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  return { server, registry, storage };
}

async function session(server: FastifyInstance): Promise<string> {
  const res = await server.inject({ method: 'GET', url: '/api/v1/session' });
  return res.cookies.find((c) => c.name === 'aural_sid')!.value;
}

async function createPodcast(server: FastifyInstance, sid: string): Promise<string> {
  const created = await server.inject({
    method: 'POST',
    url: '/api/v1/tts/jobs',
    cookies: { aural_sid: sid },
    payload: { text: '你好', engineId: 'fixture', voiceId: 'fixture:default' },
  });
  return created.json().jobId as string;
}

async function createAsset(
  server: FastifyInstance,
  registry: ReturnType<typeof createRegistry>,
  storage: LocalStorage,
  sid: string,
): Promise<string> {
  const jobId = await createPodcast(server, sid);
  expect(await runWorkerOnce({ registry, storage })).toBe(true);
  const job = await server.inject({
    method: 'GET',
    url: `/api/v1/jobs/${jobId}`,
    cookies: { aural_sid: sid },
  });
  return job.json().output.assetId as string;
}

beforeEach(resetDb);
afterAll(async () => {
  for (const dispose of disposers) {
    await dispose();
  }
  await closeDb();
});

test('owner is redirected to a signed URL that streams the audio', async () => {
  const { server, registry, storage } = await setup();
  const sid = await session(server);
  const assetId = await createAsset(server, registry, storage, sid);

  const res = await server.inject({
    method: 'GET',
    url: `/api/v1/assets/${assetId}/audio`,
    cookies: { aural_sid: sid },
  });
  expect(res.statusCode).toBe(302);

  const location = res.headers.location as string;
  expect(location).toBeTruthy();
  const signed = new URL(location, 'http://localhost');
  const served = await server.inject({ method: 'GET', url: `${signed.pathname}${signed.search}` });
  expect(served.statusCode).toBe(200);
  expect(served.headers['content-type']).toMatch(/^audio\/mpeg/);
  expect(served.rawPayload.length).toBeGreaterThan(1000);
});

test('another session cannot read the asset', async () => {
  const { server, registry, storage } = await setup();
  const sidA = await session(server);
  const sidB = await session(server);
  const assetId = await createAsset(server, registry, storage, sidA);

  const resB = await server.inject({
    method: 'GET',
    url: `/api/v1/assets/${assetId}/audio`,
    cookies: { aural_sid: sidB },
  });
  expect(resB.statusCode).toBe(404);
});

test('a tampered signature is forbidden', async () => {
  const { server, registry, storage } = await setup();
  const sid = await session(server);
  const assetId = await createAsset(server, registry, storage, sid);

  const res = await server.inject({
    method: 'GET',
    url: `/api/v1/assets/${assetId}/audio`,
    cookies: { aural_sid: sid },
  });
  const signed = new URL(res.headers.location as string, 'http://localhost');
  signed.searchParams.set('token', 'deadbeef');

  const served = await server.inject({
    method: 'GET',
    url: `${signed.pathname}${signed.search}`,
  });
  expect(served.statusCode).toBe(403);
  expect(served.json().error.code).toBe('FORBIDDEN');
});
