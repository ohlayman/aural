import { describe, expect, test } from 'vitest';
import { countChars } from './chars.js';

describe('countChars', () => {
  test('counts CJK as one grapheme each', () => {
    expect(countChars('你好')).toBe(2);
  });
  test('counts a ZWJ emoji as one grapheme', () => {
    expect(countChars('👩‍💻')).toBe(1);
  });
  test('counts combining marks as one grapheme', () => {
    expect(countChars('é')).toBe(1);
  });
  test('counts 5001 ASCII chars', () => {
    expect(countChars('a'.repeat(5001))).toBe(5001);
  });
});
