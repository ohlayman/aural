import type { Job } from '@aural/shared';
import { ApiError, apiFetch } from '@/lib/api-client';

export interface CreateTTSJobInput {
  text: string;
  engineId: string;
  voiceId: string;
}

export interface CreateTTSJobResult {
  jobId: string;
  status: string;
  createdAt: string;
}

export function createTTSJob(input: CreateTTSJobInput): Promise<CreateTTSJobResult> {
  return apiFetch<CreateTTSJobResult>('/api/v1/tts/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getJob(jobId: string): Promise<Job> {
  return apiFetch<Job>(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
}

/**
 * Downloads a finished asset's audio. The API answers with a 302 to a signed
 * file URL; `fetch` follows it by default, so the resolved response is audio.
 */
export async function fetchAssetAudio(assetId: string): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(
      `/api/v1/assets/${encodeURIComponent(assetId)}/audio`,
      { credentials: 'include' },
    );
  } catch (cause) {
    throw new ApiError({
      code: 'NETWORK',
      message: 'Network request failed',
      status: 0,
      retryable: true,
      cause,
    });
  }

  if (!response.ok) {
    throw new ApiError({
      code: 'HTTP_ERROR',
      message: response.statusText || 'Request failed',
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  return response.arrayBuffer();
}
