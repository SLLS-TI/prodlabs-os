import { useQuery } from '@tanstack/react-query';
import { getWeeklyProgressBatch, type BatchTimeGoalItem } from '@/lib/api/endpoints/analytics';
import { qk } from '@/services/queryKeys';

// Weekly progress for every project the caller may see time for that has a weekly
// goal, in one batch request behind the project switcher rings. Keyed on its own, so
// the trigger and every row share the single cached result (no request per project).
// The switcher owns the fetch while it is open (enabled); the trigger and rows read
// the same cache with enabled false, so opening it fires exactly one request. A client
// gets an empty array, so no project shows a ring.
export function useProjectWeeklyProgress(enabled: boolean): Map<number, BatchTimeGoalItem> {
  const { data } = useQuery({
    queryKey: qk.weeklyProgress(),
    queryFn: getWeeklyProgressBatch,
    enabled,
  });
  return new Map((data ?? []).map((item) => [item.projectId, item]));
}
