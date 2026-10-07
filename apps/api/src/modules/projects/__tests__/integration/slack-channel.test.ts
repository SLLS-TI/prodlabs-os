import { describe, it, expect, beforeEach } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { authedApi } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// Per-project Slack channel: GET/PATCH /projects/:key/settings/slack.
// Route is projectOwner-gated. enabled:true with an empty channel is coerced to
// enabled:false by the service. Non-owners get 403.

describe('project slack channel settings', () => {
  beforeEach(resetDb);

  async function ownerWithProject() {
    const user = await signUpTestUser();
    const api = authedApi(user.cookie);
    await api.projects.post({ key: 'SLK', name: 'Slack Test' });
    return { api, projectKey: 'SLK' };
  }

  it('returns the default state with no channel configured', async () => {
    const { api, projectKey } = await ownerWithProject();

    const res = await api.projects({ projectKey }).settings.slack.get();

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ channel: '', enabled: false });
  });

  it('stores a channel and enabled flag', async () => {
    const { api, projectKey } = await ownerWithProject();

    const res = await api
      .projects({ projectKey })
      .settings.slack.patch({ channel: 'C01234567', enabled: true });

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ channel: 'C01234567', enabled: true });
  });

  it('coerces enabled:true with a blank channel to enabled:false', async () => {
    const { api, projectKey } = await ownerWithProject();

    const res = await api
      .projects({ projectKey })
      .settings.slack.patch({ channel: '', enabled: true });

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ channel: '', enabled: false });
  });

  it('round-trips the stored value via GET', async () => {
    const { api, projectKey } = await ownerWithProject();

    await api.projects({ projectKey }).settings.slack.patch({ channel: '#general', enabled: true });
    const res = await api.projects({ projectKey }).settings.slack.get();

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ channel: '#general', enabled: true });
  });

  it('rejects a non-owner member with 403', async () => {
    const { api, projectKey } = await ownerWithProject();
    const memberEmail = `member-${randomUUID().slice(0, 8)}@example.com`;
    const member = await signUpTestUser({ email: memberEmail });
    const memberApi = authedApi(member.cookie);

    const invite = await api.projects({ projectKey }).invites.post({
      email: memberEmail,
      role: 'member',
    });
    await memberApi.invites({ token: invite.data!.token }).accept.post();

    const res = await memberApi.projects({ projectKey }).settings.slack.patch({
      channel: '#evil',
      enabled: true,
    });

    expect(res.status).toBe(403);
  });

  it('rejects a non-member with 403 or 404', async () => {
    const { projectKey } = await ownerWithProject();
    const outsider = await signUpTestUser({
      email: `outsider-${randomUUID().slice(0, 8)}@example.com`,
    });
    const outsiderApi = authedApi(outsider.cookie);

    const res = await outsiderApi
      .projects({ projectKey })
      .settings.slack.patch({ channel: '#x', enabled: true });

    expect([403, 404]).toContain(res.status);
  });
});
