import { useTranslations } from 'next-intl';
import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsSection from '@/components/common/page/SettingsSection';
import SettingsRow from '@/components/common/page/SettingsRow';
import { HEALTH_DIMENSIONS, type HealthWeightsForm } from '../../hooks/useHealthWeightsForm';

// The weights this project's health score uses in the god stats view. Five
// non-negative numbers, one per dimension. The total indicator is advisory: the score
// normalizes by proportion, so the values need not sum to 100. A reader without
// workflow_config edit gets the current values, not disabled controls.
export default function SettingsHealthWeights({ form }: { form: HealthWeightsForm }) {
  const t = useTranslations('settings.configuration');

  if (!form.editable) {
    const summary = HEALTH_DIMENSIONS.map(
      (d) => `${t(`healthWeight.dimensions.${d}`)} ${form.values[d]}`,
    ).join(' · ');
    return (
      <SettingsSection title={t('healthWeight.title')} description={t('healthWeight.hint')}>
        <SettingsCard>
          <SettingsRow
            title={t('healthWeight.weights')}
            description={t('healthWeight.weightsHint')}
            control={
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Gauge className="size-4" />
                {summary}
              </span>
            }
          />
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t('healthWeight.title')} description={t('healthWeight.hint')}>
      <SettingsCard className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {HEALTH_DIMENSIONS.map((dimension) => (
            <label key={dimension} className="space-y-1.5 text-sm">
              <span className="text-xs font-medium">
                {t(`healthWeight.dimensions.${dimension}`)}
              </span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={form.values[dimension]}
                onChange={(e) => form.setValue(dimension, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4">
          <p
            className={cn(
              'text-xs',
              form.total === 100 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-500',
            )}
          >
            {form.total === 100
              ? t('healthWeight.total', { total: form.total })
              : t('healthWeight.totalHint', { total: form.total })}
          </p>
          <Button variant="ghost" size="sm" onClick={form.reset}>
            {t('healthWeight.reset')}
          </Button>
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}
