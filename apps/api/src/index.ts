import { buildServer } from './server.js';
import { createRegistryFromEnv } from './providers/registry.js';
import { createStorageFromEnv } from './modules/storage/index.js';
import { runWorkerOnce } from './modules/jobs/worker.js';

const registry = createRegistryFromEnv();
const storage = createStorageFromEnv();
const app = buildServer({ registry, storage });

try {
  await app.listen({ port: 8787, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// In-process worker; runs alongside the API without blocking startup. Never under Vitest.
if (!process.env.VITEST) {
  setInterval(() => {
    void runWorkerOnce({ registry, storage }).catch((error) => {
      app.log.error(error);
    });
  }, 500);
}
