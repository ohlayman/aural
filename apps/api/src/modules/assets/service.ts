import type { Asset } from '@aural/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { assets } from '../../db/schema.js';

type AssetRow = typeof assets.$inferSelect;

/** 共享 Asset 视图 + 内部音频 key（不可直接暴露给客户端）。 */
export type AssetRecord = Asset & { audioKey: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toAsset(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    jobId: row.jobId ?? undefined,
    type: row.type as Asset['type'],
    title: row.title,
    engineId: row.engineId,
    voiceId: row.voiceId ?? undefined,
    textContent: row.textContent ?? undefined,
    durationMs: row.durationMs ?? undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    peaks: row.peaks ?? undefined,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    audioKey: row.audioKey,
  };
}

/** 按 session 归属读取未删除资产；不存在、无效 UUID 或不属于该 session 时返回 null。 */
export async function getAssetForSession(
  id: string,
  sessionId: string,
): Promise<AssetRecord | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.sessionId, sessionId), isNull(assets.deletedAt)))
    .limit(1);
  return row ? toAsset(row) : null;
}
