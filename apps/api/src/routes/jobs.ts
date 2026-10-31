import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import { cancelQueuedJob, getJobForSession } from '../modules/jobs/queue.js';
import { getOrCreateSession } from '../modules/session/service.js';

export function registerJobRoutes(app: FastifyInstance): void {
  app.delete<{ Params: { jobId: string } }>('/api/v1/jobs/:jobId', async (request, reply) => {
    const session = await getOrCreateSession(request, reply);
    const job = await getJobForSession(request.params.jobId, session.sessionId);
    if (!job) {
      throw new AppError('NOT_FOUND');
    }
    if (job.status !== 'queued') {
      throw new AppError('INVALID_ARGUMENT', '任务已开始或已结束，无法取消');
    }
    // 条件更新可防止 lookup 与 update 之间被 worker 抢走。
    const cancelled = await cancelQueuedJob(request.params.jobId, session.sessionId);
    if (!cancelled) {
      throw new AppError('INVALID_ARGUMENT', '任务已开始或已结束，无法取消');
    }
    return reply.send(cancelled);
  });
}
