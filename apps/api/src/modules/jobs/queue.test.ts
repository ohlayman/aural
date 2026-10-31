import { afterAll, beforeEach, expect, test } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  claimNextJob,
  completeJob,
  createJob,
  failJob,
  hasActiveJob,
  sweepJobs,
} from './queue.js';
import { db } from '../../db/client.js';
import { jobs, sessions } from '../../db/schema.js';
import { resetDb, closeDb } from '../../db/test-utils.js';

beforeEach(resetDb);
afterAll(closeDb);

async function createSession(sidHash = 'a'.repeat(64)): Promise<string> {
  const [sess] = await db
    .insert(sessions)
    .values({
      sidHash,
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
  const firstSession = await createSession();
  const secondSession = await createSession('b'.repeat(64));

  await createJob(ttsJob(firstSession, 'a'));
  await createJob(ttsJob(secondSession, 'b'));

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

test('sweepJobs expires a queued job older than 30 minutes', async () => {
  const sessionId = await createSession();
  const job = await createJob(ttsJob(sessionId, 'a'));
  await db.execute(
    sql`UPDATE jobs SET created_at = now() - interval '31 minutes' WHERE id = ${job.id}`,
  );

  expect(await sweepJobs()).toEqual({ expired: 1, reclaimed: 0, failed: 0 });

  const row = await db.query.jobs.findFirst({ where: eq(jobs.id, job.id) });
  expect(row?.status).toBe('expired');
  expect(row?.finishedAt).not.toBeNull();
});

test('sweepJobs reclaims a stale running job while attempts remain', async () => {
  const sessionId = await createSession();
  const job = await createJob(ttsJob(sessionId, 'a'));
  await db.execute(sql`
    UPDATE jobs
    SET status = 'running', stage = 'synthesizing', attempts = 0,
        started_at = now() - interval '11 minutes'
    WHERE id = ${job.id}
  `);

  expect(await sweepJobs()).toEqual({ expired: 0, reclaimed: 1, failed: 0 });

  const row = await db.query.jobs.findFirst({ where: eq(jobs.id, job.id) });
  expect(row?.status).toBe('queued');
  expect(row?.stage).toBe('queued');
  expect(row?.startedAt).toBeNull();
});

test('sweepJobs fails a stale running job that exhausted retries', async () => {
  const sessionId = await createSession();
  const job = await createJob(ttsJob(sessionId, 'a'));
  await db.execute(sql`
    UPDATE jobs
    SET status = 'running', stage = 'synthesizing', attempts = 2,
        started_at = now() - interval '11 minutes'
    WHERE id = ${job.id}
  `);

  expect(await sweepJobs()).toEqual({ expired: 0, reclaimed: 0, failed: 1 });

  const row = await db.query.jobs.findFirst({ where: eq(jobs.id, job.id) });
  expect(row?.status).toBe('failed');
  expect(row?.error).toEqual({ code: 'INTERNAL', message: '任务执行超时', retryable: true });
  expect(row?.finishedAt).not.toBeNull();
});

test('sweepJobs leaves a fresh job untouched', async () => {
  const sessionId = await createSession();
  const job = await createJob(ttsJob(sessionId, 'a'));

  expect(await sweepJobs()).toEqual({ expired: 0, reclaimed: 0, failed: 0 });

  const row = await db.query.jobs.findFirst({ where: eq(jobs.id, job.id) });
  expect(row?.status).toBe('queued');
  expect(row?.startedAt).toBeNull();
  expect(row?.finishedAt).toBeNull();
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
