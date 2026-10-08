import { describe, it, expect, beforeEach } from 'bun:test';
import { authedApi, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { addProjectMember } from '#tests/helpers/members';
import { resetDb } from '#tests/helpers/db';

// The global project timer, not tied to an issue. Starting inserts a running session
// (stopped_at IS NULL); stopping it writes a project_worklog from the elapsed time. It
// coexists with issue timers — a member may run both at once; the same (project, user)
// pair is deduped. Only members who can see time may operate it; a client is forbidden.

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

// Promotes a fresh member to the client role (invites only grant owner/member).
async function joinAsClient(asOwner: Api): Promise<Api> {
  const user = await signUpTestUser();
  const invite = await asOwner
    .projects({ projectKey: 'MKT' })
    .invites.post({ email: user.email, role: 'member' });
  const api = authedApi(user.cookie);
  await api.invites({ token: invite.data!.token }).accept.post();
  await asOwner.projects({ projectKey: 'MKT' }).members({ userId: user.userId }).patch({
    role: 'client',
  });
  return api;
}

function start(client: Api) {
  return client.projects({ projectKey: 'MKT' }).timer.start.post();
}

function stop(client: Api) {
  return client.projects({ projectKey: 'MKT' }).timer.stop.post();
}

async function running(client: Api) {
  const res = await client.projects.timers.running.get();
  return res.data!;
}

function createIssue(client: Api, columnId: number) {
  return client.projects({ projectKey: 'MKT' }).issues.post({ columnId, title: 'Task' });
}

describe('project timers', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('starting', () => {
    it('creates a running session and lists it with project ref and name', async () => {
      const { asOwner } = await setupProject();

      const res = await start(asOwner);
      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({ projectId: expect.any(Number) });
      expect(res.data).not.toHaveProperty('projectKey');

      const list = await running(asOwner);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: res.data!.id, projectName: 'Marketing' });
      const teamId = (await asOwner.projects.get()).data!.find((p) => p.key === 'MKT')!.teamId;
      expect(list[0].projectKey).toBe(`${teamId}.MKT`);
    });

    it('returns the same session on a second start (no duplicate)', async () => {
      const { asOwner } = await setupProject();

      const first = (await start(asOwner)).data!;
      const second = await start(asOwner);
      expect(second.status).toBe(201);
      expect(second.data!.id).toBe(first.id);
      expect(await running(asOwner)).toHaveLength(1);
    });
  });

  describe('stopping', () => {
    it('writes a worklog of at least a minute', async () => {
      const { asOwner } = await setupProject();
      const session = (await start(asOwner)).data!;

      const res = await stop(asOwner);
      expect(res.status).toBe(200);
      expect(res.data!.session.id).toBe(session.id);
      expect(res.data!.worklog).not.toBeNull();
      expect(res.data!.worklog!.minutes).toBeGreaterThanOrEqual(1);

      expect(await running(asOwner)).toHaveLength(0);
    });

    it('answers 404 when no timer is running on the project', async () => {
      const { asOwner } = await setupProject();
      expect((await stop(asOwner)).status).toBe(404);
    });

    it('answers 404 on a double stop', async () => {
      const { asOwner } = await setupProject();
      await start(asOwner);

      expect((await stop(asOwner)).status).toBe(200);
      expect((await stop(asOwner)).status).toBe(404);
    });
  });

  describe('running list', () => {
    it('returns only the callers own sessions', async () => {
      const { asOwner } = await setupProject();
      const asMember = await addProjectMember(asOwner, 'MKT');

      await start(asOwner);
      await start(asMember);

      expect(await running(asOwner)).toHaveLength(1);
      const memberList = await running(asMember);
      expect(memberList).toHaveLength(1);
      expect(memberList[0].id).not.toBe((await running(asOwner))[0].id);
    });
  });

  describe('coexistence with issue timers', () => {
    it('runs an issue timer and a project timer at once; neither stops the other', async () => {
      const { asOwner, columnId } = await setupProject();
      const issue = (await createIssue(asOwner, columnId)).data!;

      await asOwner.issues({ issueId: issue.id }).timer.start.post();
      await start(asOwner);

      expect(await running(asOwner)).toHaveLength(1);
      expect((await asOwner.issues.timers.running.get()).data!).toHaveLength(1);

      // Stopping the project timer leaves the issue timer running, and vice versa.
      await stop(asOwner);
      expect(await running(asOwner)).toHaveLength(0);
      expect((await asOwner.issues.timers.running.get()).data!).toHaveLength(1);
    });
  });

  describe('time-visibility gate', () => {
    it('forbids a client from start and stop with 403', async () => {
      const { asOwner } = await setupProject();
      const asClient = await joinAsClient(asOwner);

      expect((await start(asClient)).status).toBe(403);
      expect((await stop(asClient)).status).toBe(403);
    });

    it('returns an empty running list for a client', async () => {
      const { asOwner } = await setupProject();
      const asClient = await joinAsClient(asOwner);

      expect(await running(asClient)).toHaveLength(0);
    });

    it('denies a non-member with 403', async () => {
      await setupProject();
      const outsider = authedApi((await signUpTestUser()).cookie);

      expect((await start(outsider)).status).toBe(403);
      expect((await stop(outsider)).status).toBe(403);
    });
  });
});
