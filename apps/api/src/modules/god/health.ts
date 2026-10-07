// Pure health-score helper for the cross-project god stats. No DB or HTTP: it maps a
// project's raw metrics to a 0-100 score across five weighted dimensions. Each
// dimension returns null when it has no data for the project, and such dimensions drop
// out of the weighted mean so a project is never penalised for a metric it cannot have.

export interface HealthWeights {
  schedule: number;
  budget: number;
  velocity: number;
  load: number;
  freshness: number;
}

export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  schedule: 30,
  budget: 25,
  velocity: 20,
  load: 15,
  freshness: 10,
};

export const HEALTH_BANDS = { green: 80, yellow: 60 } as const;

export type HealthBand = 'green' | 'yellow' | 'red';

export interface HealthMetrics {
  open: number;
  inProgress: number;
  overdue: number;
  unassigned: number;
  closedLast7d: number;
  workedMinutes: number;
  estimatedMinutes: number;
  freshnessDays: number | null;
}

export interface HealthSubScores {
  schedule: number | null;
  budget: number | null;
  velocity: number | null;
  load: number | null;
  freshness: number | null;
}

export interface HealthResult {
  score: number;
  band: HealthBand;
  subScores: HealthSubScores;
}

export function bandFor(score: number): HealthBand {
  if (score >= HEALTH_BANDS.green) return 'green';
  if (score >= HEALTH_BANDS.yellow) return 'yellow';
  return 'red';
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Share of open work that is overdue; penalise the share, not the count, so size does
// not matter. Null when nothing is open.
function scheduleScore(m: HealthMetrics): number | null {
  if (m.open === 0) return null;
  const ratio = m.overdue / m.open;
  return Math.round(100 * (1 - ratio));
}

// Burn ratio worked/estimated: on or under budget is 100, overrun falls off linearly
// to 0 at twice the estimate. Null when there are no estimates or no time logged at
// all (logging off reads as no data, not as on-budget).
function budgetScore(m: HealthMetrics): number | null {
  if (m.estimatedMinutes === 0 || m.workedMinutes === 0) return null;
  const r = m.workedMinutes / m.estimatedMinutes;
  if (r <= 1) return 100;
  return Math.round(Math.max(0, 100 * (2 - r)));
}

// Weekly throughput against the open backlog: closing a quarter of the backlog in a
// week scores 100, linearly below. Null for an idle project with no open work and no
// closings (no signal either way).
function velocityScore(m: HealthMetrics): number | null {
  if (m.open === 0 && m.closedLast7d === 0) return null;
  const ratio = m.open > 0 ? m.closedLast7d / m.open : m.closedLast7d > 0 ? 1 : 0;
  return Math.round(100 * Math.min(1, ratio / 0.25));
}

// Unassigned open work and WIP overload, averaged. WIP up to 40% of open is healthy;
// above that scales to full overload at 100% WIP. Null when nothing is open.
function loadScore(m: HealthMetrics): number | null {
  if (m.open === 0) return null;
  const unassignedShare = m.unassigned / m.open;
  const wipShare = m.inProgress / m.open;
  const overload = Math.max(0, wipShare - 0.4) / 0.6;
  return Math.round(100 * (1 - 0.5 * unassignedShare - 0.5 * overload));
}

// Days since the newest worklog: fresh up to 2 days, decaying to 0 at 14 days. Null
// when there is no worklog at all.
function freshnessScore(m: HealthMetrics): number | null {
  if (m.freshnessDays === null) return null;
  return Math.round(100 * clamp((14 - m.freshnessDays) / 12, 0, 1));
}

export function computeHealth(m: HealthMetrics, weights?: Partial<HealthWeights>): HealthResult {
  const w: HealthWeights = { ...DEFAULT_HEALTH_WEIGHTS, ...(weights ?? {}) };
  const subScores: HealthSubScores = {
    schedule: scheduleScore(m),
    budget: budgetScore(m),
    velocity: velocityScore(m),
    load: loadScore(m),
    freshness: freshnessScore(m),
  };

  const present = (Object.keys(subScores) as (keyof HealthSubScores)[]).filter(
    (k) => subScores[k] !== null,
  );

  // No dimension has data (a brand-new empty project): nothing is wrong yet.
  if (present.length === 0) return { score: 100, band: 'green', subScores };

  let weighted = 0;
  let totalWeight = 0;
  for (const k of present) {
    weighted += subScores[k]! * w[k];
    totalWeight += w[k];
  }

  // Every present dimension was weighted 0: fall back to an equal mean so the score is
  // still defined.
  if (totalWeight === 0) {
    const mean = present.reduce((sum, k) => sum + subScores[k]!, 0) / present.length;
    const score = Math.round(mean);
    return { score, band: bandFor(score), subScores };
  }

  const score = Math.round(weighted / totalWeight);
  return { score, band: bandFor(score), subScores };
}
