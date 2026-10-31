import type { FastifyInstance } from 'fastify';
import { MAX_TTS_CHARS, TTSJobRequestSchema, countChars } from '@aural/shared';
import { AppError } from '../errors.js';
import { createJob, getJobForSession, hasActiveJob } from '../modules/jobs/queue.js';
import { getOrCreateSession } from '../modules/session/service.js';

export function registerTtsRoutes(app: FastifyInstance): void {
  app.post('/api/v1/tts/jobs', async (request, reply) => {
    const session = await getOrCreateSession(request, reply);
    const parsed = TTSJobRequestSchema.parse(request.body);
    const provider = app.registry.resolveTTS(parsed.engineId);

    const prefix = `${parsed.engineId}:`;
    if (!parsed.voiceId.startsWith(prefix)) {
      throw new AppError('INVALID_ARGUMENT', `音色不属于引擎：${parsed.voiceId}`);
    }
    const localVoiceId = parsed.voiceId.slice(prefix.length);
    const voices = await provider.listVoices();
    if (!voices.some((voice) => voice.id === localVoiceId)) {
      throw new AppError('INVALID_ARGUMENT', `未知音色：${parsed.voiceId}`);
    }

    const cap = Math.min(MAX_TTS_CHARS, provider.capabilities.maxCharsPerRequest);
    if (countChars(parsed.text) > cap) {
      throw new AppError('TEXT_TOO_LONG', '文本超过当前引擎上限');
    }

    if (await hasActiveJob(session.sessionId)) {
      throw new AppError('RATE_LIMITED', '当前会话已有进行中的任务');
    }

    const job = await createJob({
      sessionId: session.sessionId,
      type: 'tts',
      engineId: parsed.engineId,
      voiceId: parsed.voiceId,
      input: {
        text: parsed.text,
        voiceId: parsed.voiceId,
        language: parsed.language,
        speed: parsed.speed,
        pitch: parsed.pitch,
        volume: parsed.volume,
        format: parsed.format,
      },
    });

    return reply.status(202).send({
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
    });
  });

  app.get<{ Params: { jobId: string } }>('/api/v1/jobs/:jobId', async (request, reply) => {
    const session = await getOrCreateSession(request, reply);
    const job = await getJobForSession(request.params.jobId, session.sessionId);
    if (!job) {
      throw new AppError('NOT_FOUND');
    }
    return reply.send({ ...job, progress: null });
  });
}
