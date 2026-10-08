import { request } from '@/lib/api/core/client';
import type { Worklog } from '@/lib/api/endpoints/worklogs';

// A member's running timer on an issue, the bare session returned by start and inside
// stop. Running while it is in the list the running query returns; stopping it writes a
// worklog from the elapsed time.
export interface TimerSession {
  id: number;
  issueId: number;
  userId: string;
  startedAt: string;
}

// A running session enriched with its issue and project, returned by
// listRunningTimers. identifier is the human label ("MKT-42"); projectKey is the full
// ref ("<teamRef>.<key>") that issuePath and useStopTimer take.
export interface RunningTimer extends TimerSession {
  title: string;
  identifier: string;
  sequenceNumber: number;
  projectKey: string;
}

// The result of stopping a timer: the stopped session and the worklog it wrote, or
// null when the span rounded to no minutes.
export interface StopTimerResult {
  session: TimerSession;
  worklog: Worklog | null;
}

// The caller's running timers across the whole instance, loaded once and shared by
// every view so running state is resolved client-side by issue id.
export const listRunningTimers = () => request<RunningTimer[]>('/issues/timers/running');

export const startTimer = (issueId: number) =>
  request<TimerSession>(`/issues/${issueId}/timer/start`, { method: 'POST' });

export const stopTimer = (issueId: number) =>
  request<StopTimerResult>(`/issues/${issueId}/timer/stop`, { method: 'POST' });

// The global project timer, not tied to an issue. The bare session returned by start
// and inside stop; running while it is in the list listRunningProjectTimers returns.
export interface ProjectTimerSession {
  id: number;
  projectId: number;
  userId: string;
  startedAt: string;
}

// A running project session enriched with its project, returned by
// listRunningProjectTimers. projectKey is the full ref ("<teamRef>.<key>") that
// stopProjectTimer takes.
export interface RunningProjectTimer extends ProjectTimerSession {
  projectKey: string;
  projectName: string;
}

// One entry of time logged against a project directly (via the project timer).
export interface ProjectWorklog {
  id: number;
  projectId: number;
  userId: string;
  minutes: number;
  spentOn: string;
  note: string | null;
  createdAt: string;
}

// The result of stopping a project timer: the stopped session and the worklog it
// wrote, or null when the span rounded to no minutes.
export interface StopProjectTimerResult {
  session: ProjectTimerSession;
  worklog: ProjectWorklog | null;
}

export const listRunningProjectTimers = () =>
  request<RunningProjectTimer[]>('/projects/timers/running');

export const startProjectTimer = (projectKey: string) =>
  request<ProjectTimerSession>(`/projects/${projectKey}/timer/start`, { method: 'POST' });

export const stopProjectTimer = (projectKey: string) =>
  request<StopProjectTimerResult>(`/projects/${projectKey}/timer/stop`, { method: 'POST' });
