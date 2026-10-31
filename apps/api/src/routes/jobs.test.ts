import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { claimNextJob } from '../modules/jobs/queue.js';
import { createRegistry } from '../providers/registry.js';
import { LocalStorage } from '../modules/storage/local.js';
import { fixtureTTS, fixtureSTT } from '../providers/fixture/index.js';
import { resetDb, closeDb } from '../db/test-utils.js';

const disposers: Array<() => Promise<void>> = [];

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'aural-jobs-'));
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

beforeEach(resetDb);
afterAll(async () => {
  for (const dispose of disposers) {
    await dispose();
  }
  await closeDb();
});

test('cancel moves a queued job to cancelled', async () => {
  const { server } = await setup();
  const sid = await session(server);
  const jobId = await createPodcast(server, sid);

  const res = await server.inject({
    method: 'DELETE',
    url: `/api/v1/jobs/${jobId}`,
    cookies: { aural_sid: sid },
  });
  expect(res.statusCode).toBe(200);

  const job = await server.inject({
    method: 'GET',
    url: `/api/v1/jobs/${jobId}`,
    cookies: { aural_sid: sid },
  });
  expect(job.json().status).toBe('cancelled');
  expect(job.json().finishedAt).toBeTruthy();
});

test('a foreign session cannot cancel the job', async () => {
  const { server } = await setup();
  const sidA = await session(server);
  const sidB = await session(server);
  const jobId = await createPodcast(server, sidA);

  const res = await server.inject({
    method: 'DELETE',
    url: `/api/v1/jobs/${jobId}`,
    cookies: { aural_sid: sidB },
  });
  expect(res.statusCode).toBe(404);
  expect(res.json().error.code).toBe('NOT_FOUND');
});

test('a running job cannot be cancelled', async () => {
  const { server } = await setup();
  const sid = await session(server);
  const jobId = await createPodcast(server, sid);

  const claimed = await claimNextJob();
  expect(claimed?.id).toBe(jobId);

  const res = await server.inject({
    method: 'DELETE',
    url: `/api/v1/jobs/${jobId}`,
    cookies: { aural_sid: sid },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error.code).toBe('INVALID_ARGUMENT');

  const job = await server.inject({
    method: 'GET',
    url: `/api/v1/jobs/${jobId}`,
    cookies: { aural_sid: sid },
  });
  expect(job.json().status).toBe('running');
});
