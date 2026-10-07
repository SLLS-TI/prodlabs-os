import { request } from '@/lib/api/core/client';

// Cross-project ("portfolio") statistics for god mode: per-project metrics with a
// health score, plus an instance-wide roll-up. Point-in-time, no history.

export type HealthBand = 'green' | 'yellow' | 'red';

export interface HealthSubScores {
  schedule: number | null;
  budget: number | null;
  velocity: number | null;
  load: number | null;
  freshness: number | null;
}

export interface GodStatsProject {
  projectId: number;
  projectKey: string;
  name: string;
  teamId: number;
  workedMinutes: number;
  estimatedMinutes: number;
  open: number;
  inProgress: number;
  overdue: number;
  unassigned: number;
  closedLast7d: number;
  freshnessDays: number | null;
  healthScore: number;
  healthBand: HealthBand;
  subScores: HealthSubScores;
}

export interface GodStatsGlobal {
  globalScore: number;
  overduePct: number;
  redProjectCount: number;
  globalBurnRatio: number | null;
  totals: {
    projectCount: number;
    openIssues: number;
    overdueIssues: number;
    workedMinutes: number;
    estimatedMinutes: number;
    closedLast7d: number;
    unassigned: number;
  };
  weekCommitment: {
    committed: number;
    done: number;
    remaining: number;
  };
}

export interface GodStats {
  projects: GodStatsProject[];
  global: GodStatsGlobal;
}

export const getGodStats = () => request<GodStats>('/god/stats');
