'use client';

import { Cell, Label, Pie, PieChart } from 'recharts';
import { useTranslations } from 'next-intl';
import type { GodStatsGlobal } from '@/lib/api/endpoints/godStats';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const DONE_COLOR = '#22c55e';
const REMAINING_COLOR = '#d4d4d8';

// Current-week commitment across all projects as a two-slice donut (done vs remaining),
// with the total committed in the center. The server already computed the counts.
export default function GodStatsWeekCommitmentChart({ global }: { global: GodStatsGlobal }) {
  const t = useTranslations('god.stats.week');
  const { committed, done, remaining } = global.weekCommitment;

  if (committed === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>;
  }

  const chartData = [
    { key: 'done', label: t('done'), value: done, fill: DONE_COLOR },
    { key: 'remaining', label: t('remaining'), value: remaining, fill: REMAINING_COLOR },
  ];

  const chartConfig: ChartConfig = {
    done: { label: t('done'), color: DONE_COLOR },
    remaining: { label: t('remaining'), color: REMAINING_COLOR },
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <ChartContainer dir="ltr" config={chartConfig} className="aspect-square h-[180px]">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
          <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={55} strokeWidth={2}>
            {chartData.map((d) => (
              <Cell key={d.key} fill={d.fill} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox)) return null;
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan
                      x={viewBox.cx}
                      className="fill-foreground text-3xl font-semibold tabular-nums"
                    >
                      {committed}
                    </tspan>
                    <tspan x={viewBox.cx} dy="1.5em" className="fill-muted-foreground text-xs">
                      {t('total')}
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="min-w-0 flex-1 space-y-1 text-sm">
        {chartData.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.fill }} />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="text-muted-foreground tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
