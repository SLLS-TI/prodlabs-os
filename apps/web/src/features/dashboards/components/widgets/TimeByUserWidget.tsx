import { useTranslations } from 'next-intl';
import Avatar from '@/components/common/Avatar';
import { formatMinutes } from '@/utils/estimate';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeByUserQuery } from '../../services/analytics.service';

// Time logged per member on the project, most minutes first. No per-widget config; it
// always shows every member who logged time.
export default function TimeByUserWidget({ projectKey }: { projectKey: string }) {
  const t = useTranslations('dashboards.timeByUser');
  const { data, isLoading } = useTimeByUserQuery(projectKey);
  const items = data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <ul className="divide-y divide-border/50 text-sm">
      {items.map((item) => (
        <li key={item.userId} className="flex items-center gap-2 py-1.5">
          <Avatar name={item.userName ?? ''} image={item.userImage} />
          <span className="min-w-0 flex-1 truncate">{item.userName ?? item.userId}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatMinutes(item.minutes)}
          </span>
        </li>
      ))}
    </ul>
  );
}
