import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const DEV_DATABASE_URL = 'postgres://aural@127.0.0.1:5433/aural';
const TEST_DATABASE_URL = 'postgres://aural@127.0.0.1:5433/aural_test';

const connectionString = process.env.VITEST
  ? (process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL)
  : (process.env.DATABASE_URL ?? DEV_DATABASE_URL);

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
