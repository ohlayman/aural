/**
 * 把 8k 单声道 PCM 压成可视化用的峰值数组。
 * 每个桶取绝对值最大的采样，再归一到 0..1；空/短输入返回全 0，绝不产生 NaN。
 */
export function computePeaks(pcm: Int16Array, buckets = 120): number[] {
  const peaks = new Array<number>(buckets).fill(0);
  if (pcm.length === 0) return peaks;

  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor((bucket * pcm.length) / buckets);
    const end = Math.floor(((bucket + 1) * pcm.length) / buckets);
    let maxAbs = 0;
    for (let i = start; i < end; i++) {
      const abs = Math.abs(pcm[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    peaks[bucket] = Math.min(1, maxAbs / 32768);
  }

  return peaks;
}
