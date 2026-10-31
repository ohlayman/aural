import { describe, expect, test } from 'vitest';
import { createRegistry, createRegistryFromEnv } from './registry.js';
import { fixtureSTT, fixtureTTS } from './fixture/index.js';

describe('createRegistry', () => {
  test('resolves only configured providers', () => {
    const registry = createRegistry({ tts: [fixtureTTS], stt: [fixtureSTT], defaultTts: 'fixture' });
    expect(registry.resolveTTS('fixture').id).toBe('fixture');
    expect(registry.resolveSTT('fixture').id).toBe('fixture');
    expect(() => registry.resolveTTS('nope')).toThrowError(/未知引擎/);
    expect(() => registry.resolveSTT('nope')).toThrowError(/未知引擎/);
  });

  test('defaultTTS returns the configured default provider', () => {
    const registry = createRegistry({ tts: [fixtureTTS], stt: [fixtureSTT], defaultTts: 'fixture' });
    expect(registry.defaultTTS().id).toBe('fixture');
  });

  test('createRegistryFromEnv rejects an unregistered default tts at construction', () => {
    const previous = process.env.DEFAULT_TTS_PROVIDER;
    process.env.DEFAULT_TTS_PROVIDER = 'nope';
    try {
      expect(() => createRegistryFromEnv()).toThrowError(/未知的默认 TTS 引擎/);
    } finally {
      if (previous === undefined) {
        delete process.env.DEFAULT_TTS_PROVIDER;
      } else {
        process.env.DEFAULT_TTS_PROVIDER = previous;
      }
    }
  });

  test('list returns engine views for tts and stt', async () => {
    const registry = createRegistry({ tts: [fixtureTTS], stt: [fixtureSTT], defaultTts: 'fixture' });
    const engines = await registry.list();
    expect(engines).toHaveLength(2);

    const tts = engines.find((engine) => engine.id === 'fixture' && engine.kind === 'tts');
    expect(tts).toMatchObject({
      id: 'fixture',
      kind: 'tts',
      displayName: '本地示例',
      tier: 'standard',
      voiceCount: 2,
      languages: ['zh', 'en'],
    });
    expect(tts?.capabilities).toEqual(fixtureTTS.capabilities);

    const stt = engines.find((engine) => engine.id === 'fixture' && engine.kind === 'stt');
    expect(stt).toMatchObject({
      id: 'fixture',
      kind: 'stt',
      displayName: '本地示例',
      tier: 'standard',
      voiceCount: 0,
      languages: ['zh', 'en'],
    });
    expect(stt?.capabilities).toEqual(fixtureSTT.capabilities);
  });
});
