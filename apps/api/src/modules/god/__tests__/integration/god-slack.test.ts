import { describe, it, expect, beforeEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { addUser, setup } from '../helpers';

// God-mode Slack bot settings: GET/PUT /god/slack-settings.
// The token is a secret — it is never echoed back, only hasBotToken flips.
// enabled:true with no stored token is rejected. A non-god caller gets 403.
// Token validation against the real Slack API is intentionally skipped in tests
// (no live token available); the route rejects a bad token with 400, tested by
// sending a clearly invalid one and asserting the status — matching the approach
// the Telegram god test uses for the same network-gated validation.

describe('god slack settings', () => {
  beforeEach(resetDb);

  it('refuses access to a non-god user', async () => {
    const { god } = await setup();
    const plain = await addUser({ email: 'plain@example.com' });
    await god.api.projects.post({ key: 'GOD', name: 'GodTest' });

    const res = await plain.api.god['slack-settings'].get();

    expect(res.status).toBe(403);
  });

  it('returns the initial state with no token stored', async () => {
    const { god } = await setup();

    const res = await god.api.god['slack-settings'].get();

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ enabled: false, hasBotToken: false, teamName: '' });
  });

  it('rejects enabled:true when no token is stored', async () => {
    const { god } = await setup();

    const res = await god.api.god['slack-settings'].put({ enabled: true });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid bot token (Slack auth.test would return ok:false)', async () => {
    const { god } = await setup();

    const res = await god.api.god['slack-settings'].put({ botToken: 'not-a-real-token' });

    // The token is sent to Slack's auth.test; an invalid token is rejected with 400.
    expect(res.status).toBe(400);
  });

  it('refuses PUT for a non-god user', async () => {
    await setup();
    const plain = await addUser({ email: 'plain2@example.com' });

    const res = await plain.api.god['slack-settings'].put({ enabled: false });

    expect(res.status).toBe(403);
  });
});
