import { db, issueTimerSession } from '@repo/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { createWorklog, type WorklogRow } from './worklogs';

// A play/stop timer on an issue. A running session is a row with stopped_at IS NULL;
// stopping it stamps stopped_at and writes an issue_worklog from the elapsed time, so
// the sum, the feed and every worklog behaviour come from the existing worklog path.
// A member may run several timers at once (one per issue); the API only dedupes the
// same (issue, user) pair.

export interface TimerSessionRow {
  id: number;
  issueId: number;
  userId: string;
  startedAt: string;
}

function mapSession(row: {
  id: number;
  issueId: number;
  userId: string;
  startedAt: Date;
}): TimerSessionRow {
  return { id: row.id, issueId: row.issueId, userId: row.userId, startedAt: iso(row.startedAt) };
}

// The caller's running sessions across the whole instance, newest first. Loaded once
// on page init so every view can show which issues are ticking for this user.
export async function listRunningTimers(userId: string): Promise<TimerSessionRow[]> {
  const rows = await db
    .select({
      id: issueTimerSession.id,
      issueId: issueTimerSession.issueId,
      userId: issueTimerSession.userId,
      startedAt: issueTimerSession.startedAt,
    })
    .from(issueTimerSession)
    .where(and(eq(issueTimerSession.userId, userId), isNull(issueTimerSession.stoppedAt)))
    .orderBy(desc(issueTimerSession.startedAt));
  return rows.map(mapSession);
}

async function findRunning(issueId: number, userId: string): Promise<TimerSessionRow | null> {
  const [row] = await db
    .select({
      id: issueTimerSession.id,
      issueId: issueTimerSession.issueId,
      userId: issueTimerSession.userId,
      startedAt: issueTimerSession.startedAt,
    })
    .from(issueTimerSession)
    .where(
      and(
        eq(issueTimerSession.issueId, issueId),
        eq(issueTimerSession.userId, userId),
        isNull(issueTimerSession.stoppedAt),
      ),
    );
  return row ? mapSession(row) : null;
}

// Starts a timer. Idempotent per (issueId, userId): an already-running session is
// returned unchanged, so a double start cannot make two.
export async function startTimer(issueId: number, userId: string): Promise<TimerSessionRow> {
  const existing = await findRunning(issueId, userId);
  if (existing) return existing;

  const [row] = await db.insert(issueTimerSession).values({ issueId, userId }).returning({
    id: issueTimerSession.id,
    issueId: issueTimerSession.issueId,
    userId: issueTimerSession.userId,
    startedAt: issueTimerSession.startedAt,
  });
  return mapSession(row);
}

// Stops the caller's running session on this issue and writes a worklog from the
// elapsed time. minutes = max(1, ceil((stoppedAt - startedAt) / 60000)) — a 0 ms span
// (start and stop in the same millisecond) stops the session but writes no worklog,
// returning worklog: null. Throws 404 when the caller has no running session on the
// issue.
export async function stopTimer(
  issueId: number,
  userId: string,
): Promise<{ session: TimerSessionRow; worklog: WorklogRow | null }> {
  const stoppedAt = new Date();
  const [row] = await db
    .update(issueTimerSession)
    .set({ stoppedAt })
    .where(
      and(
        eq(issueTimerSession.issueId, issueId),
        eq(issueTimerSession.userId, userId),
        isNull(issueTimerSession.stoppedAt),
      ),
    )
    .returning({
      id: issueTimerSession.id,
      issueId: issueTimerSession.issueId,
      userId: issueTimerSession.userId,
      startedAt: issueTimerSession.startedAt,
    });
  if (!row) throw new HttpError(404, 'No running timer on this issue');

  const session = mapSession(row);
  const minutes = Math.ceil((stoppedAt.getTime() - row.startedAt.getTime()) / 60000);
  if (minutes <= 0) return { session, worklog: null };

  const worklog = await createWorklog(issueId, userId, {
    minutes,
    spentOn: stoppedAt.toISOString().slice(0, 10),
  });
  return { session, worklog };
}
