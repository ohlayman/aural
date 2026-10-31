import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Job, STTJobInput, TTSJobInput } from '@aural/shared';
import { db } from '../../db/client.js';
import { jobs } from '../../db/schema.js';

export type CreateJobInput = {
  sessionId: string;
  type: 'tts' | 'stt';
  engineId: string;
  voiceId?: string;
  input: TTSJobInput | STTJobInput;
};

export type JobOutput = NonNullable<Job['output']>;
export type JobError = NonNullable<Job['error']>;

type JobRow = typeof jobs.$inferSelect;

function toIso(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type as Job['type'],
    engineId: row.engineId,
    voiceId: row.voiceId ?? undefined,
    status: row.status as Job['status'],
    stage: row.stage as Job['stage'],
    input: row.input as Job['input'],
    output: (row.output as Job['output'] | null) ?? undefined,
    error: (row.error as Job['error'] | null) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
  };
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const [row] = await db
    .insert(jobs)
    .values({
      sessionId: input.sessionId,
      type: input.type,
      engineId: input.engineId,
      voiceId: input.voiceId,
      input: input.input,
      status: 'queued',
      stage: 'queued',
    })
    .returning();
  return toJob(row);
}

export async function claimNextJob(): Promise<Job | null> {
  return db.transaction(async (tx) => {
    // Design §11.1: atomically claim the oldest queued job, skipping rows locked by other workers.
    const result = await tx.execute(sql`
      UPDATE jobs
      SET status = 'running', stage = 'synthesizing',
          started_at = now(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'queued'
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    const id = (result.rows[0] as { id?: string } | undefined)?.id;
    if (!id) return null;
    const row = await tx.query.jobs.findFirst({ where: eq(jobs.id, id) });
    return row ? toJob(row) : null;
  });
}

export async function completeJob(id: string, output: JobOutput): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'succeeded', stage: 'done', output, finishedAt: sql`now()` })
    .where(eq(jobs.id, id));
}

export async function failJob(id: string, error: JobError): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'failed', error, finishedAt: sql`now()` })
    .where(eq(jobs.id, id));
}

export async function hasActiveJob(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.sessionId, sessionId), inArray(jobs.status, ['queued', 'running'])))
    .limit(1);
  return row !== undefined;
}
