import { sql } from 'drizzle-orm';
import { db, pool } from './client.js';
import { runMigrations } from './migrate.js';

let migrated: Promise<void> | null = null;

export async function resetDb(): Promise<void> {
  migrated ??= runMigrations();
  await migrated;
  await db.execute(sql`TRUNCATE usage, assets, jobs, sessions RESTART IDENTITY CASCADE`);
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
