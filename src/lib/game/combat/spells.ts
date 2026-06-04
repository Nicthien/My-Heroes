import { getCreature } from "@/lib/game/creature-catalog";
import { calculateSpellDamage, getSpell, type SpellDefinition, type SpellSchool } from "@/lib/game/spells";
import { CombatBoardUnit, CombatSide, CombatTerrainFeature, UnitType } from "@/lib/game/types";
import { canRegenerateHealth, getUnitRule } from "@/lib/game/units";
import { applyDamageToStack } from "./rules";
import { COMBAT_BASE_ROWS, COMBAT_COLS, COMBAT_ROWS, getHexDistance, getHexNeighbors, isInsideCombatCell, isTerrainBlocked } from "./movement";
import {
  hasMagicMirror,
  isImmuneToAllSpells,
  getSpellDamageTakenMultiplier,
  withEffect,
  withoutEffects,
  type CombatStatusEffect,
} from "./effects";
import type { SiegeState } from "./siege";

export interface CombatSpellCaster {
  heroId: string;
  playerId: string;
  side: CombatSide;
  spellPower: number;
  skills?: Partial<Record<string, "basic" | "advanced" | "expert">>;
}

export interface CombatSpellAction {
  type: "CAST_COMBAT_SPELL";
  spellId: string;
  targetUnitId?: string;
  secondaryUnitId?: string;
  q?: number;
  r?: number;
}

export interface CombatSpellExecution {
  ok: true;
  units: CombatBoardUnit[];
  log: string[];
  affectedUnitIds: string[];
  result: "attacker" | "defender" | null;
  terrain?: CombatTerrainFeature[];
  siege?: SiegeState | null;
  requiresQueueRebuild?: boolean;
}

export interface CombatSpellFailure {
  ok: false;
  error: string;
}

export function getCombatSpellRoundKey(round: number) {
  return String(Math.max(1, Math.floor(round || 1)));
}

export function hasHeroCastCombatSpell(
  spellCastsByRound: Record<string, string[]> | undefined,
  round: number,
  heroId: string
) {
  return Boolean(spellCastsByRound?.[getCombatSpellRoundKey(round)]?.includes(heroId));
}

export function markHeroCombatSpellCast(
  spellCastsByRound: Record<string, string[]> | undefined,
  round: number,
  heroId: string
) {
  const key = getCombatSpellRoundKey(round);
  const previous = spellCastsByRound ?? {};
  return {
    ...previous,
    [key]: [...(previous[key] ?? []).filter((id) => id !== heroId), heroId],
  };
}

function skillLevel(skills: CombatSpellCaster["skills"], id: string): number {
  const v = skills?.[id];
  return v === "expert" ? 3 : v === "advanced" ? 2 : v === "basic" ? 1 : 0;
}

function schoolSkillKey(school: SpellSchool): string | undefined {
  return school === "fire" ? "fire_magic"
    : school === "water" ? "water_magic"
    : school === "earth" ? "earth_magic"
    : school === "air" ? "air_magic"
    : undefined;
}

// Mastery index (0 basic .. 2 expert) derived from the matching magic-school skill.
function masteryIndex(caster: CombatSpellCaster, spell: SpellDefinition): number {
  const key = schoolSkillKey(spell.school);
  const lvl = key ? skillLevel(caster.skills, key) : 0;
  return Math.max(0, Math.min(2, lvl - 1));
}

function effectDuration(caster: CombatSpellCaster, spell: SpellDefinition): number {
  // Base duration scales lightly with spell power; school mastery extends it.
  const base = 2 + Math.max(0, Math.round(caster.spellPower));
  const masteryBonus = masteryIndex(caster, spell);
  return Math.max(2, Math.min(30, base + masteryBonus));
}

export function executeCombatSpell(params: {
  units: CombatBoardUnit[];
  caster: CombatSpellCaster;
  action: CombatSpellAction;
  terrain?: CombatTerrainFeature[];
  siege?: SiegeState | null;
  enemySkills?: Partial<Record<string, "basic" | "advanced" | "expert">>;
  random?: () => number;
}): CombatSpellExecution | CombatSpellFailure {
  const spell = getSpell(params.action.spellId);
  if (!spell || spell.context !== "combat" || !spell.implemented) {
    return { ok: false, error: "Sort de combat invalide" };
  }

  if (spell.damage) return executeDamageSpell(spell, params);
  return executeEffectSpell(spell, params);
}

// ---------------------------------------------------------------------------
// Damage spells
// ---------------------------------------------------------------------------

