import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// A circular progress ring drawn around its children (a ProjectLogo). The arc length
// is the fraction of value/max, clamped to a full circle; over-goal is shown by the
// destructive color, not by overflowing the ring. Design-system tokens only, so it
// adapts in light and dark mode. Size comes from the className (size-7 on rows, size-9
// on the trigger).
export default function RingProgress({
  value,
  max,
  className,
  children,
}: {
  value: number;
  max: number;
  className?: string;
  children?: ReactNode;
}) {
  const fraction = max > 0 ? Math.min(1, value / max) : 0;
  const over = value > max;
  const percent = Math.round((max > 0 ? value / max : 0) * 100);

  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)}>
      <svg
        viewBox="0 0 36 36"
        className="absolute inset-0 size-full -rotate-90"
        role="img"
        aria-label={`${percent}%`}
      >
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          strokeWidth="2.5"
          className="text-muted-foreground/30"
          stroke="currentColor"
        />
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${fraction * 100} 100`}
          className={over ? 'text-destructive' : 'text-foreground/70'}
          stroke="currentColor"
        />
      </svg>
      <span className="flex items-center justify-center">{children}</span>
    </span>
  );
}
