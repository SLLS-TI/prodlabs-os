import { readSecret } from '../secrets';

// The instance Slack bot, stored encrypted in app_secret under 'slack.bot'. Two
// processes read it: the api (settings UI) and the worker (Slack delivery falls back
// to this bot when a team set no token of its own). The api owns the write, so a
// field added here has to be set there too.

export const SLACK_BOT_SECRET_KEY = 'slack.bot';

export interface InstanceSlackConfig {
  enabled: boolean;
  botToken: string; // secret, xoxb-...
  // Resolved from auth.test when the token is saved, so the settings UI can confirm
  // which workspace the token belongs to without a second lookup.
  botUserId: string;
  teamName: string;
}

export async function getInstanceSlackConfig(): Promise<InstanceSlackConfig> {
  const stored = await readSecret<InstanceSlackConfig>(SLACK_BOT_SECRET_KEY);
  // Merge over the default so a config written before a field was added stays valid.
  return { enabled: false, botToken: '', botUserId: '', teamName: '', ...stored };
}

// Whether the instance bot can be used right now. Slack delivery falls back to this
// bot only when it is.
export function isInstanceSlackUsable(config: InstanceSlackConfig): boolean {
  return config.enabled && config.botToken.length > 0;
}
