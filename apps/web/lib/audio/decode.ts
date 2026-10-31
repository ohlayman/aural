/**
 * Fetches an audio URL and decodes it into an AudioBuffer. When no context is
 * supplied a temporary one is created for decoding and closed afterwards; the
 * returned buffer stays valid after that context closes.
 */
export async function decodeAudio(
  url: string,
  ctx?: AudioContext,
): Promise<AudioBuffer> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Audio fetch failed: ${response.status}`);
  }
  const bytes = await response.arrayBuffer();

  if (ctx) return ctx.decodeAudioData(bytes);

  const temporary = new AudioContext();
  try {
    return await temporary.decodeAudioData(bytes);
  } finally {
    void temporary.close().catch(() => {});
  }
}

/**
 * Buckets channel 0 into `buckets` slices, taking the max absolute sample of
 * each and normalizing to 0..1. Empty or short buffers return zeros.
 */
export function computePeaks(buffer: AudioBuffer, buckets = 120): number[] {
  const peaks = new Array<number>(buckets).fill(0);
  if (buckets <= 0) return peaks;

  let samples: Float32Array | null = null;
  try {
    if (buffer.numberOfChannels > 0) {
      samples = buffer.getChannelData(0);
    }
  } catch {
    samples = null;
  }
  if (!samples || samples.length === 0) return peaks;

  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor((bucket * samples.length) / buckets);
    const end = Math.floor(((bucket + 1) * samples.length) / buckets);
    let maxAbs = 0;
    for (let i = start; i < end; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    peaks[bucket] = Math.min(1, maxAbs);
  }

  return peaks;
}
