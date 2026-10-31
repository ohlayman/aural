'use client';

import type { Job, JobStatus } from '@aural/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getJob } from './api';

const TERMINAL_STATUSES = new Set<JobStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'expired',
]);

const FIRST_PHASE_UPDATES = 5;
const FAST_INTERVAL_MS = 1000;
const STEADY_INTERVAL_MS = 2000;
const SLOW_INTERVAL_MS = 5000;
const SLOW_AFTER_MS = 60_000;

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Polls a TTS job: 1s for the first five updates, 2s for the next minute,
 * then 5s. Stops once the job reaches a terminal status.
 */
export function useTTSJob(jobId?: string) {
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current = jobId ? Date.now() : null;
  }, [jobId]);

  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => {
      if (!jobId) return Promise.reject(new Error('Missing job id'));
      return getJob(jobId);
    },
    enabled: !!jobId,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const data: Job | undefined = query.state.data;
      if (data && isTerminalStatus(data.status)) return false;

      if (query.state.dataUpdateCount < FIRST_PHASE_UPDATES) {
        return FAST_INTERVAL_MS;
      }

      const elapsed = startedAt.current ? Date.now() - startedAt.current : 0;
      return elapsed < SLOW_AFTER_MS ? STEADY_INTERVAL_MS : SLOW_INTERVAL_MS;
    },
  });
}
