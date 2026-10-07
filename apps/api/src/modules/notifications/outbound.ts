import {
  db,
  notificationDelivery,
  issue,
  issueActivity,
  project,
  team,
  user,
  emailSource,
  getProjectEmailConfig,
  type DeliveryPayload,
} from '@repo/db';
import { eq, inArray } from 'drizzle-orm';
import { readRedactedSettings } from '#modules/notification-settings/service';
import { getPreferencesForUsers } from '#modules/notification-preferences/service';
import { getTelegramChatIds, hasUsableInstanceBot } from '#modules/telegram/service';
import { hasUsableInstanceSlack } from '#modules/slack/service';
import { getSlackProjectSettings } from '#modules/projects/service';
import { escapeHtml } from '#shared/lib';
import { issueUrl, teamRef } from '#modules/teams/ref';
import type { NotificationType, NewNotificationRow } from './service';

// Outbound notification delivery: turns the inbox notification rows produced by an
// issue event into notification_delivery outbox rows. Email and Telegram are per
// member and per their own preferences: for each inbox row (already one per
// recipient), the member's notification-preferences decide whether it goes by email
// (to their account address) and/or Telegram (to the chat of the Telegram account
// they linked). Slack is per project instead: one post per distinct event type to the
// project's configured channel, independent of member preferences. The team that owns
// the project supplies the provider credentials (SMTP/Resend, and optionally its own
// Telegram/Slack bot token — each otherwise goes through the instance bot). The
// message text is composed here at enqueue time and stored on the row; the worker
// drains the outbox and the sender reads the credentials at send time.
//
// This is best-effort: enqueue never throws into the caller (a failure here must not
// break creating a comment or updating an issue), so callers wrap it in try/catch.

interface OutboxRow {
  projectId: number;
  channel: 'email' | 'telegram' | 'slack';
  recipient: string;
  payload: DeliveryPayload;
}

// The issue reference shown in messages, e.g. "IAP-42".
function issueRef(projectKey: string, seq: number): string {
  return `${projectKey}-${seq}`;
}

interface StateChange {
  from: string;
  to: string;
}

async function readStateChange(activityId: number): Promise<StateChange | null> {
  const [row] = await db
    .select({ payload: issueActivity.payload })
    .from(issueActivity)
    .where(eq(issueActivity.id, activityId));
  const from = row?.payload.from?.value;
  const to = row?.payload.to?.value;
  if (!from || !to) return null;
  return { from, to };
}

// Email copy, addressed to the recipient in the second person.
function emailPayload(
  type: NotificationType,
  ref: string,
  title: string,
  actor: string,
  url: string | undefined,
  stateChange: StateChange | null,
): DeliveryPayload {
  const line: Record<NotificationType, { subject: string; text: string }> = {
    assigned: { subject: `${ref}: assigned to you`, text: `${actor} assigned this issue to you.` },
    mentioned: {
      subject: `${ref}: you were mentioned`,
      text: `${actor} mentioned you on this issue.`,
    },
    commented: { subject: `${ref}: new comment`, text: `${actor} commented on this issue.` },
    state_changed: {
      subject: stateChange
        ? `${ref}: status changed to ${stateChange.to}`
        : `${ref}: status changed`,
      text: stateChange
        ? `${actor} changed the status of this issue from ${stateChange.from} to ${stateChange.to}.`
        : `${actor} changed the status of this issue.`,
    },
  };
  const { subject, text } = line[type];
  return { subject, text: `${text}\n\n${ref}: ${title}`, url };
}

// Telegram copy. Rendered as HTML (parse_mode HTML) with the issue reference as a
// clickable link, plus a plain-text fallback. Issue-centric third person, matching
// the email copy without repeating the second-person address.
function telegramPayload(
  type: NotificationType,
  ref: string,
  title: string,
  actor: string,
  url: string | undefined,
  stateChange: StateChange | null,
): DeliveryPayload {
  const meta: Record<NotificationType, { emoji: string; action: string }> = {
    assigned: { emoji: '📌', action: `Assigned by ${actor}` },
    mentioned: { emoji: '💬', action: `Mentioned by ${actor}` },
    commented: { emoji: '💬', action: `New comment by ${actor}` },
    state_changed: {
      emoji: '🔄',
      action: stateChange
        ? `Status changed from ${stateChange.from} to ${stateChange.to} by ${actor}`
        : `Status changed by ${actor}`,
    },
  };
  const { emoji, action } = meta[type];

  // HTML (parse_mode=HTML): the issue reference is the clickable link, so no raw URL
  // is shown. A blank line (\n\n) separates the title line from the action line. The
  // plain-text fallback carries no URL here; the sender appends it once.
  const refLink = url
    ? `<a href="${escapeHtml(url)}"><b>${escapeHtml(ref)}</b></a>`
    : `<b>${escapeHtml(ref)}</b>`;
  const html = `${emoji} ${refLink} ${escapeHtml(title)}\n\n<i>${escapeHtml(action)}</i>`;
  const text = `${emoji} ${ref} ${title}\n\n${action}`;
  return { text, html, url };
}

