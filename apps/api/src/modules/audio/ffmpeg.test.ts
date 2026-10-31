import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { normalizeToMp3, probeDurationMs, toPcm8k } from './ffmpeg.js';

const FIXTURE = fileURLToPath(
  new URL('../../providers/fixture/sample-3s.mp3', import.meta.url),
);

describe('ffmpeg helpers', () => {
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'aural-audio-test-'));
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('probeDurationMs reports roughly 3 seconds for the fixture', async () => {
    const durationMs = await probeDurationMs(FIXTURE);
    expect(durationMs).toBeGreaterThanOrEqual(2800);
    expect(durationMs).toBeLessThanOrEqual(3200);
  }, 30_000);

  test('toPcm8k returns roughly 3 seconds of non-silent samples', async () => {
    const pcm = await toPcm8k(FIXTURE);
    expect(pcm.length).toBeGreaterThan(16000);
    expect(pcm.length).toBeLessThan(40000);
    const maxAbs = pcm.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    expect(maxAbs).toBeGreaterThan(0);
  }, 30_000);

  test('toPcm8k surfaces ffmpeg stderr on failure', async () => {
    await expect(toPcm8k('/no/such/file.mp3')).rejects.toThrow(/ffmpeg failed:/);
  }, 30_000);

  test('probeDurationMs surfaces ffprobe stderr on failure', async () => {
    await expect(probeDurationMs('/no/such/file.mp3')).rejects.toThrow(/ffprobe failed:/);
  }, 30_000);

  test('normalizeToMp3 keeps the duration within 300ms', async () => {
    const input = await readFile(FIXTURE);
    const outputPath = join(workDir, 'normalized.mp3');

    await normalizeToMp3(input, outputPath);

    const inputMs = await probeDurationMs(FIXTURE);
    const outputMs = await probeDurationMs(outputPath);
    expect(Math.abs(outputMs - inputMs)).toBeLessThanOrEqual(300);
  }, 30_000);
});
