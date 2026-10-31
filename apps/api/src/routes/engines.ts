import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import { ensurePreview } from '../modules/preview/cache.js';

export function registerEngineRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { kind?: string } }>('/api/v1/engines', async (request) => {
    const engines = await app.registry.list();
    const { kind } = request.query;
    return kind ? engines.filter((engine) => engine.kind === kind) : engines;
  });

  app.get<{ Querystring: { engineId?: string; language?: string; q?: string } }>(
    '/api/v1/voices',
    async (request) => {
      const { engineId, language, q } = request.query;
      if (!engineId) {
        throw new AppError('INVALID_ARGUMENT', '缺少 engineId');
      }
      const provider = app.registry.resolveTTS(engineId);
      const voices = await provider.listVoices(language);
      if (!q) return voices;
      const needle = q.toLowerCase();
      return voices.filter((voice) => voice.name.toLowerCase().includes(needle));
    },
  );

  app.get<{ Params: { voiceId: string } }>(
    '/api/v1/voices/:voiceId/preview',
    async (request, reply) => {
      const composite = decodeURIComponent(request.params.voiceId);
      const separator = composite.indexOf(':');
      if (separator <= 0) {
        throw new AppError('INVALID_ARGUMENT', 'voiceId 需为 engineId:localId');
      }
      const engineId = composite.slice(0, separator);
      const localVoiceId = composite.slice(separator + 1);
      const provider = app.registry.resolveTTS(engineId);
      const voice = (await provider.listVoices()).find((item) => item.id === localVoiceId);
      if (!voice) {
        throw new AppError('INVALID_ARGUMENT', `未知音色：${localVoiceId}`);
      }
      if (voice.previewUrl) {
        return reply.redirect(voice.previewUrl, 302);
      }
      const key = await ensurePreview(app.storage, provider, voice);
      return reply.redirect(await app.storage.signedUrl(key, 300), 302);
    },
  );
}
