'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { formatMinutes } from '@/utils/estimate';
import { issuePath } from '@/utils/paths';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useRunningTimers, useStopTimer } from '../services/timers.service';
import { formatElapsed } from './IssueTimerButton';

// The caller's running timers, listed in the sidebar footer so they stay in view across
// projects and views. Each row links to its issue and can be stopped here. These are the
// user's own timers, shown even in a project where their role lost time-tracking
// visibility, so a forgotten timer can always be stopped.
export default function SidebarRunningTimers() {
  const t = useTranslations('nav');
  const tTimer = useTranslations('issue.timer');
  const { state } = useSidebar();
  const { data } = useRunningTimers();
  const stop = useStopTimer();
  const timers = data ?? [];

  // One ticker for the whole list; each row computes its own elapsed from now - startedAt.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (timers.length === 0) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timers.length]);

  if (timers.length === 0 || state === 'collapsed') return null;

  const onStop = (issueId: number, projectKey: string) => {
    stop.mutate(
      { issueId, projectKey },
      {
        onSuccess: (result) =>
          toast.success(
            result.worklog
              ? tTimer('stopped', { time: formatMinutes(result.worklog.minutes) })
              : tTimer('stoppedNoTime'),
          ),
      },
    );
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('runningTimers')}</SidebarGroupLabel>
      <SidebarMenu>
        {timers.map((timer) => {
          const elapsed = formatElapsed(
            now != null ? now - new Date(timer.startedAt).getTime() : 0,
          );
          return (
            <SidebarMenuItem key={timer.id}>
              <SidebarMenuButton asChild tooltip={`${timer.identifier} ${timer.title}`}>
                <Link href={issuePath(timer.projectKey, timer.sequenceNumber)}>
                  <span
                    className="size-1.5 shrink-0 animate-pulse rounded-full bg-destructive"
                    aria-hidden
                  />
                  <span className="shrink-0 text-xs text-destructive tabular-nums">{elapsed}</span>
                  <span className="truncate">{timer.title}</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuAction
                className="text-destructive"
                aria-label={t('stopTimer', { issue: timer.identifier })}
                onClick={() => onStop(timer.issueId, timer.projectKey)}
                disabled={stop.isPending}
              >
                <Square className="fill-current" />
              </SidebarMenuAction>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
