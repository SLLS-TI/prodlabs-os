'use client';

import { useQuery } from '@tanstack/react-query';
import { getGodStats } from '@/lib/api/endpoints/godStats';
import { qk } from '@/services/queryKeys';

export function useGodStatsQuery() {
  return useQuery({ queryKey: qk.godStats, queryFn: getGodStats });
}
