import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import { getAssetForSession } from '../modules/assets/service.js';
import { getOrCreateSession } from '../modules/session/service.js';

export function registerAssetRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>('/api/v1/assets/:id/audio', async (request, reply) => {
    const session = await getOrCreateSession(request, reply);
    const asset = await getAssetForSession(request.params.id, session.sessionId);
    if (!asset) {
      throw new AppError('NOT_FOUND');
    }
    const url = await app.storage.signedUrl(asset.audioKey, 300);
    return reply.redirect(url, 302);
  });

  // 公开但需签名：不带 session，exp + token 由存储适配器校验。
  app.get<{ Params: { '*': string }; Querystring: { exp?: string; token?: string } }>(
    '/api/v1/files/*',
    async (request, reply) => {
      const key = request.params['*'];
      const exp = Number(request.query.exp);
      const token = String(request.query.token ?? '');
      if (!app.storage.verifySignedUrl(key, exp, token)) {
        throw new AppError('FORBIDDEN');
      }
      const stream = await app.storage.getStream(key);
      reply.type('audio/mpeg');
      return reply.send(Readable.fromWeb(stream));
    },
  );
}
