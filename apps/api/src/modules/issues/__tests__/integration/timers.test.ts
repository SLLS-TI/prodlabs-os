import { describe, it, expect, beforeEach } from 'bun:test';
import { authedApi, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { addProjectMember } from '#tests/helpers/members';
import { createRole } from '#tests/helpers/roles';
import { resetDb } from '#tests/helpers/db';

// The play/stop timer on an issue. Starting inserts a running session (stopped_at
// IS NULL); stopping it writes an issue_worklog from the elapsed time through the
// existing worklog path, so the sum, the feed and every worklog behaviour follow.
// A member may run several timers at once; the same (issue, user) pair is deduped.

interface Setup {
  asOwner: Api;
  columnId: number;
}

async function setupProject(): Promise<Setup> {
  const owner = await signUpTestUser();
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  const view = await asOwner.projects({ projectKey: 'MKT' }).get();
  return { asOwner, columnId: view.data!.columns[0].id };
}

function createIssue(client: Api, columnId: number, title = 'Task') {
  return client.projects({ projectKey: 'MKT' }).issues.post({ columnId, title });
}

function start(client: Api, issueId: number) {
  return client.issues({ issueId }).timer.start.post();
}

function stop(client: Api, issueId: number) {
  return client.issues({ issueId }).timer.stop.post();
}

async function running(client: Api) {
  const res = await client.issues.timers.running.get();
  return res.data!;
}

async function read(client: Api, issueId: number) {
  const res = await client.issues({ issueId }).get();
  return res.data!;
}

async function feedActions(client: Api, issueId: number) {
  const res = await client.issues({ issueId }).feed.get({ query: {} });
  return res.data!.items.map((item) => item.action);
}

describe('timers', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('starting', () => {
    it('creates a running session and lists it', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;

      const res = await start(asOwner, issue.id);
      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({ issueId: issue.id });

      const list = await running(asOwner);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: res.data!.id, issueId: issue.id });
    });

    it('returns the same session on a second start (no duplicate)', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;

      const first = (await start(asOwner, issue.id)).data!;
      const second = await start(asOwner, issue.id);
      expect(second.status).toBe(201);
      expect(second.data!.id).toBe(first.id);
      expect(await running(asOwner)).toHaveLength(1);
    });

    it('runs timers on two issues at once', async () => {
      const { asOwner, columnId } = await setupProject();
      const a = (await createIssue(asOwner, columnId, 'A')).data!;
      const b = (await createIssue(asOwner, columnId, 'B')).data!;

      await start(asOwner, a.id);
      await start(asOwner, b.id);

      const list = await running(asOwner);
      expect(list).toHaveLength(2);
      expect(new Set(list.map((s) => s.issueId))).toEqual(new Set([a.id, b.id]));
    });

    it('denies a non-member with 403', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;
      const outsider = await signUpTestUser();

      expect((await start(authedApi(outsider.cookie), issue.id)).status).toBe(403);
    });
  });

  describe('stopping', () => {
    it('writes a worklog of at least a minute and raises loggedMinutes', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;
      await start(asOwner, issue.id);

      const res = await stop(asOwner, issue.id);
      expect(res.status).toBe(200);
      expect(res.data!.session.issueId).toBe(issue.id);
      expect(res.data!.worklog).not.toBeNull();
      expect(res.data!.worklog!.minutes).toBeGreaterThanOrEqual(1);

      expect(await read(asOwner, issue.id)).toMatchObject({
        loggedMinutes: res.data!.worklog!.minutes,
      });
      expect((await feedActions(asOwner, issue.id)).filter((a) => a === 'worklog')).toHaveLength(1);
    });

    it('clears the running state after a stop', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;
      await start(asOwner, issue.id);
      await stop(asOwner, issue.id);

      expect(await running(asOwner)).toHaveLength(0);
    });

    it('answers 404 when no timer is running on the issue', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;

      expect((await stop(asOwner, issue.id)).status).toBe(404);
    });

    it('answers 404 on a double stop', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;
      await start(asOwner, issue.id);

      expect((await stop(asOwner, issue.id)).status).toBe(200);
      expect((await stop(asOwner, issue.id)).status).toBe(404);
    });
  });

  describe('running list', () => {
    it('returns only the callers own sessions', async () => {
      const { asOwner, columnId } = await setupProject();
      const asMember = await addProjectMember(asOwner, 'MKT');
      const issue = (await createIssue(asOwner, columnId)).data!;

      await start(asOwner, issue.id);
      await start(asMember, issue.id);

      const ownerList = await running(asOwner);
      expect(ownerList).toHaveLength(1);
      expect(ownerList[0].issueId).toBe(issue.id);

      const memberList = await running(asMember);
      expect(memberList).toHaveLength(1);
      expect(memberList[0].id).not.toBe(ownerList[0].id);
    });

    it('enriches each session with the issue title, identifier, number and project ref', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId, 'Ship it')).data!;
      const start201 = (await start(asOwner, issue.id)).data!;
      // start returns the bare session shape (no enrichment).
      expect(start201).not.toHaveProperty('title');

      const list = await running(asOwner);
      const session = list.find((s) => s.issueId === issue.id)!;
      expect(session.title).toBe('Ship it');
      expect(session.sequenceNumber).toBe(issue.sequenceNumber);
      expect(session.identifier).toBe(`MKT-${issue.sequenceNumber}`);
      // projectKey is the full ref "<teamRef>.<key>" (the team has no slug, so teamId).
      const teamId = (await asOwner.projects.get()).data!.find((p) => p.key === 'MKT')!.teamId;
      expect(session.projectKey).toBe(`${teamId}.MKT`);
    });

    it('returns the bare session shape on stop', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;
      await start(asOwner, issue.id);
      const stopped = (await stop(asOwner, issue.id)).data!;
      expect(stopped.session).not.toHaveProperty('title');
      expect(stopped.session).toMatchObject({ issueId: issue.id });
    });
  });

  it('removes a running session with the issue', async () => {
    const { asOwner, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;
    await start(asOwner, issue.id);

    await asOwner.issues({ issueId: issue.id }).delete();

    expect(await running(asOwner)).toHaveLength(0);
  });

  describe('time-visibility gate', () => {
    function restrictTo(client: Api, roleIds: number[]) {
      return client.projects({ projectKey: 'MKT' }).settings.estimates.patch({
        points: false,
        time: false,
        logging: true,
        timeGoalMinutes: null,
        timeGoalPeriod: null,
        timeVisibleRoleIds: roleIds,
      });
    }

    it('403s start and stop for a member whose role is not on the allowlist', async () => {
      const { asOwner, columnId } = await setupProject();
      const allowed = await createRole(asOwner, 'MKT', {
        name: 'Allowed',
        permissions: { work_items: { read: true, edit: true } },
      });
      const other = await createRole(asOwner, 'MKT', {
        name: 'Other',
        permissions: { work_items: { read: true, edit: true } },
      });
      const allowedMember = await addProjectMember(asOwner, 'MKT', allowed.data!.id);
      const otherMember = await addProjectMember(asOwner, 'MKT', other.data!.id);
      const issue = (await createIssue(asOwner, columnId)).data!;
      await restrictTo(asOwner, [allowed.data!.id]);

      expect((await start(otherMember, issue.id)).status).toBe(403);
      expect((await stop(otherMember, issue.id)).status).toBe(403);

      expect((await start(allowedMember, issue.id)).status).toBe(201);
      expect((await stop(allowedMember, issue.id)).status).toBe(200);
      expect((await start(asOwner, issue.id)).status).toBe(201);
    });

    it('keeps a members own running timer visible after their role loses visibility', async () => {
      const { asOwner, columnId } = await setupProject();
      const member = await addProjectMember(asOwner, 'MKT');
      const other = await createRole(asOwner, 'MKT', {
        name: 'Other',
        permissions: { work_items: { read: true, edit: true } },
      });
      const issue = (await createIssue(asOwner, columnId)).data!;
      await start(member, issue.id);

      // Restrict visibility to a role the member is not on; their board scaffold loses
      // canSeeTimeTracking, but the running-timers endpoint is not filtered.
      await restrictTo(asOwner, [other.data!.id]);

      expect((await member.projects({ projectKey: 'MKT' }).get()).data?.canSeeTimeTracking).toBe(
        false,
      );
      expect(await running(member)).toHaveLength(1);
    });
  });
});
