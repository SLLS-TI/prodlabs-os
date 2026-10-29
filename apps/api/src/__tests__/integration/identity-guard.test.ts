import { describe, it, expect, beforeEach } from 'bun:test';
import { db, agentRun, project, user } from '@repo/db';
import { eq } from 'drizzle-orm';
import { api, authedApi, type Api } from '#tests/helpers/app';
import { createAgent } from '#tests/helpers/agents';
import { publicFilename, viewerAvatarId } from '#shared/identity-guard';
import { enqueueAgentRun } from '#modules/agents/core/run-queue';
import { signUpTestUser, type TestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// The global identity guard (shared/identity-guard.ts): every response a client
// receives has agency names, handles, emails and ids rewritten to the project's face,
// free text included, while an owner reads the stored text.

async function join(
  asOwner: Api,
  role: 'member' | 'client',
  name: string,
  projectKey = 'MKT',
  existing?: { api: Api; user: TestUser },
) {
  const user = existing?.user ?? (await signUpTestUser({ name }));
  const api = existing?.api ?? authedApi(user.cookie);
  if (existing) {
    await asOwner.projects({ projectKey }).members.post({ userId: user.userId, role: 'member' });
  } else {
    const invite = await asOwner
      .projects({ projectKey })
      .invites.post({ email: user.email, role: 'member' });
    await api.invites({ token: invite.data!.token }).accept.post();
  }
  if (role === 'client') {
    await asOwner.projects({ projectKey }).members({ userId: user.userId }).patch({
      role: 'client',
    });
  }
  return { api, user };
}

interface Setup {
  asOwner: Api;
  owner: TestUser;
  teammate: { api: Api; user: TestUser };
  client: { api: Api; user: TestUser };
  issueId: number;
  sequenceNumber: number;
}

async function setup(): Promise<Setup> {
  const owner = await signUpTestUser({ name: 'Silvio Sampaio' });
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  const columnId = (await asOwner.projects({ projectKey: 'MKT' }).get()).data!.columns[0].id;
  const teammate = await join(asOwner, 'member', 'Dionatha Goulart');
  const client = await join(asOwner, 'client', 'Victor Client');
  const issue = (
    await teammate.api.projects({ projectKey: 'MKT' }).issues.post({
      columnId,
      title: 'Dionatha: fix layout',
      description: `Rafa says Dionatha Goulart will check, cc @${teammate.user.username} at ${teammate.user.email}`,
      assigneeUserId: teammate.user.userId,
    })
  ).data!;
  await teammate.api.issues({ issueId: issue.id }).comments.post({ body: 'Thanks, Dionatha here' });
  return {
    asOwner,
    owner,
    teammate,
    client,
    issueId: issue.id,
    sequenceNumber: issue.sequenceNumber,
  };
}

describe('client identity guard', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('shows the face in place of a team member in issue free text and ids for a client', async () => {
    const { owner, teammate, client, issueId } = await setup();
    const res = await client.api.issues({ issueId }).get();
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.data);
    expect(res.data!.title).toBe('Silvio: fix layout');
    expect(res.data!.description).toBe(
      `Rafa says Silvio Sampaio will check, cc @${owner.username} at ${owner.email}`,
    );
    expect(res.data!.assigneeUserId).toBe(owner.userId);
    expect(json).not.toContain(teammate.user.userId);
    expect(json).not.toContain(teammate.user.email);
    expect(json).not.toContain('Dionatha');
    expect(json).not.toContain('Goulart');
  });

  it('shows the face in a team member comment body for a client, real text for the owner', async () => {
    const { asOwner, teammate, client, issueId } = await setup();
    const clientFeed = await client.api.issues({ issueId }).feed.get({ query: {} });
    const clientComment = clientFeed.data!.items.find((i) => i.kind === 'comment')!;
    expect(clientComment.body).toBe('Thanks, Silvio here');
    expect(JSON.stringify(clientFeed.data)).not.toContain('Dionatha');

    const ownerFeed = await asOwner.issues({ issueId }).feed.get({ query: {} });
    const ownerComment = ownerFeed.data!.items.find((i) => i.kind === 'comment')!;
    expect(ownerComment.body).toBe('Thanks, Dionatha here');
    expect(ownerComment.actorUserId).toBe(teammate.user.userId);
  });

  it('leaves the stored text intact for the owner', async () => {
    const { asOwner, teammate, issueId } = await setup();
    const res = await asOwner.issues({ issueId }).get();
    expect(res.data!.title).toBe('Dionatha: fix layout');
    expect(res.data!.assigneeUserId).toBe(teammate.user.userId);
  });

  it("keeps the client's own identity and covers error bodies", async () => {
    const { client } = await setup();
    const me = await client.api.issues({ issueId: 999_999 }).get();
    expect(me.status).toBe(404);
    const project = await client.api.projects({ projectKey: 'MKT' }).get();
    const json = JSON.stringify(project.data);
    expect(json).toContain(client.user.userId);
    expect(json).not.toContain('Dionatha');
  });
});

