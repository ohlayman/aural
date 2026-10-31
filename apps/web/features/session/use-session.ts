'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchSession, sessionQueryKey } from './api';

export function useSession() {
  return useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession });
}
