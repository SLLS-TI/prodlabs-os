import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import SettingsSection from '@/components/common/page/SettingsSection';
import EnabledSwitch from '@/components/common/inputs/EnabledSwitch';
import SecretInput from '@/components/common/inputs/SecretInput';
import type { SlackForm } from '../../hooks/useSlackForm';

// The bot the team delivers Slack notifications through. The token is optional: left
// empty, the team sends through the instance bot. The per-project channel is set on
// each project's Configuration page. The token is sent only when changed.
export default function SlackSettings({ form }: { form: SlackForm }) {
  const t = useTranslations('teams.notifications');
  const { settings } = form;
  return (
    <SettingsSection
      title={t('slackBot')}
      description={t('slackBotHint')}
      action={<EnabledSwitch checked={form.enabled} onChange={form.setEnabled} />}
    >
      <div className="space-y-1.5 sm:max-w-md">
        <Label htmlFor="slack-token">{t('botToken')}</Label>
        <SecretInput
          id="slack-token"
          value={form.botToken}
          onChange={form.setBotToken}
          hasStored={settings.slack.hasBotToken}
          placeholder="xoxb-…"
        />
      </div>
    </SettingsSection>
  );
}
