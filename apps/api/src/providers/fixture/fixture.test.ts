import { describe, expect, test } from 'vitest';
import { fixtureSTT, fixtureTTS } from './index.js';

describe('fixtureTTS', () => {
  test('returns a real mp3 buffer', async () => {
    const result = await fixtureTTS.synthesize({ text: '你好', voiceId: 'fixture:default' });
    const bytes = Buffer.isBuffer(result.audio) ? result.audio : Buffer.from(result.audio as Uint8Array);
    expect(result.format).toBe('mp3');
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(result.durationMs).toBe(3000);
    expect(result.sampleRate).toBe(24000);
  });

  test('lists the two built-in voices', async () => {
    const voices = await fixtureTTS.listVoices();
    expect(voices.map((voice) => voice.id)).toEqual(['default', 'deep']);
    expect(voices.map((voice) => voice.name)).toEqual(['晴川', '沉舟']);
  });
});

describe('fixtureSTT', () => {
  test('returns a fixed Chinese sentence', async () => {
    const result = await fixtureSTT.transcribe({ audio: new Uint8Array(), mimeType: 'audio/mpeg' });
    expect(result.text).toBe('这是本地示例引擎返回的一段固定中文转写文本。');
    expect(result.language).toBe('zh');
    expect(result.durationMs).toBe(3000);
  });
});
