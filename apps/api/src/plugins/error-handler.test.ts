import { describe, expect, test } from 'vitest';
import { AppError } from '../errors.js';
import { buildServer } from '../server.js';

describe('error envelope', () => {
  test('unknown route returns 404 with NOT_FOUND envelope', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'NOT_FOUND', retryable: false, requestId: expect.any(String) },
    });
    const body = res.json() as { error: { requestId: string } };
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });

  test('AppError maps to its mapped status and code', async () => {
    const app = buildServer();
    app.get('/__test/text-too-long', async () => {
      throw new AppError('TEXT_TOO_LONG');
    });
    const res = await app.inject({ method: 'GET', url: '/__test/text-too-long' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'TEXT_TOO_LONG', retryable: false, requestId: expect.any(String) },
    });
    const body = res.json() as { error: { requestId: string } };
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });
});
