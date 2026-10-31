import type { Registry } from '../../providers/registry.js';
import type { Storage } from '../storage/types.js';
import { sweepJobs } from './queue.js';
import { runWorkerOnce } from './worker.js';

export interface WorkerPoolOptions {
  registry?: Registry;
  storage?: Storage;
  concurrency?: number;
  intervalMs?: number;
  sweepIntervalMs?: number;
  /** Overridable for tests; defaults to claiming and processing one job. */
  runOnce?: () => Promise<unknown>;
  /** Overridable for tests; defaults to the queue housekeeping sweep. */
  sweep?: () => Promise<unknown>;
  log?: (error: unknown) => void;
}

export interface WorkerPool {
  stop(): void;
  readonly done: Promise<void>;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_INTERVAL_MS = 500;
const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

function normalizeConcurrency(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.floor(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded, non-overlapping worker pool. Each loop processes one job at a time,
 * so at most `concurrency` jobs run in parallel. The first tick sweeps stale
 * jobs, which also recovers work left behind by a crashed process at startup.
 */
export function createWorkerPool(options: WorkerPoolOptions = {}): WorkerPool {
  const concurrency = normalizeConcurrency(options.concurrency);
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const log = options.log ?? ((error: unknown) => console.error(error));
  const runOnce =
    options.runOnce ??
    (() => {
      if (!options.registry || !options.storage) {
        throw new Error('worker pool requires registry and storage');
      }
      return runWorkerOnce({ registry: options.registry, storage: options.storage });
    });
  const sweep = options.sweep ?? sweepJobs;

  let stopped = false;
  let lastSweepAt = 0;

  async function maybeSweep(): Promise<void> {
    if (Date.now() - lastSweepAt < sweepIntervalMs) return;
    lastSweepAt = Date.now();
    await sweep();
  }

  async function loop(): Promise<void> {
    while (!stopped) {
      try {
        await maybeSweep();
        await runOnce();
      } catch (error) {
        log(error);
      }
      if (stopped) break;
      await sleep(intervalMs);
    }
  }

  const done = Promise.all(
    Array.from({ length: concurrency }, () => loop()),
  ).then(() => undefined);

  return {
    stop() {
      stopped = true;
    },
    done,
  };
}
