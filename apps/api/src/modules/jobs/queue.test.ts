import { afterAll, beforeEach, expect, test } from 'vitest';
import { claimNextJob, completeJob, createJob, failJob, hasActiveJob } from './queue.js';
import { db } from '../../db/client.js';
import { sessions } from '../../db/schema.js';
import { resetDb, closeDb } from '../../db/test-utils.js';

beforeEach(resetDb);
afterAll(closeDb);

async function createSession(): Promise<string> {
  const [sess] = await db
    .insert(sessions)
    .values({
      sidHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  return sess.id;
}

function ttsJob(sessionId: string, text: string) {
  return {
    sessionId,
    type: 'tts' as const,
    engineId: 'fixture',
    voiceId: 'fixture:default',
    input: { text, voiceId: 'fixture:default' },
  };
}

test('claims each queued job exactly once', async () => {
  const sessionId = await createSession();

  await createJob(ttsJob(sessionId, 'a'));
  await createJob(ttsJob(sessionId, 'b'));

  const first = await claimNextJob();
  const second = await claimNextJob();
  expect(first?.status).toBe('running');
  expect(second?.id).not.toBe(first?.id);
  expect(await claimNextJob()).toBeNull();
});

test('hasActiveJob is true after create and false after completeJob', async () => {
  const sessionId = await createSession();
  const job = await createJob(ttsJob(sessionId, 'a'));

  expect(await hasActiveJob(sessionId)).toBe(true);

  const claimed = await claimNextJob();
  expect(claimed?.id).toBe(job.id);
  expect(claimed?.stage).toBe('synthesizing');
  expect(await hasActiveJob(sessionId)).toBe(true);

  await completeJob(job.id, { text: 'done' });
  expect(await hasActiveJob(sessionId)).toBe(false);
});

test('hasActiveJob is true after create and false after failJob', async () => {
  const sessionId = await createSession();
  await createJob(ttsJob(sessionId, 'a'));

  expect(await hasActiveJob(sessionId)).toBe(true);

  const claimed = await claimNextJob();
  await failJob(claimed!.id, { code: 'INTERNAL', message: 'boom', retryable: false });

  expect(await hasActiveJob(sessionId)).toBe(false);
});

test('maps the inserted row to the shared camelCase Job shape', async () => {
  const sessionId = await createSession();
  const job = await createJob(ttsJob(sessionId, 'a'));

  expect(job).toMatchObject({
    sessionId,
    type: 'tts',
    engineId: 'fixture',
    voiceId: 'fixture:default',
    status: 'queued',
    stage: 'queued',
    input: { text: 'a', voiceId: 'fixture:default' },
  });
  expect(typeof job.id).toBe('string');
  expect(typeof job.createdAt).toBe('string');
  expect(job.startedAt).toBeUndefined();
  expect(job.finishedAt).toBeUndefined();
  expect((job as Record<string, unknown>).session_id).toBeUndefined();
});
