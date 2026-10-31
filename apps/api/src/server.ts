import Fastify, { type FastifyInstance } from 'fastify';

export type Deps = Record<string, never>;

export function buildServer(_deps: Partial<Deps> = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ ok: true }));
  return app;
}
