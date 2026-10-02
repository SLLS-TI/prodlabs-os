'use client';

import { useEffect, useState } from 'react';
import { Loader2, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { formatMinutes } from '@/utils/estimate';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRunningTimers, useStartTimer, useStopTimer } from '../services/timers.service';

// The running time as h:mm:ss. formatMinutes has no seconds, so the ticking readout
// gets its own formatter; the logged totals and the stop toast use formatMinutes.
// Exported so the sidebar running-timers list renders the same readout.
export function formatElapsed(ms: number): string {
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

  const pill = (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-destructive">
      <span className="size-1.5 animate-pulse rounded-full bg-destructive" aria-hidden />
      <span className="text-xs tabular-nums">{elapsed}</span>
    </span>
  );

  // A non-editor gets no control: the recording pill with the live counter when one
  // ticks, nothing when it does not. The value, not a disabled stop button.
  if (!canEdit) {
    if (!isRunning) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
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

  const label = isRunning ? t('stop') : t('start');

  // The stop control shared by both running states: a compact ghost button carrying
  // the Square. Its onToggle stops propagation so a click never opens the row.
  const stopButton = (
    <Button
      variant="ghost"
      size="icon-xs"
      className="shrink-0 text-destructive"
      aria-label={label}
      onClick={onToggle}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Square className="size-3.5 fill-current" />
      )}
    </Button>
  );

  if (variant === 'inline') {
    if (isRunning) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 py-0.5 ps-2 pe-0.5 text-destructive">
          <span className="size-1.5 animate-pulse rounded-full bg-destructive" aria-hidden />
          <span className="text-sm tabular-nums">{elapsed}</span>
          {stopButton}
        </span>
      );
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5"
        onClick={onToggle}
        disabled={pending}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
        {label}
      </Button>
    );
  }

  if (isRunning) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 py-0.5 ps-1.5 text-destructive">
            <span className="size-1.5 animate-pulse rounded-full bg-destructive" aria-hidden />
            <span className="text-xs tabular-nums">{elapsed}</span>
            {stopButton}
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('running', { time: elapsed })}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
          aria-label={label}
          onClick={onToggle}
          disabled={pending}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
