const DPR_CAP = 1.75;

/**
 * Resamples peaks to exactly `count` bars with linear interpolation, clamping
 * every value to 0..1. Empty input yields zeros so the ribbon keeps its layout.
 */
export function buildBars(peaks: number[], count = 160): number[] {
  if (count <= 0) return [];

  const bars = new Array<number>(count).fill(0);
  if (peaks.length === 0) return bars;

  if (peaks.length === 1) {
    const only = Number.isFinite(peaks[0]) ? Math.min(1, Math.max(0, peaks[0])) : 0;
    return bars.fill(only);
  }

  for (let i = 0; i < count; i++) {
    const position = (i * (peaks.length - 1)) / (count - 1);
    const left = Math.floor(position);
    const right = Math.min(peaks.length - 1, left + 1);
    const mix = position - left;
    const value = peaks[left] * (1 - mix) + peaks[right] * mix;
    bars[i] = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }

  return bars;
}

/** mm:ss, clamped at zero. */
export function formatTime(seconds: number): string {
  const total =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export interface BarLayout {
  gap: number;
  barWidth: number;
}

/**
 * Fits `count` bars into `width`: a gap of at most 2px (40% of a slot at
 * narrow widths, never below 0.5px), with the bar width derived so the last
 * bar's right edge never exceeds `width`. Falls back to gapless bars when the
 * width cannot hold even the minimum gaps.
 */
export function computeBarLayout(width: number, count: number): BarLayout {
  if (count <= 0 || width <= 0) return { gap: 0, barWidth: 0 };

  const gap = Math.min(2, Math.max(0.5, (width / count) * 0.4));
  const barWidth = (width - (count - 1) * gap) / count;
  if (barWidth > 0) return { gap, barWidth };

  return { gap: 0, barWidth: width / count };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
  context.fill();
}

/**
 * Draws mirrored bars with the played portion in a cyan→violet gradient, the
 * remainder at 16% white, and a 28px violet playhead glow.
 */
export function drawRibbon(
  canvas: HTMLCanvasElement,
  bars: number[],
  progress: number,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width <= 0 || height <= 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  context.clearRect(0, 0, width, height);

  const count = bars.length;
  if (count === 0) return;

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const { gap, barWidth } = computeBarLayout(width, count);
  const middle = height / 2;

  const playedGradient = context.createLinearGradient(0, 0, width, 0);
  playedGradient.addColorStop(0, 'rgba(34, 211, 238, 0.95)');
  playedGradient.addColorStop(0.55, 'rgba(142, 116, 255, 0.95)');
  playedGradient.addColorStop(1, 'rgba(124, 92, 255, 0.95)');

  for (let i = 0; i < count; i++) {
    const x = i * (barWidth + gap);
    const barHeight = bars[i] * height * 0.42;
    const played = i / count <= clampedProgress;
    context.fillStyle = played ? playedGradient : 'rgba(255, 255, 255, 0.16)';
    roundedRect(
      context,
      x,
      middle - barHeight,
      barWidth,
      barHeight * 2,
      Math.min(barWidth / 2, 1.5),
    );
  }

  const playhead = clampedProgress * width;
  context.fillStyle = 'rgba(255, 255, 255, 0.85)';
  context.fillRect(Math.max(0, Math.min(width - 1, playhead)), 2, 1, height - 4);

  const glow = context.createLinearGradient(playhead - 14, 0, playhead + 14, 0);
  glow.addColorStop(0, 'rgba(124, 92, 255, 0)');
  glow.addColorStop(0.5, 'rgba(124, 92, 255, 0.35)');
  glow.addColorStop(1, 'rgba(124, 92, 255, 0)');
  context.fillStyle = glow;
  context.fillRect(playhead - 14, 0, 28, height);
}