describe('client identity guard scope', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('scrubs a project-scoped read only in the projects where the viewer is a client', async () => {
    const { asOwner, teammate } = await setup();
    await asOwner.projects.post({ key: 'OPS', name: 'Operations' });
    await join(asOwner, 'member', '', 'OPS', teammate);
    const mixed = await join(asOwner, 'member', 'Marta Mixed', 'OPS');
    await join(asOwner, 'client', '', 'MKT', mixed);

    const ops = await mixed.api.projects({ projectKey: 'OPS' }).members.get({ query: {} });
    expect(JSON.stringify(ops.data)).toContain('Dionatha Goulart');

    const mkt = await mixed.api.projects({ projectKey: 'MKT' }).issues.search.get({
      query: { q: 'fix' },
    });
    expect(JSON.stringify(mkt.data)).toContain('Silvio: fix layout');
    expect(JSON.stringify(mkt.data)).not.toContain('Dionatha');
  });

  it('takes the team away from a client removed from their last project', async () => {
    const { asOwner, client } = await setup();
    const teamId = (await client.api.teams.get()).data![0]!.id;
    expect((await client.api.teams({ teamId }).members.get({ query: {} })).status).toBe(403);
    await asOwner.projects({ projectKey: 'MKT' }).members({ userId: client.user.userId }).delete();
    expect((await client.api.teams({ teamId }).members.get({ query: {} })).status).toBe(404);
    expect((await client.api.teams({ teamId }).projects.get({ query: {} })).status).toBe(404);
  });
});

describe('client identity guard beyond JSON reads', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('refuses a client a public link and masks an agency-made one', async () => {
    const { asOwner, owner, teammate, client, issueId } = await setup();
    const refused = await client.api.issues({ issueId }).share.post({ extended: true });
    expect(refused.status).toBe(403);

    const token = (await asOwner.issues({ issueId }).share.post({ extended: true })).data!.token;
    const shared = await api.share.issue({ token }).get();
    expect(shared.status).toBe(200);
    const json = JSON.stringify(shared.data);
    expect(json).not.toContain(teammate.user.userId);
    expect(json).not.toContain('Dionatha');
    expect(json).not.toContain(teammate.user.email);
    expect(shared.data!.issue.assigneeUserId).toBe(owner.userId);
    expect(json).toContain(client.user.userId);
  });

  it('answers a client naming an agency or unknown person with one error', async () => {
    const { owner, teammate, client, issueId } = await setup();
    const issue = client.api.issues({ issueId });
    for (const userId of [teammate.user.userId, 'no-such-user']) {
      const assign = await issue.patch({ assigneeUserId: userId });
      expect(assign.status).toBe(400);
      expect(assign.error?.value).toMatchObject({ error: 'Invalid user' });
      const watch = await issue.watchers({ userId }).put();
      expect(watch.status).toBe(400);
      expect(watch.error?.value).toMatchObject({ error: 'Invalid user' });
    }
    expect((await issue.patch({ assigneeUserId: owner.userId })).status).toBe(200);
    expect((await issue.patch({ assigneeUserId: client.user.userId })).status).toBe(200);
  });

  it('runs a client search for an agency name as a search for the face', async () => {
    const { asOwner, client } = await setup();
    const owners = await asOwner.projects({ projectKey: 'MKT' }).issues.search.get({
      query: { q: 'dionatha' },
    });
    expect(owners.data!.length).toBe(1);
    const clients = await client.api.projects({ projectKey: 'MKT' }).issues.search.get({
      query: { q: 'dionatha' },
    });
    expect(clients.status).toBe(200);
    expect(clients.data!.length).toBe(0);
  });

  it('filters a client inbox by the actor the client is shown', async () => {
    const { owner, teammate, client, issueId } = await setup();
    await teammate.api.issues({ issueId }).patch({ assigneeUserId: client.user.userId });
    const inbox = client.api.notifications;
    const all = await inbox.get({ query: {} });
    expect(all.data!.items.length).toBeGreaterThan(0);
    const byReal = await inbox.get({ query: { from: teammate.user.userId } });
    expect(byReal.data!.items.length).toBe(0);
    const byFace = await inbox.get({ query: { from: owner.userId } });
    expect(byFace.data!.items.length).toBe(all.data!.items.length);
  });

  it('gives a client a bare link preview', async () => {
    const { client } = await setup();
    const res = await client.api['link-previews'].get({ query: { url: 'https://example.com/p' } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ title: null, description: null, image: null, siteName: null });
  });

  it('serves a client the face avatar in place of an agency one', async () => {
    const { owner, teammate, client } = await setup();
    const faceAvatar = '11111111-1111-4111-8111-111111111111';
    const agencyAvatar = '22222222-2222-4222-8222-222222222222';
    await db
      .update(user)
      .set({ image: `/avatars/${faceAvatar}/raw` })
      .where(eq(user.id, owner.userId));
    await db
      .update(user)
      .set({ image: `/avatars/${agencyAvatar}/raw` })
      .where(eq(user.id, teammate.user.userId));
    expect(await viewerAvatarId(agencyAvatar, { id: client.user.userId })).toBe(faceAvatar);
    expect(await viewerAvatarId(agencyAvatar, { id: owner.userId })).toBe(agencyAvatar);
    expect(await viewerAvatarId(agencyAvatar, null)).toBe(agencyAvatar);
  });

  it('scrubs an agency name out of a public file name', async () => {
    await setup();
    const [{ id }] = await db.select({ id: project.id }).from(project);
    expect(await publicFilename(id, 'dionatha-goulart-notes.pdf')).toBe('Silvio-Sampaio-notes.pdf');
  });

  it('queues no agent run for a client', async () => {
    const { asOwner, client, issueId } = await setup();
    const agent = (
      await createAgent(asOwner, 'MKT', { name: 'Bot', username: 'bot', kind: 'internal' })
    ).data!.agent;
    const run = {
      agentId: agent.id,
      projectId: agent.projects[0].id,
      issueId,
      sourceActivityId: null,
      prompt: 'who works here?',
    };
    await enqueueAgentRun({ ...run, actorUserId: client.user.userId });
    expect(await db.select().from(agentRun).where(eq(agentRun.issueId, issueId))).toHaveLength(0);
    await enqueueAgentRun({ ...run, actorUserId: null });
    expect(await db.select().from(agentRun).where(eq(agentRun.issueId, issueId))).toHaveLength(1);
  });
});
