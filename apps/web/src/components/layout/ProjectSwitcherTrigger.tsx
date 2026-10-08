import type { ComponentProps } from 'react';
import { ChevronsUpDown, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Project } from '@/lib/api/endpoints/projects';
import type { BatchTimeGoalItem } from '@/lib/api/endpoints/analytics';
import ItsAPlanMark from '@/components/brand/ItsAPlanMark';
import ProjectLogo from '@/components/common/ProjectLogo';
import RingProgress from '@/components/common/RingProgress';
import { SidebarMenuButton } from '@/components/ui/sidebar';

export default function ProjectSwitcherTrigger({
  current,
  progress,
  ...props
}: ComponentProps<typeof SidebarMenuButton> & {
  current?: Project;
  progress: Map<number, BatchTimeGoalItem>;
}) {
  const t = useTranslations('nav');
  const item = current ? progress.get(current.id) : undefined;

  return (
    <SidebarMenuButton
      {...props}
      size="lg"
      title={current ? `${current.name} (${current.key}) · ${current.teamName}` : t('projects')}
      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
    >
      {current ? (
        item ? (
          <RingProgress value={item.loggedMinutes} max={item.goalMinutes} className="size-9">
            <ProjectLogo
              name={current.name}
              logoUrl={current.logoUrl}
              className="size-7! text-xs"
            />
          </RingProgress>
        ) : (
          <ProjectLogo name={current.name} logoUrl={current.logoUrl} className="size-9! text-xs" />
        )
      ) : (
        <ItsAPlanMark className="size-9! shrink-0 text-sidebar-foreground" />
      )}
      <div className="grid min-w-0 flex-1 gap-1 text-start text-sm leading-tight">
        <span dir="auto" className="truncate font-semibold tracking-tight">
          {current?.name ?? t('noProjects')}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {current && (
            <span dir="ltr" className="shrink-0 font-mono text-[10px] tracking-wider uppercase">
              {current.key}
            </span>
          )}
          <Users className="size-3 shrink-0" />
          <span dir="auto" className="truncate">
            {current?.teamName ?? '—'}
          </span>
        </span>
      </div>
      <ChevronsUpDown className="ms-auto" />
    </SidebarMenuButton>
  );
}
