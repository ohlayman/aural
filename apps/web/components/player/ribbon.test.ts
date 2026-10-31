import { describe, expect, it, vi } from 'vitest';
import { buildBars, computeBarLayout, drawRibbon, formatTime } from './ribbon';

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

describe('computeBarLayout', () => {
  it('fits 160 bars inside a 360px desktop ribbon', () => {
    const { gap, barWidth } = computeBarLayout(360, 160);
    const total = 160 * barWidth + 159 * gap;

    expect(barWidth).toBeGreaterThan(0);
    expect(gap).toBeGreaterThanOrEqual(0.5);
    expect(gap).toBeLessThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(360 + 1e-9);
  });

  it('caps the gap at 2px on wide ribbons without overflowing', () => {
    const { gap, barWidth } = computeBarLayout(1600, 160);

    expect(gap).toBe(2);
    expect(160 * barWidth + 159 * gap).toBeLessThanOrEqual(1600 + 1e-9);
  });

  it('drops gaps rather than overflowing narrow ribbons', () => {
    const { gap, barWidth } = computeBarLayout(60, 160);

    expect(gap).toBe(0);
    expect(160 * barWidth).toBeLessThanOrEqual(60 + 1e-9);
  });
});

describe('drawRibbon', () => {
  it('keeps the last bar inside a 360px canvas', () => {
    const arcToArgs: number[][] = [];
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arcTo: vi.fn((...args: number[]) => {
        arcToArgs.push(args);
      }),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      lineCap: 'butt',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ width: 360, height: 56 }),
    });

    drawRibbon(canvas, new Array<number>(160).fill(0.5), 0);

    // roundedRect is called once per bar; each call records four arcTo points.
    expect(arcToArgs).toHaveLength(160 * 4);
    const rightEdge = Math.max(...arcToArgs.map((args) => args[0]));
    expect(rightEdge).toBeLessThanOrEqual(360 + 1e-9);
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
