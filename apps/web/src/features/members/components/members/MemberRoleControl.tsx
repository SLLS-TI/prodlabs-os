'use client';

import { useTranslations } from 'next-intl';
import type { MemberRow } from '@/lib/api/endpoints/members';
import type { Role } from '@/lib/api/endpoints/roles';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSetMemberRole } from '@/services/members.service';

// Owner and client are not custom roles, so they sit outside the roles list under
// these values.
const OWNER_VALUE = 'owner';
const CLIENT_VALUE = 'client';

// A member's role, shown in the members list and in the team's project panel. A
// reader who may reassign it gets a select — the team's custom roles, plus Owner when
// they may hand that rank out; anyone else sees the current role name as a read-only
// badge. The last owner cannot be demoted, so their select is disabled. An agent is
// offered the roles without Owner: an owner bypasses the matrix, and the API refuses
// it for an agent.
export default function MemberRoleControl({
  projectKey,
  member,
  roles,
  canManage,
  canGrantOwner,
  isLastOwner,
}: {
  projectKey: string;
  member: Pick<MemberRow, 'userId' | 'role' | 'roleId' | 'roleName' | 'isAgent'>;
  roles: Role[];
  canManage: boolean;
  // An owner bypasses the matrix, so only a project owner or someone who runs the team
  // promotes to it — the member permission alone does not.
  canGrantOwner: boolean;
  isLastOwner: boolean;
}) {
  const t = useTranslations('members');
  const tCommon = useTranslations('common');
  const setMemberRole = useSetMemberRole(projectKey);
  const isOwnerRow = member.role === 'owner';
  const isClientRow = member.role === 'client';

  // A null roleId means the member uses the project's default role.
  const defaultRole = roles.find((r) => r.isDefault) ?? null;
  const currentId = member.roleId ?? defaultRole?.id ?? null;
  const currentName = member.roleName ?? defaultRole?.name ?? tCommon('member');

  if (!canManage) {
    return (
      <Badge
        variant={isOwnerRow ? 'secondary' : 'outline'}
        className="px-1.5 py-0 text-[10px] font-normal"
      >
        {isOwnerRow ? tCommon('owner') : isClientRow ? t('roleClient') : currentName}
      </Badge>
    );
  }

  const value = isOwnerRow ? OWNER_VALUE : isClientRow ? CLIENT_VALUE : currentId?.toString();

  function onValueChange(next: string) {
    if (next === value) return;
    if (next === OWNER_VALUE) setMemberRole.mutate({ userId: member.userId, role: 'owner' });
    else if (next === CLIENT_VALUE) setMemberRole.mutate({ userId: member.userId, role: 'client' });
    else setMemberRole.mutate({ userId: member.userId, role: 'member', roleId: Number(next) });
  }

  return (
    <Select
      value={value}
      disabled={setMemberRole.isPending || roles.length === 0 || (isOwnerRow && isLastOwner)}
      onValueChange={onValueChange}
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-36 text-xs"
        title={isOwnerRow && isLastOwner ? t('lastOwner') : undefined}
      >
        <SelectValue placeholder={t('selectRole')} />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.id} value={String(r.id)}>
            {r.name}
          </SelectItem>
        ))}
        {!member.isAgent && canGrantOwner && (
          <SelectItem value={OWNER_VALUE}>{tCommon('owner')}</SelectItem>
        )}
        {!member.isAgent && <SelectItem value={CLIENT_VALUE}>{t('roleClient')}</SelectItem>}
      </SelectContent>
    </Select>
  );
}
