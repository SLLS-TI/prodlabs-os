import { request } from '@/lib/api/core/client';
import type { Worklog } from '@/lib/api/endpoints/worklogs';

// A member's running timer on an issue. Running while it is in the list the running
// query returns; stopping it writes a worklog from the elapsed time.
export interface TimerSession {
  id: number;
  issueId: number;
  userId: string;
  startedAt: string;
}

// The result of stopping a timer: the stopped session and the worklog it wrote, or
// null when the span rounded to no minutes.
export interface StopTimerResult {
  session: TimerSession;
  worklog: Worklog | null;
}

// The caller's running timers across the whole instance, loaded once and shared by
// every view so running state is resolved client-side by issue id.
export const listRunningTimers = () => request<TimerSession[]>('/issues/timers/running');

export const startTimer = (issueId: number) =>
  request<TimerSession>(`/issues/${issueId}/timer/start`, { method: 'POST' });

export const stopTimer = (issueId: number) =>
  request<StopTimerResult>(`/issues/${issueId}/timer/stop`, { method: 'POST' });
