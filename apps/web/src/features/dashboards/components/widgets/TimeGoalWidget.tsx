import { useTranslations } from 'next-intl';
import { formatMinutes } from '@/utils/estimate';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeGoalQuery } from '../../services/analytics.service';

// The project's time goal and the time logged against it: a progress bar (filled =
// logged / goal, destructive when over), the two figures, and the status word. The
// goal and its period are a project setting, read from the endpoint; there is no
// per-widget config. With no goal set it points to Configuration.
export default function TimeGoalWidget({ projectKey }: { projectKey: string }) {
  const t = useTranslations('dashboards.timeGoal');
  const { data, isLoading } = useTimeGoalQuery(projectKey);

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data) return null;

  if (data.status === 'none' || data.goalMinutes == null) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('noGoal')}</p>;
  }

  const over = data.status === 'over';
  const filled = data.goalMinutes === 0 ? 1 : Math.min(1, data.loggedMinutes / data.goalMinutes);
  const periodLabel = t(data.period === 'weekly' ? 'period.weekly' : 'period.total');

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {formatMinutes(data.loggedMinutes)}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('goal', { time: formatMinutes(data.goalMinutes) })} · {periodLabel}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-foreground/70')}
          style={{ width: `${filled * 100}%` }}
        />
      </div>
      <span className={cn('text-xs', over ? 'text-destructive' : 'text-muted-foreground')}>
        {t(`status.${data.status}`)}
      </span>
    </div>
  );
}