function executeDamageSpell(
  spell: SpellDefinition,
  params: Parameters<typeof executeCombatSpell>[0]
): CombatSpellExecution | CombatSpellFailure {
  const units = params.units.map((unit) => ({ ...unit }));
  const targets = getDamageSpellTargets(spell, params.action, units, params.caster.side);
  if (!targets.ok) return targets;

  const sorceryBonus = skillLevel(params.caster.skills, "sorcery") * 0.05;
  const key = schoolSkillKey(spell.school);
  const schoolBonus = key ? skillLevel(params.caster.skills, key) * 0.1 : 0;
  const spellMultiplier = 1 + sorceryBonus + schoolBonus;
  const baseDamage = Math.floor(
    calculateSpellDamage(spell, params.caster.spellPower, masteryIndex(params.caster, spell)) * spellMultiplier
  );
  const log: string[] = [];
  const affected: string[] = [];

  const rng = params.random ?? Math.random;
  const enemyResistanceLvl = skillLevel(params.enemySkills, "resistance");
  const resistanceChance = enemyResistanceLvl === 1 ? 0.05 : enemyResistanceLvl === 2 ? 0.1 : enemyResistanceLvl === 3 ? 0.2 : 0;

  targets.units.forEach((target, index) => {
    if (target.side !== params.caster.side && isImmuneToAllSpells(target)) {
      log.push(`${getUnitRule(target.unitType).label} est protege par l'anti-magie.`);
      return;
    }
    if (target.side !== params.caster.side && resistanceChance > 0 && rng() < resistanceChance) {
      log.push(`${getUnitRule(target.unitType).label} resiste a ${spell.label} (Resistance).`);
      return;
    }
    const multiplier = spell.id === "chain_lightning" ? Math.pow(0.5, index) : 1;
    const rawDamage = Math.floor(baseDamage * multiplier);
    const resolution = resolveSpellDamage(spell, target, rawDamage);
    if (resolution.damage <= 0) {
      log.push(`${getUnitRule(target.unitType).label} resiste a ${spell.label}.`);
      return;
    }

    // Miroir magique : renvoie le sort vers une troupe du lanceur.
    if (target.side !== params.caster.side && hasMagicMirror(target) && rng() < 0.4) {
      const mirrorPool = units.filter((u) => u.count > 0 && u.side === params.caster.side);
      const reflected = mirrorPool[Math.floor(rng() * mirrorPool.length)];
      if (reflected) {
        const { lost } = applyDamageToStack(reflected, resolution.damage);
        affected.push(reflected.id);
        log.push(`${getUnitRule(target.unitType).label} reflechit ${spell.label} vers ${getUnitRule(reflected.unitType).label} : ${resolution.damage} dégâts, ${lost} perte(s).`);
        return;
      }
    }

    const before = target.count;
    const { lost } = applyDamageToStack(target, resolution.damage);
    affected.push(target.id);
    log.push(`${spell.label} frappe ${getUnitRule(target.unitType).label} : ${resolution.damage} dégâts, ${lost} perte(s).`);
    if (before > 0 && target.count <= 0) {
      log.push(`${getUnitRule(target.unitType).label} est detruit.`);
    }
  });

  const livingUnits = units.filter((unit) => unit.count > 0);
  return {
    ok: true,
    units: livingUnits,
    log,
    affectedUnitIds: affected,
    result: getCombatResult(livingUnits),
  };
}

function getDamageSpellTargets(
  spell: SpellDefinition,
  action: CombatSpellAction,
  units: CombatBoardUnit[],
  casterSide: CombatSide
): { ok: true; units: CombatBoardUnit[] } | CombatSpellFailure {
  const living = units.filter((unit) => unit.count > 0);

  if (spell.id === "armageddon") return { ok: true, units: living };
  if (spell.id === "death_ripple") return { ok: true, units: living.filter((unit) => !isUndead(unit)) };
  if (spell.id === "destroy_undead") return { ok: true, units: living.filter(isUndead) };

  const target = living.find((unit) => unit.id === action.targetUnitId);
  if (!target) return { ok: false, error: "Cible invalide" };
  if (target.side === casterSide) return { ok: false, error: "Cible ennemie requise" };

  if (spell.id === "chain_lightning") {
    const chain: CombatBoardUnit[] = [target];
    while (chain.length < 5) {
      const previous = chain[chain.length - 1];
      const next = living
        .filter((unit) => !chain.some((item) => item.id === unit.id))
        .sort((a, b) => getHexDistance(previous, a) - getHexDistance(previous, b))[0];
      if (!next) break;
      chain.push(next);
    }
    return { ok: true, units: chain };
  }

  if (spell.id === "fireball" || spell.id === "meteor_shower") {
    return { ok: true, units: living.filter((unit) => getHexDistance(unit, target) <= 1) };
  }
  if (spell.id === "inferno") {
    return { ok: true, units: living.filter((unit) => getHexDistance(unit, target) <= 2) };
  }
  if (spell.id === "frost_ring") {
    return { ok: true, units: living.filter((unit) => unit.id !== target.id && getHexDistance(unit, target) === 1) };
  }

  return { ok: true, units: [target] };
}

