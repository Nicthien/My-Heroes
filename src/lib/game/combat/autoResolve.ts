import { UnitStack } from "../types";
import { canRegenerateHealth, getUnitRule } from "../units";
import { clampMorale } from "./morale";

export interface CombatHeroSnapshot {
  id: string;
  attack: number;
  defense: number;
  morale?: number;
  luck?: number;
  armies: UnitStack[];
}

export interface AutoCombatResult {
  winnerHeroId: string;
  loserHeroId: string;
  attackerPower: number;
  defenderPower: number;
  winnerLossRatio: number;
  // Exact post-combat state for non-regenerating units (the King): they keep their
  // real wounds into and out of auto-combat instead of being reset to full by the
  // ratio-based loss model. Applied verbatim, keyed by the stack id. count 0 = killed.
  survivorOverrides?: Array<{ id: string; count: number; health: number }>;
}

export function calculateArmyPower(hero: CombatHeroSnapshot) {
  const armyPower = hero.armies.reduce((total, army) => {
    return total + getUnitRule(army.unitType).power * army.count;
  }, 0);

  const statsMultiplier = 1 + hero.attack * 0.05 + hero.defense * 0.03;
  const moraleMultiplier = 1 + clampMorale(hero.morale ?? 0) * 0.04;
  const luckMultiplier = 1 + Math.max(-3, Math.min(3, Math.trunc(hero.luck ?? 0))) * 0.035;
  return Math.max(1, Math.round(armyPower * statsMultiplier * moraleMultiplier * luckMultiplier));
}

// A single stack inside the headless auto-combat simulation. The simulation mirrors
// the manual hex-combat damage math (see combat/rules.ts) so that auto-resolve and a
// hand-played fight reach comparable outcomes — instead of the old gold-cost scalar,
// which valued units by their price tag rather than their fighting strength.
interface SimStack {
  id: string;
  side: "attacker" | "defender";
  unitType: string;
  count: number;
  startCount: number;
  maxHealth: number;
  health: number;
  speed: number;
  ranged: boolean;
  avgDamage: number;
  ruleAttack: number;
  ruleDefense: number;
  retaliated: boolean;
  // Non-regenerating units (the King) are shielded — struck only when no other ally
  // is left — and their exact HP is carried in and out of the fight.
  shielded: boolean;
}

function buildSimStacks(hero: CombatHeroSnapshot, side: SimStack["side"]): SimStack[] {
  return hero.armies
    .filter((army) => army.count > 0)
    .map((army) => {
      const rule = getUnitRule(army.unitType);
      const fullHealth = rule.health * army.count;
      // The King never heals, so it enters auto-combat at its actual current HP rather
      // than topped up to full like the rest of the (freshly engaged) army.
      const shielded = !canRegenerateHealth(army.unitType);
      return {
        id: army.id,
        side,
        unitType: army.unitType,
        count: army.count,
        startCount: army.count,
        maxHealth: rule.health,
        health: shielded && army.health > 0 ? Math.min(fullHealth, army.health) : fullHealth,
        speed: rule.speed,
        ranged: Boolean(rule.ranged && (rule.shots ?? 0) > 0),
        avgDamage: (rule.minDamage + rule.maxDamage) / 2,
        ruleAttack: rule.attack,
        ruleDefense: rule.defense,
        retaliated: false,
        shielded,
      };
    });
}

// Same attack/defense curve as manual combat (combat/rules.ts getAttackDefenseMultiplier):
// +5% damage per point of attack over defense (cap ×5), −2.5% per point under (floor ×0.3).
function attackDefenseMultiplier(attackValue: number, defenseValue: number): number {
  const diff = attackValue - defenseValue;
  if (diff > 0) return Math.min(5, 1 + 0.05 * diff);
  if (diff < 0) return Math.max(0.3, 1 - 0.025 * Math.abs(diff));
  return 1;
}

// Morale and luck fold in as an outgoing-damage multiplier for the whole side, mirroring
// the old power bonuses but applied symmetrically to both armies.
function sideDamageMultiplier(hero: CombatHeroSnapshot): number {
  const morale = 1 + clampMorale(hero.morale ?? 0) * 0.04;
  const luck = 1 + Math.max(-3, Math.min(3, Math.trunc(hero.luck ?? 0))) * 0.035;
  return Math.max(0.1, morale * luck);
}

function applySimDamage(target: SimStack, damage: number) {
  target.health = Math.max(0, target.health - damage);
  target.count = target.health > 0 ? Math.ceil(target.health / target.maxHealth) : 0;
}

