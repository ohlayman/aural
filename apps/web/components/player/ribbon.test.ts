import { describe, expect, it } from 'vitest';
import { buildBars, formatTime } from './ribbon';

describe('buildBars', () => {
  it('resamples 120 peaks to 160 bars', () => {
    const bars = buildBars(Array.from({ length: 120 }, () => 0.5));
    expect(bars).toHaveLength(160);
    expect(bars.every((value) => value === 0.5)).toBe(true);
  });

  it('interpolates linearly between peaks', () => {
    expect(buildBars([0, 1], 3)).toEqual([0, 0.5, 1]);
    expect(buildBars([0, 0.6, 1], 5)).toEqual([0, 0.3, 0.6, 0.8, 1]);
  });

  it('returns zeros for empty input', () => {
    const bars = buildBars([], 4);
    expect(bars).toEqual([0, 0, 0, 0]);
    expect(buildBars([], 160)).toHaveLength(160);
  });

  it('clamps out-of-range and non-finite peaks', () => {
    expect(buildBars([2, -1], 2)).toEqual([1, 0]);
    expect(buildBars([Number.NaN, 0.5], 2)).toEqual([0, 0.5]);
  });

  it('repeats a single peak', () => {
    expect(buildBars([0.25], 3)).toEqual([0.25, 0.25, 0.25]);
  });
});

describe('formatTime', () => {
  it('formats mm:ss and clamps negatives', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(-5)).toBe('00:00');
    expect(formatTime(65.9)).toBe('01:05');
    expect(formatTime(600)).toBe('10:00');
  });
});
