import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job, TTSJobInput, TTSResult } from '@aural/shared';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { assets, sessions } from '../../db/schema.js';
import type { Registry } from '../../providers/registry.js';
import { normalizeToMp3, probeDurationMs, toPcm8k } from '../audio/ffmpeg.js';
import { computePeaks } from '../audio/peaks.js';
import type { Storage } from '../storage/types.js';

const PEAK_BUCKETS = 120;
const ASSET_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type TtsPipelineResult = { assetId: string; durationMs: number };

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

/** 合成 → 归一化 → 波形/时长 → 落存储 → 插资产。临时文件始终清理。 */
export async function runTtsPipeline(
  job: Job,
  deps: { registry: Registry; storage: Storage },
): Promise<TtsPipelineResult> {
  const input = job.input as TTSJobInput;
  const provider = deps.registry.resolveTTS(job.engineId);

  const prefix = `${job.engineId}:`;
  const localVoiceId = job.voiceId?.startsWith(prefix)
    ? job.voiceId.slice(prefix.length)
    : (job.voiceId ?? '');

  const result = await provider.synthesize({
    text: input.text,
    voiceId: localVoiceId,
    language: input.language,
    speed: input.speed,
    pitch: input.pitch,
    volume: input.volume,
    format: 'mp3',
  });
  const source = await toBuffer(result.audio);

  const dir = await mkdtemp(join(tmpdir(), 'aural-tts-'));
  const normalizedPath = join(dir, 'normalized.mp3');
  try {
    await normalizeToMp3(source, normalizedPath);
    const pcm = await toPcm8k(normalizedPath);
    const peaks = computePeaks(pcm, PEAK_BUCKETS);
    const durationMs = await probeDurationMs(normalizedPath);

    const [session] = await db
      .select({ sidHash: sessions.sidHash })
      .from(sessions)
      .where(eq(sessions.id, job.sessionId))
      .limit(1);
    if (!session) {
      throw new Error(`会话不存在：${job.sessionId}`);
    }

    const normalized = await readFile(normalizedPath);
    const assetId = randomUUID();
    const now = new Date();
    const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `audio/${month}/${session.sidHash}/${assetId}.mp3`;
    const { size } = await deps.storage.put(key, normalized);

    await db.insert(assets).values({
      id: assetId,
      sessionId: job.sessionId,
      jobId: job.id,
      type: 'tts',
      title: input.text.trim().slice(0, 30) || '语音合成',
      engineId: job.engineId,
      voiceId: job.voiceId,
      audioKey: key,
      durationMs,
      sizeBytes: size,
      peaks,
      expiresAt: new Date(now.getTime() + ASSET_TTL_MS),
    });

    return { assetId, durationMs };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