// The winner's loss ratio is measured in HP actually taken, not whole units killed.
// A big high-HP stack can survive a fight with every unit's count intact but a lot of
// chip damage; basing losses on HP means any damage the enemy lands translates into a
// casualty (combined with the "≥1 unit" floor downstream), so an auto-win is never free
// when the defender got to strike back.
function hpLossRatio(stacks: SimStack[]): number {
  let startHP = 0;
  let endHP = 0;
  for (const stack of stacks) {
    startHP += stack.maxHealth * stack.startCount;
    endHP += stack.health;
  }
  return startHP > 0 ? Math.min(0.999, Math.max(0, (startHP - endHP) / startHP)) : 0;
}

/**
 * Resolves a combat by simulating it round by round with the same damage rules the
 * manual hex board uses: average damage × attack/defense multiplier, casualties =
 * damage ÷ unit HP, melee strikes draw one retaliation, ranged stacks fire without
 * retaliation, and initiative follows unit speed. This keeps AUTO outcomes in line
 * with what the player would get fighting the same armies by hand.
 */
export function autoResolveCombat(
  attacker: CombatHeroSnapshot,
  defender: CombatHeroSnapshot
): AutoCombatResult {
  const attackerPower = calculateArmyPower(attacker);
  const defenderPower = calculateArmyPower(defender);

  const stacks = [...buildSimStacks(attacker, "attacker"), ...buildSimStacks(defender, "defender")];
  const heroAttack = { attacker: attacker.attack, defender: defender.attack };
  const heroDefense = { attacker: attacker.defense, defender: defender.defense };
  const sideMultiplier = { attacker: sideDamageMultiplier(attacker), defender: sideDamageMultiplier(defender) };

  const sideAlive = (side: SimStack["side"]) => stacks.some((s) => s.side === side && s.count > 0);
  // Focus fire the most dangerous living enemy stack (highest damage output). Shielded
  // units (the King) are struck only once every other ally has fallen — the other
  // creatures protect it, mirroring how melee shields ranged in the loss model.
  const pickTarget = (foeSide: SimStack["side"]) => {
    const living = stacks.filter((s) => s.side === foeSide && s.count > 0);
    const exposed = living.filter((s) => !s.shielded);
    const pool = exposed.length > 0 ? exposed : living;
    return pool.sort((a, b) => b.count * b.avgDamage - a.count * a.avgDamage)[0];
  };

  const strike = (actor: SimStack, target: SimStack) => {
    const multiplier = attackDefenseMultiplier(
      actor.ruleAttack + heroAttack[actor.side],
      target.ruleDefense + heroDefense[target.side],
    );
    applySimDamage(target, actor.count * actor.avgDamage * multiplier * sideMultiplier[actor.side]);
  };

  let rounds = 0;
  while (sideAlive("attacker") && sideAlive("defender") && rounds < 200) {
    rounds++;
    for (const stack of stacks) stack.retaliated = false;
    // Initiative: fastest first; the attacker holds the edge on speed ties.
    const order = stacks
      .filter((s) => s.count > 0)
      .sort((a, b) => b.speed - a.speed || (a.side === "attacker" ? -1 : 1));

    for (const actor of order) {
      if (actor.count <= 0) continue;
      // The King stays in reserve behind the other creatures: while any non-shielded
      // ally still stands it neither strikes (so it draws no retaliation) nor can be
      // targeted, and only engages once it is the last unit of its side.
      if (actor.shielded && stacks.some((s) => s.side === actor.side && !s.shielded && s.count > 0)) continue;
      const foeSide: SimStack["side"] = actor.side === "attacker" ? "defender" : "attacker";
      const target = pickTarget(foeSide);
      if (!target) break;
      strike(actor, target);
      // Melee draws a single retaliation per defending stack per round; ranged does not.
      if (!actor.ranged && target.count > 0 && !target.retaliated) {
        target.retaliated = true;
        strike(target, actor);
      }
    }
  }

  const attackerStillAlive = sideAlive("attacker");
  const defenderStillAlive = sideAlive("defender");
  let attackerWins: boolean;
  if (attackerStillAlive && !defenderStillAlive) attackerWins = true;
  else if (defenderStillAlive && !attackerStillAlive) attackerWins = false;
  else {
    // Round cap reached (or mutual wipe): decide on surviving power, defender on a tie.
    const remaining = (side: SimStack["side"]) =>
      stacks.filter((s) => s.side === side).reduce((sum, s) => sum + getUnitRule(s.unitType).power * s.count, 0);
    attackerWins = remaining("attacker") > remaining("defender");
  }

  const winnerStacks = stacks.filter((s) => s.side === (attackerWins ? "attacker" : "defender"));
  // Shielded units (the King) are carried out via survivorOverrides with their exact
  // HP, so they are excluded from the ratio that distributes losses across the rest.
  const winnerLossRatio = hpLossRatio(winnerStacks.filter((s) => !s.shielded));

  // Exact final state for shielded non-regen units, applied verbatim downstream.
  const survivorOverrides = stacks
    .filter((s) => s.shielded)
    .map((s) => ({ id: s.id, count: s.count, health: s.health }));

  return {
    winnerHeroId: attackerWins ? attacker.id : defender.id,
    loserHeroId: attackerWins ? defender.id : attacker.id,
    attackerPower,
    defenderPower,
    winnerLossRatio,
    survivorOverrides,
  };
}

