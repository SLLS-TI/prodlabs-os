import { describe, it, expect, beforeEach } from 'bun:test';
import { authedApi, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

const smtp = {
  enabled: true,
  host: 'smtp.example.com',
  port: 587,
  encryption: 'none' as const,
  username: '',
  timeout: null,
};

async function ownedTeam(): Promise<{ api: Api; teamId: number }> {
  const user = await signUpTestUser();
  const api = authedApi(user.cookie);
  const teams = await api.teams.get();
  return { api, teamId: teams.data![0].id };
}

describe('notification settings', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects SMTP without a host', async () => {
    const { api, teamId } = await ownedTeam();

    const res = await api
      .teams({ teamId })
      ['notification-settings'].put({ smtp: { ...smtp, host: '  ' } });

    expect(res.status).toBe(400);
  });

  it('rejects SMTP with a username but no password', async () => {
    const { api, teamId } = await ownedTeam();

    const res = await api
      .teams({ teamId })
      ['notification-settings'].put({ smtp: { ...smtp, username: 'mailer@example.com' } });

    expect(res.status).toBe(400);
  });

  it('rejects Resend without an API key', async () => {
    const { api, teamId } = await ownedTeam();

    const res = await api.teams({ teamId })['notification-settings'].put({
      resend: { enabled: true },
    });

    expect(res.status).toBe(400);
  });

  it('keeps the stored password when the field is left blank', async () => {
    const { api, teamId } = await ownedTeam();
    const credentials = { ...smtp, username: 'mailer@example.com', password: 'secret' };

    const saved = await api.teams({ teamId })['notification-settings'].put({ smtp: credentials });
    expect(saved.status).toBe(200);
    expect(saved.data?.smtp.hasPassword).toBe(true);

    const again = await api
      .teams({ teamId })
      ['notification-settings'].put({ smtp: { ...credentials, password: '' } });

    expect(again.status).toBe(200);
    expect(again.data?.smtp.hasPassword).toBe(true);
  });

  it('stores a provider that can send', async () => {
    const { api, teamId } = await ownedTeam();

    const res = await api.teams({ teamId })['notification-settings'].put({
      smtp: { ...smtp, host: ' smtp.example.com ' },
    });

    expect(res.status).toBe(200);
    expect(res.data?.smtp).toMatchObject({ enabled: true, host: 'smtp.example.com' });
  });

  it('stores the slack bot token and reports it as present without echoing it', async () => {
    const { api, teamId } = await ownedTeam();

    const res = await api.teams({ teamId })['notification-settings'].put({
      slack: { enabled: true, botToken: 'xoxb-test-token' },
    });

    expect(res.status).toBe(200);
    expect(res.data?.slack).toMatchObject({ enabled: true, hasBotToken: true });
    expect(JSON.stringify(res.data)).not.toContain('xoxb-test-token');
  });

  it('keeps the stored slack token when botToken is omitted', async () => {
    const { api, teamId } = await ownedTeam();

    await api.teams({ teamId })['notification-settings'].put({
      slack: { enabled: true, botToken: 'xoxb-stored' },
    });

    const again = await api.teams({ teamId })['notification-settings'].put({
      slack: { enabled: false },
    });

    expect(again.status).toBe(200);
    expect(again.data?.slack).toMatchObject({ enabled: false, hasBotToken: true });
  });

  it('rejects a non-owner team member trying to change slack settings', async () => {
    const { api, teamId } = await ownedTeam();
    const member = await signUpTestUser({ email: 'member@example.com' });
    const memberApi = authedApi(member.cookie);

    // Invite the member into the team so the route resolves it, then assert 403.
    const invite = await api.teams({ teamId }).invites.post({
      email: 'member@example.com',
      role: 'member',
    });
    await memberApi.invites({ token: invite.data!.token }).accept.post();

    const res = await memberApi.teams({ teamId })['notification-settings'].put({
      slack: { enabled: true, botToken: 'xoxb-test' },
    });

    expect(res.status).toBe(403);
  });
});
