import type { SpellSchool } from "@/lib/game/spells";
import type { CombatBoardUnit, CombatSide } from "@/lib/game/types";

// Persistent combat status effect attached to a CombatBoardUnit.
// Stored inside board_state JSON, so no DB migration is required.
export interface CombatStatusEffect {
  spellId: string;
  label: string;
  school: SpellSchool;
  kind: "buff" | "debuff";
  duration: number; // remaining rounds; decremented at each round boundary
  sourceHeroId?: string | null;
  sourceSide?: CombatSide;
  // Stat deltas (applied additively on top of base/hero stats)
  attack?: number;
  defense?: number;
  speed?: number;
  morale?: number;
  luck?: number;
  // Damage-roll modifiers
  forceMaxDamage?: boolean; // bless
  forceMinDamage?: boolean; // curse
  // Action / retaliation modifiers
  disabled?: boolean; // blind: skips the unit's turn
  noRetaliation?: boolean; // blind: target cannot retaliate
  extraRetaliations?: number; // counterstrike
  cannotShoot?: boolean; // forgetfulness
  fireShieldPct?: number; // fire_shield: reflect a fraction of melee damage
  meleeDamageTakenMult?: number; // shield
  rangedDamageTakenMult?: number; // air_shield
  slayerBonus?: boolean; // slayer
  // Spell interaction
  protectionSchool?: SpellSchool; // protection_from_x reduces that school's spell damage
  spellDamageMult?: number; // multiplier applied to incoming spell damage of protectionSchool
  antiMagic?: boolean; // anti_magic: immune to all spells
  magicMirror?: boolean; // magic_mirror: may reflect enemy spells
  // Control
  controlledBy?: CombatSide; // hypnotize: unit temporarily fights for this side
  berserk?: boolean; // berserk: forced to attack nearest unit
}

function effects(unit: CombatBoardUnit): CombatStatusEffect[] {
  return Array.isArray(unit.statusEffects) ? unit.statusEffects : [];
}

function sum(unit: CombatBoardUnit, key: "attack" | "defense" | "speed" | "morale" | "luck"): number {
  return effects(unit).reduce((total, effect) => total + (Number(effect[key]) || 0), 0);
}

export function getEffectiveSpeed(unit: CombatBoardUnit): number {
  return Math.max(1, Math.round((Number(unit.speed) || 0) + sum(unit, "speed")));
}

export function getEffectiveAttackBonus(unit: CombatBoardUnit): number {
  return sum(unit, "attack");
}

export function getEffectiveDefenseBonus(unit: CombatBoardUnit): number {
  return sum(unit, "defense");
}

export function getEffectiveMorale(unit: CombatBoardUnit): number {
  return Math.max(-3, Math.min(3, (Number(unit.morale) || 0) + sum(unit, "morale")));
}

export function getEffectiveLuck(unit: CombatBoardUnit): number {
  return Math.max(-3, Math.min(3, (Number(unit.luck) || 0) + sum(unit, "luck")));
}

export function getDamageOverride(unit: CombatBoardUnit): "min" | "max" | null {
  let forceMin = false;
  let forceMax = false;
  for (const effect of effects(unit)) {
    if (effect.forceMaxDamage) forceMax = true;
    if (effect.forceMinDamage) forceMin = true;
  }
  if (forceMin && forceMax) return null;
  if (forceMax) return "max";
  if (forceMin) return "min";
  return null;
}

export function isUnitDisabled(unit: CombatBoardUnit): boolean {
  return effects(unit).some((effect) => effect.disabled);
}

export function canRetaliate(unit: CombatBoardUnit): boolean {
  return !effects(unit).some((effect) => effect.noRetaliation);
}

export function getExtraRetaliations(unit: CombatBoardUnit): number {
  return effects(unit).reduce((total, effect) => total + (Number(effect.extraRetaliations) || 0), 0);
}

export function canShoot(unit: CombatBoardUnit): boolean {
  return !effects(unit).some((effect) => effect.cannotShoot);
}

export function getMeleeDamageTakenMultiplier(unit: CombatBoardUnit): number {
  return effects(unit).reduce((mult, effect) => mult * (effect.meleeDamageTakenMult ?? 1), 1);
}

export function getRangedDamageTakenMultiplier(unit: CombatBoardUnit): number {
  return effects(unit).reduce((mult, effect) => mult * (effect.rangedDamageTakenMult ?? 1), 1);
}

export function getFireShieldPct(unit: CombatBoardUnit): number {
  return effects(unit).reduce((pct, effect) => Math.max(pct, effect.fireShieldPct ?? 0), 0);
}

export function hasSlayer(unit: CombatBoardUnit): boolean {
  return effects(unit).some((effect) => effect.slayerBonus);
}

export function isImmuneToAllSpells(unit: CombatBoardUnit): boolean {
  return effects(unit).some((effect) => effect.antiMagic);
}

export function hasMagicMirror(unit: CombatBoardUnit): boolean {
  return effects(unit).some((effect) => effect.magicMirror);
}

// Multiplier applied to incoming spell damage given the spell's school (protection_from_x).
export function getSpellDamageTakenMultiplier(unit: CombatBoardUnit, school: SpellSchool): number {
  return effects(unit).reduce((mult, effect) => {
    if (effect.spellDamageMult === undefined) return mult;
    if (effect.protectionSchool && effect.protectionSchool !== school && effect.protectionSchool !== "all") return mult;
    return mult * effect.spellDamageMult;
  }, 1);
}

export function getControlledSide(unit: CombatBoardUnit): CombatSide | null {
  for (const effect of effects(unit)) {
    if (effect.controlledBy) return effect.controlledBy;
  }
  return null;
}

export function isBerserk(unit: CombatBoardUnit): boolean {
  return effects(unit).some((effect) => effect.berserk);
}

// Returns a NEW unit with the effect added (immutable). Effects of the same spellId are replaced.
export function withEffect(unit: CombatBoardUnit, effect: CombatStatusEffect): CombatBoardUnit {
  const others = effects(unit).filter((existing) => existing.spellId !== effect.spellId);
  return { ...unit, statusEffects: [...others, effect] };
}

// Returns a NEW unit with effects removed by predicate (used by dispel/cure).
export function withoutEffects(
  unit: CombatBoardUnit,
  predicate: (effect: CombatStatusEffect) => boolean
): CombatBoardUnit {
  const remaining = effects(unit).filter((effect) => !predicate(effect));
  if (remaining.length === effects(unit).length) return unit;
  return { ...unit, statusEffects: remaining };
}

// Decrements durations and removes expired effects. Returns a NEW unit. Used at round boundaries.
export function tickEffects(unit: CombatBoardUnit): CombatBoardUnit {
  const current = effects(unit);
  if (current.length === 0) return unit;
  const next = current
    .map((effect) => ({ ...effect, duration: effect.duration - 1 }))
    .filter((effect) => effect.duration > 0);
  return { ...unit, statusEffects: next };
}
