export interface RmgTuning {
  resourceBudgetPercent: number;
  buildingPercent: number;
  looseResourcePercent: number;
  monsterPercent: number;
  adventurePercent: number;
}

export const DEFAULT_RMG_TUNING: RmgTuning = {
  resourceBudgetPercent: 100,
  buildingPercent: 70,
  looseResourcePercent: 80,
  monsterPercent: 100,
  adventurePercent: 100,
};

const TUNING_LIMITS: Record<keyof RmgTuning, { min: number; max: number }> = {
  resourceBudgetPercent: { min: 25, max: 250 },
  buildingPercent: { min: 0, max: 250 },
  looseResourcePercent: { min: 0, max: 300 },
  monsterPercent: { min: 0, max: 250 },
  adventurePercent: { min: 0, max: 250 },
};

export function normalizeRmgTuning(input?: Partial<RmgTuning> | null): RmgTuning {
  return {
    resourceBudgetPercent: normalizeTuningValue(input?.resourceBudgetPercent, "resourceBudgetPercent"),
    buildingPercent: normalizeTuningValue(input?.buildingPercent, "buildingPercent"),
    looseResourcePercent: normalizeTuningValue(input?.looseResourcePercent, "looseResourcePercent"),
    monsterPercent: normalizeTuningValue(input?.monsterPercent, "monsterPercent"),
    adventurePercent: normalizeTuningValue(input?.adventurePercent, "adventurePercent"),
  };
}

export function tuningPercentToMultiplier(percent: number): number {
  return Math.max(0, percent) / 100;
}

function normalizeTuningValue(value: unknown, key: keyof RmgTuning): number {
  const fallback = DEFAULT_RMG_TUNING[key];
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const rounded = Math.round(numeric);
  const limits = TUNING_LIMITS[key];
  return Math.min(limits.max, Math.max(limits.min, rounded));
}
