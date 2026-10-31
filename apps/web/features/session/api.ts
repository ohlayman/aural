import type { Session } from '@aural/shared';
import { apiFetch } from '@/lib/api-client';

export const sessionQueryKey = ['session'] as const;

export function fetchSession(): Promise<Session> {
  return apiFetch<Session>('/api/v1/session');
}
