import { db, issue, issueActivity, project, maskActor, type ActivityPayload } from '@repo/db';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { iso } from '#shared/lib';
import { isMaskableActor, type MaskContext } from '#shared/access';
import { maskMentionsInBody } from '#shared/mentions';
import {
  maskPayloadProse,
  maskUserSides,
  textSide,
  userName,
  userSide,
  type ActivityInput,
} from '#modules/issues/activity';

// An initiative's activity feed merges two kinds of rows from issue_activity:
// events of the initiative itself (initiative_id set) and the activity of the
// issues linked to it (issue_id set, resolved through issue.initiative_id). Both
// live in one table, so the feed is one keyset-paginated query over a single id
// space. Initiative-level events are written by recordActivity/logInitiativeUpdate.

export type FeedKind = 'comment' | 'activity';

export interface InitiativeFeedItemRow {
  id: number;
  // 'initiative' for an event of the initiative itself, 'issue' for the activity
  // of a linked issue. Derived from which owner column is set.
  source: 'initiative' | 'issue';
  kind: FeedKind;
  actorUserId: string | null;
  actorName: string | null;
  body: string | null;
  action: string | null;
  payload: ActivityPayload;
  createdAt: string;
  // Set only for 'issue' rows, so the UI can link the entry to its issue.
  issueId: number | null;
  issueIdentifier: string | null;
}

// Opaque page cursor: the (created_at, id) of the last returned item. id breaks
// ties when two entries share a created_at (bulk activity from one edit).
export interface FeedCursor {
  ts: string;
  id: number;
}

export interface FeedPage {
  items: InitiativeFeedItemRow[];
  nextCursor: FeedCursor | null;
}

// One page of an initiative's feed, newest first. limit is clamped to 1..100. A mask
// context (present for a client viewer) rewrites team-member attribution to the face,
// the same as the issue feed.
export async function listFeed(
  initiativeId: number,
  opts: { before?: FeedCursor | null; limit?: number } = {},
  mask: MaskContext | null = null,
): Promise<FeedPage> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const before = opts.before ?? null;
  const linkedIssueIds = db
    .select({ id: issue.id })
    .from(issue)
    .where(eq(issue.initiativeId, initiativeId));
  const rows = await db
    .select({
      id: issueActivity.id,
      issueId: issueActivity.issueId,
      initiativeId: issueActivity.initiativeId,
      kind: issueActivity.kind,
      actorUserId: issueActivity.actorUserId,
      actorName: issueActivity.actorName,
      body: issueActivity.body,
      action: issueActivity.action,
      payload: issueActivity.payload,
      createdAt: issueActivity.createdAt,
      cursorTs: sql<string>`${issueActivity.createdAt}::text`,
      seq: issue.sequenceNumber,
      projectKey: project.key,
    })
    .from(issueActivity)
    .leftJoin(issue, eq(issue.id, issueActivity.issueId))
    .leftJoin(project, eq(project.id, issue.projectId))
    .where(
      and(
        or(
          eq(issueActivity.initiativeId, initiativeId),
          inArray(issueActivity.issueId, linkedIssueIds),
        ),
        before
          ? sql`(${issueActivity.createdAt}, ${issueActivity.id}) < (${before.ts}::timestamptz, ${before.id}::integer)`
          : undefined,
      ),
    )
    .orderBy(desc(issueActivity.createdAt), desc(issueActivity.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((row) =>
      maskInitiativeFeedItem(
        {
          id: row.id,
          source: row.initiativeId != null ? ('initiative' as const) : ('issue' as const),
          kind: row.kind as FeedKind,
          actorUserId: row.actorUserId,
          actorName: row.actorName,
          body: row.body,
          action: row.action,
          payload: row.payload,
          createdAt: iso(row.createdAt),
          issueId: row.issueId,
          issueIdentifier:
            row.seq != null && row.projectKey ? `${row.projectKey}-${row.seq}` : null,
        },
        mask,
      ),
    ),
    nextCursor: hasMore && last ? { ts: last.cursorTs, id: last.id } : null,
  };
}

// Masks an initiative feed row to the face for a client viewer: the actor, the body's
// mentions of team members, the owner/assignee/delegate user-named payload sides, and
// the mentions inside a title or description change's prose. The issue feed shares the
// same rule (issues/activity maskFeedItem); this mirrors it for the initiative-shaped
// row.
function maskInitiativeFeedItem(
  item: InitiativeFeedItemRow,
  mask: MaskContext | null,
): InitiativeFeedItemRow {
  if (!mask) return item;
  const masked = maskActor(item, mask.face, isMaskableActor(mask, item.actorUserId));
  const body =
    masked.body != null
      ? maskMentionsInBody(masked.body, mask.clientMemberHandles, mask.face?.username ?? null)
      : masked.body;
  let payload = masked.payload;
  if (masked.action === 'owner' || masked.action === 'assignee' || masked.action === 'delegate')
    payload = maskUserSides(payload, mask);
  else if (masked.action === 'title' || masked.action === 'description')
    payload = maskPayloadProse(payload, mask);
  return body === masked.body && payload === masked.payload ? masked : { ...masked, body, payload };
}

// --- Activity log ----------------------------------------------------------------
// recordActivity writes initiative-level change-log entries (kind 'activity',
// initiative_id set). The initiative mutation functions call it.

export async function recordActivity(
  initiativeId: number,
  events: ActivityInput[],
  actorUserId?: string | null,
): Promise<void> {
  if (!events.length) return;
  const resolvedActorId = actorUserId ?? null;
  const actorName = await userName(resolvedActorId);
  await db.insert(issueActivity).values(
    events.map(({ action, ...payload }) => ({
      issueId: null,
      initiativeId,
      kind: 'activity' as const,
      actorUserId: resolvedActorId,
      actorName,
      action,
      payload,
    })),
  );
}

// The subset of an initiative's fields the change log diffs.
export interface InitiativeSnapshot {
  id: number;
  title: string;
  description: string;
  status: string;
  ownerUserId: string | null;
  priority: string | null;
  startDate: string | null;
  targetDate: string | null;
}

// Diffs an initiative's before/after state and records one event per changed
// field. Owner resolves to a name snapshot (kept correct after a rename/delete);
// the rest store their raw value (the UI formats status/priority/dates).
export async function logInitiativeUpdate(
  before: InitiativeSnapshot,
  after: InitiativeSnapshot,
  actorUserId?: string | null,
): Promise<void> {
  const events: ActivityInput[] = [];
  if (before.title !== after.title)
    events.push({ action: 'title', from: textSide(before.title), to: textSide(after.title) });
  if (before.description !== after.description)
    events.push({ action: 'description', to: textSide(after.description) });
  if (before.status !== after.status)
    events.push({ action: 'status', from: textSide(before.status), to: textSide(after.status) });
  if (before.ownerUserId !== after.ownerUserId)
    events.push({
      action: 'owner',
      from: await userSide(before.ownerUserId),
      to: await userSide(after.ownerUserId),
    });
  if ((before.priority ?? '') !== (after.priority ?? ''))
    events.push({
      action: 'priority',
      from: textSide(before.priority),
      to: textSide(after.priority),
    });
  if (before.startDate !== after.startDate)
    events.push({
      action: 'start_date',
      from: textSide(before.startDate),
      to: textSide(after.startDate),
    });
  if (before.targetDate !== after.targetDate)
    events.push({
      action: 'target_date',
      from: textSide(before.targetDate),
      to: textSide(after.targetDate),
    });
  await recordActivity(after.id, events, actorUserId);
}