function resolveSpellDamage(spell: SpellDefinition, target: CombatBoardUnit, damage: number) {
  const creature = getCreature(target.unitType);
  const special = creature.special.toLowerCase();
  if (isImmuneToSpell(spell, special)) return { damage: 0 };

  let multiplier = 1;
  if (isVulnerableToSpell(spell, special)) multiplier *= 2;
  multiplier *= getInnateMitigation(spell, target, special);
  multiplier *= getSpellDamageTakenMultiplier(target, spell.school);
  return { damage: Math.floor(damage * multiplier) };
}

function isImmuneToSpell(spell: SpellDefinition, special: string) {
  if (special.includes("magic immunity")) return true;
  if (special.includes("immune to all spells")) return true;
  if (special.includes("immune to meteor shower") && spell.id === "meteor_shower") return true;
  if (special.includes("immune to ice bolt") && spell.id === "ice_bolt") return true;
  if (special.includes("immune to frost ring") && spell.id === "frost_ring") return true;
  if (special.includes("immune to lightning bolt") && spell.id === "lightning_bolt") return true;
  if (special.includes("immune to chain lightning") && spell.id === "chain_lightning") return true;
  if (special.includes("immune to armageddon") && spell.id === "armageddon") return true;
  if (special.includes("fire immunity") && spell.school === "fire") return true;
  if (special.includes("1-3 lvl spells immunity") && spell.level <= 3) return true;
  if (special.includes("1-4 lvl spells immunity") && spell.level <= 4) return true;
  return false;
}

function isVulnerableToSpell(spell: SpellDefinition, special: string) {
  const label = spell.label.toLowerCase();
  return special.includes(`vulnerable to ${label}`) ||
    (spell.id === "lightning_bolt" && special.includes("vulnerable to lightning bolt")) ||
    (spell.id === "chain_lightning" && special.includes("vulnerable to lightning bolt")) ||
    (spell.id === "fireball" && special.includes("vulnerable to fireball")) ||
    (spell.id === "inferno" && special.includes("vulnerable to fireball")) ||
    (spell.id === "armageddon" && special.includes("vulnerable to fireball")) ||
    (spell.id === "meteor_shower" && special.includes("vulnerable to meteor shower")) ||
    (spell.id === "ice_bolt" && special.includes("vulnerable to ice bolt")) ||
    (spell.id === "frost_ring" && special.includes("vulnerable to ice bolt"));
}

function getInnateMitigation(spell: SpellDefinition, target: CombatBoardUnit, special: string) {
  if (spell.id === "destroy_undead" || spell.id === "death_ripple") return 1;
  if (target.unitType === "golem") return 0.25;
  if (target.unitType === "iron_golem") return 0.25;
  if (target.unitType === "steel_golem") return 0.2;
  if (target.unitType === "gold_golem") return 0.15;
  if (target.unitType === "diamond_golem") return 0.05;
  const match = special.match(/spell damage resistance \(\+?(\d+)%\)|spell damage resistance \+?(\d+)%/i);
  const percent = Number(match?.[1] ?? match?.[2] ?? NaN);
  if (Number.isFinite(percent)) return Math.max(0, 1 - percent / 100);
  if (target.unitType === "dwarf") return 0.8;
  if (target.unitType === "battle_dwarf") return 0.6;
  return 1;
}

function isUndead(unit: CombatBoardUnit) {
  const creature = getCreature(unit.unitType);
  const special = creature.special.toLowerCase();
  return creature.group === "necropolis" || special.includes("undead") || special.includes("unliving");
}

// ---------------------------------------------------------------------------
// Effect / utility spells
// ---------------------------------------------------------------------------

type SpellTargeting = "ally" | "enemy" | "any";

