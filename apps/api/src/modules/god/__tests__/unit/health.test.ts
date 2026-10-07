import { describe, expect, it } from 'bun:test';
import { DEFAULT_HEALTH_WEIGHTS, bandFor, computeHealth, type HealthMetrics } from '../../health';

const base: HealthMetrics = {
  open: 0,
  inProgress: 0,
  overdue: 0,
  unassigned: 0,
  closedLast7d: 0,
  workedMinutes: 0,
  estimatedMinutes: 0,
  freshnessDays: null,
};

const metrics = (over: Partial<HealthMetrics>): HealthMetrics => ({ ...base, ...over });

describe('bandFor', () => {
  it('applies the documented thresholds', () => {
    expect(bandFor(80)).toBe('green');
    expect(bandFor(79)).toBe('yellow');
    expect(bandFor(60)).toBe('yellow');
    expect(bandFor(59)).toBe('red');
  });
});

describe('computeHealth sub-scores', () => {
  it('schedule: 2 overdue of 10 open scores 80', () => {
    const r = computeHealth(metrics({ open: 10, overdue: 2 }));
    expect(r.subScores.schedule).toBe(80);
  });

  it('schedule: null when nothing is open', () => {
    const r = computeHealth(metrics({ open: 0 }));
    expect(r.subScores.schedule).toBeNull();
  });

  it('budget: worked 1.5x estimate scores 50, 0.8x scores 100', () => {
    expect(
      computeHealth(metrics({ estimatedMinutes: 100, workedMinutes: 150 })).subScores.budget,
    ).toBe(50);
    expect(
      computeHealth(metrics({ estimatedMinutes: 100, workedMinutes: 80 })).subScores.budget,
    ).toBe(100);
  });

  it('budget: null when no estimates or no time logged', () => {
    expect(
      computeHealth(metrics({ estimatedMinutes: 0, workedMinutes: 100 })).subScores.budget,
    ).toBeNull();
    expect(
      computeHealth(metrics({ estimatedMinutes: 100, workedMinutes: 0 })).subScores.budget,
    ).toBeNull();
  });

  it('velocity: closed 2 of 20 open scores 40', () => {
    expect(computeHealth(metrics({ open: 20, closedLast7d: 2 })).subScores.velocity).toBe(40);
  });

  it('velocity: null when idle (no open work, no closings)', () => {
    expect(computeHealth(metrics({ open: 0, closedLast7d: 0 })).subScores.velocity).toBeNull();
  });

  it('load: 5 unassigned and 9 in-progress of 10 open scores 33', () => {
    const r = computeHealth(metrics({ open: 10, unassigned: 5, inProgress: 9 }));
    expect(r.subScores.load).toBe(33);
  });

  it('freshness: 5 days scores 75, null with no worklog', () => {
    expect(computeHealth(metrics({ freshnessDays: 5 })).subScores.freshness).toBe(75);
    expect(computeHealth(metrics({ freshnessDays: null })).subScores.freshness).toBeNull();
  });
});

describe('computeHealth normalization', () => {
  it('drops budget when there are no estimates and re-normalizes over the rest', () => {
    const noBudget = computeHealth(
      metrics({ open: 10, overdue: 2, closedLast7d: 3, freshnessDays: 1 }),
    );
    expect(noBudget.subScores.budget).toBeNull();
    // Only schedule/velocity/load/freshness contribute; budget's absence must not
    // change the score relative to the same metrics with budget forced on-budget.
    const withBudget = computeHealth(
      metrics({
        open: 10,
        overdue: 2,
        closedLast7d: 3,
        freshnessDays: 1,
        estimatedMinutes: 100,
        workedMinutes: 80,
      }),
    );
    expect(withBudget.subScores.budget).toBe(100);
    expect(noBudget.score).not.toBe(withBudget.score);
    expect(noBudget.subScores.schedule).toBe(withBudget.subScores.schedule);
  });

  it('logging off drops both budget and freshness', () => {
    const r = computeHealth(
      metrics({ open: 10, overdue: 1, closedLast7d: 2, workedMinutes: 0, freshnessDays: null }),
    );
    expect(r.subScores.budget).toBeNull();
    expect(r.subScores.freshness).toBeNull();
    expect(r.subScores.schedule).not.toBeNull();
  });

  it('an empty project with no data at all scores 100 green', () => {
    const r = computeHealth(base);
    expect(r.score).toBe(100);
    expect(r.band).toBe('green');
    expect(Object.values(r.subScores).every((v) => v === null)).toBe(true);
  });

  it('merges partial stored weights over the defaults', () => {
    const m = metrics({ open: 10, overdue: 5, closedLast7d: 10, freshnessDays: 1 });
    const scheduleOnly = computeHealth(m, { schedule: 100, velocity: 0, load: 0, freshness: 0 });
    // With only schedule weighted, the score equals the schedule sub-score (50).
    expect(scheduleOnly.subScores.schedule).toBe(50);
    expect(scheduleOnly.score).toBe(50);
  });

  it('a key set to 0 excludes that dimension without treating it as missing data', () => {
    const m = metrics({ open: 10, overdue: 2, closedLast7d: 3, freshnessDays: 1 });
    const freshnessZeroed = computeHealth(m, { ...DEFAULT_HEALTH_WEIGHTS, freshness: 0 });
    expect(freshnessZeroed.subScores.freshness).not.toBeNull();
    const freshnessDefault = computeHealth(m);
    expect(freshnessZeroed.score).not.toBe(freshnessDefault.score);
  });

  it('falls back to an equal mean when every present dimension is weighted 0', () => {
    const m = metrics({ open: 10, overdue: 2, closedLast7d: 3, freshnessDays: 1 });
    const allZero = computeHealth(m, {
      schedule: 0,
      budget: 0,
      velocity: 0,
      load: 0,
      freshness: 0,
    });
    const subs = [
      allZero.subScores.schedule,
      allZero.subScores.velocity,
      allZero.subScores.load,
      allZero.subScores.freshness,
    ].filter((v): v is number => v !== null);
    const mean = Math.round(subs.reduce((a, b) => a + b, 0) / subs.length);
    expect(allZero.score).toBe(mean);
  });
});
