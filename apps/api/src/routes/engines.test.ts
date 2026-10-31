import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { createRegistry } from '../providers/registry.js';
import { LocalStorage } from '../modules/storage/local.js';
import { fixtureSTT, fixtureTTS } from '../providers/fixture/index.js';

let server: FastifyInstance;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'aural-preview-'));
  server = buildServer({
    registry: createRegistry({ tts: [fixtureTTS], stt: [fixtureSTT], defaultTts: 'fixture' }),
    storage: new LocalStorage(root, 'test'),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('lists engines and filters by kind', async () => {
  const engines = await server.inject({ method: 'GET', url: '/api/v1/engines' });
  expect(engines.statusCode).toBe(200);
  expect(engines.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'fixture', kind: 'tts' })]),
  );

  const stt = await server.inject({ method: 'GET', url: '/api/v1/engines?kind=stt' });
  expect(stt.json()).toEqual([expect.objectContaining({ id: 'fixture', kind: 'stt' })]);
});

test('lists voices and filters by name', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/v1/voices?engineId=fixture' });
  expect(res.statusCode).toBe(200);
  expect(res.json().map((voice: { name: string }) => voice.name)).toEqual(['晴川', '沉舟']);

  const filtered = await server.inject({ method: 'GET', url: '/api/v1/voices?engineId=fixture&q=沉' });
  expect(filtered.json().map((voice: { name: string }) => voice.name)).toEqual(['沉舟']);
});

test('preview is synthesized once and then cached', async () => {
  const spy = vi.spyOn(fixtureTTS, 'synthesize');

  const first = await server.inject({
    method: 'GET',
    url: '/api/v1/voices/fixture%3Adefault/preview',
  });
  const second = await server.inject({
    method: 'GET',
    url: '/api/v1/voices/fixture%3Adefault/preview',
  });

  expect(spy).toHaveBeenCalledTimes(1);
  expect(first.statusCode).toBe(302);
  expect(second.statusCode).toBe(302);

  const location = String(first.headers.location);
  expect(location).toContain('/api/v1/files/preview/fixture/default.mp3');

  const fileUrl = new URL(location);
  const file = await server.inject({
    method: 'GET',
    url: `${fileUrl.pathname}${fileUrl.search}`,
  });
  expect(file.statusCode).toBe(200);
  expect(file.headers['content-type']).toContain('audio/mpeg');
  expect(file.rawPayload.length).toBeGreaterThan(1000);
});

test('voices with a previewUrl redirect to it without synthesis', async () => {
  const remoteTTS = {
    ...fixtureTTS,
    id: 'remote',
    listVoices: async () => [
      {
        id: 'v1',
        engineId: 'remote',
        name: '远端',
        language: 'zh',
        enabled: true,
        previewUrl: 'https://cdn.example.com/v1.mp3',
      },
    ],
  };
  const root = await mkdtemp(join(tmpdir(), 'aural-preview-'));
  const custom = buildServer({
    registry: createRegistry({ tts: [remoteTTS], stt: [fixtureSTT], defaultTts: 'remote' }),
    storage: new LocalStorage(root, 'test'),
  });
  const spy = vi.spyOn(remoteTTS, 'synthesize');

  const res = await custom.inject({ method: 'GET', url: '/api/v1/voices/remote%3Av1/preview' });
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe('https://cdn.example.com/v1.mp3');
  expect(spy).not.toHaveBeenCalled();
});

test('rejects unknown engines and voices with INVALID_ARGUMENT', async () => {
  const noEngine = await server.inject({ method: 'GET', url: '/api/v1/voices' });
  expect(noEngine.statusCode).toBe(400);
  expect(noEngine.json().error.code).toBe('INVALID_ARGUMENT');

  const engine = await server.inject({ method: 'GET', url: '/api/v1/voices?engineId=nope' });
  expect(engine.statusCode).toBe(400);
  expect(engine.json().error.code).toBe('INVALID_ARGUMENT');

  const voice = await server.inject({
    method: 'GET',
    url: '/api/v1/voices/fixture%3Anope/preview',
  });
  expect(voice.statusCode).toBe(400);
  expect(voice.json().error.code).toBe('INVALID_ARGUMENT');

  const previewEngine = await server.inject({
    method: 'GET',
    url: '/api/v1/voices/nope%3Adefault/preview',
  });
  expect(previewEngine.statusCode).toBe(400);
  expect(previewEngine.json().error.code).toBe('INVALID_ARGUMENT');
});
