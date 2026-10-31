import { describe, expect, test } from 'vitest';
import { TTSJobRequestSchema } from './contracts.js';

describe('TTSJobRequestSchema', () => {
  test('rejects whitespace-only text', () => {
    expect(TTSJobRequestSchema.safeParse({ text: '   \n ', engineId: 'fixture', voiceId: 'fixture:default' }).success).toBe(false);
  });
  test('accepts a normal request', () => {
    expect(TTSJobRequestSchema.safeParse({ text: '你好', engineId: 'fixture', voiceId: 'fixture:default' }).success).toBe(true);
  });
});
