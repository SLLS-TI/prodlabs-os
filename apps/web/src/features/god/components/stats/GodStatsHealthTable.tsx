'use client';

import { useTranslations } from 'next-intl';
import type { GodStatsProject } from '@/lib/api/endpoints/godStats';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BAND_PILL } from './healthBand';

const sub = (value: number | null) => (value === null ? '—' : String(value));

// One row per project: the health band and score, the five sub-scores (— for a
// dimension with no data), and the raw metrics. This is the complete view; the charts
// above show only the top projects.
export default function GodStatsHealthTable({ projects }: { projects: GodStatsProject[] }) {
  const t = useTranslations('god.stats');

  const rows = [...projects].sort((a, b) => a.healthScore - b.healthScore);

  return (
    <Table className="min-w-[900px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('table.project')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('table.health')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('dimensions.schedule')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('dimensions.budget')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('dimensions.velocity')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('dimensions.load')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('dimensions.freshness')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('table.open')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('table.overdue')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('table.closedLast7d')}
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">
            {t('table.unassigned')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.projectId}>
            <TableCell>
              <span className="font-medium">{p.projectKey}</span>
              <span className="ms-2 text-muted-foreground">{p.name}</span>
            </TableCell>
            <TableCell>
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums',
                  BAND_PILL[p.healthBand],
                )}
              >
                {p.healthScore}
              </span>
            </TableCell>
            <TableCell className="tabular-nums">{sub(p.subScores.schedule)}</TableCell>
            <TableCell className="tabular-nums">{sub(p.subScores.budget)}</TableCell>
            <TableCell className="tabular-nums">{sub(p.subScores.velocity)}</TableCell>
            <TableCell className="tabular-nums">{sub(p.subScores.load)}</TableCell>
            <TableCell className="tabular-nums">{sub(p.subScores.freshness)}</TableCell>
            <TableCell className="tabular-nums">{p.open}</TableCell>
            <TableCell className="tabular-nums">{p.overdue}</TableCell>
            <TableCell className="tabular-nums">{p.closedLast7d}</TableCell>
            <TableCell className="tabular-nums">{p.unassigned}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