// No auto-win is ever free: a hero who wins an auto-combat always loses at least
// this many units. The engine's loss ratio hits a 0.05 floor and Math.floor() then
// rounds tiny per-stack casualties down to zero (e.g. floor(10 * 0.05) = 0), so
// without this a lopsided win costs nothing. The forced loss only applies when there
// was a real fight (lossRatio > 0) and the engine rounded everything to zero, and it
// never wipes the winner's last unit (winning with a single unit keeps it; the only
// way to lose your whole army is to actually lose the battle).
const MIN_WINNER_CASUALTIES = 1;

export function applyLossesToWinnerArmies(
  armies: UnitStack[],
  lossRatio: number
) {
  return applyLossesToArmies(armies, lossRatio, false);
}

export function applyLossesToArmies(
  armies: UnitStack[],
  lossRatio: number,
  wipeArmy: boolean
) {
  if (wipeArmy) {
    return armies.map((army) => ({ ...army, count: 0, health: 0 }));
  }
  if (lossRatio <= 0) {
    return armies.map((army) => ({ ...army }));
  }

  // Casualties are absorbed by the melee front line first; ranged stacks only
  // bleed once the melee that shields them is wiped out (or if the army has no
  // melee at all). The total casualty budget is the same as a flat lossRatio,
  // measured in unit "power" so it is fair across creature tiers.
  const stackPower = (army: UnitStack) => getUnitRule(army.unitType).power * army.count;
  const isRanged = (army: UnitStack) => Boolean(getUnitRule(army.unitType).ranged);

  const meleePower = armies.reduce((sum, army) => (isRanged(army) ? sum : sum + stackPower(army)), 0);
  const rangedPower = armies.reduce((sum, army) => (isRanged(army) ? sum + stackPower(army) : sum), 0);
  const budget = (meleePower + rangedPower) * lossRatio;

  // The melee line absorbs up to its full strength before any budget spills over.
  const meleeFraction = meleePower > 0 ? Math.min(1, budget / meleePower) : 0;
  const rangedBudget = Math.max(0, budget - meleePower);
  const rangedFraction = rangedPower > 0 ? Math.min(1, rangedBudget / rangedPower) : 0;

  const result = armies.map((army) => {
    const fraction = isRanged(army) ? rangedFraction : meleeFraction;
    const losses = Math.max(0, Math.floor(army.count * fraction));
    const nextCount = Math.max(0, army.count - losses);
    return {
      ...army,
      count: nextCount,
      health: nextCount * army.maxHealth,
    };
  });

  // Enforce the "at least 1 casualty" rule when the engine rounded the toll to zero.
  const totalLost = armies.reduce((sum, army, i) => sum + (army.count - result[i].count), 0);
  const survivors = result.reduce((sum, army) => sum + army.count, 0);
  // Cap so we never wipe the winner's last unit (that would be a defeat, not a win).
  const forced = Math.min(MIN_WINNER_CASUALTIES - totalLost, survivors - 1);
  if (forced > 0) {
    // Melee front line bleeds first, then ranged; within each, the largest stack.
    const order = result
      .map((_, i) => i)
      .sort((a, b) => {
        const meleeBias = (isRanged(armies[a]) ? 1 : 0) - (isRanged(armies[b]) ? 1 : 0);
        return meleeBias !== 0 ? meleeBias : result[b].count - result[a].count;
      });
    let remaining = forced;
    for (const idx of order) {
      if (remaining <= 0) break;
      const stack = result[idx];
      const take = Math.min(remaining, stack.count);
      if (take <= 0) continue;
      const nextCount = stack.count - take;
      result[idx] = { ...stack, count: nextCount, health: nextCount * stack.maxHealth };
      remaining -= take;
    }
  }

  return result;
}