// Slack mrkdwn escaping: only these three characters, and not inside a link target.
// Distinct from escapeHtml, so do not reuse it.
function escapeSlack(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Slack copy for a channel post. One line per event, issue-centric and naming the
// actor (the channel is not a per-member DM). The issue reference is a mrkdwn link
// (<url|REF>); the body is the row's payload.text, no html/subject.
function slackPayload(
  type: NotificationType,
  ref: string,
  title: string,
  actor: string,
  url: string | undefined,
  stateChange: StateChange | null,
): DeliveryPayload {
  const action: Record<NotificationType, string> = {
    assigned: `Assigned by ${actor}`,
    mentioned: `${actor} mentioned someone`,
    commented: `New comment by ${actor}`,
    state_changed: stateChange
      ? `Status: ${stateChange.from} → ${stateChange.to} (by ${actor})`
      : `Status changed by ${actor}`,
  };
  const refLink = url ? `<${url}|${escapeSlack(ref)}>` : escapeSlack(ref);
  const text = `*${refLink}* ${escapeSlack(title)}\n_${escapeSlack(action[type])}_`;
  return { text, url };
}

// Enqueues outbound delivery rows for the inbox notifications just created for one
// issue event. All rows in `notifications` share the same issue and actor (both call
// sites operate on a single issue). No-op when the team has no enabled provider or
// no member wants any of the event types present.
export async function enqueueOutbound(
  notifications: NewNotificationRow[],
  actorName: string | null,
): Promise<void> {
  if (notifications.length === 0) return;
  const projectId = notifications[0].projectId;

  const [projectRow] = await db
    .select({ key: project.key, name: project.name, teamId: project.teamId, teamSlug: team.slug })
    .from(project)
    .innerJoin(team, eq(team.id, project.teamId))
    .where(eq(project.id, projectId));
  if (!projectRow) return;

  const settings = await readRedactedSettings(projectRow.teamId);

  // The team's own provider when it configured one, otherwise the instance
  // provider when the team asked for it and the instance shares it.
  const source = emailSource(settings);
  const emailEnabled =
    source === 'smtp'
      ? settings.smtp.host.length > 0 && settings.smtp.hasPassword
      : source === 'resend'
        ? settings.resend.hasApiKey
        : source === 'system'
          ? (await getProjectEmailConfig()) !== null
          : false;
  // The team turns Telegram on; the bot that sends is either its own or, when it
  // set no token, the instance bot.
  const telegramEnabled =
    settings.telegram.enabled && (settings.telegram.hasBotToken || (await hasUsableInstanceBot()));
  // Slack is per project: the project names a channel, and a usable bot token exists
  // on the team (its own or the enabled flag) or on the instance. Unlike email and
  // Telegram, Slack posts to the project channel, not to the members, so it does not
  // depend on any member preference.
  const projectSlack = await getSlackProjectSettings(projectId);
  const slackEnabled =
    projectSlack.enabled &&
    projectSlack.channel.length > 0 &&
    (settings.slack.hasBotToken || (await hasUsableInstanceSlack()));
  if (!emailEnabled && !telegramEnabled && !slackEnabled) return;

  const issueId = notifications[0].issueId;
  const [issueRow] = await db
    .select({ seq: issue.sequenceNumber, title: issue.title })
    .from(issue)
    .where(eq(issue.id, issueId));
  if (!issueRow) return;

  const ref = issueRef(projectRow.key, issueRow.seq);
  const url = issueUrl(
    teamRef({ id: projectRow.teamId, slug: projectRow.teamSlug }),
    projectRow.key,
    issueRow.seq,
  );
  const actor = actorName ?? 'Someone';
  // One issue event, so every 'state_changed' row points at the same activity row.
  const statusActivityId =
    notifications.find((n) => n.type === 'state_changed')?.sourceActivityId ?? null;
  const stateChange = statusActivityId != null ? await readStateChange(statusActivityId) : null;

  const userIds = [...new Set(notifications.map((n) => n.userId))];
  const [users, prefsByUser, chatIdByUser] = await Promise.all([
    db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, userIds)),
    getPreferencesForUsers(projectId, userIds),
    telegramEnabled ? getTelegramChatIds(userIds) : Promise.resolve(new Map<string, string>()),
  ]);
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  const out: OutboxRow[] = [];
  for (const n of notifications) {
    const prefs = prefsByUser.get(n.userId);
    if (!prefs) continue; // member has not opted in

    if (emailEnabled && prefs.emailEvents[n.type]) {
      const email = emailById.get(n.userId);
      if (email) {
        out.push({
          projectId,
          channel: 'email',
          recipient: email,
          payload: emailPayload(n.type, ref, issueRow.title, actor, url, stateChange),
        });
      }
    }
    if (telegramEnabled && prefs.telegramEvents[n.type]) {
      // No linked Telegram account means nowhere to send; the member sees the prompt
      // to link one in the project's notification settings.
      const chatId = chatIdByUser.get(n.userId);
      if (chatId) {
        out.push({
          projectId,
          channel: 'telegram',
          recipient: chatId,
          payload: telegramPayload(n.type, ref, issueRow.title, actor, url, stateChange),
        });
      }
    }
  }

  // One Slack post per distinct event type in the batch (the per-member rows collapse
  // to the underlying event), all to the project channel.
  if (slackEnabled) {
    for (const type of new Set(notifications.map((n) => n.type))) {
      out.push({
        projectId,
        channel: 'slack',
        recipient: projectSlack.channel,
        payload: slackPayload(type, ref, issueRow.title, actor, url, stateChange),
      });
    }
  }

  if (out.length === 0) return;
  await db.insert(notificationDelivery).values(out);
}
