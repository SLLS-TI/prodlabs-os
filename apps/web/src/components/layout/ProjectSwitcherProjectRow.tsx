import { useTranslations } from 'next-intl';
import type { Project } from '@/lib/api/endpoints/projects';
import { cn } from '@/lib/utils';
import { useRelativeTime } from '@/context/relativeTimeContext';
import ProjectLogo from '@/components/common/ProjectLogo';
import ProjectLevelChip from '@/components/common/ProjectLevelChip';
import { levelSuffix } from '@/components/common/projectLevelName';
import { usePermissions } from '@/hooks/usePermissions';
import { AssigneeAvatar } from '@/features/issue/components/shared/IssueBadges';
import { CommandItem } from '@/components/ui/command';
import ProjectSwitcherHideButton from './ProjectSwitcherHideButton';
import ProjectSwitcherStarButton from './ProjectSwitcherStarButton';

export default function ProjectSwitcherProjectRow({
  project,
  currentProjectKey,
  onSelectProject,
}: {
  project: Project;
  currentProjectKey: string | null;
  onSelectProject: (key: string) => void;
}) {
  const t = useTranslations('nav.projectPicker');
  const current = project.ref === currentProjectKey;
  const relativeTime = useRelativeTime();
  const showLevel = usePermissions().role !== 'client';

  return (
    <div className="group/row relative flex items-center gap-0.5 rounded-sm has-[[data-selected=true]]:bg-accent">
      {current && (
        <span aria-hidden className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-foreground" />
      )}
      <CommandItem
        value={`project-${project.id}`}
        onSelect={() => onSelectProject(project.ref)}
        aria-current={current || undefined}
        className="min-w-0 flex-1 gap-2.5 p-2 data-[selected=true]:bg-transparent"
      >
        <div className="relative shrink-0 self-start">
          <ProjectLogo
            name={project.name}
            logoUrl={project.logoUrl}
            className="size-7 text-[11px]"
          />
          {showLevel && project.levelEmoji && (
            <ProjectLevelChip
              emoji={project.levelEmoji}
              color={project.levelColor}
              className="absolute -end-1.5 -top-1.5 size-4 text-[10px]"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm wrap-anywhere whitespace-normal',
              current ? 'font-semibold' : 'font-medium',
            )}
            dir="auto"
          >
            {levelSuffix(project.name, showLevel ? project.levelName : null)}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <span dir="ltr" className="shrink-0 font-mono text-[10px] tracking-wider uppercase">
              {project.key}
            </span>
            {project.lastActivityAt && (
              <>
                <span aria-hidden>·</span>
                <time dateTime={project.lastActivityAt}>
                  {t('activeAgo', { time: relativeTime(project.lastActivityAt) })}
                </time>
              </>
            )}
          </span>
          {project.responsible && (
            <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/70">
              <AssigneeAvatar
                name={project.responsible.name}
                image={project.responsible.image}
                className="size-4"
              />
              <span dir="auto" className="truncate" aria-label={t('responsible')}>
                {project.responsible.name}
              </span>
            </span>
          )}
        </div>
      </CommandItem>
      <ProjectSwitcherHideButton project={project} />
      {!project.isHidden && <ProjectSwitcherStarButton project={project} />}
    </div>
  );
}
