'use client';

import { useTranslations } from 'next-intl';
import type { GodStatsGlobal } from '@/lib/api/endpoints/godStats';
import { formatMinutes } from '@/utils/estimate';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { BAND_TEXT, bandFor } from './healthBand';

// The portfolio summary: a row of numeric cards reading from the global roll-up. The
// global score is colored by its band; the rest are plain figures.
export default function GodStatsSummary({ global }: { global: GodStatsGlobal }) {
  const t = useTranslations('god.stats');
  const { totals } = global;

  const cards: { label: string; value: string; accent?: string }[] = [
    {
      label: t('summary.globalScore'),
      value: String(global.globalScore),
      accent: BAND_TEXT[bandFor(global.globalScore)],
    },
    { label: t('summary.overduePct'), value: `${global.overduePct}%` },
    { label: t('summary.redProjects'), value: String(global.redProjectCount) },
    {
      label: t('summary.burnRatio'),
      value: global.globalBurnRatio === null ? '—' : `${global.globalBurnRatio}×`,
    },
    { label: t('summary.openIssues'), value: String(totals.openIssues) },
    { label: t('summary.closedLast7d'), value: String(totals.closedLast7d) },
    { label: t('summary.unassigned'), value: String(totals.unassigned) },
    { label: t('summary.worked'), value: formatMinutes(totals.workedMinutes) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={cn('text-3xl font-semibold tracking-tight tabular-nums', card.accent)}>
              {card.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
