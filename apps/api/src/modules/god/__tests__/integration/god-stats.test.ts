import { describe, it, expect, beforeEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { type Api } from '#tests/helpers/app';
import { createRole } from '#tests/helpers/roles';
import { addUser, setup } from '../helpers';

// Cross-project god statistics. Figures are derived from the real issue /
// issue_worklog / issue_status tables, so the tests build state through the create /
// move / log-time API rather than inserting rows. The god user (first signup) reads
// every project; a plain user is refused.

const TODAY = new Date().toISOString().slice(0, 10);

// Monday of the current week (date_trunc('week') in Postgres), as 'YYYY-MM-DD'. Any due
// date between this and the following Sunday counts toward the current-week commitment.
function mondayOfThisWeek(): string {
  const d = new Date();
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

async function createProject(api: Api, key: string, name: string) {
  const created = await api.projects.post({ key, name });
  const view = await api.projects({ projectKey: key }).get();
  const col: Record<string, number> = {};
  for (const c of view.data!.columns) col[c.stateType] = c.id;
  return { projectId: created.data!.id, col };
}

async function createIssue(
  api: Api,
  key: string,
  columnId: number,
  extra: {
    title?: string;
    dueDate?: string | null;
    estimateMinutes?: number | null;
    assigneeUserId?: string | null;
  } = {},
) {
  const { title = 'Task', ...rest } = extra;
  const res = await api.projects({ projectKey: key }).issues.post({ columnId, title, ...rest });
  if (!res.data) throw new Error(`createIssue failed with status ${res.status}`);
  return res.data;
}

describe('god stats', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('access', () => {
    it('refuses a plain user and allows the instance owner', async () => {
      const { god } = await setup();
      const outsider = await addUser({ email: 'outsider@example.com' });

      expect((await outsider.api.god.stats.get()).status).toBe(403);
      expect((await god.api.god.stats.get()).status).toBe(200);
    });
  });

  describe('aggregation', () => {
    it('reports per-project metrics and a size-weighted roll-up', async () => {
      const { god } = await setup();
      const { col: mkt } = await createProject(god.api, 'MKT', 'Marketing');
      const { col: eng } = await createProject(god.api, 'ENG', 'Engineering');

      // MKT: one overdue unassigned open issue with an estimate and logged time, plus
      // one issue closed today.
      const overdue = await createIssue(god.api, 'MKT', mkt.unstarted, {
        dueDate: '2000-01-01',
        estimateMinutes: 100,
        assigneeUserId: god.id,
      });
      await god.api.issues({ issueId: overdue.id }).worklogs.post({ minutes: 60, spentOn: TODAY });
      const unassignedOpen = await createIssue(god.api, 'MKT', mkt.backlog);
      await god.api.issues({ issueId: unassignedOpen.id }).patch({ assigneeUserId: null });
      const toClose = await createIssue(god.api, 'MKT', mkt.started, { assigneeUserId: god.id });
      await god.api.issues({ issueId: toClose.id }).patch({ columnId: mkt.completed });

      // ENG: a single open issue, no time, no estimate.
      await createIssue(god.api, 'ENG', eng.started, { assigneeUserId: god.id });

      const res = await god.api.god.stats.get();
      expect(res.status).toBe(200);

      const mktRow = res.data!.projects.find((p) => p.projectKey === 'MKT')!;
      const engRow = res.data!.projects.find((p) => p.projectKey === 'ENG')!;

      expect(mktRow).toMatchObject({
        workedMinutes: 60,
        estimatedMinutes: 100,
        open: 2,
        overdue: 1,
        unassigned: 1,
        closedLast7d: 1,
      });
      expect(mktRow.freshnessDays).toBe(0);
      expect(engRow).toMatchObject({
        workedMinutes: 0,
        estimatedMinutes: 0,
        open: 1,
        overdue: 0,
        closedLast7d: 0,
      });
      expect(engRow.freshnessDays).toBeNull();

      const totals = res.data!.global.totals;
      expect(totals).toMatchObject({
        projectCount: 2,
        openIssues: 3,
        overdueIssues: 1,
        workedMinutes: 60,
        estimatedMinutes: 100,
        closedLast7d: 1,
        unassigned: 1,
      });
      // overduePct = 1 overdue of 3 open.
      expect(res.data!.global.overduePct).toBeCloseTo(33.3, 1);
      // globalBurnRatio = 60 worked / 100 estimated.
      expect(res.data!.global.globalBurnRatio).toBeCloseTo(0.6, 2);
    });

    it('excludes archived issues from the open and overdue counts', async () => {
      const { god } = await setup();
      const { col } = await createProject(god.api, 'MKT', 'Marketing');
      const archived = await createIssue(god.api, 'MKT', col.started, { dueDate: '2000-01-01' });
      await god.api.issues({ issueId: archived.id }).archive.post();

      const res = await god.api.god.stats.get();
      const row = res.data!.projects.find((p) => p.projectKey === 'MKT')!;

      expect(row.open).toBe(0);
      expect(row.overdue).toBe(0);
    });

    it('counts the current-week commitment across projects by state', async () => {
      const { god } = await setup();
      const { col: mkt } = await createProject(god.api, 'MKT', 'Marketing');
      const { col: eng } = await createProject(god.api, 'ENG', 'Engineering');
      const week = mondayOfThisWeek();

      // Committed this week: two open (MKT + ENG) and one completed (MKT).
      await createIssue(god.api, 'MKT', mkt.unstarted, { dueDate: week });
      await createIssue(god.api, 'ENG', eng.started, { dueDate: week });
      const done = await createIssue(god.api, 'MKT', mkt.started, { dueDate: week });
      await god.api.issues({ issueId: done.id }).patch({ columnId: mkt.completed });

      // Excluded: due last week, canceled this week, and archived this week.
      await createIssue(god.api, 'MKT', mkt.unstarted, { dueDate: '2000-01-01' });
      await createIssue(god.api, 'MKT', mkt.canceled, { dueDate: week });
      const archived = await createIssue(god.api, 'ENG', eng.unstarted, { dueDate: week });
      await god.api.issues({ issueId: archived.id }).archive.post();

      const res = await god.api.god.stats.get();
      expect(res.status).toBe(200);
      expect(res.data!.global.weekCommitment).toMatchObject({
        committed: 3,
        done: 1,
        remaining: 2,
      });
    });

    it('reads worked time across a restrictive time-visibility allowlist', async () => {
      const { god } = await setup();
      const { col } = await createProject(god.api, 'MKT', 'Marketing');
      // Restrict time visibility to a role no viewer effectively holds. The owner still
      // logs time (owners bypass the gate), and god stats read it regardless of the gate.
      const role = await createRole(god.api, 'MKT', { name: 'Restricted', permissions: {} });
      await god.api.projects({ projectKey: 'MKT' }).settings.estimates.patch({
        points: false,
        time: false,
        logging: true,
        timeGoalMinutes: null,
        timeGoalPeriod: null,
        timeVisibleRoleIds: [role.data!.id],
      });
      const issue = await createIssue(god.api, 'MKT', col.started, { assigneeUserId: god.id });
      await god.api.issues({ issueId: issue.id }).worklogs.post({ minutes: 45, spentOn: TODAY });

      const res = await god.api.god.stats.get();
      const row = res.data!.projects.find((p) => p.projectKey === 'MKT')!;

      expect(row.workedMinutes).toBe(45);
    });
  });
});
