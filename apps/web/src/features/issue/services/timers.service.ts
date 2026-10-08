// The play/stop timer on an issue. The caller's running timers are fetched once and
// shared by every view; a view reads an issue's running state by looking it up by
// issueId in that list, so there is no per-issue request. Starting flips the button,
// so it only refreshes the running list; stopping writes a worklog, so it refreshes
// the full worklog set (the sum, the feed, the board) plus the timers and analytics.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listRunningTimers,
  startTimer,
  stopTimer,
  listRunningProjectTimers,
  startProjectTimer,
  stopProjectTimer,
} from '@/lib/api/endpoints/timers';
import { qk } from '@/services/queryKeys';

export function useRunningTimers() {
  return useQuery({ queryKey: qk.timerSessions(), queryFn: listRunningTimers });
}

export function useStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { issueId: number }) => startTimer(vars.issueId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.timerSessions() });
    },
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { issueId: number; projectKey: string }) => stopTimer(vars.issueId),
    onSuccess: (_data, { issueId, projectKey }) => {
      void qc.invalidateQueries({ queryKey: qk.timerSessions() });
      void qc.invalidateQueries({ queryKey: qk.worklogs(issueId) });
      void qc.invalidateQueries({ queryKey: qk.issue(issueId) });
      void qc.invalidateQueries({ queryKey: qk.feed(issueId) });
      void qc.invalidateQueries({ queryKey: qk.boardIssues(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.analyticsForProject(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.weeklyProgress() });
    },
  });
}

// The global project timer, mirroring the issue timer hooks but keyed to a project.
// The caller's running project sessions are fetched once and shared; a view reads its
// project's running state by looking it up by projectKey in the list.
export function useRunningProjectTimers() {
  return useQuery({
    queryKey: qk.projectTimerSessions(),
    queryFn: listRunningProjectTimers,
  });
}

export function useStartProjectTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { projectKey: string }) => startProjectTimer(vars.projectKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.projectTimerSessions() });
    },
  });
}

export function useStopProjectTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { projectKey: string }) => stopProjectTimer(vars.projectKey),
    onSuccess: (_data, { projectKey }) => {
      void qc.invalidateQueries({ queryKey: qk.projectTimerSessions() });
      void qc.invalidateQueries({ queryKey: qk.analyticsForProject(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.weeklyProgress() });
    },
  });
}
