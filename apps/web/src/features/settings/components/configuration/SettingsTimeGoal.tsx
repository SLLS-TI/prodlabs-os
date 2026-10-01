import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { formatMinutes, parseMinutes } from '@/utils/estimate';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SettingsRow from '@/components/common/page/SettingsRow';
import type { EstimatesForm, TimeGoalPeriod } from '../../hooks/useEstimatesForm';

const OFF = 'off';

// The project's time goal: a period and a duration, or off. 'total' compares the goal
// to all time ever logged, 'weekly' to the current week's. Shown only while time
// logging is on, since a goal is read against logged time. A reader without
// workflow_config edit gets the current value, not disabled controls.
export default function SettingsTimeGoal({ form }: { form: EstimatesForm }) {
  const t = useTranslations('settings.configuration');

  // The duration is held as text so a half-typed value is not lost; it commits to
  // the form on change when it parses. Reseeded when the stored minutes change.
  const [text, setText] = useState(
    form.timeGoalMinutes != null ? formatMinutes(form.timeGoalMinutes) : '',
  );
  useEffect(() => {
    setText(form.timeGoalMinutes != null ? formatMinutes(form.timeGoalMinutes) : '');
  }, [form.timeGoalMinutes]);

  function onPeriodChange(value: string) {
    if (value === OFF) {
      form.setTimeGoalPeriod(null);
      form.setTimeGoalMinutes(null);
      return;
    }
    form.setTimeGoalPeriod(value as TimeGoalPeriod);
  }

  function onTextChange(value: string) {
    setText(value);
    const minutes = parseMinutes(value);
    form.setTimeGoalMinutes(minutes != null && minutes > 0 ? minutes : null);
  }

  if (!form.editable) {
    const value =
      form.timeGoalPeriod != null && form.timeGoalMinutes != null
        ? t('timeGoalValueReadOnly', {
            time: formatMinutes(form.timeGoalMinutes),
            period: t(
              form.timeGoalPeriod === 'weekly' ? 'timeGoalPeriodWeekly' : 'timeGoalPeriodTotal',
            ),
          })
        : t('timeGoalPeriodOff');
    return (
      <SettingsRow
        title={t('timeGoal')}
        description={t('timeGoalHint')}
        control={
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" />
            {value}
          </span>
        }
      />
    );
  }

  return (
    <SettingsRow
      title={t('timeGoal')}
      description={t('timeGoalHint')}
      control={
        <div className="flex items-center gap-2">
          {form.timeGoalPeriod != null && (
            <Input
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="40h"
              aria-label={t('timeGoalValue')}
              className="h-9 w-28"
            />
          )}
          <Select value={form.timeGoalPeriod ?? OFF} onValueChange={onPeriodChange}>
            <SelectTrigger size="sm" className="w-36 shrink-0" aria-label={t('timeGoalPeriod')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OFF}>{t('timeGoalPeriodOff')}</SelectItem>
              <SelectItem value="total">{t('timeGoalPeriodTotal')}</SelectItem>
              <SelectItem value="weekly">{t('timeGoalPeriodWeekly')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}
