import {
  writeSecret,
  getInstanceSlackConfig,
  isInstanceSlackUsable,
  SLACK_BOT_SECRET_KEY,
  type InstanceSlackConfig,
} from '@repo/db';

// The instance Slack bot write side. One bot serves the whole instance: it is the
// default sender for project Slack notifications (a team may still set its own bot
// token in its notification settings, which wins for that team's deliveries). The
// token is a secret, so it lives encrypted in app_secret under 'slack.bot' with a
// `redacted` mirror for the settings UI. The stored shape and its reader are in
// @repo/db, shared with the worker; what is here is the write side.

export async function hasUsableInstanceSlack(): Promise<boolean> {
  return isInstanceSlackUsable(await getInstanceSlackConfig());
}

// The config as returned to the client: the token replaced by a boolean telling
// whether one is stored.
export interface InstanceSlackDto {
  enabled: boolean;
  teamName: string;
  hasBotToken: boolean;
}

// A partial write. The token keeps its stored value when omitted or sent empty (a
// masked field the administrator did not edit).
export interface InstanceSlackPatch {
  enabled?: boolean;
  botToken?: string;
}

function toSlackDto(config: InstanceSlackConfig): InstanceSlackDto {
  return {
    enabled: config.enabled,
    teamName: config.teamName,
    hasBotToken: config.botToken.length > 0,
  };
}

export async function getInstanceSlackSettings(): Promise<InstanceSlackDto> {
  return toSlackDto(await getInstanceSlackConfig());
}

// Asks Slack who the token belongs to. Doubles as validation: a bad token is
// rejected before it is stored, so the administrator finds out at save time rather
// than from silently undelivered notifications.
export async function fetchSlackIdentity(
  botToken: string,
): Promise<{ botUserId: string; teamName: string }> {
  let res: Response;
  try {
    res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { authorization: `Bearer ${botToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not reach Slack to verify the bot token');
  }
  if (!res.ok) throw new Error('Slack rejected this bot token');
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    user_id?: string;
    team?: string;
  } | null;
  if (!body?.ok || !body.user_id) throw new Error('Slack rejected this bot token');
  return { botUserId: body.user_id, teamName: body.team ?? '' };
}

export async function setInstanceSlackSettings(
  patch: InstanceSlackPatch,
): Promise<InstanceSlackDto> {
  const current = await getInstanceSlackConfig();
  const botToken = patch.botToken && patch.botToken.length > 0 ? patch.botToken : current.botToken;
  // Ask Slack for the workspace name only when there is something new to resolve: a
  // token that changed, or a stored one whose workspace was never recorded. An
  // unchanged token keeps the name already resolved for it, so saving an unrelated
  // field does not depend on Slack being reachable.
  const needsLookup =
    botToken.length > 0 && (botToken !== current.botToken || current.teamName.length === 0);
  const identity = needsLookup ? await fetchSlackIdentity(botToken) : null;
  const next: InstanceSlackConfig = {
    enabled: patch.enabled ?? current.enabled,
    botToken,
    botUserId: identity?.botUserId ?? current.botUserId,
    teamName: identity?.teamName ?? current.teamName,
  };
  const redacted = toSlackDto(next);
  await writeSecret(SLACK_BOT_SECRET_KEY, next, redacted);
  return redacted;
}
