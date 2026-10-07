import { useTranslations } from 'next-intl';
import type { ProjectFeatures } from '@/lib/api/endpoints/settings';
import { useFeatureLabel } from '@/hooks/useFeatureLabel';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsSection from '@/components/common/page/SettingsSection';
import SettingsRow from '@/components/common/page/SettingsRow';
import { Switch } from '@/components/ui/switch';
import type { FeatureTogglesForm } from '../../hooks/useFeatureToggles';

// The navigation sections in the order the sidebar lists them, then the sections
// of an issue. A hosted plan can block any of these, so they are shown only while
// the project may use them.
const BLOCKABLE_FEATURES = [
  'dashboards',
  'initiatives',
  'cycles',
  'documents',
  'notes',
  'subtasks',
  'checklists',
  'issueStats',
] as const satisfies (keyof ProjectFeatures)[];

// The navigation-only toggles: they hide a sidebar entry and are never blockable by
// a hosted plan, so they are always offered.
const NAV_FEATURES = [
  'aiTeam',
  'inbox',
  'workItems',
  'members',
  'notifications',
] as const satisfies (keyof ProjectFeatures)[];

// The Features block of the General page. Each switch saves on its own. Only an
// owner may change them; others see the current state read-only.
export default function SettingsFeatures({ form }: { form: FeatureTogglesForm }) {
  const t = useTranslations('settings.general');
  const featureLabel = useFeatureLabel();

  const row = (feature: keyof ProjectFeatures) => (
    <SettingsRow
      key={feature}
      title={featureLabel(feature)}
      description={t(`featureHints.${feature}`)}
      control={
        <Switch
          checked={form.features[feature]}
          disabled={!form.editable || form.saving}
          onCheckedChange={(enabled) => void form.toggle(feature, enabled)}
        />
      }
    />
  );

  return (
    <SettingsSection title={t('features')} description={t('featuresHint')}>
      <SettingsCard className="divide-y divide-border/60">
        {BLOCKABLE_FEATURES.filter((feature) => form.available.includes(feature)).map(row)}
        {NAV_FEATURES.map(row)}
      </SettingsCard>
    </SettingsSection>
  );
}
