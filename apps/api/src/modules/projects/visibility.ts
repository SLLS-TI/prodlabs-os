import type { MemberRole } from '#modules/members/service';

// Whether this viewer may see the project's time tracking. An owner always may;
// otherwise the per-project allowlist decides: an empty list means every role sees
// it, a non-empty list grants only the roles it names. effectiveRoleId is the
// viewer's assigned role, or the team's default role when they have none.
export function canSeeTimeTracking(
  role: MemberRole,
  effectiveRoleId: number | null,
  timeVisibleRoleIds: number[],
): boolean {
  if (role === 'owner') return true;
  if (timeVisibleRoleIds.length === 0) return true;
  return effectiveRoleId != null && timeVisibleRoleIds.includes(effectiveRoleId);
}
