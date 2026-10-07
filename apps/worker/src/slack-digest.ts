import {
  db,
  notificationDelivery,
  getInstanceSlackConfig,
  isInstanceSlackUsable,
  readNotificationConfig,
} from '@repo/db';
import { sql } from 'drizzle-orm';
import { dueSlots, digestTimezone, type DigestSlot } from './slack-digest-schedule';

// Daily Slack digests. The loop runs every minute; at the 07:00 and 17:00 local
// firing windows it enqueues one notification_delivery 'slack' row per Slack-enabled
// project. 07:00 ('morning') lists open tasks due today or overdue; 17:00 ('evening')
// summarizes what the project completed today against what is still pending. The rows
// drain through the same delivery loop and sendSlack as every other channel, so retry
// and backoff are reused. A per-(project, slot, local date) marker in slack_digest_run
// makes a digest fire exactly once a day regardless of worker restarts or replica
// count. The timezone is a single instance setting (DIGEST_TIMEZONE, default UTC). The
// slot/date logic is in slack-digest-schedule.ts, dependency-free so it unit-tests
// without a database.

// Cap each digest list so a project with hundreds of overdue issues does not produce
// a message Slack renders poorly. The overflow is reported with a trailing line.
const LIST_CAP = 50;

interface SlackProject {
  projectId: number;
  teamId: number;
  key: string;
  name: string;
  teamSlug: string | null;
  channel: string;
}

// Projects with a non-empty Slack channel and enabled=true in project_setting.
async function slackEnabledProjects(): Promise<SlackProject[]> {
  const rows = (await db.execute(sql`
    SELECT p.id AS "projectId", p.team_id AS "teamId", p.key, p.name,
           t.slug AS "teamSlug", ps.value->>'channel' AS channel
    FROM project_setting ps
    JOIN project p ON p.id = ps.project_id
    JOIN team t ON t.id = p.team_id
    WHERE ps.key = 'slack'
      AND ps.value->>'enabled' = 'true'
      AND coalesce(ps.value->>'channel', '') <> ''
  `)) as unknown as SlackProject[];
  return rows;
}

// Whether a team can send Slack right now: its own token, or the instance default.
async function teamCanSendSlack(teamId: number, instanceUsable: boolean): Promise<boolean> {
  const config = await readNotificationConfig(teamId);
  if (config?.slack.botToken && config.slack.botToken.length > 0) return true;
  return instanceUsable;
}

interface DigestIssue {
  seq: number;
  title: string;
  dueDate: string | null;
}

async function openDueIssues(projectId: number, localDate: string): Promise<DigestIssue[]> {
  return (await db.execute(sql`
    SELECT i.sequence_number AS seq, i.title, i.due_date AS "dueDate"
    FROM issue i
    JOIN project_column c ON c.id = i.column_id
    WHERE i.project_id = ${projectId}
      AND i.archived_at IS NULL
      AND c.state_type NOT IN ('completed', 'canceled')
      AND i.due_date IS NOT NULL
      AND i.due_date <= ${localDate}::date
    ORDER BY i.due_date, i.sequence_number
  `)) as unknown as DigestIssue[];
}

async function completedTodayIssues(
  projectId: number,
  localDate: string,
  tz: string,
): Promise<DigestIssue[]> {
  // Local midnight of localDate in tz, as the UTC instant entered_at (timestamptz)
  // is compared against. "<date> AT TIME ZONE <zone>" reads the local wall-clock
  // time in that zone and yields the corresponding instant.
  return (await db.execute(sql`
    SELECT DISTINCT i.sequence_number AS seq, i.title, i.due_date AS "dueDate"
    FROM issue_status s
    JOIN issue i ON i.id = s.issue_id
    WHERE i.project_id = ${projectId}
      AND s.state_type IN ('completed', 'canceled')
      AND s.entered_at >= (${localDate}::date::timestamp AT TIME ZONE ${tz})
    ORDER BY i.sequence_number
  `)) as unknown as DigestIssue[];
}

