import {
  identityScrubberForProjects,
  projectHasClients,
  viewerStanding,
  type IdentityScrubber,
} from '@repo/db';
import { getSessionFromHeaders } from '@repo/auth';

// The last line of the client masking rule: whatever a client receives, every agency
// identity in it (ids, names, nicknames, handles, emails, avatar URLs) reads as the
// project's face. Runs on every planner response, MCP tool calls and error bodies
// included, after the per-route masking.

// The scrubber for what a viewer receives, or null when nothing is rewritten. On a
// request scoped to a project, only a client of that project is scrubbed, with that
// project's group alone. On a request with no project, a viewer whose only standing
// is as a client is scrubbed with every project they are a client of; a viewer who also
// holds a non-client role keeps the per-route masking only.
export async function identityScrubberFor(
  userId: string,
  projectId: number | null = null,
): Promise<IdentityScrubber | null> {
  const standing = await viewerStanding(userId);
  if (!standing.clientProjectIds.length) return null;
  if (projectId != null) {
    if (!standing.clientProjectIds.includes(projectId)) return null;
    return identityScrubberForProjects([projectId]);
  }
  if (standing.hasFoothold) return null;
  return identityScrubberForProjects(standing.clientProjectIds);
}

// The project a request resolved through its access guard: `project` from the
// :projectKey macros, `projectId` from the entity guards.
function requestProjectId(project: unknown, projectId: unknown): number | null {
  const id = (project as { id?: unknown } | null | undefined)?.id ?? projectId;
  return typeof id === 'number' ? id : null;
}

// The scrubber that rewrites a project's agency identities to its face, for content
// served with no viewer: a public share bundle, a file name on a public raw route.
export function projectIdentityScrubber(projectId: number): Promise<IdentityScrubber> {
  return identityScrubberForProjects([projectId]);
}

// The name a public raw route sends in Content-Disposition. A client can fetch the
// route without a session, so the name is scrubbed whenever the project has clients.
export async function publicFilename(projectId: number, filename: string): Promise<string> {
  if (!(await projectHasClients(projectId))) return filename;
  return (await projectIdentityScrubber(projectId)).prose(filename);
}

// The avatar id to serve a viewer asking for one: a client asking for an agency
// member's picture gets the face's, or null (404) when the face has none.
export async function viewerAvatarId(
  id: string,
  viewer: { id: string } | null | undefined,
): Promise<string | null> {
  if (!viewer) return id;
  const scrub = await identityScrubberFor(viewer.id);
  if (!scrub) return id;
  const image = `/avatars/${id}/raw`;
  const shown = scrub({ image }).image;
  if (shown === image) return id;
  return shown?.match(/^\/avatars\/([^/]+)\/raw$/)?.[1] ?? null;
}

function isScrubbable(value: unknown): boolean {
  if (typeof value === 'string') return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function requestViewer(
  request: Request,
  user: { id: string } | null | undefined,
): Promise<{ id: string } | null> {
  if (user !== undefined) return user;
  return (await getSessionFromHeaders(request.headers))?.user ?? null;
}

// The hooks take their context destructured: Elysia reads a hook's parameter list to
// decide what to prepare, and a hook that takes the whole context makes it parse the
// body of every route, /api/auth/* included, before better-auth can read it.
interface GuardContext {
  request: Request;
  user?: { id: string } | null;
  project?: unknown;
  projectId?: unknown;
}

const SEARCH_PARAMS = ['q', 'search'];

// The beforeHandle hook body. A client's search text is scrubbed the way what it reads
// is: a search for an agency name runs as a search for the face's, so the results
// never show whether a hidden name occurs in the project. Declared async for the
// reason given on guardResponseIdentities.
export async function guardSearchQuery({
  request,
  query,
  user,
  project,
  projectId,
}: GuardContext & { query: Record<string, unknown> }): Promise<void> {
  const keys = SEARCH_PARAMS.filter((key) => typeof query?.[key] === 'string');
  if (!keys.length) return;
  const viewer = await requestViewer(request, user);
  if (!viewer) return;
  const scrub = await identityScrubberFor(viewer.id, requestProjectId(project, projectId));
  if (!scrub) return;
  for (const key of keys) query[key] = scrub.prose(query[key] as string);
}

// The mapResponse hook body. A Response, Blob or stream is left alone. The viewer is
// the context user the session plugin resolved; a request that failed before it ran
// (validation, not found) is resolved from its session headers. It is passed to
// mapResponse as a declared async function: Elysia awaits a hook only when it can
// see the async keyword, and an unawaited promise is sent as an empty body. Elysia
// maps a plain value returned here like a handler's, though the hook type names only
// Response.
export async function guardResponseIdentities({
  request,
  responseValue,
  user,
  project,
  projectId,
}: GuardContext & { responseValue?: unknown }): Promise<Response | void> {
  if (!isScrubbable(responseValue)) return undefined;
  const viewer = await requestViewer(request, user);
  if (!viewer) return undefined;
  const scrub = await identityScrubberFor(viewer.id, requestProjectId(project, projectId));
  return scrub ? (scrub(responseValue) as Response) : undefined;
}
