import { afterAll, beforeEach, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildServer } from '../server.js';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { resetDb, closeDb } from '../db/test-utils.js';

beforeEach(resetDb);
afterAll(closeDb);

test('sets an httpOnly sid and reuses the session', async () => {
  const app = buildServer();
  const first = await app.inject({ method: 'GET', url: '/api/v1/session' });
  const cookie = first.cookies.find((c) => c.name === 'aural_sid');
  expect(cookie?.httpOnly).toBe(true);
  expect(first.json().sessionId).toBeTruthy();

  const second = await app.inject({
    method: 'GET',
    url: '/api/v1/session',
    cookies: { aural_sid: cookie!.value },
  });
  expect(second.json().sessionId).toBe(first.json().sessionId);
});

test('does not expose the raw sid in JSON and stores only its sha256', async () => {
  const app = buildServer();
  const first = await app.inject({ method: 'GET', url: '/api/v1/session' });
  const cookie = first.cookies.find((c) => c.name === 'aural_sid');
  expect(cookie).toBeTruthy();

  expect(JSON.stringify(first.json())).not.toContain(cookie!.value);

  const hash = createHash('sha256').update(cookie!.value).digest('hex');
  const row = await db.query.sessions.findFirst({ where: eq(sessions.sidHash, hash) });
  expect(row).toBeTruthy();
  expect(row!.sidHash).not.toBe(cookie!.value);
  expect(row!.sidHash).toBe(hash);
});

test('returns the zero-usage quota and an expiry', async () => {
  const app = buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/v1/session' });
  expect(res.json().quota).toEqual({
    ttsChars: { used: 0, limit: 20000 },
    sttSeconds: { used: 0, limit: 1800 },
  });
  expect(res.json().expiresAt).toBeTruthy();
});