const EFFECT_TARGETING: Record<string, SpellTargeting> = {
  // ally buffs
  haste: "ally", prayer: "ally", bloodlust: "ally", precision: "ally", stone_skin: "ally",
  shield: "ally", air_shield: "ally", bless: "ally", fortune: "ally", mirth: "ally",
  protection_from_air: "ally", protection_from_earth: "ally", protection_from_fire: "ally",
  protection_from_water: "ally", anti_magic: "ally", counterstrike: "ally", fire_shield: "ally",
  slayer: "ally", magic_mirror: "ally", frenzy: "ally",
  // enemy debuffs
  slow: "enemy", weakness: "enemy", disrupting_ray: "enemy", curse: "enemy", misfortune: "enemy",
  sorrow: "enemy", blind: "enemy", forgetfulness: "enemy", berserk: "enemy", hypnotize: "enemy",
};

const SUMMONED_ELEMENTALS: Partial<Record<SpellDefinition["id"], UnitType>> = {
  summon_air_elemental: UnitType.AIR_ELEMENTAL,
  summon_earth_elemental: UnitType.EARTH_ELEMENTAL,
  summon_fire_elemental: UnitType.FIRE_ELEMENTAL,
  summon_water_elemental: UnitType.WATER_ELEMENTAL,
};

function buildSpellEffect(spell: SpellDefinition, caster: CombatSpellCaster): CombatStatusEffect | null {
  const duration = effectDuration(caster, spell);
  const mastery = masteryIndex(caster, spell); // 0..2
  const base: CombatStatusEffect = {
    spellId: spell.id,
    label: spell.label,
    school: spell.school,
    kind: spell.kind === "debuff" ? "debuff" : "buff",
    duration,
    sourceHeroId: caster.heroId,
    sourceSide: caster.side,
  };
  switch (spell.id) {
    case "haste": return { ...base, speed: 3 + mastery };
    case "slow": return { ...base, speed: -(3 + mastery) };
    case "prayer": return { ...base, attack: 2 + mastery, defense: 2 + mastery, speed: 2 + mastery };
    case "bloodlust": return { ...base, attack: 3 + mastery * 3 };
    case "precision": return { ...base, attack: 3 + mastery * 3 };
    case "frenzy": return { ...base, attack: 5 + mastery * 5 };
    case "stone_skin": return { ...base, defense: 3 + mastery * 3 };
    case "weakness": return { ...base, attack: -(3 + mastery * 3) };
    case "disrupting_ray": return { ...base, defense: -(3 + mastery) };
    case "shield": return { ...base, meleeDamageTakenMult: mastery >= 1 ? 0.7 : 0.85 };
    case "air_shield": return { ...base, rangedDamageTakenMult: mastery >= 1 ? 0.5 : 0.75 };
    case "bless": return { ...base, forceMaxDamage: true };
    case "curse": return { ...base, forceMinDamage: true };
    case "fortune": return { ...base, luck: 1 + (mastery >= 2 ? 1 : 0) };
    case "misfortune": return { ...base, luck: -(1 + (mastery >= 2 ? 1 : 0)) };
    case "mirth": return { ...base, morale: 1 + (mastery >= 2 ? 1 : 0) };
    case "sorrow": return { ...base, morale: -(1 + (mastery >= 2 ? 1 : 0)) };
    case "blind": return { ...base, disabled: true, noRetaliation: true };
    case "forgetfulness": return { ...base, cannotShoot: true };
    case "counterstrike": return { ...base, extraRetaliations: mastery >= 2 ? 99 : 1 + mastery };
    case "fire_shield": return { ...base, fireShieldPct: mastery >= 1 ? 0.3 : 0.2 };
    case "slayer": return { ...base, slayerBonus: true };
    case "magic_mirror": return { ...base, magicMirror: true };
    case "anti_magic": return { ...base, antiMagic: true };
    case "berserk": return { ...base, berserk: true };
    case "hypnotize": return { ...base, controlledBy: caster.side };
    case "protection_from_air": return { ...base, protectionSchool: "air", spellDamageMult: mastery >= 1 ? 0.5 : 0.7 };
    case "protection_from_earth": return { ...base, protectionSchool: "earth", spellDamageMult: mastery >= 1 ? 0.5 : 0.7 };
    case "protection_from_fire": return { ...base, protectionSchool: "fire", spellDamageMult: mastery >= 1 ? 0.5 : 0.7 };
    case "protection_from_water": return { ...base, protectionSchool: "water", spellDamageMult: mastery >= 1 ? 0.5 : 0.7 };
    default: return null;
  }
}

