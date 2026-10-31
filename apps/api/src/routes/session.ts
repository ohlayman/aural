import type { FastifyInstance } from 'fastify';
import { getOrCreateSession } from '../modules/session/service.js';

export function registerSessionRoutes(app: FastifyInstance): void {
  app.get('/api/v1/session', async (request, reply) => getOrCreateSession(request, reply));
}
