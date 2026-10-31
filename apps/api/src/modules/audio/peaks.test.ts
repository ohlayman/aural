import { describe, expect, test } from 'vitest';
import { computePeaks } from './peaks.js';

describe('computePeaks', () => {
  test('returns 120 buckets in 0..1', () => {
    const pcm = new Int16Array(8000 * 3);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 10) * 32767);
    const peaks = computePeaks(pcm, 120);
    expect(peaks).toHaveLength(120);
    expect(Math.max(...peaks)).toBeGreaterThan(0.9);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0);
  });

  test('returns buckets zeros for empty input', () => {
    const peaks = computePeaks(new Int16Array(0), 60);
    expect(peaks).toHaveLength(60);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  test('returns buckets zeros when input is shorter than buckets', () => {
    const peaks = computePeaks(Int16Array.from([100, -300]), 10);
    expect(peaks).toHaveLength(10);
    expect(peaks.every((p) => Number.isFinite(p) && p >= 0 && p <= 1)).toBe(true);
  });

  test('clamps full-scale samples to 1', () => {
    const pcm = Int16Array.from([-32768, 32767]);
    const peaks = computePeaks(pcm, 1);
    expect(peaks).toEqual([1]);
  });
});
