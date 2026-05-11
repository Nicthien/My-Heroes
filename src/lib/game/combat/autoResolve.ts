import { UnitStack } from "../types";

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

const UNIT_POWER: Record<string, number> = {
  pikeman: 60,
  halberdier: 90,
  archer: 90,
  marksman: 140,
  griffin: 220,
  royal_griffin: 320,
  swordsman: 350,
  crusader: 520,
  monk: 500,
  zealot: 700,
  cavalier: 900,
  champion: 1200,
  angel: 3000,
  archangel: 4500,
};

export function calculateArmyPower(hero: CombatHeroSnapshot) {
  const armyPower = hero.armies.reduce((total, army) => {
    return total + (UNIT_POWER[army.unitType] ?? 100) * army.count;
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
  return armies.map((army) => {
    const losses = Math.max(0, Math.floor(army.count * lossRatio));
    const nextCount = Math.max(1, army.count - losses);
    return {
      ...army,
      count: nextCount,
      health: nextCount * army.maxHealth,
    };
  });
}
