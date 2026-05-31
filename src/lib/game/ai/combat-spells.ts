import {
  executeCombatSpell,
  hasHeroCastCombatSpell,
  type CombatSpellCaster,
} from "@/lib/game/combat/spells";
import {
  calculateSpellDamage,
  getHeroMana,
  getSpell,
  getSpellCost,
  SPELLS,
  type SpellDefinition,
} from "@/lib/game/spells";
import { calculateCombatDamageRange } from "@/lib/game/combat/rules";
import type { CombatBoardUnit, CombatSide, CombatTerrainFeature } from "@/lib/game/types";

export interface AiSpellHero {
  heroId: string;
  side: CombatSide;
  playerId: string;
  spellPower: number;
  knowledge: number;
  mana: number | null;
  knownSpellIds: string[] | null;
  hasSpellBook: boolean;
  skills?: Partial<Record<string, "basic" | "advanced" | "expert">>;
}

export interface AiSpellChoice {
  spell: SpellDefinition;
  caster: CombatSpellCaster;
  action: { type: "CAST_COMBAT_SPELL"; spellId: string; targetUnitId?: string };
  estimatedDamage: number;
  estimatedKills: number;
  score: number;
}

// Buffs the AI casts on its own strongest stack.
const ALLY_BUFFS = new Set([
  "haste", "prayer", "bloodlust", "precision", "frenzy", "stone_skin", "shield", "air_shield",
  "bless", "fortune", "mirth", "counterstrike", "fire_shield", "slayer", "magic_mirror", "anti_magic",
  "protection_from_air", "protection_from_earth", "protection_from_fire", "protection_from_water",
]);

// Debuffs the AI casts on the enemy's strongest stack.
const ENEMY_DEBUFFS = new Set([
  "slow", "weakness", "disrupting_ray", "curse", "misfortune", "sorrow", "blind", "forgetfulness",
  "berserk", "hypnotize",
]);

// Heals/revives the AI casts on its most wounded stack.
const HEAL_SPELLS = new Set(["cure", "resurrection", "animate_dead"]);

// Spells the AI never auto-casts (cell targeting, allied sacrifice, situational siege, etc.).
const AI_SKIP_SPELLS = new Set([
  "teleport", "sacrifice", "clone", "dispel", "remove_obstacle", "quicksand", "force_field", "earthquake",
]);

const ALL_COMBAT_SPELLS = SPELLS.filter((spell) => spell.context === "combat" && spell.implemented);

export function chooseAiCombatSpell(params: {
  hero: AiSpellHero;
  units: CombatBoardUnit[];
  terrain: CombatTerrainFeature[];
  round: number;
  spellCastsByRound: Record<string, string[]> | undefined;
  enemySkills?: Partial<Record<string, "basic" | "advanced" | "expert">>;
}): AiSpellChoice | null {
  const { hero, units, round, spellCastsByRound } = params;
  if (!hero.hasSpellBook) return null;
  if (hasHeroCastCombatSpell(spellCastsByRound, round, hero.heroId)) return null;

  const mana = getHeroMana({ mana: hero.mana, knowledge: hero.knowledge });
  const known = hero.knownSpellIds ?? [];
  // Without an explicit known list, classic heroes are assumed to know low-level spells.
  const candidates = (known.length > 0
    ? ALL_COMBAT_SPELLS.filter((spell) => known.includes(spell.id))
    : ALL_COMBAT_SPELLS.filter((spell) => spell.level <= 2)
  ).filter((spell) => !AI_SKIP_SPELLS.has(spell.id));
  if (candidates.length === 0) return null;

  const caster: CombatSpellCaster = {
    heroId: hero.heroId,
    playerId: hero.playerId,
    side: hero.side,
    spellPower: hero.spellPower,
    skills: hero.skills,
  };

  let best: AiSpellChoice | null = null;
  for (const spell of candidates) {
    if (mana < getSpellCost(spell)) continue;
    const evaluation = spell.damage
      ? evaluateDamageSpell(spell, hero, units)
      : evaluateEffectSpell(spell, hero, units);
    if (!evaluation) continue;
    if (evaluation.score < 40) continue;
    if (!best || evaluation.score > best.score) {
      best = {
        spell,
        caster,
        action: { type: "CAST_COMBAT_SPELL", spellId: spell.id, targetUnitId: evaluation.targetUnitId },
        estimatedDamage: evaluation.estimatedDamage ?? 0,
        estimatedKills: evaluation.estimatedKills ?? 0,
        score: evaluation.score,
      };
    }
  }
  return best;
}

interface SpellEvaluation {
  targetUnitId?: string;
  score: number;
  estimatedDamage?: number;
  estimatedKills?: number;
}

