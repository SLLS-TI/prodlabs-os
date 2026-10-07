import { t } from 'elysia';

const HealthBand = t.Union([t.Literal('green'), t.Literal('yellow'), t.Literal('red')]);

const SubScores = t.Object({
  schedule: t.Nullable(t.Number()),
  budget: t.Nullable(t.Number()),
  velocity: t.Nullable(t.Number()),
  load: t.Nullable(t.Number()),
  freshness: t.Nullable(t.Number()),
});

const ProjectStatsRow = t.Object({
  projectId: t.Integer(),
  projectKey: t.String(),
  name: t.String(),
  teamId: t.Integer(),
  workedMinutes: t.Integer(),
  estimatedMinutes: t.Integer(),
  open: t.Integer(),
  inProgress: t.Integer(),
  overdue: t.Integer(),
  unassigned: t.Integer(),
  closedLast7d: t.Integer(),
  freshnessDays: t.Nullable(t.Integer()),
  healthScore: t.Integer(),
  healthBand: HealthBand,
  subScores: SubScores,
});

const GlobalRollup = t.Object({
  globalScore: t.Integer(),
  overduePct: t.Number(),
  redProjectCount: t.Integer(),
  globalBurnRatio: t.Nullable(t.Number()),
  totals: t.Object({
    projectCount: t.Integer(),
    openIssues: t.Integer(),
    overdueIssues: t.Integer(),
    workedMinutes: t.Integer(),
    estimatedMinutes: t.Integer(),
    closedLast7d: t.Integer(),
    unassigned: t.Integer(),
  }),
  weekCommitment: t.Object({
    committed: t.Integer(),
    done: t.Integer(),
    remaining: t.Integer(),
  }),
});

export const GodStatsResponse = t.Object({
  projects: t.Array(ProjectStatsRow),
  global: GlobalRollup,
});
