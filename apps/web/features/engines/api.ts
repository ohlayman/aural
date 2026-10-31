import type { EngineView, Voice } from '@aural/shared';
import { apiFetch } from '@/lib/api-client';

export function fetchEngines(): Promise<EngineView[]> {
  return apiFetch<EngineView[]>('/api/v1/engines?kind=tts');
}

export function fetchVoices(engineId: string, language?: string): Promise<Voice[]> {
  const params = new URLSearchParams({ engineId });
  if (language) params.set('language', language);
  return apiFetch<Voice[]>(`/api/v1/voices?${params.toString()}`);
}

export function previewUrl(voiceId: string): string {
  return `/api/v1/voices/${encodeURIComponent(voiceId)}/preview`;
}
