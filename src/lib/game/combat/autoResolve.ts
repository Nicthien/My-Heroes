import { UnitStack } from "../types";
import { getUnitRule } from "../units";

export interface CombatHeroSnapshot {
  id: string;
  attack: number;
  defense: number;
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
  return Math.max(1, Math.round(armyPower * statsMultiplier));
}

export function autoResolveCombat(
  attacker: CombatHeroSnapshot,
  defender: CombatHeroSnapshot
): AutoCombatResult {
  const attackerPower = calculateArmyPower(attacker);
  const defenderPower = calculateArmyPower(defender);
  const attackerWins = attackerPower >= defenderPower;
  const winnerPower = attackerWins ? attackerPower : defenderPower;
  const loserPower = attackerWins ? defenderPower : attackerPower;

  const pressure = Math.min(0.85, loserPower / Math.max(winnerPower, 1));

  return {
    winnerHeroId: attackerWins ? attacker.id : defender.id,
    loserHeroId: attackerWins ? defender.id : attacker.id,
    attackerPower,
    defenderPower,
    winnerLossRatio: Math.max(0.05, pressure * 0.45),
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
  return armies.map((army) => {
    const losses = wipeArmy ? army.count : Math.max(0, Math.floor(army.count * lossRatio));
    const nextCount = wipeArmy ? 0 : Math.max(1, army.count - losses);
    return {
      ...army,
      count: nextCount,
      health: nextCount * army.maxHealth,
    };
  });
}
