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
import type { MaskingForm } from '../../hooks/useMaskingForm';

// The member a client-role viewer sees every team-member action attributed to. Owner
// only; a reader without project ownership gets the current state, not disabled
// controls. 'auto' is the empty choice: it stores null and the API falls back to the
// oldest owner. Radix Select has no empty value, so the fallback carries this sentinel.
const AUTO = 'auto';

export default function SettingsClientMasking({ form }: { form: MaskingForm }) {
  const t = useTranslations('settings.configuration');
  const { project } = useShell();
  const members = (project?.assignees ?? []).filter((a) => a.kind === 'member');
  const faceName = members.find((m) => m.userId === form.faceUserId)?.name;

  if (!form.editable) {
    return (
      <SettingsRow
        title={t('clientMasking')}
        description={t('clientMaskingHint')}
        control={
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserCircle className="size-4" />
            {faceName ?? t('clientMaskingAuto')}
          </span>
        }
      />
    );
  }

  return (
    <SettingsRow
      title={t('clientMasking')}
      description={t('clientMaskingHint')}
      control={
        <Select
          value={form.faceUserId ?? AUTO}
          onValueChange={(value) => form.setFaceUserId(value === AUTO ? null : value)}
        >
          <SelectTrigger size="sm" className="w-56" aria-label={t('clientMasking')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>{t('clientMaskingAuto')}</SelectItem>
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
