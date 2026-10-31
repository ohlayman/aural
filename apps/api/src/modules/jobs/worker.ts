import type { Registry } from '../../providers/registry.js';
import { AppError } from '../../errors.js';
import type { Storage } from '../storage/types.js';
import { claimNextJob, completeJob, failJob } from './queue.js';
import { runTtsPipeline } from './tts-pipeline.js';

/**
 * Claim and process a single queued job. Returns false when the queue is empty.
 */
export async function runWorkerOnce(deps: { registry: Registry; storage: Storage }): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  if (job.type !== 'tts') {
    await failJob(job.id, {
      code: 'INTERNAL',
      message: 'Unsupported job type',
      retryable: false,
    });
    return true;
  }

  try {
    const output = await runTtsPipeline(job, deps);
    await completeJob(job.id, output);
  } catch (error) {
    const appError = error instanceof AppError ? error : null;
    await failJob(job.id, {
      code: appError?.code ?? 'INTERNAL',
      message: error instanceof Error ? error.message : String(error),
      retryable: appError?.retryable ?? true,
    });
  }
  return true;
}
