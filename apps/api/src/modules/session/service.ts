import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Session } from '@aural/shared';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sessions } from '../../db/schema.js';

const COOKIE_NAME = 'aural_sid';
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function hashSid(sid: string): string {
  return createHash('sha256').update(sid).digest('hex');
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  };
}

function toSession(row: { id: string; expiresAt: Date }): Session {
  return {
    sessionId: row.id,
    quota: {
      ttsChars: { used: 0, limit: 20000 },
      sttSeconds: { used: 0, limit: 1800 },
    },
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function getOrCreateSession(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<Session> {
  const now = new Date();
  const rawSid = req.cookies[COOKIE_NAME];

  if (rawSid) {
    const [existing] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sidHash, hashSid(rawSid)))
      .limit(1);

    if (existing && existing.expiresAt.getTime() > now.getTime()) {
      const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      const [updated] = await db
        .update(sessions)
        .set({ lastSeenAt: now, expiresAt })
        .where(eq(sessions.id, existing.id))
        .returning();
      return toSession(updated!);
    }
  }

  const sid = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const [created] = await db
    .insert(sessions)
    .values({ sidHash: hashSid(sid), expiresAt })
    .returning();

  reply.setCookie(COOKIE_NAME, sid, cookieOptions());
  return toSession(created!);
}
