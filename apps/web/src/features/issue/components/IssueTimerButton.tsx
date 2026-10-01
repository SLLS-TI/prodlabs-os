'use client';

import { useEffect, useState } from 'react';
import { Loader2, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { formatMinutes } from '@/utils/estimate';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRunningTimers, useStartTimer, useStopTimer } from '../services/timers.service';

// The running time as h:mm:ss. formatMinutes has no seconds, so the ticking readout
// gets its own formatter; the logged totals and the stop toast use formatMinutes.
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// The play/stop timer on an issue, the single control shared by the board card, the
// table row, the calendar chip and the issue detail. Running state is resolved from
// the caller's running-timers list by issue id — no per-issue request. A member
// without work_items edit sees a read-only running indicator but cannot start or
// stop; when no timer runs the button is hidden for them (a reader gets values, not
// disabled controls). The caller gates rendering on the time-logging feature.
export function IssueTimerButton({
  issueId,
  projectKey,
  canEdit,
  variant = 'icon',
}: {
  issueId: number;
  projectKey: string;
  canEdit: boolean;
  variant?: 'icon' | 'inline';
}) {
  const t = useTranslations('issue.timer');
  const running = useRunningTimers();
  const start = useStartTimer();
  const stop = useStopTimer();
  const session = running.data?.find((s) => s.issueId === issueId) ?? null;
  const startedAt = session ? new Date(session.startedAt).getTime() : null;

  // Ticks only after mount, so the server render and the first client render agree
  // (no seconds on the server). Reseeded whenever the running session starts or stops.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (startedAt == null) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const isRunning = session != null;
  const elapsedMs = startedAt != null && now != null ? now - startedAt : 0;
  const elapsed = formatElapsed(elapsedMs);
  const pending = start.isPending || stop.isPending;

  // A non-editor gets no control: a running indicator when one ticks, nothing when
  // it does not.
  if (!canEdit) {
    if (!isRunning) return null;
    const indicator = (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs text-primary tabular-nums',
          variant === 'icon' && 'shrink-0',
        )}
      >
        <Square className="size-3 fill-current" />
        {variant === 'inline' && <span>{elapsed}</span>}
      </span>
    );
    return (
      <Tooltip>
        <TooltipTrigger asChild>{indicator}</TooltipTrigger>
        <TooltipContent>{t('running', { time: elapsed })}</TooltipContent>
      </Tooltip>
    );
  }

  const onToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (pending) return;
    if (isRunning) {
      stop.mutate(
        { issueId, projectKey },
        {
          // The detail (inline) view already shows the result — the worklog tally
          // updates and the button flips — so only the compact variants, where the
          // write is otherwise invisible, toast.
          onSuccess: (result) => {
            if (variant === 'inline') return;
            toast.success(
              result.worklog
                ? t('stopped', { time: formatMinutes(result.worklog.minutes) })
                : t('stoppedNoTime'),
            );
          },
        },
      );
    } else {
      start.mutate({ issueId });
    }
  };

  const icon = pending ? (
    <Loader2 className="size-3.5 animate-spin" />
  ) : isRunning ? (
    <Square className="size-3.5 fill-current" />
  ) : (
    <Play className="size-3.5" />
  );
  const label = isRunning ? t('stop') : t('start');

  if (variant === 'inline') {
    return (
      <Button
        variant={isRunning ? 'secondary' : 'ghost'}
        size="sm"
        className={cn('h-7 gap-1.5', isRunning && 'text-primary')}
        onClick={onToggle}
        disabled={pending}
      >
        {icon}
        {isRunning ? <span className="tabular-nums">{elapsed}</span> : label}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('shrink-0', isRunning && 'text-primary')}
          aria-label={label}
          onClick={onToggle}
          disabled={pending}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isRunning ? t('running', { time: elapsed }) : label}</TooltipContent>
    </Tooltip>
  );
}
