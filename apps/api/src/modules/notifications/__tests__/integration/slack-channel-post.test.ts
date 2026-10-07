import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  db,
  notificationDelivery,
  writeSecret,
  SLACK_BOT_SECRET_KEY,
  type InstanceSlackConfig,
} from '@repo/db';
import { authedApi, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// The project's Slack channel post is enqueued on the issue event itself, not off the
// per-member inbox rows. So an event whose only member is the actor (never notified)
// still posts to the channel — the case the per-member batch misses. Each post is one
// notification_delivery row with channel='slack' to the project's configured channel.
//
// Slack usability needs a channel on the project and a usable bot token. The instance
// token is written directly here (through @repo/db) because the api route validates it
// against the live Slack API, which is unavailable in tests. The outbox has no read
// route, so the rows are read from the table.

async function enableInstanceSlack(): Promise<void> {
  const config: InstanceSlackConfig = {
    enabled: true,
    botToken: 'xoxb-test-token',
    botUserId: 'U000',
    teamName: 'Test Workspace',
  };
  await writeSecret(SLACK_BOT_SECRET_KEY, config, { enabled: true, hasBotToken: true });
}

async function slackRows(): Promise<{ channel: string; payload: { text?: string } }[]> {
  return db
    .select({ channel: notificationDelivery.channel, payload: notificationDelivery.payload })
    .from(notificationDelivery)
    .where(eq(notificationDelivery.channel, 'slack'));
}

interface Member {
  api: Api;
  userId: string;
  username: string;
}

async function setup(): Promise<{ owner: Member; columnId: number; doneColumnId: number }> {
  const u = await signUpTestUser();
  const api = authedApi(u.cookie);
  await api.projects.post({ key: 'MKT', name: 'Marketing' });
  const view = await api.projects({ projectKey: 'MKT' }).get();
  const columns = view.data!.columns;
  const done = columns.find((c) => c.stateType === 'completed') ?? columns[columns.length - 1];
  return {
    owner: { api, userId: u.userId, username: u.username },
    columnId: columns[0].id,
    doneColumnId: done.id,
  };
}

async function addMember(owner: Member): Promise<Member> {
  const u = await signUpTestUser();
  const invite = await owner.api
    .projects({ projectKey: 'MKT' })
    .invites.post({ email: u.email, role: 'member' });
  const api = authedApi(u.cookie);
  await api.invites({ token: invite.data!.token }).accept.post();
  return { api, userId: u.userId, username: u.username };
}

async function setChannel(owner: Member, channel: string): Promise<void> {
  await owner.api.projects({ projectKey: 'MKT' }).settings.slack.patch({ channel, enabled: true });
}

function createIssue(client: Api, columnId: number, patch: Record<string, unknown> = {}) {
  return client.projects({ projectKey: 'MKT' }).issues.post({ columnId, title: 'Task', ...patch });
}

describe('slack channel post', () => {
  beforeEach(resetDb);

  it('posts a status change by the sole member (the actor, no other watcher)', async () => {
    await enableInstanceSlack();
    const { owner, columnId, doneColumnId } = await setup();
    await setChannel(owner, 'C01234567');
    const issue = (await createIssue(owner.api, columnId)).data!;

    await owner.api.issues({ issueId: issue.id }).patch({ columnId: doneColumnId });

    const rows = await slackRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('slack');

    // No per-member inbox row was created (the actor is the only member and is never
    // notified), so the old watcher-coupled path would have posted nothing.
    const inbox = await owner.api.notifications.get({ query: { types: 'state_changed' } });
    expect(inbox.data!.items).toHaveLength(0);
  });

  it('posts an assigned event when another member is assigned', async () => {
    await enableInstanceSlack();
    const { owner, columnId } = await setup();
    const member = await addMember(owner);
    await setChannel(owner, 'C01234567');

    await createIssue(owner.api, columnId, { title: 'Ship it', assigneeUserId: member.userId });

    const rows = await slackRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.text).toContain('Assigned by');
  });

  it('posts a commented event even when the actor is the only watcher', async () => {
    await enableInstanceSlack();
    const { owner, columnId } = await setup();
    await setChannel(owner, 'C01234567');
    const issue = (await createIssue(owner.api, columnId)).data!;

    await owner.api.issues({ issueId: issue.id }).comments.post({ body: 'a note' } as never);

    const rows = await slackRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.text).toContain('New comment by');
  });

  it('does not post when the project has no channel set', async () => {
    await enableInstanceSlack();
    const { owner, columnId, doneColumnId } = await setup();
    const issue = (await createIssue(owner.api, columnId)).data!;

    await owner.api.issues({ issueId: issue.id }).patch({ columnId: doneColumnId });

    expect(await slackRows()).toHaveLength(0);
  });

  it('does not post when no usable bot token exists on the instance or team', async () => {
    const { owner, columnId, doneColumnId } = await setup();
    await setChannel(owner, 'C01234567');
    const issue = (await createIssue(owner.api, columnId)).data!;

    await owner.api.issues({ issueId: issue.id }).patch({ columnId: doneColumnId });

    expect(await slackRows()).toHaveLength(0);
  });

  it('posts exactly one slack row per event, no double-posting', async () => {
    await enableInstanceSlack();
    const { owner, columnId, doneColumnId } = await setup();
    const member = await addMember(owner);
    await setChannel(owner, 'C01234567');

    // Assign to the member and change status in one update: two distinct event types,
    // the member is a watcher, so the per-member batch is non-empty too.
    const issue = (await createIssue(owner.api, columnId, { assigneeUserId: member.userId })).data!;
    await owner.api.issues({ issueId: issue.id }).patch({ columnId: doneColumnId });

    const rows = await slackRows();
    // issue create: one 'assigned'. status change: one 'state_changed'.
    expect(rows.filter((r) => r.payload.text?.includes('Assigned by'))).toHaveLength(1);
    expect(rows.filter((r) => r.payload.text?.includes('Status:'))).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });
});
