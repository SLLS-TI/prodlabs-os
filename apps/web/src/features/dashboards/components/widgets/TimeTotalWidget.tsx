import { formatMinutes } from '@/utils/estimate';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeByUserQuery } from '../../services/analytics.service';

// The project's total logged time as a single number. DRY on data: it reuses the
// time-per-user query and sums the per-user minutes client-side (the same pattern
// StatWidget uses for its count), so it needs no endpoint of its own.
export default function TimeTotalWidget({ projectKey }: { projectKey: string }) {
  const { data, isLoading } = useTimeByUserQuery(projectKey);

  if (isLoading) return <Skeleton className="h-10 w-20" />;

  const total = (data ?? []).reduce((sum, item) => sum + item.minutes, 0);
  return (
    <div className="text-4xl font-semibold tracking-tight tabular-nums">{formatMinutes(total)}</div>
  );
}
