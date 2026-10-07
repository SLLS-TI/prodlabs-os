import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './client';
import { projectMember, teamMember } from './schema';

// A user whose only standing anywhere is through client-role project memberships: at
// least one such membership, no owner/member project role in any team, and no
// owner/manager rank on any team. This is the account-scoped counterpart of
// isExternalTeamClient (apps/api), used where there is no team context — the
// better-auth API-key endpoints, which resolve to the owner's account. Fails closed:
// returns true only when the user clearly has no non-client foothold anywhere.
export async function isGlobalExternalClient(userId: string): Promise<boolean> {
  const [teamLeads, projectRoles] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(teamMember)
      .where(and(eq(teamMember.userId, userId), inArray(teamMember.role, ['owner', 'manager']))),
    db
      .select({ role: projectMember.role })
      .from(projectMember)
      .where(eq(projectMember.userId, userId)),
  ]);
  if ((teamLeads[0]?.count ?? 0) > 0) return false;
  if (projectRoles.length === 0) return false;
  let hasClient = false;
  for (const r of projectRoles) {
    if (r.role === 'owner' || r.role === 'member') return false;
    if (r.role === 'client') hasClient = true;
  }
  return hasClient;
}
