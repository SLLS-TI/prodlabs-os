'use client';

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { useTranslations } from 'next-intl';
import type { GodStatsProject } from '@/lib/api/endpoints/godStats';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const OVERDUE_COLOR = '#ef4444';
const TOP_N = 12;

// Overdue open issues per project, as single-series bars. Capped at the TOP_N projects
// with the most overdue work; the health table carries the full set.
export default function GodStatsOverdueChart({ projects }: { projects: GodStatsProject[] }) {
  const t = useTranslations('god.stats');

  const chartData = [...projects]
    .filter((p) => p.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, TOP_N)
    .map((p) => ({ projectKey: p.projectKey, overdue: p.overdue }));

  const chartConfig: ChartConfig = {
    overdue: { label: t('overdue.label'), color: OVERDUE_COLOR },
  };

  if (chartData.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t('overdue.empty')}</p>;
  }

  return (
    <ChartContainer dir="ltr" config={chartConfig} className="h-[220px] w-full">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="projectKey"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="overdue" fill="var(--color-overdue)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}
