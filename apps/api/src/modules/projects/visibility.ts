import { db, project, projectMember, user, type FaceIdentity } from '@repo/db';
import { and, asc, eq } from 'drizzle-orm';
import type { MemberRole } from '#modules/members/service';

// Whether this viewer may see the project's time tracking. An owner always may; a
// client never does — time per contributor is the attribution the masking hides.
// Otherwise the per-project allowlist decides: an empty list means every role sees
// it, a non-empty list grants only the roles it names. effectiveRoleId is the
// viewer's assigned role, or the team's default role when they have none.
export function canSeeTimeTracking(
  role: MemberRole,
  effectiveRoleId: number | null,
  timeVisibleRoleIds: number[],
): boolean {
  if (role === 'owner') return true;
  if (role === 'client') return false;
  if (timeVisibleRoleIds.length === 0) return true;
  return effectiveRoleId != null && timeVisibleRoleIds.includes(effectiveRoleId);
}

// Whether this viewer may see the project's level (emoji + name + color). Everyone but
// a client; a client never sees any trace of the level, on any surface.
export function canSeeLevel(role: MemberRole): boolean {
  return role !== 'client';
}

// The identity a client sees for every maskable actor: the project's configured face
// user, else the oldest owner (createdAt asc). null only when the project has no owner
// at all, which cannot happen in practice. Resolved once per client read request.
export async function resolveFaceIdentity(projectId: number): Promise<FaceIdentity | null> {
  const [row] = await db
    .select({ faceUserId: project.faceUserId })
    .from(project)
    .where(eq(project.id, projectId));
  if (!row) return null;
  if (row.faceUserId) {
    const face = await selectIdentity(row.faceUserId);
    if (face) return face;
  }
  const [oldestOwner] = await db
    .select({ userId: projectMember.userId })
    .from(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.role, 'owner')))
    .orderBy(asc(projectMember.createdAt))
    .limit(1);
  return oldestOwner ? selectIdentity(oldestOwner.userId) : null;
}

async function selectIdentity(userId: string): Promise<FaceIdentity | null> {
  const [row] = await db
    .select({ userId: user.id, name: user.name, image: user.image, username: user.username })
    .from(user)
    .where(eq(user.id, userId));
  return row ?? null;
}
