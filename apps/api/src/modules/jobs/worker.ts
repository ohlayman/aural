import type { Registry } from '../../providers/registry.js';
import type { Storage } from '../storage/types.js';
import { claimNextJob, failJob } from './queue.js';

/**
 * Claim and process a single queued job. Returns false when the queue is empty.
 */
export async function runWorkerOnce(deps: { registry: Registry; storage: Storage }): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  // Task 10 replaces this dispatch with the real TTS/STT pipeline.
  await failJob(job.id, {
    code: 'INTERNAL',
    message: 'Job pipeline not implemented',
    retryable: false,
  });
  return true;
}
