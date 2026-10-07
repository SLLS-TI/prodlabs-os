'use client';

import { useTranslations } from 'next-intl';
import ListSkeleton from '@/components/common/skeleton/ListSkeleton';
import SettingsSection from '@/components/common/page/SettingsSection';
import SettingsCard from '@/components/common/page/SettingsCard';
import GodSectionPage from './components/GodSectionPage';
import GodStatsSummary from './components/stats/GodStatsSummary';
import GodStatsHoursChart from './components/stats/GodStatsHoursChart';
import GodStatsOverdueChart from './components/stats/GodStatsOverdueChart';
import GodStatsHealthTable from './components/stats/GodStatsHealthTable';
import { useGodStatsQuery } from './services/godStats.service';

// The cross-project statistics page: an instance-wide roll-up, worked-vs-estimated
// hours and overdue charts over the top projects, and a per-project health table. All
// read-only; the server computes the scores and totals.
export default function GodStatsPage() {
  const t = useTranslations('god.stats');
  const query = useGodStatsQuery();

  if (!query.data) {
    return (
      <GodSectionPage slug="stats" widthClassName="max-w-none">
        <ListSkeleton rows={6} rowClassName="h-12" />
      </GodSectionPage>
    );
  }

  const { projects, global } = query.data;

  if (projects.length === 0) {
    return (
      <GodSectionPage slug="stats" widthClassName="max-w-none">
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </GodSectionPage>
    );
  }

  return (
    <GodSectionPage slug="stats" widthClassName="max-w-none">
      <div className="space-y-8">
        <GodStatsSummary global={global} />

        <div className="grid gap-8 lg:grid-cols-2">
          <SettingsSection title={t('hours.title')} description={t('hours.subtitle')}>
            <GodStatsHoursChart projects={projects} />
          </SettingsSection>
          <SettingsSection title={t('overdue.title')} description={t('overdue.subtitle')}>
            <GodStatsOverdueChart projects={projects} />
          </SettingsSection>
        </div>

        <SettingsSection title={t('table.title')} description={t('table.subtitle')}>
          <SettingsCard className="overflow-x-auto">
            <GodStatsHealthTable projects={projects} />
          </SettingsCard>
        </SettingsSection>
      </div>
    </GodSectionPage>
  );
}
