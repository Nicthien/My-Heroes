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
}

const IMPLEMENTED_COMBAT_SPELLS = SPELLS.filter(
  (spell) => spell.context === "combat" && spell.implemented && spell.damage,
);

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
  // Sans known_spells défini, on suppose que le héros connaît tous les sorts de base (cas hero classique).
  const candidates = (known.length > 0
    ? IMPLEMENTED_COMBAT_SPELLS.filter((spell) => known.includes(spell.id))
    : IMPLEMENTED_COMBAT_SPELLS.filter((spell) => spell.level <= 2));
  if (candidates.length === 0) return null;

  let best: AiSpellChoice | null = null;
  for (const spell of candidates) {
    const cost = getSpellCost(spell);
    if (mana < cost) continue;
    const targets = pickSpellTargets(spell, units, hero.side);
    if (targets.length === 0) continue;
    const baseDamage = calculateSpellDamage(spell, hero.spellPower, 0);
    let totalDamage = 0;
    let totalKills = 0;
    const primaryTarget: CombatBoardUnit | undefined = targets[0];
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      const multiplier = spell.id === "chain_lightning" ? Math.pow(0.5, index) : 1;
      const damage = Math.floor(baseDamage * multiplier);
      const kills = target.maxHealth > 0 ? Math.min(target.count, Math.floor(damage / target.maxHealth)) : 0;
      const valueWeight = target.ranged ? 1.4 : 1;
      totalDamage += damage * valueWeight;
      totalKills += kills;
    }
    // Évaluation : on préfère les kills, puis le ratio damage/mana.
    const score = totalKills * 200 + totalDamage / Math.max(1, cost);
    // Seuil pour éviter les casts inutiles : doit valoir mieux qu'une attaque normale.
    if (score < 50) continue;
    if (!best || score > (best.estimatedKills * 200 + best.estimatedDamage / Math.max(1, getSpellCost(best.spell)))) {
      best = {
        spell,
        caster: {
          heroId: hero.heroId,
          playerId: hero.playerId,
          side: hero.side,
          spellPower: hero.spellPower,
          skills: hero.skills,
        },
        action: {
          type: "CAST_COMBAT_SPELL",
          spellId: spell.id,
          targetUnitId: primaryTarget?.id,
        },
        estimatedDamage: totalDamage,
        estimatedKills: totalKills,
      };
    }
  }
  return best;
}

function pickSpellTargets(spell: SpellDefinition, units: CombatBoardUnit[], casterSide: CombatSide): CombatBoardUnit[] {
  const living = units.filter((u) => u.count > 0);
  const enemies = living.filter((u) => u.side !== casterSide);
  if (enemies.length === 0) return [];

  // Sorts AoE globaux : on inclut un proxy pour estimer l'impact total.
  if (spell.id === "armageddon") return living;
  if (spell.id === "death_ripple") return enemies;
  if (spell.id === "destroy_undead") return [];

  // Single-target ou AoE centré : cible l'ennemi le plus dangereux (tireur prioritaire).
  const sorted = [...enemies].sort((a, b) => priorityValue(b) - priorityValue(a));
  const primary = sorted[0];

  if (spell.id === "fireball" || spell.id === "meteor_shower" || spell.id === "inferno") {
    // Cible la zone autour du primary qui touche le plus d'ennemis.
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

  if (spell.id === "chain_lightning") {
    return [primary];
  }

  return [primary];
}

function priorityValue(unit: CombatBoardUnit): number {
  return unit.count * (unit.maxHealth || 1) + (unit.ranged ? 200 : 0);
}

export function executeAiSpellCast(params: {
  units: CombatBoardUnit[];
  caster: CombatSpellCaster;
  action: AiSpellChoice["action"];
  enemySkills?: Partial<Record<string, "basic" | "advanced" | "expert">>;
}) {
  const spell = getSpell(params.action.spellId);
  if (!spell) return { ok: false as const, error: "Sort inconnu" };
  const execution = executeCombatSpell({
    units: params.units,
    caster: params.caster,
    action: params.action,
    enemySkills: params.enemySkills,
  });
  return execution;
}

// Re-export referenced helpers for callers that operate via the AI module
export { calculateCombatDamageRange };
