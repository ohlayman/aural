import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export function registerRequestId(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    request.id = `req_${randomUUID()}`;
  });
}
