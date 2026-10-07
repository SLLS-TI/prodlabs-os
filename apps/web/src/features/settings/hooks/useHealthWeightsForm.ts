import { useEffect, useState } from 'react';
import type { HealthWeights } from '@/lib/api/endpoints/settings';
import { usePermissions } from '@/hooks/usePermissions';
import { useHealthWeightsQuery, useUpdateHealthWeights } from '../services/settings.service';

export type HealthDimension = keyof HealthWeights;

export const HEALTH_DIMENSIONS: HealthDimension[] = [
  'schedule',
  'budget',
  'velocity',
  'load',
  'freshness',
];

// Defaults a reset returns to. The web app can't import packages, so this mirrors the
// source of truth DEFAULT_HEALTH_WEIGHTS in apps/api/src/modules/god/health.ts — keep in sync.
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  schedule: 30,
  budget: 25,
  velocity: 20,
  load: 15,
  freshness: 10,
};

// The per-project health-score weights form, shared between the page header (the Save
// action) and the body (the weight inputs). Weights have their own read, so this hook
// fetches like useAutoArchiveForm, seeds from the stored values, and reseeds on change.
// Inputs are held as strings; a blank or non-numeric field saves as 0.
export interface HealthWeightsForm {
  editable: boolean;
  loaded: boolean;
  saving: boolean;
  save: () => Promise<void>;
  values: Record<HealthDimension, string>;
  setValue: (dimension: HealthDimension, value: string) => void;
  reset: () => void;
  total: number;
}

const toStrings = (w: HealthWeights): Record<HealthDimension, string> => ({
  schedule: String(w.schedule),
  budget: String(w.budget),
  velocity: String(w.velocity),
  load: String(w.load),
  freshness: String(w.freshness),
});

const toNumber = (value: string) => Math.max(0, Math.round(Number(value) || 0));

export function useHealthWeightsForm(projectKey: string): HealthWeightsForm {
  const { can } = usePermissions();
  const query = useHealthWeightsQuery(projectKey);
  const update = useUpdateHealthWeights(projectKey);

  const [values, setValues] = useState<Record<HealthDimension, string>>(
    toStrings(DEFAULT_HEALTH_WEIGHTS),
  );

  const data = query.data;
  useEffect(() => {
    if (data) setValues(toStrings(data));
  }, [data]);

  function setValue(dimension: HealthDimension, value: string) {
    setValues((prev) => ({ ...prev, [dimension]: value }));
  }

  function reset() {
    setValues(toStrings(DEFAULT_HEALTH_WEIGHTS));
  }

  async function save() {
    await update.mutateAsync({
      schedule: toNumber(values.schedule),
      budget: toNumber(values.budget),
      velocity: toNumber(values.velocity),
      load: toNumber(values.load),
      freshness: toNumber(values.freshness),
    });
  }

  const total = HEALTH_DIMENSIONS.reduce((sum, d) => sum + toNumber(values[d]), 0);

  return {
    editable: can('workflow_config', 'edit'),
    loaded: query.isSuccess,
    saving: update.isPending,
    save,
    values,
    setValue,
    reset,
    total,
  };
}