function executeEffectSpell(
  spell: SpellDefinition,
  params: Parameters<typeof executeCombatSpell>[0]
): CombatSpellExecution | CombatSpellFailure {
  const { caster, action } = params;
  const units = params.units.map((unit) => ({ ...unit }));
  const living = units.filter((unit) => unit.count > 0);

  // Spells with dedicated handlers
  if (spell.id in SUMMONED_ELEMENTALS) return applySummon(spell, units, action, caster, params.terrain ?? []);
  if (spell.id === "cure") return applyCure(spell, units, action, caster);
  if (spell.id === "dispel") return applyDispel(spell, units, action, caster);
  if (spell.id === "resurrection" || spell.id === "animate_dead") return applyResurrect(spell, units, action, caster);
  if (spell.id === "sacrifice") return applySacrifice(spell, units, action, caster);
  if (spell.id === "clone") return applyClone(spell, units, action, caster);
  if (spell.id === "teleport") return applyTeleport(spell, units, action, params.terrain ?? []);
  if (spell.id === "earthquake") return applyEarthquake(units, params.siege ?? null);
  if (spell.id === "remove_obstacle" || spell.id === "quicksand" || spell.id === "force_field") {
    return applyTerrainSpell(spell, units, action, params.terrain ?? []);
  }

  // Generic effect spells (buffs / debuffs)
  const targeting = EFFECT_TARGETING[spell.id];
  const effect = buildSpellEffect(spell, caster);
  if (!targeting || !effect) return { ok: false, error: "Sort non implemente" };

  const target = living.find((unit) => unit.id === action.targetUnitId);
  if (!target) return { ok: false, error: "Cible invalide" };
  if (targeting === "ally" && target.side !== caster.side) return { ok: false, error: "Cible alliee requise" };
  if (targeting === "enemy" && target.side === caster.side) return { ok: false, error: "Cible ennemie requise" };
  if (targeting === "enemy" && isImmuneToAllSpells(target)) return { ok: false, error: "Cible protegee par l'anti-magie" };

  const nextUnits = units.map((unit) => (unit.id === target.id ? withEffect(unit, effect) : unit));
  // Speed-changing buffs/debuffs must rebuild the turn queue.
  const requiresQueueRebuild = effect.speed !== undefined;
  return {
    ok: true,
    units: nextUnits,
    log: [`${spell.label} affecte ${getUnitRule(target.unitType).label}.`],
    affectedUnitIds: [target.id],
    result: null,
    requiresQueueRebuild,
  };
}

function applySummon(
  spell: SpellDefinition,
  units: CombatBoardUnit[],
  action: CombatSpellAction,
  caster: CombatSpellCaster,
  terrain: CombatTerrainFeature[]
): CombatSpellExecution | CombatSpellFailure {
  const unitType = SUMMONED_ELEMENTALS[spell.id];
  if (!unitType) return { ok: false, error: "Sort non implemente" };

  const anchor = action.targetUnitId
    ? units.find((unit) => unit.id === action.targetUnitId && unit.count > 0)
    : null;
  if (anchor && anchor.side !== caster.side) return { ok: false, error: "Cible alliee requise" };

  const preferred = Number.isInteger(action.q) && Number.isInteger(action.r)
    ? { q: Number(action.q), r: Number(action.r) }
    : anchor;
  const placement = findSummonPlacement(caster.side, units, terrain, preferred);
  if (!placement) return { ok: false, error: "Aucune case libre pour l'invocation" };

  const rule = getUnitRule(unitType);
  const count = getSummonedElementalCount(caster, spell);
  const summoned: CombatBoardUnit = {
    id: `${caster.heroId}-${spell.id}-${Date.now()}`,
    unitType,
    count,
    health: count * rule.health,
    maxHealth: rule.health,
    position: getNextUnitPosition(units),
    side: caster.side,
    ownerPlayerId: caster.playerId,
    heroId: caster.heroId,
    participantId: null,
    joinsRound: 1,
    q: placement.q,
    r: placement.r,
    speed: rule.speed,
    minDamage: rule.minDamage,
    maxDamage: rule.maxDamage,
    ranged: Boolean(rule.ranged),
    shots: rule.shots ?? 0,
    hasRetaliated: false,
    defended: false,
    waited: false,
    summoned: true,
  };

  return {
    ok: true,
    units: [...units, summoned],
    log: [`${spell.label} invoque ${count} ${rule.label}.`],
    affectedUnitIds: [summoned.id],
    result: null,
    requiresQueueRebuild: true,
  };
}

