import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

// The project level's emoji on a lightened tint of the emoji's dominant color. The
// color is a stored hex; the background mixes it into the surface so it reads in light
// and dark themes. A null color falls back to the neutral muted background.
export default function ProjectLevelChip({
  emoji,
  color,
  className,
}: {
  emoji: string;
  color: string | null;
  className?: string;
}) {
  const style = color
    ? ({
        '--chip': color,
        backgroundColor: 'color-mix(in oklch, var(--chip) 22%, var(--background))',
      } as CSSProperties)
    : undefined;

  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-md text-xs leading-none',
        color ? null : 'bg-muted',
        className,
      )}
    >
      {emoji}
    </span>
  );
}
