import {
  CombatState,
  UnitStack,
  Hero,
  Position,
} from "../types";

const COMBAT_GRID_ROWS = 7;
const COMBAT_GRID_COLS = 11;

export function initCombat(attacker: Hero, defender: Hero): CombatState {
  const allUnits = [
    ...attacker.armies.map((u) => ({ ...u, side: "attacker" as const })),
    ...defender.armies.map((u) => ({ ...u, side: "defender" as const })),
  ].sort((a, b) => getUnitSpeed(a.unitType) - getUnitSpeed(b.unitType));

  const board: (UnitStack | null)[][] = Array.from(
    { length: COMBAT_GRID_ROWS },
    () => Array(COMBAT_GRID_COLS).fill(null)
  );

  attacker.armies.forEach((unit, i) => {
    const row = Math.floor(i / 2);
    board[row][1] = { ...unit };
  });

  defender.armies.forEach((unit, i) => {
    const row = Math.floor(i / 2);
    board[row][COMBAT_GRID_COLS - 2] = { ...unit };
  });

  return {
    board,
    currentUnitId: allUnits[0]?.id ?? "",
    round: 1,
    attackerHeroId: attacker.id,
    defenderHeroId: defender.id,
    isFinished: false,
  };
}

export function executeAttack(
  state: CombatState,
  attackerPos: Position,
  defenderPos: Position,
  attackerStats: { attack: number; defense: number },
  defenderStats: { attack: number; defense: number }
): CombatState {
  const newBoard = state.board.map((row) => row.map((cell) => cell));
  const attacker = newBoard[attackerPos.y][attackerPos.x];
  const defender = newBoard[defenderPos.y][defenderPos.x];

  if (!attacker || !defender) return state;

  const attackDiff =
    attackerStats.attack - defenderStats.defense;
  const damageMultiplier = attackDiff > 0 ? 1 + 0.05 * attackDiff : 1 / (1 + 0.05 * Math.abs(attackDiff));
  const baseDamage = getUnitBaseDamage(attacker.unitType) * attacker.count;
  const totalDamage = Math.floor(baseDamage * damageMultiplier);

  const newDefenderHealth = defender.health - totalDamage;

  if (newDefenderHealth <= 0) {
    newBoard[defenderPos.y][defenderPos.x] = null;
  } else {
    const remainingCount = Math.ceil(newDefenderHealth / defender.maxHealth);
    newBoard[defenderPos.y][defenderPos.x] = {
      ...defender,
      health: newDefenderHealth,
      count: remainingCount,
    };
  }

  const isFinished = checkCombatEnd(newBoard);
  const winnerId = isFinished
    ? getWinner(newBoard, state.attackerHeroId, state.defenderHeroId)
    : undefined;

  const nextUnitId = findNextUnit(newBoard, state.currentUnitId);

  return {
    ...state,
    board: newBoard,
    currentUnitId: nextUnitId,
    isFinished,
    winnerId,
  };
}

function checkCombatEnd(board: (UnitStack | null)[][]): boolean {
  let attackerAlive = false;
  let defenderAlive = false;

  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const col = row.indexOf(cell);
      if (col < COMBAT_GRID_COLS / 2) attackerAlive = true;
      else defenderAlive = true;
    }
  }

  return !attackerAlive || !defenderAlive;
}

function getWinner(
  board: (UnitStack | null)[][],
  attackerHeroId: string,
  defenderHeroId: string
): string {
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const col = row.indexOf(cell);
      if (col < COMBAT_GRID_COLS / 2) return attackerHeroId;
    }
  }
  return defenderHeroId;
}

function findNextUnit(
  board: (UnitStack | null)[][],
  currentId: string
): string {
  const units: { id: string; speed: number }[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell) units.push({ id: cell.id, speed: getUnitSpeed(cell.unitType) });
    }
  }
  units.sort((a, b) => b.speed - a.speed);
  const currentIndex = units.findIndex((u) => u.id === currentId);
  const nextIndex = (currentIndex + 1) % units.length;
  return units[nextIndex]?.id ?? "";
}

function getUnitSpeed(unitType: string): number {
  const speeds: Record<string, number> = {
    pikeman: 4,
    halberdier: 5,
    archer: 4,
    marksman: 6,
    griffin: 7,
    royal_griffin: 9,
    swordsman: 5,
    crusader: 6,
    monk: 4,
    zealot: 6,
    cavalier: 7,
    champion: 9,
    angel: 11,
    archangel: 12,
  };
  return speeds[unitType] ?? 5;
}

function getUnitBaseDamage(unitType: string): number {
  const damages: Record<string, number> = {
    pikeman: 3,
    halberdier: 6,
    archer: 3,
    marksman: 6,
    griffin: 5,
    royal_griffin: 8,
    swordsman: 8,
    crusader: 12,
    monk: 7,
    zealot: 10,
    cavalier: 12,
    champion: 18,
    angel: 40,
    archangel: 50,
  };
  return damages[unitType] ?? 5;
}