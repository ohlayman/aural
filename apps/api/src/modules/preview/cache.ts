import type { Storage } from '../storage/types.js';
import type { TTSProvider, TTSResult, Voice } from '../../providers/types.js';

const PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function previewKey(engineId: string, localVoiceId: string): string {
  return `preview/${engineId}/${localVoiceId}.mp3`;
}

async function toBuffer(audio: TTSResult['audio']): Promise<Buffer> {
  if (audio instanceof Uint8Array) return Buffer.from(audio);
  const reader = audio.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** 确保试听文件存在且未过期（7 天），返回其存储 key；不写 usage。 */
export async function ensurePreview(
  storage: Storage,
  provider: TTSProvider,
  voice: Voice,
): Promise<string> {
  const key = previewKey(provider.id, voice.id);
  const info = await storage.stat(key);
  if (info && Date.now() - info.mtimeMs < PREVIEW_TTL_MS) {
    return key;
  }

  const result = await provider.synthesize({
    text: `你好，我是${voice.name}。`,
    voiceId: voice.id,
    format: 'mp3',
  });
  await storage.put(key, await toBuffer(result.audio));
  return key;
}
