import { useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useSlackChannelQuery, useUpdateSlackChannel } from '../services/settings.service';

// The per-project Slack channel form state, shared between the section's Save button
// and its fields. Seeds from the stored setting and reseeds whenever it changes (e.g.
// after a save). Only a project owner may change it, matching the API guard.
export interface SlackChannelForm {
  editable: boolean;
  loaded: boolean;
  saving: boolean;
  save: () => Promise<void>;
  channel: string;
  setChannel: (v: string) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  dirty: boolean;
}

export function useSlackChannelForm(projectKey: string): SlackChannelForm {
  const { isOwner } = usePermissions();
  const settingsQuery = useSlackChannelQuery(projectKey, isOwner);
  const update = useUpdateSlackChannel(projectKey);

  const [channel, setChannel] = useState('');
  const [enabled, setEnabled] = useState(false);

  const data = settingsQuery.data;
  useEffect(() => {
    setChannel(data?.channel ?? '');
    setEnabled(data?.enabled ?? false);
  }, [data]);

  const dirty =
    data != null &&
    (channel.trim() !== data.channel || (enabled && channel.trim().length > 0) !== data.enabled);

  async function save() {
    await update.mutateAsync({ channel: channel.trim(), enabled });
  }

  return {
    editable: isOwner,
    loaded: settingsQuery.isSuccess,
    saving: update.isPending,
    save,
    channel,
    setChannel,
    enabled,
    setEnabled,
    dirty,
  };
}
