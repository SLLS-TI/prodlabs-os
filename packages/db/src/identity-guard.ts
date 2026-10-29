import { sql } from 'drizzle-orm';
import { db } from './client';
import {
  SYSTEM_ACTOR_NAMES,
  buildIdentityScrubber,
  type GuardIdentity,
  type IdentityGuardGroup,
  type IdentityScrubber,
} from './masking';

// What the identity scrubber needs for a client's projects. Read by the api (every
// response a client receives) and the worker (outbound messages a client receives).
// Every read is cached in-process for a few seconds; invalidateIdentityGuard drops the
// caches after a write that changes who is a client or who is the face.

const STANDING_TTL_MS = 3_000;
const GROUP_TTL_MS = 5_000;
const SNAPSHOT_TTL_MS = 60_000;
const MAX_ENTRIES = 1_000;

interface Entry<T> {
  expires: number;
  value: Promise<T>;
}

const caches: Map<unknown, Entry<unknown>>[] = [];

function cache<K, T>(): Map<K, Entry<T>> {
  const map = new Map<K, Entry<T>>();
  caches.push(map as Map<unknown, Entry<unknown>>);
  return map;
}

// The cached value, or the one being loaded: concurrent misses share a single load.
// The least recently used entry is evicted past MAX_ENTRIES; a failed load is dropped.
function cached<K, T>(map: Map<K, Entry<T>>, key: K, ttl: number, load: () => Promise<T>) {
  const now = Date.now();
  const hit = map.get(key);
  if (hit && hit.expires > now) {
    map.delete(key);
    map.set(key, hit);
    return hit.value;
  }
  const value = load();
  map.set(key, { expires: now + ttl, value });
  value.catch(() => {
    if (map.get(key)?.value === value) map.delete(key);
  });
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value as K);
  return value;
}

export function invalidateIdentityGuard(): void {
  for (const map of caches) map.clear();
}

// Where a user stands: the projects in which they are a client, and whether they also
// hold an agency role in a team that runs one of those projects (owner/member of one of
// its projects, owner/manager of the team). A client's own team elsewhere is no such role.
export interface ViewerStanding {
  clientProjectIds: number[];
  hasFoothold: boolean;
}

const standings = cache<string, ViewerStanding>();

export function viewerStanding(userId: string): Promise<ViewerStanding> {
  return cached(standings, userId, STANDING_TTL_MS, async () => {
    const [row] = (await db.execute(sql`
      WITH client_project AS (
        SELECT pm.project_id, p.team_id FROM project_member pm
        JOIN project p ON p.id = pm.project_id
        WHERE pm.user_id = ${userId} AND pm.role = 'client'
      )
      SELECT
        coalesce((SELECT array_agg(project_id ORDER BY project_id) FROM client_project), '{}')
          AS "clientProjectIds",
        (EXISTS (SELECT 1 FROM project_member m JOIN project p ON p.id = m.project_id
            WHERE m.user_id = ${userId} AND m.role IN ('owner', 'member')
              AND p.team_id IN (SELECT team_id FROM client_project))
          OR EXISTS (SELECT 1 FROM team_member t
            WHERE t.user_id = ${userId} AND t.role IN ('owner', 'manager')
              AND t.team_id IN (SELECT team_id FROM client_project))) AS "hasFoothold"
    `)) as unknown as ViewerStanding[];
    return {
      clientProjectIds: (row?.clientProjectIds ?? []).map(Number),
      hasFoothold: row?.hasFoothold === true,
    };
  });
}

// The projects in which the user is a client.
export async function clientProjectIds(userId: string): Promise<number[]> {
  return (await viewerStanding(userId)).clientProjectIds;
}

const projectsWithClients = cache<number, boolean>();

export function projectHasClients(projectId: number): Promise<boolean> {
  return cached(projectsWithClients, projectId, GROUP_TTL_MS, async () => {
    const rows = (await db.execute(sql`
      SELECT 1 FROM project_member WHERE project_id = ${projectId} AND role = 'client' LIMIT 1
    `)) as unknown as unknown[];
    return rows.length > 0;
  });
}

interface UserRow extends GuardIdentity {
  displayUsername: string | null;
  agentUsernames: string[] | null;
}

// Every user of the instance. Anyone who is not a current client of a project or its
// face is hidden from that project's clients: an agency member, an admin, a former
// member, a member of another team, a client of another project.
const users = cache<'all', GuardIdentity[]>();

function loadUsers(): Promise<GuardIdentity[]> {
  return cached(users, 'all', GROUP_TTL_MS, async () => {
    const rows = (await db.execute(sql`
      SELECT u.id AS "userId", u.name, u.username, u.display_username AS "displayUsername",
        u.email, u.image,
        (SELECT array_agg(a.username) FROM ai_agent a WHERE a.user_id = u.id) AS "agentUsernames"
      FROM "user" u
    `)) as unknown as UserRow[];
    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      username: r.username,
      email: r.email,
      image: r.image,
      aliases: [r.displayUsername, ...(r.agentUsernames ?? [])],
      isAgent: r.agentUsernames != null,
    }));
  });
}

