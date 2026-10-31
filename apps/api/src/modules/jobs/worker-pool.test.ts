import { describe, expect, test, vi } from 'vitest';
import { createWorkerPool } from './worker-pool.js';

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('createWorkerPool', () => {
  test('never runs more than `concurrency` jobs and sweeps once at startup', async () => {
    let active = 0;
    let maxActive = 0;
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const runOnce = vi.fn(async () => {
      active += 1;
      started += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
    });
    const sweep = vi.fn(async () => {});

    const pool = createWorkerPool({
      concurrency: 3,
      intervalMs: 1,
      runOnce,
      sweep,
      log: () => {},
    });

    await waitFor(() => started >= 3);

    expect(started).toBe(3);
    expect(maxActive).toBe(3);
    expect(sweep).toHaveBeenCalledTimes(1);

    pool.stop();
    release();
    await pool.done;
  });

  test('logs a failing tick and keeps the loop going', async () => {
    let calls = 0;
    const log = vi.fn();
    const runOnce = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
    });

    const pool = createWorkerPool({
      concurrency: 1,
      intervalMs: 1,
      runOnce,
      sweep: async () => {},
      log,
    });

    await waitFor(() => calls >= 3);

    pool.stop();
    await pool.done;

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