function evaluateDamageSpell(spell: SpellDefinition, hero: AiSpellHero, units: CombatBoardUnit[]): SpellEvaluation | null {
  const targets = pickDamageTargets(spell, units, hero.side);
  if (targets.length === 0) return null;
  const baseDamage = calculateSpellDamage(spell, hero.spellPower, 0);
  let totalDamage = 0;
  let totalKills = 0;
  const primary = targets[0];
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    const multiplier = spell.id === "chain_lightning" ? Math.pow(0.5, index) : 1;
    const damage = Math.floor(baseDamage * multiplier);
    const kills = target.maxHealth > 0 ? Math.min(target.count, Math.floor(damage / target.maxHealth)) : 0;
    totalDamage += damage * (target.ranged ? 1.4 : 1);
    totalKills += kills;
  }
  const cost = getSpellCost(spell);
  const score = totalKills * 200 + totalDamage / Math.max(1, cost);
  return { targetUnitId: primary?.id, score, estimatedDamage: totalDamage, estimatedKills: totalKills };
}

function evaluateEffectSpell(spell: SpellDefinition, hero: AiSpellHero, units: CombatBoardUnit[]): SpellEvaluation | null {
  const living = units.filter((u) => u.count > 0);
  const allies = living.filter((u) => u.side === hero.side);
  const enemies = living.filter((u) => u.side !== hero.side);

  if (HEAL_SPELLS.has(spell.id)) {
    const woundedPool = spell.id === "animate_dead" ? allies.filter(isLikelyUndead) : allies;
    const wounded = woundedPool
      .map((u) => ({ u, deficit: u.count * u.maxHealth - u.health }))
      .filter((entry) => entry.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit)[0];
    if (!wounded) return null;
    const maxHealth = Math.max(1, wounded.u.count * wounded.u.maxHealth);
    return { targetUnitId: wounded.u.id, score: 50 + (wounded.deficit / maxHealth) * 120 };
  }

  if (ALLY_BUFFS.has(spell.id)) {
    const target = [...allies]
      .filter((u) => !hasEffect(u, spell.id))
      .sort((a, b) => stackValue(b) - stackValue(a))[0];
    if (!target) return null;
    // Buff the most valuable stack; small bonus for ranged when buffing offense/precision.
    return { targetUnitId: target.id, score: 55 + stackValue(target) / 40 };
  }

  if (ENEMY_DEBUFFS.has(spell.id)) {
    const target = [...enemies]
      .filter((u) => !hasEffect(u, spell.id))
      .sort((a, b) => stackValue(b) - stackValue(a))[0];
    if (!target) return null;
    // Disabling debuffs (blind/hypnotize/berserk) are worth more than stat shaving.
    const disablingBonus = (spell.id === "blind" || spell.id === "hypnotize" || spell.id === "berserk") ? 60 : 0;
    return { targetUnitId: target.id, score: 60 + disablingBonus + stackValue(target) / 40 };
  }

  return null;
}

function pickDamageTargets(spell: SpellDefinition, units: CombatBoardUnit[], casterSide: CombatSide): CombatBoardUnit[] {
  const living = units.filter((u) => u.count > 0);
  const enemies = living.filter((u) => u.side !== casterSide);
  if (enemies.length === 0) return [];

  if (spell.id === "armageddon") return living;
  if (spell.id === "death_ripple") return enemies;
  if (spell.id === "destroy_undead") return enemies.filter(isLikelyUndead);

  const sorted = [...enemies].sort((a, b) => stackValue(b) - stackValue(a));
  const primary = sorted[0];

  if (spell.id === "fireball" || spell.id === "meteor_shower" || spell.id === "inferno") {
    const radius = spell.id === "inferno" ? 2 : 1;
    let bestCount = 0;
    let bestCenter = primary;
    for (const center of enemies) {
      const count = enemies.filter((u) => Math.max(Math.abs(u.q - center.q), Math.abs(u.r - center.r)) <= radius).length;
      if (count > bestCount) {
        bestCount = count;
        bestCenter = center;
      }
    }
    return enemies.filter((u) => Math.max(Math.abs(u.q - bestCenter.q), Math.abs(u.r - bestCenter.r)) <= radius);
  }

  return [primary];
}

function stackValue(unit: CombatBoardUnit): number {
  return unit.count * (unit.maxHealth || 1) + (unit.ranged ? 200 : 0);
}

function hasEffect(unit: CombatBoardUnit, spellId: string): boolean {
  return Boolean(unit.statusEffects?.some((effect) => effect.spellId === spellId));
}

function isLikelyUndead(unit: CombatBoardUnit): boolean {
  return unit.unitType.toString().includes("skeleton") ||
    unit.unitType.toString().includes("zombie") ||
    unit.unitType.toString().includes("lich") ||
    unit.unitType.toString().includes("vampire") ||
    unit.unitType.toString().includes("wraith") ||
    unit.unitType.toString().includes("ghost") ||
    unit.unitType.toString().includes("bone");
}

export function executeAiSpellCast(params: {
  units: CombatBoardUnit[];
  caster: CombatSpellCaster;
  action: AiSpellChoice["action"];
  terrain?: CombatTerrainFeature[];
  enemySkills?: Partial<Record<string, "basic" | "advanced" | "expert">>;
}) {
  const spell = getSpell(params.action.spellId);
  if (!spell) return { ok: false as const, error: "Sort inconnu" };
  return executeCombatSpell({
    units: params.units,
    caster: params.caster,
    action: params.action,
    terrain: params.terrain,
    enemySkills: params.enemySkills,
  });
}

// Re-export referenced helpers for callers that operate via the AI module
export { calculateCombatDamageRange };
