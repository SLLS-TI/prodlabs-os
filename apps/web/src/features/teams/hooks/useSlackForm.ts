'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { NotificationSettings } from '@/lib/api/endpoints/notificationSettings';
import { useUpdateNotificationSettings } from '@/services/teams.service';

export interface SlackForm {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  botToken: string;
  setBotToken: (v: string) => void;
  settings: NotificationSettings;
  dirty: boolean;
  saving: boolean;
  save: () => Promise<void>;
}

// Form state for the Slack notification provider tab. Shared between the tab's Save
// button and the body fields, so it lives in a hook. The token is sent only when
// changed; left empty, the team sends through the instance Slack bot.
export function useSlackForm(teamId: number, settings: NotificationSettings): SlackForm {
  const t = useTranslations('teams.notifications');
  const update = useUpdateNotificationSettings(teamId);
  const [enabled, setEnabled] = useState(settings.slack.enabled);
  const [botToken, setBotToken] = useState('');

  const dirty = enabled !== settings.slack.enabled || botToken.length > 0;

  async function save() {
    await update.mutateAsync({
      slack: {
        enabled,
        ...(botToken.length > 0 ? { botToken } : {}),
      },
    });
    setBotToken('');
    toast.success(t('slackSaved'));
  }

  return {
    enabled,
    setEnabled,
    botToken,
    setBotToken,
    settings,
    dirty,
    saving: update.isPending,
    save,
  };
}