function escapeSlack(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function issueUrl(p: SlackProject, seq: number): string | undefined {
  const base = process.env.APP_URL;
  if (!base) return undefined;
  const teamRef = p.teamSlug ?? String(p.teamId);
  return `${base}/${teamRef}/issue/${p.key}-${seq}`;
}

function issueLine(p: SlackProject, issue: DigestIssue, withDue: boolean): string {
  const ref = `${p.key}-${issue.seq}`;
  const url = issueUrl(p, issue.seq);
  const link = url ? `<${url}|${escapeSlack(ref)}>` : `*${escapeSlack(ref)}*`;
  const due = withDue && issue.dueDate ? ` (due ${issue.dueDate})` : '';
  return `• ${link} ${escapeSlack(issue.title)}${due}`;
}

// Caps a list to LIST_CAP lines, appending "…and N more" when it overflows.
function capLines(lines: string[]): string[] {
  if (lines.length <= LIST_CAP) return lines;
  return [...lines.slice(0, LIST_CAP), `…and ${lines.length - LIST_CAP} more`];
}

function morningText(p: SlackProject, open: DigestIssue[]): string {
  const header = `*Tasks to finish today — ${escapeSlack(p.name)}*`;
  if (open.length === 0) return `${header}\n_Nothing due today._`;
  return [header, ...capLines(open.map((i) => issueLine(p, i, true)))].join('\n');
}

function eveningText(p: SlackProject, completed: DigestIssue[], pending: DigestIssue[]): string {
  const header = `*End of day — ${escapeSlack(p.name)}*`;
  const completedBlock =
    completed.length === 0
      ? ['*Completed today*', '_Nothing completed today._']
      : ['*Completed today*', ...capLines(completed.map((i) => issueLine(p, i, false)))];
  const pendingBlock =
    pending.length === 0
      ? ['*Still pending*', '_Nothing pending._']
      : ['*Still pending*', ...capLines(pending.map((i) => issueLine(p, i, true)))];
  return [header, ...completedBlock, ...pendingBlock].join('\n');
}

async function digestText(p: SlackProject, slot: DigestSlot, localDate: string): Promise<string> {
  if (slot === 'morning') {
    return morningText(p, await openDueIssues(p.projectId, localDate));
  }
  // Evening: completed today vs. still pending (the morning scope minus what was
  // completed today).
  const [completed, open] = await Promise.all([
    completedTodayIssues(p.projectId, localDate, digestTimezone()),
    openDueIssues(p.projectId, localDate),
  ]);
  const completedSeqs = new Set(completed.map((i) => i.seq));
  const pending = open.filter((i) => !completedSeqs.has(i.seq));
  return eveningText(p, completed, pending);
}

// Claims the (project, slot, runDate) marker. Returns true only for the worker/replica
// whose insert took, which is then the one that enqueues the digest.
async function claimMarker(projectId: number, slot: DigestSlot, runDate: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    INSERT INTO slack_digest_run (project_id, slot, run_date)
    VALUES (${projectId}, ${slot}, ${runDate})
    ON CONFLICT DO NOTHING
    RETURNING project_id
  `)) as unknown as { project_id: number }[];
  return rows.length > 0;
}

export async function runSlackDigests(now: Date = new Date()): Promise<void> {
  const tz = digestTimezone();
  const slots = dueSlots(now, tz);
  if (slots.length === 0) return;

  const projects = await slackEnabledProjects();
  if (projects.length === 0) return;

  const instanceUsable = isInstanceSlackUsable(await getInstanceSlackConfig());

  for (const p of projects) {
    if (!(await teamCanSendSlack(p.teamId, instanceUsable))) continue;
    for (const { slot, runDate } of slots) {
      if (!(await claimMarker(p.projectId, slot, runDate))) continue;
      const text = await digestText(p, slot, runDate);
      await db.insert(notificationDelivery).values({
        projectId: p.projectId,
        channel: 'slack',
        recipient: p.channel,
        payload: { text },
      });
    }
  }
}
