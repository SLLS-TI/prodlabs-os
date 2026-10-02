import { CornerDownRight } from 'lucide-react';
import { type Maps } from '@/utils/project';
import { cn } from '@/lib/utils';
import { IssueTimerButton } from '@/features/issue/components/IssueTimerButton';
import { StateIcon } from '@/features/issue/components/shared/IssueIcons';
import { useSubtasks } from '../../context/useSubtasks';

// The row's subtasks, as sub-rows under it behind a nesting mark: each subtask's
// state, identifier and title. How many are done is on the row itself
// (SubtaskProgress). A subtask has no row of its own, so this is where it shows
// in the table; a click opens it. A subtask inherits the parent's project, so it
// gets the timer button under the same gate: projectKey is set only when the
// parent passes it (time logging on and the viewer may see time).
export function TableRowSubtasks({
  issueId,
  maps,
  onOpenIssue,
  projectKey,
  canEdit,
}: {
  issueId: number;
  maps: Maps;
  onOpenIssue: (id: number) => void;
  projectKey?: string;
  canEdit?: boolean;
}) {
  const subtasks = useSubtasks(issueId);
  if (subtasks.length === 0) return null;

  return (
    <div className="col-span-full mt-1 flex flex-col pl-6">
      {subtasks.map((subtask) => {
        const column = maps.columnById.get(subtask.columnId);
        const done = column?.stateType === 'completed';
        return (
          <div
            key={subtask.id}
            className="-mx-1.5 flex min-w-0 items-center gap-2 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onOpenIssue(subtask.id);
              }}
            >
              {/* Marks the row as nested under the issue row above: it is otherwise
                  only indented, which reads as a link row. */}
              <CornerDownRight className="size-3 shrink-0 text-muted-foreground/60" />
              {column && (
                <StateIcon
                  stateType={column.stateType}
                  color={column.color}
                  className="size-3.5 shrink-0"
                />
              )}
              <span className="shrink-0 tabular-nums">{subtask.identifier}</span>
              <span className={cn('truncate', done && 'text-muted-foreground/60 line-through')}>
                {subtask.title}
              </span>
            </button>
            {projectKey && (
              <IssueTimerButton
                issueId={subtask.id}
                projectKey={projectKey}
                canEdit={canEdit ?? false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
