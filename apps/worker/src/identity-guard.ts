import { db, identityScrubberForProjects, projectHasClients, type DeliveryPayload } from '@repo/db';
import { sql } from 'drizzle-orm';

// Outbound messages a client can read have every agency identity rewritten to the
// project's face, with the same scrubber the api applies to its responses. A Slack
// channel post is scrubbed in a project with clients unless the project marks its
// channel internal (a client may sit in a shared channel); an email or Telegram message
// only when its recipient is a client.

async function slackChannelIsInternal(projectId: number): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT value FROM project_setting WHERE project_id = ${projectId} AND key = 'slack'
  `)) as unknown as { value: { internalOnly?: unknown } | null }[];
  return rows[0]?.value?.internalOnly === true;
}

async function recipientIsClient(
  projectId: number,
  channel: string,
  recipient: string | null,
  payload: DeliveryPayload,
): Promise<boolean> {
  if (channel === 'slack') return !(await slackChannelIsInternal(projectId));
  if (payload.projectInviteId != null) {
    const rows = (await db.execute(sql`
      SELECT 1 FROM team_invite WHERE id = ${payload.projectInviteId} AND project_role = 'client'
    `)) as unknown as unknown[];
    if (rows.length > 0) return true;
  }
  if (!recipient) return false;
  const match =
    channel === 'telegram'
      ? sql`u.id IN (SELECT user_id FROM user_telegram_account WHERE chat_id = ${recipient})`
      : sql`lower(u.email) = lower(${recipient})`;
  const rows = (await db.execute(sql`
    SELECT 1 FROM project_member pm JOIN "user" u ON u.id = pm.user_id
    WHERE pm.project_id = ${projectId} AND pm.role = 'client' AND ${match}
    LIMIT 1
  `)) as unknown as unknown[];
  return rows.length > 0;
}

// The payload to send: subject, text and html scrubbed when a client reads it, the
// row's payload unchanged otherwise.
export async function guardDeliveryPayload(row: {
  projectId: number;
  channel: string;
  recipient: string | null;
  payload: DeliveryPayload;
}): Promise<DeliveryPayload> {
  if (!(await projectHasClients(row.projectId))) return row.payload;
  if (!(await recipientIsClient(row.projectId, row.channel, row.recipient, row.payload))) {
    return row.payload;
  }
  const scrub = await identityScrubberForProjects([row.projectId]);
  const { subject, text, html } = row.payload;
  return { ...row.payload, ...scrub({ subject, text, html }) };
}
