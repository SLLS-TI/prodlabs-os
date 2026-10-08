import { describe, it, expect, beforeEach } from 'bun:test';
import { authedApi, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// Project level: an emoji, its name, and the emoji's dominant color (hex) on the
// project. Set by an owner from Settings, shown to every viewer but a client, whose
// read has all three nulled server-side on both the scaffold and the list.

// Invites a fresh user into the project on a role and returns a client acting as them.
// A client role is assigned by promoting a member (invites only grant owner/member).
async function joinProject(asOwner: Api, role: 'member' | 'client'): Promise<Api> {
  const user = await signUpTestUser();
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
  return api;
}

async function setupProject() {
  const owner = await signUpTestUser();
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  return { asOwner };
}

const LEVEL = { levelEmoji: '🚀', levelName: 'Launch', levelColor: '#aabbcc' };

async function scaffoldLevel(client: Api) {
  const res = await client.projects({ projectKey: 'MKT' }).get();
  expect(res.status).toBe(200);
  const { levelEmoji, levelName, levelColor } = res.data!.project;
  return { levelEmoji, levelName, levelColor };
}

async function listLevel(client: Api) {
  const res = await client.projects.get({ query: {} });
  expect(res.status).toBe(200);
  const item = res.data!.find((p) => p.key === 'MKT')!;
  return { levelEmoji: item.levelEmoji, levelName: item.levelName, levelColor: item.levelColor };
}

describe('project level', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('lets an owner set the level and reads it back on the scaffold and the list', async () => {
    const { asOwner } = await setupProject();

    const patched = await asOwner.projects({ projectKey: 'MKT' }).patch(LEVEL);
    expect(patched.status).toBe(200);
    expect(patched.data).toMatchObject(LEVEL);

    expect(await scaffoldLevel(asOwner)).toEqual(LEVEL);
    expect(await listLevel(asOwner)).toEqual(LEVEL);
  });

  it('shows the level to a non-client member', async () => {
    const { asOwner } = await setupProject();
    const member = await joinProject(asOwner, 'member');
    await asOwner.projects({ projectKey: 'MKT' }).patch(LEVEL);

    expect(await scaffoldLevel(member)).toEqual(LEVEL);
    expect(await listLevel(member)).toEqual(LEVEL);
  });

  it('nulls all three fields for a client on both the scaffold and the list', async () => {
    const { asOwner } = await setupProject();
    const client = await joinProject(asOwner, 'client');
    await asOwner.projects({ projectKey: 'MKT' }).patch(LEVEL);

    const nulls = { levelEmoji: null, levelName: null, levelColor: null };
    expect(await scaffoldLevel(client)).toEqual(nulls);
    expect(await listLevel(client)).toEqual(nulls);
  });

  it('clears the whole trio when the emoji is set to null', async () => {
    const { asOwner } = await setupProject();
    await asOwner.projects({ projectKey: 'MKT' }).patch(LEVEL);

    const cleared = await asOwner.projects({ projectKey: 'MKT' }).patch({ levelEmoji: null });
    expect(cleared.status).toBe(200);

    expect(await scaffoldLevel(asOwner)).toEqual({
      levelEmoji: null,
      levelName: null,
      levelColor: null,
    });
  });

  it('rejects an emoji that is not a single emoji grapheme', async () => {
    const { asOwner } = await setupProject();

    const invalid = await asOwner.projects({ projectKey: 'MKT' }).patch({ levelEmoji: 'ab' });
    expect(invalid.status).toBe(400);

    const valid = await asOwner
      .projects({ projectKey: 'MKT' })
      .patch({ levelEmoji: '🚀', levelName: 'Launch', levelColor: '#aabbcc' });
    expect(valid.status).toBe(200);
    expect(valid.data!.levelEmoji).toBe('🚀');
  });

  it('rejects a level color that is not a hex string', async () => {
    const { asOwner } = await setupProject();
    const res = await asOwner.projects({ projectKey: 'MKT' }).patch({ levelColor: 'nothex' });
    expect(res.status).toBe(400);
  });

  it('denies a member setting the level (owner-only)', async () => {
    const { asOwner } = await setupProject();
    const member = await joinProject(asOwner, 'member');

    const res = await member.projects({ projectKey: 'MKT' }).patch(LEVEL);
    expect(res.status).toBe(403);
  });
});
