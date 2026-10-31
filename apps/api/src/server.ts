import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRequestId } from './plugins/request-id.js';
import { registerSession } from './plugins/session.js';
import { createRegistryFromEnv, type Registry } from './providers/registry.js';
import { registerSessionRoutes } from './routes/session.js';
import { createStorageFromEnv, type Storage } from './modules/storage/index.js';

export type Deps = {
  registry: Registry;
  storage: Storage;
};

declare module 'fastify' {
  interface FastifyInstance {
    registry: Registry;
    storage: Storage;
  }
}

export function buildServer(deps: Partial<Deps> = {}): FastifyInstance {
  const registry = deps.registry ?? createRegistryFromEnv();
  const storage = deps.storage ?? createStorageFromEnv();
  const app = Fastify({ logger: false });
  app.decorate('registry', registry);
  app.decorate('storage', storage);
  registerRequestId(app);
  registerErrorHandler(app);
  registerSession(app);
  app.get('/health', async () => ({ ok: true }));
  registerSessionRoutes(app);
  return app;
}
