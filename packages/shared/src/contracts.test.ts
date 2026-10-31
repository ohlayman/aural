import { describe, expect, test } from 'vitest';
import { JobSchema, TTSJobRequestSchema } from './contracts.js';

describe('TTSJobRequestSchema', () => {
  test('rejects whitespace-only text', () => {
    expect(TTSJobRequestSchema.safeParse({ text: '   \n ', engineId: 'fixture', voiceId: 'fixture:default' }).success).toBe(false);
  });
  test('accepts a normal request', () => {
    expect(TTSJobRequestSchema.safeParse({ text: '你好', engineId: 'fixture', voiceId: 'fixture:default' }).success).toBe(true);
  });
});

describe('JobSchema', () => {
  test('accepts a PRD-shaped TTS input without engineId', () => {
    expect(
      JobSchema.safeParse({
        id: 'job_01J9Z3K2',
        sessionId: 'ses_01J9',
        type: 'tts',
        engineId: 'fixture',
        voiceId: 'fixture:default',
        status: 'queued',
        stage: 'queued',
        input: { text: '你好', voiceId: 'fixture:default' },
        createdAt: '2026-10-31T00:00:00Z',
      }).success,
    ).toBe(true);
  });
});
