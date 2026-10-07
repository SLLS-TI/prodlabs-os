import type { HealthBand } from '@/lib/api/endpoints/godStats';

// Band thresholds mirror the API helper (>=80 green, >=60 yellow, else red). Used for the
// global score, which the API returns without its own band.
export function bandFor(score: number): HealthBand {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}

// Token-based classes for a health band: BAND_TEXT colors the summary score, BAND_PILL
// the table's score pill.
export const BAND_TEXT: Record<HealthBand, string> = {
  green: 'text-green-600 dark:text-green-500',
  yellow: 'text-amber-600 dark:text-amber-500',
  red: 'text-red-600 dark:text-red-500',
};

export const BAND_PILL: Record<HealthBand, string> = {
  green: 'bg-green-500/10 text-green-700 dark:text-green-400',
  yellow: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-700 dark:text-red-400',
};
