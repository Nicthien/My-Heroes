export const LUCK_MIN = -3;
export const LUCK_MAX = 3;
export const LUCK_CHANCE_PER_POINT = 1 / 24;
export const LUCK_DAMAGE_MULTIPLIER = 2;

export function clampLuck(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(LUCK_MIN, Math.min(LUCK_MAX, Math.trunc(value)));
}

export function rollPositiveLuck(luck: number, random: () => number = Math.random) {
  const value = clampLuck(luck);
  if (value <= 0) return false;
  return random() < value * LUCK_CHANCE_PER_POINT;
}
