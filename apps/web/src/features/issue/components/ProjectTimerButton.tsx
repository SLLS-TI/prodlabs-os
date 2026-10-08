'use client';

import { useEffect, useState } from 'react';
import { Loader2, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { formatMinutes } from '@/utils/estimate';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useRunningProjectTimers,
  useStartProjectTimer,
  useStopProjectTimer,
} from '../services/timers.service';
import { formatElapsed } from './IssueTimerButton';

// The global project timer control in the header: a play/stop button that logs time
// against the project itself, not an issue. Running state is resolved from the
// caller's running project-timers list by projectKey. The caller gates rendering on
// the time-logging feature and canSeeTime; a member who cannot see time never gets it.
export default function ProjectTimerButton({
  projectKey,
  canEdit,
}: {
  projectKey: string;
  canEdit: boolean;
}) {
  const t = useTranslations('issue.projectTimer');
  const running = useRunningProjectTimers();
  const start = useStartProjectTimer();
  const stop = useStopProjectTimer();
  const session = running.data?.find((s) => s.projectKey === projectKey) ?? null;
  const startedAt = session ? new Date(session.startedAt).getTime() : null;

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

  if (!canEdit) return null;

  const onToggle = () => {
    if (pending) return;
    if (isRunning) {
      stop.mutate(
        { projectKey },
        {
          onSuccess: (result) => {
            toast.success(
              result.worklog
                ? t('stopped', { time: formatMinutes(result.worklog.minutes) })
                : t('stoppedNoTime'),
            );
          },
        },
      );
    } else {
      start.mutate({ projectKey });
    }
  };

  const label = isRunning ? t('stop') : t('start');

  if (isRunning) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 py-0.5 ps-2 pe-0.5 text-destructive">
            <span className="size-1.5 animate-pulse rounded-full bg-destructive" aria-hidden />
            <span className="text-xs tabular-nums">{elapsed}</span>
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
          size="icon"
          className="size-8 shrink-0"
          aria-label={label}
          onClick={onToggle}
          disabled={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
