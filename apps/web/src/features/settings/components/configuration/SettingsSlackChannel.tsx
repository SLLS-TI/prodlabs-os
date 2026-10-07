import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsSection from '@/components/common/page/SettingsSection';
import EnabledSwitch from '@/components/common/inputs/EnabledSwitch';
import type { SlackChannelForm } from '../../hooks/useSlackChannelForm';

// The Slack block of the Configuration page: the channel this project posts its
// issue events and daily digests to. The bot token is a team/instance setting; here
// only the channel and whether posting is on. Owner-only — a non-owner cannot read
// or change it, so they get a notice rather than a disabled form.
export default function SettingsSlackChannel({ form }: { form: SlackChannelForm }) {
  const t = useTranslations('settings.configuration');
  const tCommon = useTranslations('common');

  async function save() {
    await form.save();
    toast.success(t('slackSaved'));
  }

  return (
    <SettingsSection
      title={t('slack')}
      description={t('slackHint')}
      action={
        form.editable ? (
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!form.dirty || form.saving || !form.loaded}
          >
            {tCommon('save')}
          </Button>
        ) : undefined
      }
    >
      {!form.editable ? (
        <p className="text-sm text-muted-foreground">{t('slackOwnerOnly')}</p>
      ) : (
        <SettingsCard className="space-y-6 p-4">
          <div className="flex items-center justify-between gap-6">
            <div className="max-w-2xl space-y-1">
              <div className="text-sm font-medium">{t('slackEnabled')}</div>
              <p className="text-xs text-muted-foreground">{t('slackEnabledHint')}</p>
            </div>
            <EnabledSwitch checked={form.enabled} onChange={form.setEnabled} />
          </div>
          <div className="space-y-1.5 sm:max-w-md">
            <Label htmlFor="slack-channel">{t('slackChannel')}</Label>
            <Input
              id="slack-channel"
              value={form.channel}
              onChange={(e) => form.setChannel(e.target.value)}
              placeholder="#updates"
            />
            <p className="text-xs text-muted-foreground">{t('slackChannelHint')}</p>
          </div>
        </SettingsCard>
      )}
    </SettingsSection>
  );
}
