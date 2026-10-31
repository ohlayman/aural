import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRequestId } from './plugins/request-id.js';
import { registerSession } from './plugins/session.js';
import { createRegistryFromEnv, type Registry } from './providers/registry.js';
import { registerSessionRoutes } from './routes/session.js';

export type Deps = {
  registry: Registry;
};

declare module 'fastify' {
  interface FastifyInstance {
    registry: Registry;
  }
}

export function buildServer(deps: Partial<Deps> = {}): FastifyInstance {
  const registry = deps.registry ?? createRegistryFromEnv();
  const app = Fastify({ logger: false });
  app.decorate('registry', registry);
  registerRequestId(app);
  registerErrorHandler(app);
  registerSession(app);
  app.get('/health', async () => ({ ok: true }));
  registerSessionRoutes(app);
  return app;
}
