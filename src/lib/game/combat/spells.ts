import { getCreature } from "@/lib/game/creature-catalog";
import { calculateSpellDamage, getSpell, type SpellDefinition } from "@/lib/game/spells";
import { CombatBoardUnit, CombatSide } from "@/lib/game/types";
import { getUnitRule } from "@/lib/game/units";
import { applyDamageToStack } from "./rules";
import { getHexDistance } from "./movement";

export interface CombatSpellCaster {
  heroId: string;
  playerId: string;
  side: CombatSide;
  spellPower: number;
}

export interface CombatSpellAction {
  type: "CAST_COMBAT_SPELL";
  spellId: string;
  targetUnitId?: string;
  q?: number;
  r?: number;
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

export function executeCombatSpell(params: {
  units: CombatBoardUnit[];
  caster: CombatSpellCaster;
  action: CombatSpellAction;
}) {
  const spell = getSpell(params.action.spellId);
  if (!spell || spell.context !== "combat" || !spell.implemented || !spell.damage) {
    return { ok: false as const, error: "Sort de combat invalide" };
  }

  const units = params.units.map((unit) => ({ ...unit }));
  const targets = getSpellTargets(spell, params.action, units, params.caster.side);
  if (!targets.ok) return targets;

  const baseDamage = calculateSpellDamage(spell, params.caster.spellPower, 0);
  const log: string[] = [];
  const affected: string[] = [];

  targets.units.forEach((target, index) => {
    const multiplier = spell.id === "chain_lightning" ? Math.pow(0.5, index) : 1;
    const rawDamage = Math.floor(baseDamage * multiplier);
    const resolution = resolveSpellDamage(spell, target, rawDamage);
    if (resolution.damage <= 0) {
      log.push(`${getUnitRule(target.unitType).label} resiste a ${spell.label}.`);
      return;
    }

    const before = target.count;
    const { lost } = applyDamageToStack(target, resolution.damage);
    affected.push(target.id);
    log.push(`${spell.label} frappe ${getUnitRule(target.unitType).label} : ${resolution.damage} degats, ${lost} perte(s).`);
    if (before > 0 && target.count <= 0) {
      log.push(`${getUnitRule(target.unitType).label} est detruit.`);
    }
  });

  const livingUnits = units.filter((unit) => unit.count > 0);
  return {
    ok: true as const,
    units: livingUnits,
    log,
    affectedUnitIds: affected,
    result: getCombatResult(livingUnits),
  };
}

function getSpellTargets(
  spell: SpellDefinition,
  action: CombatSpellAction,
  units: CombatBoardUnit[],
  casterSide: CombatSide
): { ok: true; units: CombatBoardUnit[] } | { ok: false; error: string } {
  const living = units.filter((unit) => unit.count > 0);

  if (spell.id === "armageddon") return { ok: true, units: living };
  if (spell.id === "death_ripple") return { ok: true, units: living.filter((unit) => !isUndead(unit)) };
  if (spell.id === "destroy_undead") return { ok: true, units: living.filter(isUndead) };

  const target = living.find((unit) => unit.id === action.targetUnitId);
  if (!target) return { ok: false, error: "Cible invalide" };
  if (target.side === casterSide && !canTargetAllies()) return { ok: false, error: "Cible ennemie requise" };

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

function canTargetAllies() {
  return false;
}

function resolveSpellDamage(spell: SpellDefinition, target: CombatBoardUnit, damage: number) {
  const creature = getCreature(target.unitType);
  const special = creature.special.toLowerCase();
  if (isImmuneToSpell(spell, special)) return { damage: 0 };

  let multiplier = 1;
  if (isVulnerableToSpell(spell, special)) multiplier *= 2;
  multiplier *= getInnateMitigation(spell, target, special);
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
  const match = special.match(/spell damage resistance \(\+?(\d+)%\)|spell damage resistance \+?(\d+)%|spell damage resistance \(\+?(\d+)%\)/i);
  const percent = Number(match?.[1] ?? match?.[2] ?? match?.[3] ?? NaN);
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

function getCombatResult(units: CombatBoardUnit[]): "attacker" | "defender" | null {
  const attackerAlive = units.some((unit) => unit.side === "attacker" && unit.count > 0);
  const defenderAlive = units.some((unit) => unit.side === "defender" && unit.count > 0);
  if (attackerAlive && defenderAlive) return null;
  return attackerAlive ? "attacker" : "defender";
}
