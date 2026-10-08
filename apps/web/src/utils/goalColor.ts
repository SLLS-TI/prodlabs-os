// Progress-based color for a time goal: red below half the goal, amber from half to
// three quarters, green at or above three quarters.
type GoalLevel = 'low' | 'mid' | 'high';

export function goalLevel(fraction: number): GoalLevel {
  if (fraction >= 0.75) return 'high';
  if (fraction >= 0.5) return 'mid';
  return 'low';
}

export const goalFillClass: Record<GoalLevel, string> = {
  low: 'bg-red-500',
  mid: 'bg-amber-500',
  high: 'bg-emerald-500',
};

export const goalTextClass: Record<GoalLevel, string> = {
  low: 'text-red-500',
  mid: 'text-amber-500',
  high: 'text-emerald-500',
};
