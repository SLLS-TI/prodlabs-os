'use client';

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { useTranslations } from 'next-intl';
import type { GodStatsProject } from '@/lib/api/endpoints/godStats';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const SERIES_COLOR = { worked: '#6366f1', estimated: '#94a3b8' };
const TOP_N = 12;

const toHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

// Worked vs estimated hours per project, as grouped bars. Capped at the TOP_N projects
// by worked + estimated magnitude so the axis stays legible; the health table carries
// the full set. Minutes are shown as hours.
export default function GodStatsHoursChart({ projects }: { projects: GodStatsProject[] }) {
  const t = useTranslations('god.stats');

  const chartData = [...projects]
    .filter((p) => p.workedMinutes > 0 || p.estimatedMinutes > 0)
    .sort((a, b) => b.workedMinutes + b.estimatedMinutes - (a.workedMinutes + a.estimatedMinutes))
    .slice(0, TOP_N)
    .map((p) => ({
      projectKey: p.projectKey,
      worked: toHours(p.workedMinutes),
      estimated: toHours(p.estimatedMinutes),
    }));

  const chartConfig: ChartConfig = {
    worked: { label: t('hours.worked'), color: SERIES_COLOR.worked },
    estimated: { label: t('hours.estimated'), color: SERIES_COLOR.estimated },
  };

  if (chartData.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t('hours.empty')}</p>;
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
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="worked" fill="var(--color-worked)" radius={3} />
        <Bar dataKey="estimated" fill="var(--color-estimated)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}
