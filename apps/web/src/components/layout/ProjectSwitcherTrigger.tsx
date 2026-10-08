import type { ComponentProps } from 'react';
import { ChevronsUpDown, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Project } from '@/lib/api/endpoints/projects';
import type { BatchTimeGoalItem } from '@/lib/api/endpoints/analytics';
import ItsAPlanMark from '@/components/brand/ItsAPlanMark';
import Avatar from '@/components/common/Avatar';
import ProjectLogo from '@/components/common/ProjectLogo';
import RingProgress from '@/components/common/RingProgress';
import ProjectLevelChip from '@/components/common/ProjectLevelChip';
import { levelSuffix } from '@/components/common/projectLevelName';
import { usePermissions } from '@/hooks/usePermissions';
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
  const { role } = usePermissions();
  const showLevel = role !== 'client';
  const levelName = showLevel ? (current?.levelName ?? null) : null;

  return (
    <SidebarMenuButton
      {...props}
      size="lg"
      title={
        current
          ? `${levelSuffix(current.name, levelName)} (${current.key}) · ${current.teamName}`
          : t('projects')
      }
      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
    >
      {current ? (
        <div className="flex flex-col items-center gap-1">
          {item ? (
            <RingProgress value={item.loggedMinutes} max={item.goalMinutes} className="size-9">
              <ProjectLogo
                name={current.name}
                logoUrl={current.logoUrl}
                className="size-7! text-xs"
              />
            </RingProgress>
          ) : (
            <ProjectLogo
              name={current.name}
              logoUrl={current.logoUrl}
              className="size-9! text-xs"
            />
          )}
          {showLevel && current.levelEmoji && (
            <ProjectLevelChip emoji={current.levelEmoji} color={current.levelColor} />
          )}
        </div>
      ) : (
        <ItsAPlanMark className="size-9! shrink-0 text-sidebar-foreground" />
      )}
      <div className="grid min-w-0 flex-1 gap-1 text-start text-sm leading-tight">
        <span dir="auto" className="truncate font-semibold tracking-tight">
          {current ? levelSuffix(current.name, levelName) : t('noProjects')}
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
          {current?.responsible && (
            <>
              <Avatar
                name={current.responsible.name}
                image={current.responsible.image}
                className="size-4 shrink-0"
              />
              <span dir="auto" className="truncate">
                {current.responsible.name}
              </span>
            </>
          )}
        </span>
      </div>
      <ChevronsUpDown className="ms-auto" />
    </SidebarMenuButton>
  );
}
