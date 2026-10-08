'use client';

import { useTranslations } from 'next-intl';
import { formatMinutes } from '@/utils/estimate';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTimeGoalQuery } from '@/features/dashboards/services/analytics.service';

// A compact strip in the project header: this week's team time against the weekly
// goal. Shown only when the project has a weekly goal (period === 'weekly' with a
// goal set); a total goal or no goal renders nothing. Over-goal fills to 100% in the
// destructive color. The caller gates it on the time-logging feature and canSeeTime.
export default function WeeklyProgressBar({ projectKey }: { projectKey: string }) {
  const t = useTranslations('issue.weeklyBar');
  const { data } = useTimeGoalQuery(projectKey);

  if (!data || data.period !== 'weekly' || data.goalMinutes == null) return null;

  const over = data.status === 'over';
  const filled = data.goalMinutes === 0 ? 1 : Math.min(1, data.loggedMinutes / data.goalMinutes);
  const label = t('label', {
    logged: formatMinutes(data.loggedMinutes),
    goal: formatMinutes(data.goalMinutes),
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="hidden w-24 shrink-0 flex-col gap-1 sm:flex md:w-32"
          role="img"
          aria-label={label}
        >
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-foreground/70')}
              style={{ width: `${filled * 100}%` }}
            />
          </div>
          <span
            className={cn(
              'truncate text-[10px] tabular-nums',
              over ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{t('tooltip', { logged: formatMinutes(data.loggedMinutes) })}</TooltipContent>
    </Tooltip>
  );
}
