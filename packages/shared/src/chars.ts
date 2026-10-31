export function countChars(text: string): number {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let count = 0;
    for (const _segment of segmenter.segment(text)) {
      count += 1;
    }
    return count;
  }
  return Array.from(text).length;
}