function applyCure(spell: SpellDefinition, units: CombatBoardUnit[], action: CombatSpellAction, caster: CombatSpellCaster): CombatSpellExecution | CombatSpellFailure {
  const target = units.find((u) => u.id === action.targetUnitId && u.count > 0);
  if (!target) return { ok: false, error: "Cible invalide" };
  if (target.side !== caster.side) return { ok: false, error: "Cible alliee requise" };
  if (!canRegenerateHealth(target.unitType)) return { ok: false, error: "Le Roi ne peut pas etre soigne" };
  const heal = Math.floor((calculateSpellDamage(spell, caster.spellPower, masteryIndex(caster, spell)) || 0) + 10 + caster.spellPower * 5);
  const maxHealth = target.count * target.maxHealth;
  const cured = withoutEffects({ ...target, health: Math.min(maxHealth, target.health + heal) }, (e) => e.kind === "debuff");
  const next = units.map((u) => (u.id === target.id ? cured : u));
  return { ok: true, units: next, log: [`${spell.label} soigne ${getUnitRule(target.unitType).label} (+${heal} PV) et dissipe les maledictions.`], affectedUnitIds: [target.id], result: null };
}

function applyDispel(spell: SpellDefinition, units: CombatBoardUnit[], action: CombatSpellAction, caster: CombatSpellCaster): CombatSpellExecution | CombatSpellFailure {
  const target = units.find((u) => u.id === action.targetUnitId && u.count > 0);
  if (!target) return { ok: false, error: "Cible invalide" };
  // Dispel removes beneficial effects on enemies, harmful effects on allies.
  const removeKind = target.side === caster.side ? "debuff" : "buff";
  const cleaned = withoutEffects(target, (e) => e.kind === removeKind);
  const next = units.map((u) => (u.id === target.id ? cleaned : u));
  return { ok: true, units: next, log: [`${spell.label} dissipe les effets de ${getUnitRule(target.unitType).label}.`], affectedUnitIds: [target.id], result: null, requiresQueueRebuild: true };
}

function applyResurrect(spell: SpellDefinition, units: CombatBoardUnit[], action: CombatSpellAction, caster: CombatSpellCaster): CombatSpellExecution | CombatSpellFailure {
  const target = units.find((u) => u.id === action.targetUnitId && u.count > 0);
  if (!target) return { ok: false, error: "Cible invalide" };
  if (target.side !== caster.side) return { ok: false, error: "Cible alliee requise" };
  if (!canRegenerateHealth(target.unitType)) return { ok: false, error: "Le Roi ne peut pas etre ranime" };
  if (spell.id === "animate_dead" && !isUndead(target)) return { ok: false, error: "Animation des morts : cible morte-vivante requise" };
  const healPool = Math.floor((calculateSpellDamage(spell, caster.spellPower, masteryIndex(caster, spell)) || 0) + 40 + caster.spellPower * 10);
  const maxHealth = target.count * target.maxHealth; // current alive max
  const restored = Math.min(healPool, maxHealth - target.health + (target.maxHealth * 0)); // heal current stacks
  // Resurrection can also bring back fallen units up to the original stack size if we track it; here we heal the living stack.
  const nextHealth = Math.min(maxHealth, target.health + restored);
  const nextCount = nextHealth > 0 ? Math.ceil(nextHealth / target.maxHealth) : target.count;
  const next = units.map((u) => (u.id === target.id ? { ...u, health: nextHealth, count: Math.max(u.count, nextCount) } : u));
  return { ok: true, units: next, log: [`${spell.label} ranime ${getUnitRule(target.unitType).label} (+${restored} PV).`], affectedUnitIds: [target.id], result: null };
}

function applySacrifice(spell: SpellDefinition, units: CombatBoardUnit[], action: CombatSpellAction, caster: CombatSpellCaster): CombatSpellExecution | CombatSpellFailure {
  const beneficiary = units.find((u) => u.id === action.targetUnitId && u.count > 0);
  const sacrificed = units.find((u) => u.id === action.secondaryUnitId && u.count > 0);
  if (!beneficiary || !sacrificed) return { ok: false, error: "Sacrifice : deux cibles alliees requises" };
  if (beneficiary.side !== caster.side || sacrificed.side !== caster.side) return { ok: false, error: "Cibles alliees requises" };
  if (beneficiary.id === sacrificed.id) return { ok: false, error: "Cibles distinctes requises" };
  if (!canRegenerateHealth(beneficiary.unitType) || !canRegenerateHealth(sacrificed.unitType)) return { ok: false, error: "Le Roi ne peut pas etre implique dans un sacrifice" };
  const sacrificeValue = sacrificed.count * sacrificed.maxHealth;
  const healPool = sacrificeValue + Math.floor(caster.spellPower * sacrificed.maxHealth);
  const maxHealth = beneficiary.count * beneficiary.maxHealth;
  const nextHealth = Math.min(maxHealth, beneficiary.health + healPool);
  const next = units
    .map((u) => (u.id === beneficiary.id ? { ...u, health: nextHealth } : u))
    .map((u) => (u.id === sacrificed.id ? { ...u, count: 0, health: 0 } : u))
    .filter((u) => u.count > 0);
  return { ok: true, units: next, log: [`${spell.label} : ${getUnitRule(sacrificed.unitType).label} est sacrifie pour soigner ${getUnitRule(beneficiary.unitType).label}.`], affectedUnitIds: [beneficiary.id], result: getCombatResult(next) };
}

