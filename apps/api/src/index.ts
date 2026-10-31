import { buildServer } from './server.js';

const app = buildServer();

try {
  await app.listen({ port: 8787, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
