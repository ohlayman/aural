import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sidHash: text('sid_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_expires_at_idx').on(table.expiresAt)],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    engineId: text('engine_id').notNull(),
    voiceId: text('voice_id'),
    status: text('status').notNull().default('queued'),
    stage: text('stage').notNull().default('queued'),
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    error: jsonb('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('jobs_status_created_at_idx').on(table.status, table.createdAt),
    uniqueIndex('jobs_one_active_per_session')
      .on(table.sessionId)
      .where(sql`status in ('queued','running')`),
  ],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    engineId: text('engine_id').notNull(),
    voiceId: text('voice_id'),
    audioKey: text('audio_key').notNull(),
    textContent: text('text_content'),
    durationMs: integer('duration_ms'),
    sizeBytes: integer('size_bytes'),
    peaks: jsonb('peaks').$type<number[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('assets_session_id_created_at_idx').on(table.sessionId, table.createdAt),
    index('assets_expires_at_idx').on(table.expiresAt),
  ],
);

export const usage = pgTable(
  'usage',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    kind: text('kind').notNull(),
    used: integer('used').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.day, table.kind] })],
);