interface ProjectPart {
  face: GuardIdentity | null;
  clientIds: Set<string>;
  vocabulary: string[];
}

const projectParts = cache<number, ProjectPart>();

// The face (project.face_user_id, else the oldest owner), the current clients, and the
// project key, name and team slug the client navigates by.
function loadProjectPart(projectId: number): Promise<ProjectPart> {
  return cached(projectParts, projectId, GROUP_TTL_MS, async () => {
    const [project, clients] = await Promise.all([
      db.execute(sql`
        SELECT p.key, p.name, t.slug AS "teamSlug",
          u.id AS "userId", u.name AS "faceName", u.username, u.email, u.image
        FROM project p
        JOIN team t ON t.id = p.team_id
        LEFT JOIN "user" u ON u.id = coalesce(
          (SELECT f.id FROM "user" f WHERE f.id = p.face_user_id),
          (SELECT o.user_id FROM project_member o
            WHERE o.project_id = p.id AND o.role = 'owner'
            ORDER BY o.created_at LIMIT 1))
        WHERE p.id = ${projectId}
      `) as unknown as Promise<
        {
          key: string;
          name: string;
          teamSlug: string | null;
          userId: string | null;
          faceName: string | null;
          username: string | null;
          email: string | null;
          image: string | null;
        }[]
      >,
      db.execute(sql`
        SELECT user_id AS "userId" FROM project_member
        WHERE project_id = ${projectId} AND role = 'client'
      `) as unknown as Promise<{ userId: string }[]>,
    ]);
    const row = project[0];
    return {
      face: row?.userId
        ? {
            userId: row.userId,
            name: row.faceName,
            username: row.username,
            email: row.email,
            image: row.image,
          }
        : null,
      clientIds: new Set(clients.map((c) => c.userId)),
      vocabulary: row ? [row.key, row.name, row.teamSlug].filter((v): v is string => !!v) : [],
    };
  });
}

interface Snapshot {
  userId: string | null;
  name: string;
}

const snapshots = cache<number, Snapshot[]>();

// The actor names stored in the project's activity: a deleted user, an imported
// author, a name before a rename. A system writer's name is left out.
function loadSnapshots(projectId: number): Promise<Snapshot[]> {
  return cached(snapshots, projectId, SNAPSHOT_TTL_MS, async () => {
    const rows = (await db.execute(sql`
      SELECT a.actor_user_id AS "userId", a.actor_name AS name
      FROM issue_activity a JOIN issue i ON i.id = a.issue_id
      WHERE i.project_id = ${projectId} AND a.actor_name IS NOT NULL
      UNION
      SELECT a.actor_user_id, a.actor_name
      FROM issue_activity a JOIN initiative n ON n.id = a.initiative_id
      WHERE n.project_id = ${projectId} AND a.actor_name IS NOT NULL
    `)) as unknown as Snapshot[];
    return rows.filter((r) => !SYSTEM_ACTOR_NAMES.has(r.name));
  });
}

const TEAM_FACE: GuardIdentity = {
  userId: null,
  name: 'Team',
  username: 'team',
  email: null,
  image: null,
};

// One group per project: its face, every other user who is not one of its current
// clients, the name snapshots of its activity, and its vocabulary.
export async function loadIdentityGuardGroups(projectIds: number[]): Promise<IdentityGuardGroup[]> {
  const all = await loadUsers();
  return Promise.all(
    projectIds.map(async (projectId) => {
      const [part, names] = await Promise.all([
        loadProjectPart(projectId),
        loadSnapshots(projectId),
      ]);
      const face = part.face ?? TEAM_FACE;
      const keep = all.filter((u) => u.userId && part.clientIds.has(u.userId));
      const keptNames = new Set([face.name, ...keep.map((k) => k.name)]);
      const current = new Map(all.map((u) => [u.userId, u.name]));
      const hidden = all
        .filter((u) => u.userId !== face.userId && !(u.userId && part.clientIds.has(u.userId)))
        .concat(
          names
            .filter(
              (s) =>
                s.userId !== face.userId &&
                !(s.userId && part.clientIds.has(s.userId)) &&
                !keptNames.has(s.name) &&
                current.get(s.userId) !== s.name,
            )
            .map((s) => ({ userId: null, name: s.name, username: null, email: null, image: null })),
        );
      return { face, hidden, keep, vocabulary: part.vocabulary };
    }),
  );
}

const scrubbers = cache<string, IdentityScrubber>();

// The scrubber for a set of projects, shared by every viewer of the same set.
export function identityScrubberForProjects(projectIds: number[]): Promise<IdentityScrubber> {
  const ids = [...new Set(projectIds)].sort((a, b) => a - b);
  return cached(scrubbers, ids.join(','), GROUP_TTL_MS, async () =>
    buildIdentityScrubber(await loadIdentityGuardGroups(ids)),
  );
}
