'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchEngines, fetchVoices } from './api';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useEngines() {
  return useQuery({
    queryKey: ['engines', 'tts'],
    queryFn: fetchEngines,
    staleTime: FIVE_MINUTES,
  });
}

export function useVoices(engineId: string, language?: string) {
  return useQuery({
    queryKey: ['voices', engineId, language ?? null],
    queryFn: () => fetchVoices(engineId, language),
    staleTime: FIVE_MINUTES,
    enabled: Boolean(engineId),
  });
}
