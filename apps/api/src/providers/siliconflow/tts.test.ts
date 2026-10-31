import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { HttpResponse, delay, http } from 'msw';
import { setupServer } from 'msw/node';
import { createRegistry } from '../registry.js';
import { siliconflowTTS } from './tts.js';

const API_URL = 'https://api.siliconflow.cn/v1/audio/speech';
const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);

type CapturedRequest = { headers: Headers; body: Record<string, unknown> };
let captured: CapturedRequest | null = null;

const server = setupServer(
  http.post(API_URL, async ({ request }) => {
    captured = {
      headers: request.headers,
      body: (await request.json()) as Record<string, unknown>,
    };
    return HttpResponse.arrayBuffer(MP3_BYTES.buffer as ArrayBuffer, {
      headers: { 'content-type': 'audio/mpeg' },
    });
  }),
);

const ENV_KEYS = [
  'SILICONFLOW_API_KEY',
  'SILICONFLOW_BASE_URL',
  'SILICONFLOW_TTS_MODEL',
  'SILICONFLOW_TTFB_MS',
  'SILICONFLOW_TIMEOUT_MS',
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  captured = null;
  server.resetHandlers();
});
afterAll(() => {
  server.close();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

beforeEach(() => {
  process.env.SILICONFLOW_API_KEY = 'test-key';
  delete process.env.SILICONFLOW_BASE_URL;
  delete process.env.SILICONFLOW_TTS_MODEL;
  delete process.env.SILICONFLOW_TTFB_MS;
  delete process.env.SILICONFLOW_TIMEOUT_MS;
});

describe('siliconflowTTS.synthesize', () => {
  test('posts audio and returns mp3 bytes on success', async () => {
    const result = await siliconflowTTS.synthesize({
      text: '你好',
      voiceId: 'siliconflow:qingchuan',
      speed: 1.25,
    });

    expect(result.format).toBe('mp3');
    expect(result.audio).toBeInstanceOf(Uint8Array);
    expect((result.audio as Uint8Array).byteLength).toBeGreaterThan(0);
    expect(result.durationMs).toBeUndefined();

    expect(captured?.headers.get('authorization')).toBe('Bearer test-key');
    expect(captured?.headers.get('content-type')).toContain('application/json');
    expect(captured?.body).toMatchObject({
      model: expect.any(String),
      input: '你好',
      voice: 'qingchuan',
      response_format: 'mp3',
      speed: 1.25,
    });
  });

  test('maps 401 to UNAUTHORIZED', async () => {
    server.use(http.post(API_URL, () => new HttpResponse(null, { status: 401 })));

    await expect(
      siliconflowTTS.synthesize({ text: '你好', voiceId: 'siliconflow:qingchuan' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('maps 429 to RATE_LIMITED', async () => {
    server.use(http.post(API_URL, () => new HttpResponse(null, { status: 429 })));

    await expect(
      siliconflowTTS.synthesize({ text: '你好', voiceId: 'siliconflow:qingchuan' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  test('maps 500 to PROVIDER_UNAVAILABLE and retries once', async () => {
    let attempts = 0;
    server.use(
      http.post(API_URL, () => {
        attempts += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(
      siliconflowTTS.synthesize({ text: '你好', voiceId: 'siliconflow:qingchuan' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(attempts).toBe(2);
  });

  test('retries once when the ttfb gate expires', async () => {
    process.env.SILICONFLOW_TTFB_MS = '20';
    let attempts = 0;
    server.use(
      http.post(API_URL, async () => {
        attempts += 1;
        await delay(200);
        return HttpResponse.arrayBuffer(MP3_BYTES.buffer as ArrayBuffer);
      }),
    );

    await expect(
      siliconflowTTS.synthesize({ text: '你好', voiceId: 'siliconflow:qingchuan' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    expect(attempts).toBe(2);
  });

  test('does not retry when the total deadline expires', async () => {
    process.env.SILICONFLOW_TIMEOUT_MS = '30';
    process.env.SILICONFLOW_TTFB_MS = '5000';
    let attempts = 0;
    server.use(
      http.post(API_URL, async () => {
        attempts += 1;
        await delay(200);
        return HttpResponse.arrayBuffer(MP3_BYTES.buffer as ArrayBuffer);
      }),
    );

    await expect(
      siliconflowTTS.synthesize({ text: '你好', voiceId: 'siliconflow:qingchuan' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    expect(attempts).toBe(1);
  });

  test('maps an abort to PROVIDER_TIMEOUT', async () => {
    server.use(
      http.post(API_URL, async () => {
        await delay(200);
        return HttpResponse.arrayBuffer(MP3_BYTES.buffer as ArrayBuffer);
      }),
    );

    await expect(
      siliconflowTTS.synthesize(
        { text: '你好', voiceId: 'siliconflow:qingchuan' },
        AbortSignal.timeout(10),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  });

  test('rejects with UNAUTHORIZED when the api key is missing', async () => {
    delete process.env.SILICONFLOW_API_KEY;

    await expect(
      siliconflowTTS.synthesize({ text: '你好', voiceId: 'siliconflow:qingchuan' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'SILICONFLOW_API_KEY 未配置' });
  });
});

describe('siliconflowTTS.listVoices', () => {
  test('returns four provider-local voices', async () => {
    const voices = await siliconflowTTS.listVoices();
    expect(voices.map((voice) => voice.id)).toEqual([
      'qingchuan',
      'chenzhou',
      'bailu',
      'changfeng',
    ]);
    expect(voices.every((voice) => voice.engineId === 'siliconflow' && voice.enabled)).toBe(true);
  });

  test('filters voices by language', async () => {
    expect(await siliconflowTTS.listVoices('zh')).toHaveLength(4);
    expect(await siliconflowTTS.listVoices('en')).toHaveLength(0);
  });
});

describe('registry wiring', () => {
  test('resolves siliconflow and lists it as tts', async () => {
    const registry = createRegistry({
      tts: [siliconflowTTS],
      stt: [],
      defaultTts: 'siliconflow',
    });

    expect(registry.resolveTTS('siliconflow').id).toBe('siliconflow');
    expect(await registry.list()).toEqual([
      expect.objectContaining({ id: 'siliconflow', kind: 'tts', displayName: '硅基流动' }),
    ]);
  });
});
