import { db, project as projectTable, projectTimerSession, projectWorklog, team } from '@repo/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { HttpError, iso, pgErrorCode } from '#shared/lib';
import { projectRef } from '#modules/teams/ref';

// A play/stop timer on a project, not tied to an issue. A running session is a row with
// stopped_at IS NULL; stopping it stamps stopped_at and writes a project_worklog from the
// elapsed time. It coexists with issue timers — a member may run both at once; the API
// only dedupes the same (project, user) pair.

export interface ProjectTimerSessionRow {
  id: number;
  projectId: number;
  userId: string;
  startedAt: string;
}

// A running session enriched with its project, so the header/sidebar can name it and
// stop it without a per-session fetch. projectKey is the full ref ("<teamRef>.<key>").
export interface RunningProjectTimerRow extends ProjectTimerSessionRow {
  projectKey: string;
  projectName: string;
}

export interface ProjectWorklogRow {
  id: number;
  projectId: number;
  userId: string;
  minutes: number;
  spentOn: string;
  note: string | null;
  createdAt: string;
}

const timerColumns = {
  id: projectTimerSession.id,
  projectId: projectTimerSession.projectId,
  userId: projectTimerSession.userId,
  startedAt: projectTimerSession.startedAt,
};

function mapSession(row: {
  id: number;
  projectId: number;
  userId: string;
  startedAt: Date;
}): ProjectTimerSessionRow {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    startedAt: iso(row.startedAt),
  };
}

// The caller's running project sessions across the whole instance, newest first, each
// enriched with its project. Loaded once on page init so the header can show which
// project is ticking for this user and the sidebar can list and stop them.
export async function listRunningProjectTimers(userId: string): Promise<RunningProjectTimerRow[]> {
  const rows = await db
    .select({
      id: projectTimerSession.id,
      projectId: projectTimerSession.projectId,
      userId: projectTimerSession.userId,
      startedAt: projectTimerSession.startedAt,
      projectKey: projectTable.key,
      projectName: projectTable.name,
      teamId: team.id,
      teamSlug: team.slug,
    })
    .from(projectTimerSession)
    .innerJoin(projectTable, eq(projectTable.id, projectTimerSession.projectId))
    .innerJoin(team, eq(team.id, projectTable.teamId))
    .where(and(eq(projectTimerSession.userId, userId), isNull(projectTimerSession.stoppedAt)))
    .orderBy(desc(projectTimerSession.startedAt));
  return rows.map((row) => ({
    ...mapSession(row),
    projectKey: projectRef({ id: row.teamId, slug: row.teamSlug }, row.projectKey),
    projectName: row.projectName,
  }));
}

async function findRunning(
  projectId: number,
  userId: string,
): Promise<ProjectTimerSessionRow | null> {
  const [row] = await db
    .select(timerColumns)
    .from(projectTimerSession)
    .where(
      and(
        eq(projectTimerSession.projectId, projectId),
        eq(projectTimerSession.userId, userId),
        isNull(projectTimerSession.stoppedAt),
      ),
    );
  return row ? mapSession(row) : null;
}

// Starts a project timer. Idempotent per (projectId, userId): an already-running session
// is returned unchanged, so a double start cannot make two. The fast path reads then
// inserts; a concurrent double-start races past that read, so the partial unique index
// (project_timer_session_running_idx) rejects the second insert and the caught 23505
// returns the session the other request wrote.
export async function startProjectTimer(
  projectId: number,
  userId: string,
): Promise<ProjectTimerSessionRow> {
  const existing = await findRunning(projectId, userId);
  if (existing) return existing;

  try {
    const [row] = await db
      .insert(projectTimerSession)
      .values({ projectId, userId })
      .returning(timerColumns);
    return mapSession(row);
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      const running = await findRunning(projectId, userId);
      if (running) return running;
    }
    throw err;
  }
}

// Stops the caller's running session on this project and writes a project_worklog from the
// elapsed time. minutes = ceil((stoppedAt - startedAt) / 60000) — a 0 ms span stops the
// session but writes no worklog, returning worklog: null. Throws 404 when the caller has
// no running session on the project.
export async function stopProjectTimer(
  projectId: number,
  userId: string,
): Promise<{ session: ProjectTimerSessionRow; worklog: ProjectWorklogRow | null }> {
  const stoppedAt = new Date();
  const [row] = await db
    .update(projectTimerSession)
    .set({ stoppedAt })
    .where(
      and(
        eq(projectTimerSession.projectId, projectId),
        eq(projectTimerSession.userId, userId),
        isNull(projectTimerSession.stoppedAt),
      ),
    )
    .returning(timerColumns);
  if (!row) throw new HttpError(404, 'No running timer on this project');

  const session = mapSession(row);
  const minutes = Math.ceil((stoppedAt.getTime() - row.startedAt.getTime()) / 60000);
  if (minutes <= 0) return { session, worklog: null };

  const worklog = await createProjectWorklog(projectId, userId, {
    minutes,
    spentOn: stoppedAt.toISOString().slice(0, 10),
  });
  return { session, worklog };
}

export interface ProjectWorklogInput {
  minutes: number;
  spentOn: string;
  note?: string | null;
}

// Inserts a project worklog entry. Unlike an issue worklog there is no issue to attach a
// feed activity to, so this is a plain insert.
export async function createProjectWorklog(
  projectId: number,
  userId: string,
  input: ProjectWorklogInput,
): Promise<ProjectWorklogRow> {
  const [row] = await db
    .insert(projectWorklog)
    .values({
      projectId,
      userId,
      minutes: input.minutes,
      spentOn: input.spentOn,
      note: input.note ?? null,
    })
    .returning({
      id: projectWorklog.id,
      projectId: projectWorklog.projectId,
      userId: projectWorklog.userId,
      minutes: projectWorklog.minutes,
      spentOn: projectWorklog.spentOn,
      note: projectWorklog.note,
      createdAt: projectWorklog.createdAt,
    });
  return { ...row, createdAt: iso(row.createdAt) };
}
