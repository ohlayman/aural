import { afterAll, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { sessions } from './schema.js';
import { resetDb, closeDb } from './test-utils.js';

beforeEach(resetDb);
afterAll(closeDb);

test('stores only the sid hash', async () => {
  const sidHash = 'h'.repeat(64);
  await db.insert(sessions).values({ sidHash, expiresAt: new Date('2027-10-31T00:00:00Z') });
  const row = await db.query.sessions.findFirst({ where: eq(sessions.sidHash, sidHash) });
  expect(row?.sidHash).toBe(sidHash);
  expect(row?.id).toBeTruthy();
});
