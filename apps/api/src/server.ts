import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRequestId } from './plugins/request-id.js';

export type Deps = Record<string, never>;

export function buildServer(_deps: Partial<Deps> = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  registerRequestId(app);
  registerErrorHandler(app);
  app.get('/health', async () => ({ ok: true }));
  return app;
}
