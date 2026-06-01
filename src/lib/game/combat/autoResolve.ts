import { UnitStack } from "../types";
import { getUnitRule } from "../units";
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

export function autoResolveCombat(
  attacker: CombatHeroSnapshot,
  defender: CombatHeroSnapshot
): AutoCombatResult {
  const attackerPower = calculateArmyPower(attacker);
  const defenderPower = calculateArmyPower(defender);
  const attackerWins = attackerPower > defenderPower * 1.12;
  const winnerPower = attackerWins ? attackerPower : defenderPower;
  const loserPower = attackerWins ? defenderPower : attackerPower;

  // Lanchester's square law: a force that is N times stronger loses far less
  // than a linear share. Surviving winner power = sqrt(W^2 - L^2), so the loss
  // fraction is 1 - sqrt(1 - r^2) with r = loser/winner. This keeps lopsided
  // auto-combats cheap (a 2x army loses ~13% instead of ~35%) while an even
  // fight stays a Pyrrhic victory (~86% losses).
  const r = Math.min(0.99, loserPower / Math.max(winnerPower, 1));
  const lanchesterLoss = 1 - Math.sqrt(1 - r * r);

  return {
    winnerHeroId: attackerWins ? attacker.id : defender.id,
    loserHeroId: attackerWins ? defender.id : attacker.id,
    attackerPower,
    defenderPower,
    winnerLossRatio: Math.max(0.05, Math.min(0.92, lanchesterLoss)),
  };
}

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

  return armies.map((army) => {
    const fraction = isRanged(army) ? rangedFraction : meleeFraction;
    const losses = Math.max(0, Math.floor(army.count * fraction));
    const nextCount = Math.max(0, army.count - losses);
    return {
      ...army,
      count: nextCount,
      health: nextCount * army.maxHealth,
    };
  });
}
