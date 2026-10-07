import { describe, it, expect, beforeEach } from 'bun:test';
import { authedApi, type Api } from '#tests/helpers/app';
import { signUpTestUser, type TestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// Client-facing attribution masking. For a client-role member of a project, every
// team-member actor identity is rewritten to the project's face user at the read and
// serialize layer; the database always stores the real actor. Owners and members see
// the real actor unchanged. The feature is exercised through the issue feed, comments,
// the assignee payload sides and the @mention rewrite.

// A joined user plus the display name they signed up with (signUpTestUser does not
// return the name, so a test that asserts on the shown name tracks it here).
interface Joined {
  api: Api;
  user: TestUser;
  name: string;
}

interface Setup {
  asOwner: Api;
  owner: TestUser;
  teammate: Joined;
  client: Joined;
  columnId: number;
}

// Invites a fresh user into the project on a role and returns a client acting as them.
// A client role is assigned by promoting a member (invites only grant owner/member).
async function joinProject(asOwner: Api, role: 'member' | 'client', name: string): Promise<Joined> {
  const user = await signUpTestUser({ name });
  const invite = await asOwner
    .projects({ projectKey: 'MKT' })
    .invites.post({ email: user.email, role: 'member' });
  const api = authedApi(user.cookie);
  await api.invites({ token: invite.data!.token }).accept.post();
  if (role === 'client') {
    await asOwner.projects({ projectKey: 'MKT' }).members({ userId: user.userId }).patch({
      role: 'client',
    });
  }
  return { api, user, name };
}

async function setupProject(): Promise<Setup> {
  const owner = await signUpTestUser({ name: 'Owner' });
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  const view = await asOwner.projects({ projectKey: 'MKT' }).get();
  const columnId = view.data!.columns[0].id;

  const teammate = await joinProject(asOwner, 'member', 'Teammate');
  const client = await joinProject(asOwner, 'client', 'Client');
  return { asOwner, owner, teammate, client, columnId };
}

function createIssue(client: Api, columnId: number, patch: Record<string, unknown> = {}) {
  return client.projects({ projectKey: 'MKT' }).issues.post({ columnId, title: 'Task', ...patch });
}

async function feedItems(client: Api, issueId: number) {
  const res = await client.issues({ issueId }).feed.get({ query: {} });
  expect(res.status).toBe(200);
  return res.data!.items;
}

describe('client attribution masking', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("shows a team member's comment as the face to a client, and real to an owner", async () => {
    const { asOwner, owner, teammate, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;
    await teammate.api.issues({ issueId: issue.id }).comments.post({ body: 'done' });

    const clientComment = (await feedItems(client.api, issue.id)).find(
      (i) => i.kind === 'comment',
    )!;
    expect(clientComment.actorUserId).toBe(owner.userId);
    expect(clientComment.actorName).toBe('Owner');

    const ownerComment = (await feedItems(asOwner, issue.id)).find((i) => i.kind === 'comment')!;
    expect(ownerComment.actorUserId).toBe(teammate.user.userId);
    expect(ownerComment.actorName).toBe(teammate.name);
  });

  it("does not mask a client's own comment", async () => {
    const { asOwner, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;
    await client.api.issues({ issueId: issue.id }).comments.post({ body: 'from the client' });

    const comment = (await feedItems(client.api, issue.id)).find(
      (i) => i.body === 'from the client',
    )!;
    expect(comment.actorUserId).toBe(client.user.userId);
    expect(comment.actorName).toBe(client.name);
  });

  it("does not collapse another client's comment into the face", async () => {
    const { asOwner, client, columnId } = await setupProject();
    const other = await joinProject(asOwner, 'client', 'Other Client');
    const issue = (await createIssue(asOwner, columnId)).data!;
    await other.api.issues({ issueId: issue.id }).comments.post({ body: 'second client' });

    const comment = (await feedItems(client.api, issue.id)).find(
      (i) => i.body === 'second client',
    )!;
    expect(comment.actorUserId).toBe(other.user.userId);
    expect(comment.actorName).toBe(other.name);
  });

  it('rewrites the assignee change payload names to the face for a client', async () => {
    const { asOwner, owner, teammate, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;
    // A teammate assigns the issue to the teammate, so both the actor and the assignee
    // are maskable team members.
    await teammate.api
      .issues({ issueId: issue.id })
      .patch({ assigneeUserId: teammate.user.userId });

    const clientRow = (await feedItems(client.api, issue.id)).find((i) => i.action === 'assignee')!;
    expect(clientRow.actorUserId).toBe(owner.userId);
    expect(clientRow.payload.to?.value).toBe('Owner');

    const ownerRow = (await feedItems(asOwner, issue.id)).find((i) => i.action === 'assignee')!;
    expect(ownerRow.payload.to?.value).toBe(teammate.name);
  });

  it('rewrites a @teammember mention to the face handle for a client, keeping the stored body real', async () => {
    const { asOwner, owner, teammate, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;
    await teammate.api
      .issues({ issueId: issue.id })
      .comments.post({ body: `ping @${teammate.user.username}` });

    const clientComment = (await feedItems(client.api, issue.id)).find(
      (i) => i.kind === 'comment',
    )!;
    expect(clientComment.body).toBe(`ping @${owner.username}`);

    // The owner reads the raw stored body with the real handle.
    const ownerComment = (await feedItems(asOwner, issue.id)).find((i) => i.kind === 'comment')!;
    expect(ownerComment.body).toBe(`ping @${teammate.user.username}`);
  });

  it("shows a removed team member's feed entry and comment as the face to a client", async () => {
    const { asOwner, owner, teammate, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;
    // The teammate acts (a comment and a change), then is removed from the project. Their
    // historical rows still carry their real id and name; a client must still see the face.
    await teammate.api.issues({ issueId: issue.id }).comments.post({ body: 'before removal' });
    await teammate.api.issues({ issueId: issue.id }).patch({ title: 'Renamed by teammate' });
    await asOwner
      .projects({ projectKey: 'MKT' })
      .members({ userId: teammate.user.userId })
      .delete();

    const items = await feedItems(client.api, issue.id);
    const comment = items.find((i) => i.body === 'before removal')!;
    expect(comment.actorUserId).toBe(owner.userId);
    expect(comment.actorName).toBe('Owner');

    const titleChange = items.find((i) => i.action === 'title')!;
    expect(titleChange.actorUserId).toBe(owner.userId);
    expect(titleChange.actorName).toBe('Owner');
  });

  it('rewrites a @teammember mention inside a title and a description change for a client', async () => {
    const { asOwner, owner, teammate, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;
    await teammate.api.issues({ issueId: issue.id }).patch({
      title: `title cc @${teammate.user.username}`,
      description: `desc cc @${teammate.user.username}`,
    });

    const clientItems = await feedItems(client.api, issue.id);
    const clientTitle = clientItems.find((i) => i.action === 'title')!;
    const clientDesc = clientItems.find((i) => i.action === 'description')!;
    expect(clientTitle.payload.to?.value).toBe(`title cc @${owner.username}`);
    expect(clientDesc.payload.to?.value).toBe(`desc cc @${owner.username}`);

    // The owner reads the raw stored prose with the real handle.
    const ownerItems = await feedItems(asOwner, issue.id);
    const ownerTitle = ownerItems.find((i) => i.action === 'title')!;
    const ownerDesc = ownerItems.find((i) => i.action === 'description')!;
    expect(ownerTitle.payload.to?.value).toBe(`title cc @${teammate.user.username}`);
    expect(ownerDesc.payload.to?.value).toBe(`desc cc @${teammate.user.username}`);
  });

  it('limits a client-facing assignee-candidate list to the face and the client themselves', async () => {
    const { asOwner, owner, teammate, client } = await setupProject();
    // A second client must also be dropped: a client cannot enumerate the agency's others.
    const other = await joinProject(asOwner, 'client', 'Other Client');
    const scaffold = await client.api.projects({ projectKey: 'MKT' }).get();
    const ids = scaffold.data!.assignees.map((a) => a.userId).sort();
    expect(ids).toEqual([owner.userId, client.user.userId].sort());
    expect(ids).not.toContain(teammate.user.userId);
    expect(ids).not.toContain(other.user.userId);
    // No email is carried for anyone but the viewing client.
    for (const a of scaffold.data!.assignees) {
      if (a.userId !== client.user.userId) expect(a.email).toBe('');
    }
  });

  it('limits a client-facing watcher list to the face and the client themselves', async () => {
    const { asOwner, owner, teammate, client, columnId } = await setupProject();
    // The teammate and the client both watch the issue (they comment on it); the owner
    // created it, so they watch it too.
    const issue = (await createIssue(asOwner, columnId)).data!;
    await teammate.api.issues({ issueId: issue.id }).comments.post({ body: 'teammate here' });
    await client.api.issues({ issueId: issue.id }).comments.post({ body: 'client here' });

    const clientView = await client.api.issues({ issueId: issue.id }).get();
    const ids = clientView.data!.watchers.map((w) => w.userId).sort();
    expect(ids).toEqual([owner.userId, client.user.userId].sort());
    expect(ids).not.toContain(teammate.user.userId);
  });

  it('falls back to the oldest owner as the face when none is configured', async () => {
    const { asOwner, owner, teammate, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;
    await teammate.api.issues({ issueId: issue.id }).comments.post({ body: 'x' });

    const comment = (await feedItems(client.api, issue.id)).find((i) => i.kind === 'comment')!;
    // No face_user_id set, so the oldest owner (the project creator) is the face.
    expect(comment.actorUserId).toBe(owner.userId);
  });

  it('uses the configured face user when one is set', async () => {
    const { asOwner, teammate, client, columnId } = await setupProject();
    // Promote the teammate to a second owner, then make them the face.
    await asOwner.projects({ projectKey: 'MKT' }).members({ userId: teammate.user.userId }).patch({
      role: 'owner',
    });
    const setFace = await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.masking.patch({ faceUserId: teammate.user.userId });
    expect(setFace.status).toBe(200);

    const issue = (await createIssue(asOwner, columnId)).data!;
    // The original owner comments; the client should see the configured face (teammate).
    await asOwner.issues({ issueId: issue.id }).comments.post({ body: 'hi' });

    const comment = (await feedItems(client.api, issue.id)).find((i) => i.kind === 'comment')!;
    expect(comment.actorUserId).toBe(teammate.user.userId);
    expect(comment.actorName).toBe(teammate.name);
  });

  it('collapses the project scaffold assignees to the face for a client', async () => {
    const { owner, teammate, client } = await setupProject();
    const scaffold = await client.api.projects({ projectKey: 'MKT' }).get();
    expect(scaffold.status).toBe(200);
    const ids = scaffold.data!.assignees.map((a) => a.userId);
    // The teammate (maskable) is replaced by the face owner; the client stays.
    expect(ids).toContain(owner.userId);
    expect(ids).toContain(client.user.userId);
    expect(ids).not.toContain(teammate.user.userId);
  });

  it('remaps the issue DTO assignee id to the face for a client, real for an owner', async () => {
    const { asOwner, owner, teammate, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId, { assigneeUserId: teammate.user.userId }))
      .data!;

    const clientView = await client.api
      .projects({ projectKey: 'MKT' })
      .issues({ sequenceNumber: issue.sequenceNumber })
      .get();
    expect(clientView.data!.assigneeUserId).toBe(owner.userId);

    const ownerView = await asOwner
      .projects({ projectKey: 'MKT' })
      .issues({ sequenceNumber: issue.sequenceNumber })
      .get();
    expect(ownerView.data!.assigneeUserId).toBe(teammate.user.userId);
  });

  it('keeps the face write owner-only', async () => {
    const { teammate } = await setupProject();
    // A member (not owner) cannot set the face user.
    const res = await teammate.api
      .projects({ projectKey: 'MKT' })
      .settings.masking.patch({ faceUserId: null });
    expect(res.status).toBe(403);
  });

  it("remaps an initiative's owner id to the face for a client, real for an owner", async () => {
    const { asOwner, owner, teammate, client } = await setupProject();
    const created = await asOwner
      .projects({ projectKey: 'MKT' })
      .initiatives.post({ title: 'Launch', ownerUserId: teammate.user.userId });
    const initiativeId = created.data!.id;

    const clientList = await client.api
      .projects({ projectKey: 'MKT' })
      .initiatives.get({ query: {} });
    const clientRow = clientList.data!.items.find((i) => i.id === initiativeId)!;
    expect(clientRow.ownerUserId).toBe(owner.userId);

    const clientDetail = await client.api.initiatives({ initiativeId }).get();
    expect(clientDetail.data!.ownerUserId).toBe(owner.userId);

    const ownerList = await asOwner.projects({ projectKey: 'MKT' }).initiatives.get({ query: {} });
    const ownerRow = ownerList.data!.items.find((i) => i.id === initiativeId)!;
    expect(ownerRow.ownerUserId).toBe(teammate.user.userId);
  });

  // Time tracking is never masked for a client — it is hidden outright, so the surfaces
  // 403 rather than rewrite. These assert the 403, which is what makes masking moot.
  it('403s a client on the worklog and time-by-user routes', async () => {
    const { asOwner, client, columnId } = await setupProject();
    const issue = (await createIssue(asOwner, columnId)).data!;

    const worklogs = await client.api.issues({ issueId: issue.id }).worklogs.get();
    expect(worklogs.status).toBe(403);

    const timeByUser = await client.api
      .projects({ projectKey: 'MKT' })
      .analytics['time-by-user'].get();
    expect(timeByUser.status).toBe(403);
  });
});
