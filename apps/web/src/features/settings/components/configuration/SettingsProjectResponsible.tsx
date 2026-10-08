import { useTranslations } from 'next-intl';
import { UserCircle } from 'lucide-react';
import { useShell } from '@/context/shellContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SettingsRow from '@/components/common/page/SettingsRow';
import type { ResponsibleForm } from '../../hooks/useResponsibleForm';

// The project member responsible for the project, shown with name and avatar in every
// project listing. Owner only; a reader without ownership gets the current state, not
// disabled controls. The responsible must be an owner or member (never a client), so the
// member list already excludes clients. 'none' is the empty choice: it stores null.
// Radix Select has no empty value, so it carries this sentinel.
const NONE = 'none';

export default function SettingsProjectResponsible({ form }: { form: ResponsibleForm }) {
  const t = useTranslations('settings.configuration');
  const { project } = useShell();
  const members = (project?.assignees ?? []).filter((a) => a.kind === 'member');
  const responsibleName = members.find((m) => m.userId === form.responsibleUserId)?.name;

  if (!form.editable) {
    return (
      <SettingsRow
        title={t('responsible')}
        description={t('responsibleHint')}
        control={
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserCircle className="size-4" />
            {responsibleName ?? t('responsibleNone')}
          </span>
        }
      />
    );
  }

  return (
    <SettingsRow
      title={t('responsible')}
      description={t('responsibleHint')}
      control={
        <Select
          value={form.responsibleUserId ?? NONE}
          onValueChange={(value) => form.setResponsibleUserId(value === NONE ? null : value)}
        >
          <SelectTrigger size="sm" className="w-56" aria-label={t('responsible')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('responsibleNone')}</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}
