import { db } from '@repo/db';
import { sql } from 'drizzle-orm';
import { computeHealth, type HealthMetrics, type HealthResult, type HealthWeights } from './health';

// Cross-project ("portfolio") statistics for god mode. It reads every project without a
// membership or time-visibility check — consistent with the rest of god mode, which sees
// the whole instance. Figures are point-in-time from the current DB state; there is no
// snapshot table and no history. Each grouped query makes one pass over its table; counts
// are cast to int (Postgres count() returns bigint, which would otherwise arrive as a
// string). Archived issues are excluded from the issue counts here (archived_at IS NULL),
// which is a deliberate divergence from the per-project getStats overdue count.

interface ProjectRaw extends HealthMetrics {
  projectId: number;
  projectKey: string;
  name: string;
  teamId: number;
  weights: Partial<HealthWeights> | null;
}

interface ProjectStatsRow extends HealthMetrics {
  projectId: number;
  projectKey: string;
  name: string;
  teamId: number;
  healthScore: number;
  healthBand: HealthResult['band'];
  subScores: HealthResult['subScores'];
}

export async function getGodStats() {
  const projectRows = (await db.execute(sql`
    SELECT id, key, name, team_id, health_weights FROM project
  `)) as unknown as {
    id: number;
    key: string;
    name: string;
    team_id: number;
    health_weights: Partial<HealthWeights> | null;
  }[];

  const workedRows = (await db.execute(sql`
    SELECT i.project_id, COALESCE(SUM(w.minutes), 0)::int AS worked_minutes
      FROM issue i
      LEFT JOIN issue_worklog w ON w.issue_id = i.id
     GROUP BY i.project_id
  `)) as unknown as { project_id: number; worked_minutes: number }[];

  const estimatedRows = (await db.execute(sql`
    SELECT project_id, COALESCE(SUM(estimate_minutes), 0)::int AS estimated_minutes
      FROM issue
     WHERE estimate_minutes IS NOT NULL
     GROUP BY project_id
  `)) as unknown as { project_id: number; estimated_minutes: number }[];

  const stateRows = (await db.execute(sql`
    SELECT i.project_id,
           count(*) FILTER (
             WHERE pc.state_type NOT IN ('completed', 'canceled')
               AND i.archived_at IS NULL)::int AS open,
           count(*) FILTER (
             WHERE pc.state_type = 'started'
               AND i.archived_at IS NULL)::int AS in_progress,
           count(*) FILTER (
             WHERE i.due_date < CURRENT_DATE
               AND pc.state_type NOT IN ('completed', 'canceled')
               AND i.archived_at IS NULL)::int AS overdue,
           count(*) FILTER (
             WHERE i.assignee_user_id IS NULL
               AND pc.state_type NOT IN ('completed', 'canceled')
               AND i.archived_at IS NULL)::int AS unassigned
      FROM issue i
      JOIN project_column pc ON pc.id = i.column_id
     GROUP BY i.project_id
  `)) as unknown as {
    project_id: number;
    open: number;
    in_progress: number;
    overdue: number;
    unassigned: number;
  }[];

  const closedRows = (await db.execute(sql`
    SELECT i.project_id, count(*)::int AS closed_last_7d
      FROM (
        SELECT s.issue_id, min(s.entered_at) AS closed_at
          FROM issue_status s
         WHERE s.state_type = 'completed'
           AND NOT EXISTS (
                 SELECT 1 FROM issue_status p
                  WHERE p.issue_id = s.issue_id
                    AND p.state_type IS DISTINCT FROM 'completed'
                    AND (p.entered_at, p.id) > (s.entered_at, s.id))
         GROUP BY s.issue_id) c
      JOIN issue i ON i.id = c.issue_id
     WHERE c.closed_at >= now() - interval '7 days'
     GROUP BY i.project_id
  `)) as unknown as { project_id: number; closed_last_7d: number }[];

  const freshnessRows = (await db.execute(sql`
    SELECT i.project_id, (CURRENT_DATE - max(w.spent_on))::int AS freshness_days
      FROM issue_worklog w
      JOIN issue i ON i.id = w.issue_id
     GROUP BY i.project_id
  `)) as unknown as { project_id: number; freshness_days: number }[];

  const worked = new Map(workedRows.map((r) => [r.project_id, r.worked_minutes]));
  const estimated = new Map(estimatedRows.map((r) => [r.project_id, r.estimated_minutes]));
  const states = new Map(stateRows.map((r) => [r.project_id, r]));
  const closed = new Map(closedRows.map((r) => [r.project_id, r.closed_last_7d]));
  const freshness = new Map(freshnessRows.map((r) => [r.project_id, r.freshness_days]));

  const raws: ProjectRaw[] = projectRows.map((p) => {
    const s = states.get(p.id);
    return {
      projectId: p.id,
      projectKey: p.key,
      name: p.name,
      teamId: p.team_id,
      weights: p.health_weights,
      workedMinutes: worked.get(p.id) ?? 0,
      estimatedMinutes: estimated.get(p.id) ?? 0,
      open: s?.open ?? 0,
      inProgress: s?.in_progress ?? 0,
      overdue: s?.overdue ?? 0,
      unassigned: s?.unassigned ?? 0,
      closedLast7d: closed.get(p.id) ?? 0,
      freshnessDays: freshness.get(p.id) ?? null,
    };
  });

  const projects: ProjectStatsRow[] = raws.map((r) => {
    const health = computeHealth(r, r.weights ?? undefined);
    return {
      projectId: r.projectId,
      projectKey: r.projectKey,
      name: r.name,
      teamId: r.teamId,
      workedMinutes: r.workedMinutes,
      estimatedMinutes: r.estimatedMinutes,
      open: r.open,
      inProgress: r.inProgress,
      overdue: r.overdue,
      unassigned: r.unassigned,
      closedLast7d: r.closedLast7d,
      freshnessDays: r.freshnessDays,
      healthScore: health.score,
      healthBand: health.band,
      subScores: health.subScores,
    };
  });

  const totals = {
    projectCount: projects.length,
    openIssues: sum(projects, (p) => p.open),
    overdueIssues: sum(projects, (p) => p.overdue),
    workedMinutes: sum(projects, (p) => p.workedMinutes),
    estimatedMinutes: sum(projects, (p) => p.estimatedMinutes),
    closedLast7d: sum(projects, (p) => p.closedLast7d),
    unassigned: sum(projects, (p) => p.unassigned),
  };

  // Size-weighted by open-issue count, so projects with more work at stake count for
  // more. A portfolio of only empty projects (no open work) falls back to a plain mean.
  const sizeWeight = totals.openIssues;
  const globalScore =
    projects.length === 0
      ? 100
      : sizeWeight > 0
        ? Math.round(sum(projects, (p) => p.healthScore * p.open) / sizeWeight)
        : Math.round(sum(projects, (p) => p.healthScore) / projects.length);

  const overduePct =
    totals.openIssues > 0 ? round1((totals.overdueIssues / totals.openIssues) * 100) : 0;

  const globalBurnRatio =
    totals.estimatedMinutes > 0 ? round2(totals.workedMinutes / totals.estimatedMinutes) : null;

  const redProjectCount = projects.filter((p) => p.healthBand === 'red').length;

  return {
    projects,
    global: { globalScore, overduePct, redProjectCount, globalBurnRatio, totals },
  };
}

function sum<T>(rows: T[], get: (row: T) => number): number {
  return rows.reduce((acc, row) => acc + get(row), 0);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
