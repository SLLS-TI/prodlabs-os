// Pure formatting for the daily Slack digests: no @repo/db and no clock, so it
// unit-tests without a database. The DB queries and orchestration are in
// slack-digest.ts.

export interface SlackProject {
  projectId: number;
  teamId: number;
  key: string;
  name: string;
  teamSlug: string | null;
  channel: string;
}

export interface DigestIssue {
  seq: number;
  title: string;
  dueDate: string | null;
  stateType: string;
}

// Cap each digest list so a project with hundreds of overdue issues does not produce a
// message Slack renders poorly. The overflow is reported with a trailing line.
const LIST_CAP = 50;

// Leading emoji for an issue line, by its column state type.
const STATE_EMOJI: Record<string, string> = {
  backlog: '⬜',
  unstarted: '⬜',
  started: '🔄',
  completed: '✅',
  canceled: '❌',
};

export function stateEmoji(stateType: string): string {
  return STATE_EMOJI[stateType] ?? '•';
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
  return `${stateEmoji(issue.stateType)} ${link} ${escapeSlack(issue.title)}${due}`;
}

function capLines(lines: string[]): string[] {
  if (lines.length <= LIST_CAP) return lines;
  return [...lines.slice(0, LIST_CAP), `…and ${lines.length - LIST_CAP} more`];
}

// @channel notifies the whole channel. The digest leads with it only when there is
// something to act on, so an empty morning does not ping everyone.
const CHANNEL_MENTION = '<!channel>';

export function morningText(p: SlackProject, open: DigestIssue[]): string {
  const title = `*Tasks to finish today — ${escapeSlack(p.name)}*`;
  if (open.length === 0) return `${title}\n_Nothing due today._`;
  const header = `${CHANNEL_MENTION} ${title}`;
  return [header, ...capLines(open.map((i) => issueLine(p, i, true)))].join('\n');
}

export function eveningText(
  p: SlackProject,
  completed: DigestIssue[],
  pending: DigestIssue[],
): string {
  const title = `*End of day — ${escapeSlack(p.name)}*`;
  const header = completed.length > 0 || pending.length > 0 ? `${CHANNEL_MENTION} ${title}` : title;
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
