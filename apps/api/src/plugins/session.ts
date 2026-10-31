import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';

export function registerSession(app: FastifyInstance): void {
  app.register(cookie);
}