function applyClone(spell: SpellDefinition, units: CombatBoardUnit[], action: CombatSpellAction, caster: CombatSpellCaster): CombatSpellExecution | CombatSpellFailure {
  const target = units.find((u) => u.id === action.targetUnitId && u.count > 0);
  if (!target) return { ok: false, error: "Cible invalide" };
  if (target.side !== caster.side) return { ok: false, error: "Cible alliee requise" };
  const cloneCount = Math.max(1, Math.min(target.count, 1 + Math.floor(caster.spellPower / 3)));
  const clone: CombatBoardUnit = {
    ...target,
    id: `${target.id}-clone-${Date.now()}`,
    count: cloneCount,
    health: cloneCount * target.maxHealth,
    summoned: true,
    statusEffects: [{ spellId: "clone", label: spell.label, school: spell.school, kind: "buff", duration: effectDuration(caster, spell), sourceHeroId: caster.heroId, sourceSide: caster.side }],
    hasRetaliated: false,
    defended: false,
    waited: false,
  };
  // Place the clone next to the source if a free neighbouring cell exists; fallback to source cell offset.
  const placed = placeNear(target, units);
  clone.q = placed.q;
  clone.r = placed.r;
  return { ok: true, units: [...units, clone], log: [`${spell.label} cree un double de ${getUnitRule(target.unitType).label}.`], affectedUnitIds: [clone.id], result: null, requiresQueueRebuild: true };
}

function applyTeleport(spell: SpellDefinition, units: CombatBoardUnit[], action: CombatSpellAction, terrain: CombatTerrainFeature[]): CombatSpellExecution | CombatSpellFailure {
  const target = units.find((u) => u.id === action.targetUnitId && u.count > 0);
  if (!target) return { ok: false, error: "Cible invalide" };
  const q = Number(action.q);
  const r = Number(action.r);
  if (!Number.isInteger(q) || !Number.isInteger(r) || !isInsideCombatCell(q, r)) return { ok: false, error: "Destination invalide" };
  if (isTerrainBlocked(q, r, terrain)) return { ok: false, error: "Case bloquee" };
  if (units.some((u) => u.count > 0 && u.q === q && u.r === r)) return { ok: false, error: "Case occupee" };
  const next = units.map((u) => (u.id === target.id ? { ...u, q, r } : u));
  return { ok: true, units: next, log: [`${spell.label} deplace ${getUnitRule(target.unitType).label}.`], affectedUnitIds: [target.id], result: null };
}

function applyEarthquake(units: CombatBoardUnit[], siege: SiegeState | null): CombatSpellExecution | CombatSpellFailure {
  if (!siege) return { ok: false, error: "Tremblement de terre : utilisable uniquement lors d'un siege" };
  const nextSiege: SiegeState = { ...siege };
  const log: string[] = ["Tremblement de terre : les fortifications sont endommagees."];
  // Damage walls/gate health if the siege model exposes them; keep robust to schema differences.
  const s = nextSiege as unknown as Record<string, unknown>;
  if (typeof s.gateHealth === "number") s.gateHealth = Math.max(0, (s.gateHealth as number) - 1);
  if (Array.isArray(s.wallHealth)) s.wallHealth = (s.wallHealth as number[]).map((h) => Math.max(0, h - 1));
  return { ok: true, units, log, affectedUnitIds: [], result: null, siege: nextSiege };
}

function applyTerrainSpell(spell: SpellDefinition, units: CombatBoardUnit[], action: CombatSpellAction, terrain: CombatTerrainFeature[]): CombatSpellExecution | CombatSpellFailure {
  const q = Number(action.q);
  const r = Number(action.r);
  if (!Number.isInteger(q) || !Number.isInteger(r) || !isInsideCombatCell(q, r)) return { ok: false, error: "Case invalide" };

  if (spell.id === "remove_obstacle") {
    const nextTerrain = terrain.filter((feature) => !(feature.q === q && feature.r === r));
    if (nextTerrain.length === terrain.length) return { ok: false, error: "Aucun obstacle a retirer" };
    return { ok: true, units, log: [`${spell.label} retire un obstacle.`], affectedUnitIds: [], result: null, terrain: nextTerrain };
  }

  if (units.some((u) => u.count > 0 && u.q === q && u.r === r)) return { ok: false, error: "Case occupee" };
  if (terrain.some((feature) => feature.q === q && feature.r === r)) return { ok: false, error: "Case deja occupee par un obstacle" };
  const type: CombatTerrainFeature["type"] = spell.id === "quicksand" ? "quicksand" : "force_field";
  const nextTerrain = [...terrain, { type, q, r }];
  return { ok: true, units, log: [`${spell.label} place un obstacle.`], affectedUnitIds: [], result: null, terrain: nextTerrain };
}

