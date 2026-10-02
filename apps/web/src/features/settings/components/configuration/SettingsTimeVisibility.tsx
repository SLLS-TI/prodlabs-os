import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { listTeamRoleOptions } from '@/lib/api/endpoints/roles';
import { qk } from '@/services/queryKeys';
import { useShell } from '@/context/shellContext';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SettingsRow from '@/components/common/page/SettingsRow';
import type { EstimatesForm } from '../../hooks/useEstimatesForm';

const ALL = 'all';
const RESTRICTED = 'restricted';

// Which team roles may see this project's time tracking. An empty allowlist means every
// role sees it; a non-empty one restricts it to the chosen roles. Owners always see it,
// regardless of the list. Shown only while time logging is on. A reader without
// workflow_config edit gets the current state, not disabled controls.
export default function SettingsTimeVisibility({ form }: { form: EstimatesForm }) {
  const t = useTranslations('settings.configuration');
  const { project } = useShell();
  const teamId = project?.project.teamId;

  const [restricted, setRestricted] = useState(form.timeVisibleRoleIds.length > 0);

  const { data } = useQuery({
    queryKey: qk.teamRoleOptions(teamId ?? 0),
    queryFn: () => listTeamRoleOptions(teamId!),
    enabled: form.editable && teamId != null,
  });
  const roles = data ?? [];

  function onModeChange(value: string) {
    if (value === ALL) {
      setRestricted(false);
      form.setTimeVisibleRoleIds([]);
    } else {
      setRestricted(true);
    }
  }

  function toggle(id: number) {
    const ids = form.timeVisibleRoleIds;
    form.setTimeVisibleRoleIds(ids.includes(id) ? ids.filter((r) => r !== id) : [...ids, id]);
  }

  if (!form.editable) {
    const value = form.timeVisibleRoleIds.length === 0 ? ALL : RESTRICTED;
    return (
      <SettingsRow
        title={t('timeVisibility')}
        description={t('timeVisibilityHint')}
        control={
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-4" />
            {value === ALL ? t('timeVisibilityAll') : t('timeVisibilityRestricted')}
          </span>
        }
      />
    );
  }

  return (
    <SettingsRow
      title={t('timeVisibility')}
      description={t('timeVisibilityHint')}
      control={
        <div className="flex w-56 flex-col gap-2">
          <Select value={restricted ? RESTRICTED : ALL} onValueChange={onModeChange}>
            <SelectTrigger size="sm" aria-label={t('timeVisibility')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('timeVisibilityAll')}</SelectItem>
              <SelectItem value={RESTRICTED}>{t('timeVisibilityRestricted')}</SelectItem>
            </SelectContent>
          </Select>
          {restricted && roles.length > 0 && (
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-md border border-border/60 p-2">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.timeVisibleRoleIds.includes(role.id)}
                    onCheckedChange={() => toggle(role.id)}
                  />
                  <span className="truncate">{role.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
