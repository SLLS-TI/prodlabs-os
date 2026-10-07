'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { InstanceSlackSettings } from '@/lib/api/endpoints/god';
import SettingsCard from '@/components/common/page/SettingsCard';
import EnabledSwitch from '@/components/common/inputs/EnabledSwitch';
import SecretInput from '@/components/common/inputs/SecretInput';
import SettingsSection from '@/components/common/page/SettingsSection';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import GodSectionPage from './components/GodSectionPage';
import GodSettingsGate from './components/GodSettingsGate';
import {
  useInstanceSlackSettingsQuery,
  useUpdateInstanceSlackSettings,
} from './services/god.service';

export default function GodSlackPage() {
  const query = useInstanceSlackSettingsQuery();

  return (
    <GodSettingsGate slug="slack" data={query.data}>
      {(settings) => <SlackForm settings={settings} />}
    </GodSettingsGate>
  );
}

function SlackForm({ settings }: { settings: InstanceSlackSettings }) {
  const t = useTranslations('god.slack');
  const tCommon = useTranslations('common');
  const update = useUpdateInstanceSlackSettings();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [botToken, setBotToken] = useState('');

  const hasToken = settings.hasBotToken || botToken.length > 0;
  const dirty = enabled !== settings.enabled || botToken.length > 0;

  async function save() {
    try {
      await update.mutateAsync({
        enabled: enabled && hasToken,
        ...(botToken.length > 0 ? { botToken } : {}),
      });
      setBotToken('');
      toast.success(t('saved'));
    } catch {
      // The failure already surfaced through the global mutation error toast. A token
      // Slack rejects comes back as a 400 with what it said.
    }
  }

  return (
    <GodSectionPage
      slug="slack"
      actions={
        <Button size="sm" onClick={() => void save()} disabled={!dirty || update.isPending}>
          {update.isPending ? tCommon('saving') : tCommon('save')}
        </Button>
      }
    >
      <SettingsSection
        title={t('bot')}
        description={t(hasToken ? 'botConfigured' : 'botMissing')}
        action={
          <EnabledSwitch
            checked={enabled}
            onChange={setEnabled}
            disabled={update.isPending || !hasToken}
          />
        }
      >
        <SettingsCard className="space-y-6 p-4">
          <div className="space-y-1.5 sm:max-w-md">
            <Label htmlFor="slack-bot-token">{t('botToken')}</Label>
            <SecretInput
              id="slack-bot-token"
              value={botToken}
              onChange={setBotToken}
              hasStored={settings.hasBotToken}
              placeholder="xoxb-…"
            />
            <p className="text-xs text-muted-foreground">{t('botTokenHint')}</p>
          </div>

          {settings.teamName && (
            <div className="space-y-1 border-t border-border/60 pt-4">
              <div className="text-sm font-medium">{t('workspace')}</div>
              <p className="font-mono text-xs">{settings.teamName}</p>
              <p className="text-xs text-muted-foreground">{t('resolvedHint')}</p>
            </div>
          )}
        </SettingsCard>
      </SettingsSection>
    </GodSectionPage>
  );
}
