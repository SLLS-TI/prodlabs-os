import { useEffect, useState } from 'react';
import type { Project } from '@/lib/api/endpoints/projects';
import { usePermissions } from '@/hooks/usePermissions';
import { useUpdateEstimates } from '../services/settings.service';

export type TimeGoalPeriod = 'total' | 'weekly';

// The estimate kinds of the project, whether its members log time, and the project's
// time goal, saved by the Configuration page header together with the rest of the
// page. The current state comes with the project payload the Shell already loaded, so
// there is nothing to fetch here. The goal is two fields or neither; a half-set goal
// never leaves this form, since the period picker clears both at once when set to off.
export interface EstimatesForm {
  editable: boolean;
  saving: boolean;
  save: () => Promise<void>;
  points: boolean;
  setPoints: (v: boolean) => void;
  time: boolean;
  setTime: (v: boolean) => void;
  logging: boolean;
  setLogging: (v: boolean) => void;
  timeGoalPeriod: TimeGoalPeriod | null;
  setTimeGoalPeriod: (v: TimeGoalPeriod | null) => void;
  timeGoalMinutes: number | null;
  setTimeGoalMinutes: (v: number | null) => void;
}

export function useEstimatesForm(project: Project): EstimatesForm {
  const { can } = usePermissions();
  const update = useUpdateEstimates(project.ref);

  const [points, setPoints] = useState(project.pointsEstimateEnabled);
  const [time, setTime] = useState(project.timeEstimateEnabled);
  const [logging, setLogging] = useState(project.timeLoggingEnabled);
  const [timeGoalPeriod, setTimeGoalPeriod] = useState(project.timeGoalPeriod);
  const [timeGoalMinutes, setTimeGoalMinutes] = useState(project.timeGoalMinutes);

  useEffect(() => {
    setPoints(project.pointsEstimateEnabled);
    setTime(project.timeEstimateEnabled);
    setLogging(project.timeLoggingEnabled);
    setTimeGoalPeriod(project.timeGoalPeriod);
    setTimeGoalMinutes(project.timeGoalMinutes);
  }, [
    project.pointsEstimateEnabled,
    project.timeEstimateEnabled,
    project.timeLoggingEnabled,
    project.timeGoalPeriod,
    project.timeGoalMinutes,
  ]);

  // A goal needs both a period and a value; a period without a value, or logging
  // turned off, saves no goal. The two fields always leave this form together.
  const goalSet = logging && timeGoalPeriod != null && timeGoalMinutes != null;

  async function save() {
    await update.mutateAsync({
      points,
      time,
      logging,
      timeGoalMinutes: goalSet ? timeGoalMinutes : null,
      timeGoalPeriod: goalSet ? timeGoalPeriod : null,
    });
  }

  return {
    editable: can('workflow_config', 'edit'),
    saving: update.isPending,
    save,
    points,
    setPoints,
    time,
    setTime,
    logging,
    setLogging,
    timeGoalPeriod,
    setTimeGoalPeriod,
    timeGoalMinutes,
    setTimeGoalMinutes,
  };
}
