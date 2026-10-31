import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { runWorkerOnce } from '../modules/jobs/worker.js';
import { createRegistry } from '../providers/registry.js';
import { LocalStorage } from '../modules/storage/local.js';
import { fixtureTTS, fixtureSTT } from '../providers/fixture/index.js';
import { resetDb, closeDb } from '../db/test-utils.js';
import { db } from '../db/client.js';
import { assets } from '../db/schema.js';

async function setup(tts = [fixtureTTS]) {
  const root = await mkdtemp(join(tmpdir(), 'aural-tts-'));
  const storage = new LocalStorage(root, 'test');
  const registry = createRegistry({ tts, stt: [fixtureSTT], defaultTts: tts[0].id });
  const server = buildServer({ registry, storage });
  return { server, registry, storage };
}

async function createSession(server: FastifyInstance): Promise<string> {
  const res = await server.inject({ method: 'GET', url: '/api/v1/session' });
  return res.cookies.find((c) => c.name === 'aural_sid')!.value;
}

async function streamSize(stream: ReadableStream): Promise<number> {
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
  }
  return total;
}

beforeEach(resetDb);
afterAll(closeDb);

test('creates, runs and completes a TTS job', async () => {
  const { server, registry, storage } = await setup();
  const sid = await createSession(server);
  const cookies = { aural_sid: sid };

  const created = await server.inject({
    method: 'POST',
    url: '/api/v1/tts/jobs',
    cookies,
    payload: { text: '你好', engineId: 'fixture', voiceId: 'fixture:default' },
  });
  expect(created.statusCode).toBe(202);
  expect(created.json().status).toBe('queued');
  const jobId = created.json().jobId;

  expect(await runWorkerOnce({ registry, storage })).toBe(true);

  const job = await server.inject({
    method: 'GET',
    url: `/api/v1/jobs/${jobId}`,
    cookies,
  });
  expect(job.json().status).toBe('succeeded');
  expect(job.json().progress).toBeNull();
  const assetId = job.json().output.assetId;
  expect(assetId).toBeTruthy();
  expect(job.json().output.durationMs).toBeGreaterThanOrEqual(2500);
  expect(job.json().output.durationMs).toBeLessThanOrEqual(3500);

  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  expect(asset).toBeTruthy();
  expect(asset!.peaks).toHaveLength(120);
  expect(asset!.durationMs).toBeGreaterThanOrEqual(2500);
  expect(asset!.durationMs).toBeLessThanOrEqual(3500);
  expect(await streamSize(await storage.getStream(asset!.audioKey))).toBeGreaterThan(1000);
});

test('rejects blank text, over-limit text, and a second active job', async () => {
  const { server } = await setup();
  const sid = await createSession(server);
  const cookies = { aural_sid: sid };

  const blank = await server.inject({
    method: 'POST',
    url: '/api/v1/tts/jobs',
    cookies,
    payload: { text: '   ', engineId: 'fixture', voiceId: 'fixture:default' },
  });
  expect(blank.statusCode).toBe(400);

  const over = await server.inject({
    method: 'POST',
    url: '/api/v1/tts/jobs',
    cookies,
    payload: { text: 'a'.repeat(5001), engineId: 'fixture', voiceId: 'fixture:default' },
  });
  expect(over.statusCode).toBe(400);
  expect(over.json().error.code).toBe('TEXT_TOO_LONG');

  const first = await server.inject({
    method: 'POST',
    url: '/api/v1/tts/jobs',
    cookies,
    payload: { text: '第一', engineId: 'fixture', voiceId: 'fixture:default' },
  });
  expect(first.statusCode).toBe(202);

  const second = await server.inject({
    method: 'POST',
    url: '/api/v1/tts/jobs',
    cookies,
    payload: { text: '第二', engineId: 'fixture', voiceId: 'fixture:default' },
  });
  expect(second.statusCode).toBe(429);
  expect(second.json().error.code).toBe('RATE_LIMITED');
});

test('maps a concurrent second active job in the same session to 429', async () => {
  const { server } = await setup();
  const sid = await createSession(server);
  const cookies = { aural_sid: sid };
  const payload = { text: '并发', engineId: 'fixture', voiceId: 'fixture:default' };

  const [first, second] = await Promise.all([
    server.inject({ method: 'POST', url: '/api/v1/tts/jobs', cookies, payload }),
    server.inject({ method: 'POST', url: '/api/v1/tts/jobs', cookies, payload }),
  ]);

  expect([first.statusCode, second.statusCode].sort()).toEqual([202, 429]);

  const limited = first.statusCode === 429 ? first : second;
  expect(limited.json().error.code).toBe('RATE_LIMITED');
  expect(limited.json().error.message).toBe('当前会话已有进行中的任务');
});

test('enforces a provider cap below 5000', async () => {
  const capped = {
    ...fixtureTTS,
    id: 'capped',
    capabilities: { ...fixtureTTS.capabilities, maxCharsPerRequest: 10 },
    listVoices: async () => [{ ...(await fixtureTTS.listVoices())[0], engineId: 'capped' }],
  };
  const { server } = await setup([fixtureTTS, capped]);
  const sid = await createSession(server);

  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/tts/jobs',
    cookies: { aural_sid: sid },
    payload: { text: 'a'.repeat(11), engineId: 'capped', voiceId: 'capped:default' },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error.code).toBe('TEXT_TOO_LONG');
});

test('does not expose a job to another session', async () => {
  const { server } = await setup();
  const sidA = await createSession(server);

  const created = await server.inject({
    method: 'POST',
    url: '/api/v1/tts/jobs',
    cookies: { aural_sid: sidA },
    payload: { text: '你好', engineId: 'fixture', voiceId: 'fixture:default' },
  });
  const jobId = created.json().jobId;

  const sidB = await createSession(server);
  const res = await server.inject({
    method: 'GET',
    url: `/api/v1/jobs/${jobId}`,
    cookies: { aural_sid: sidB },
  });
  expect(res.statusCode).toBe(404);
  expect(res.json().error.code).toBe('NOT_FOUND');
});
