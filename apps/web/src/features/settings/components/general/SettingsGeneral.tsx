import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsSection from '@/components/common/page/SettingsSection';
import SettingsColorField from '../crud/SettingsColorField';
import type { GeneralForm } from '../../hooks/useGeneralForm';

// The Project block of the General page. The key is shown read-only: it prefixes
// every issue and cannot change. Only an owner may edit; others see the values
// read-only.
export default function SettingsGeneral({ form }: { form: GeneralForm }) {
  const t = useTranslations('settings.general');
  const tCommon = useTranslations('common');

  return (
    <SettingsSection title={t('project')} description={t('projectHint')}>
      <SettingsCard className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="project-key">{t('key')}</Label>
          <Input id="project-key" value={form.key} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-name">{tCommon('name')}</Label>
          <Input
            id="project-name"
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
            disabled={!form.editable}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-description">{tCommon('description')}</Label>
          <Textarea
            id="project-description"
            rows={3}
            maxLength={2000}
            value={form.description}
            onChange={(e) => form.setDescription(e.target.value)}
            disabled={!form.editable}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('themeColor')}</Label>
          <p className="text-sm text-muted-foreground">{t('themeColorHint')}</p>
          {form.editable ? (
            <div className="flex items-center gap-2">
              <SettingsColorField
                value={form.color ?? ''}
                onChange={(hex) => form.setColor(hex.trim() === '' ? null : hex)}
              />
              {form.color != null && (
                <Button type="button" variant="ghost" size="sm" onClick={() => form.setColor(null)}>
                  {tCommon('clear')}
                </Button>
              )}
            </div>
          ) : form.color != null ? (
            <span
              className="size-6 shrink-0 rounded-full border border-input"
              style={{ backgroundColor: form.color }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('themeColorNone')}</p>
          )}
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}
