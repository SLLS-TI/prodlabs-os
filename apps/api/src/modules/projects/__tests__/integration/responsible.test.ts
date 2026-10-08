import { describe, it, expect, beforeEach } from 'bun:test';
import { authedApi, type Api } from '#tests/helpers/app';
import { signUpTestUser, type TestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// The project's responsible member: the owner or member shown with name and avatar in
// every project listing. Set from the owner-only responsible settings route; stripped
// from both the list DTO and the board scaffold for a client-role viewer, the same
// client decision the attribution masking uses. Exercised through the setter, the
// project list, and the board scaffold.

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
    await asOwner
      .projects({ projectKey: 'MKT' })
      .members({ userId: user.userId })
      .patch({ role: 'client' });
  }
  return { api, user, name };
}

async function setupProject(): Promise<Setup> {
  const owner = await signUpTestUser({ name: 'Owner' });
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  const teammate = await joinProject(asOwner, 'member', 'Teammate');
  const client = await joinProject(asOwner, 'client', 'Client');
  return { asOwner, owner, teammate, client };
}

// The MKT item from a caller's project list.
async function listedProject(api: Api) {
  const res = await api.projects.get({ query: {} });
  expect(res.status).toBe(200);
  return res.data!.find((p) => p.key === 'MKT')!;
}

describe('project responsible', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('shows the responsible identity and raw FK to an owner in the list and the scaffold', async () => {
    const { asOwner, teammate } = await setupProject();
    const set = await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: teammate.user.userId });
    expect(set.status).toBe(200);

    const listed = await listedProject(asOwner);
    expect(listed.responsibleUserId).toBe(teammate.user.userId);
    expect(listed.responsible).toMatchObject({
      userId: teammate.user.userId,
      name: teammate.name,
    });

    const scaffold = await asOwner.projects({ projectKey: 'MKT' }).get();
    expect(scaffold.data!.project.responsibleUserId).toBe(teammate.user.userId);
    expect(scaffold.data!.project.responsible).toMatchObject({
      userId: teammate.user.userId,
      name: teammate.name,
    });
  });

  it('shows the responsible to a non-owner member', async () => {
    const { asOwner, teammate } = await setupProject();
    await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: teammate.user.userId });

    const listed = await listedProject(teammate.api);
    expect(listed.responsibleUserId).toBe(teammate.user.userId);
    expect(listed.responsible).toMatchObject({ userId: teammate.user.userId });

    const scaffold = await teammate.api.projects({ projectKey: 'MKT' }).get();
    expect(scaffold.data!.project.responsibleUserId).toBe(teammate.user.userId);
    expect(scaffold.data!.project.responsible).toMatchObject({ userId: teammate.user.userId });
  });

  it('never surfaces the responsible to a client, in the list or the scaffold', async () => {
    const { asOwner, teammate, client } = await setupProject();
    await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: teammate.user.userId });

    const listed = await listedProject(client.api);
    expect(listed.responsible).toBeNull();
    expect(listed.responsibleUserId).toBeNull();

    const scaffold = await client.api.projects({ projectKey: 'MKT' }).get();
    expect(scaffold.status).toBe(200);
    expect(scaffold.data!.project.responsible).toBeNull();
    expect(scaffold.data!.project.responsibleUserId).toBeNull();
  });

  it('rejects a non-member and a client, accepts a valid member', async () => {
    const { asOwner, teammate, client } = await setupProject();
    const stranger = await signUpTestUser({ name: 'Stranger' });

    const nonMember = await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: stranger.userId });
    expect(nonMember.status).toBe(400);

    const asClient = await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: client.user.userId });
    expect(asClient.status).toBe(400);

    const valid = await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: teammate.user.userId });
    expect(valid.status).toBe(200);
    expect(valid.data!.responsibleUserId).toBe(teammate.user.userId);
  });

  it('clears the responsible with null', async () => {
    const { asOwner, teammate } = await setupProject();
    await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: teammate.user.userId });

    const cleared = await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.data!.responsibleUserId).toBeNull();

    const listed = await listedProject(asOwner);
    expect(listed.responsibleUserId).toBeNull();
    expect(listed.responsible).toBeNull();
  });

  it('keeps the responsible write owner-only', async () => {
    const { teammate } = await setupProject();
    const res = await teammate.api
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: null });
    expect(res.status).toBe(403);
  });

  it('404s a non-member on the responsible write', async () => {
    await setupProject();
    const stranger = await signUpTestUser({ name: 'Stranger' });
    const res = await authedApi(stranger.cookie)
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: null });
    expect(res.status).toBe(404);
  });

  it('set-nulls the responsible when they leave the project', async () => {
    const { asOwner, teammate } = await setupProject();
    await asOwner
      .projects({ projectKey: 'MKT' })
      .settings.responsible.patch({ responsibleUserId: teammate.user.userId });

    await asOwner
      .projects({ projectKey: 'MKT' })
      .members({ userId: teammate.user.userId })
      .delete();

    const listed = await listedProject(asOwner);
    expect(listed.responsibleUserId).toBeNull();
    expect(listed.responsible).toBeNull();

    const scaffold = await asOwner.projects({ projectKey: 'MKT' }).get();
    expect(scaffold.data!.project.responsibleUserId).toBeNull();
    expect(scaffold.data!.project.responsible).toBeNull();
  });
});