function placeNear(source: CombatBoardUnit, units: CombatBoardUnit[]): { q: number; r: number } {
  const candidates = [
    { q: source.q + 1, r: source.r },
    { q: source.q - 1, r: source.r },
    { q: source.q, r: source.r + 1 },
    { q: source.q, r: source.r - 1 },
  ];
  for (const cell of candidates) {
    if (isInsideCombatCell(cell.q, cell.r) && !units.some((u) => u.count > 0 && u.q === cell.q && u.r === cell.r)) {
      return cell;
    }
  }
  return { q: source.q, r: source.r };
}

function getSummonedElementalCount(caster: CombatSpellCaster, spell: SpellDefinition) {
  return Math.max(1, Math.floor(Math.max(1, caster.spellPower) * (2 + masteryIndex(caster, spell))));
}

function getNextUnitPosition(units: CombatBoardUnit[]) {
  return units.reduce((max, unit) => Math.max(max, Number(unit.position ?? 0)), -1) + 1;
}

function findSummonPlacement(
  side: CombatSide,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  preferred?: { q: number; r: number } | null
): { q: number; r: number } | null {
  if (preferred) {
    const candidates = [preferred, ...getSummonNeighborCandidates(preferred, units)];
    for (const cell of candidates) {
      if (isFreeSummonCell(cell.q, cell.r, units, terrain)) return cell;
    }
  }

  const columns = side === "attacker"
    ? Array.from({ length: COMBAT_COLS }, (_, index) => index)
    : Array.from({ length: COMBAT_COLS }, (_, index) => COMBAT_COLS - 1 - index);
  const rows = getSummonRowOrder(getVisibleSummonRows(units, terrain));
  for (const q of columns) {
    for (const r of rows) {
      if (isFreeSummonCell(q, r, units, terrain)) return { q, r };
    }
  }
  return null;
}

function getSummonNeighborCandidates(source: { q: number; r: number }, units: CombatBoardUnit[]) {
  const occupied = new Set(units.filter((unit) => unit.count > 0).map((unit) => `${unit.q},${unit.r}`));
  const seen = new Set<string>();
  const queue: Array<{ q: number; r: number }> = [source];
  const candidates: Array<{ q: number; r: number }> = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of getHexNeighbors(current.q, current.r)) {
      const key = `${next.q},${next.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (getHexDistance(source, next) > 2) continue;
      if (!occupied.has(key)) candidates.push(next);
      queue.push(next);
    }
  }
  return candidates.sort((a, b) => getHexDistance(source, a) - getHexDistance(source, b));
}

function getVisibleSummonRows(units: CombatBoardUnit[], terrain: CombatTerrainFeature[]) {
  const maxRow = [...units, ...terrain].reduce((max, item) => Math.max(max, Number(item.r ?? 0)), COMBAT_BASE_ROWS - 1);
  return Math.max(COMBAT_BASE_ROWS, Math.min(COMBAT_ROWS, maxRow + 1));
}

function getSummonRowOrder(rowCount: number) {
  const center = Math.floor(Math.min(rowCount, COMBAT_BASE_ROWS) / 2);
  const rows: number[] = [];
  for (let offset = 0; rows.length < rowCount && offset < COMBAT_ROWS; offset++) {
    for (const r of [center + offset, center - offset]) {
      if (r >= 0 && r < rowCount && !rows.includes(r)) rows.push(r);
    }
  }
  return rows;
}

function isFreeSummonCell(q: number, r: number, units: CombatBoardUnit[], terrain: CombatTerrainFeature[]) {
  return isInsideCombatCell(q, r) &&
    !isTerrainBlocked(q, r, terrain) &&
    !units.some((unit) => unit.count > 0 && unit.q === q && unit.r === r);
}

function getCombatResult(units: CombatBoardUnit[]): "attacker" | "defender" | null {
  const attackerAlive = units.some((unit) => unit.side === "attacker" && unit.count > 0);
  const defenderAlive = units.some((unit) => unit.side === "defender" && unit.count > 0);
  if (attackerAlive && defenderAlive) return null;
  return attackerAlive ? "attacker" : "defender";
}
