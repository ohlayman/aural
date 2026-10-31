import { describe, expect, test } from 'vitest';
import { buildServer } from './server.js';

describe('health', () => {
  test('GET /health returns ok', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
