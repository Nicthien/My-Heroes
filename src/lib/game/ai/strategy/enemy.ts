import { calculateHeroPower, calculateStacksPower } from "../combat";
import type { AiContext } from "../types";
import type { AiPlayerMemory } from "./memory";

const PRIMARY_ENEMY_REFRESH_TURNS = 6;
const CHEBYSHEV = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function selectPrimaryEnemy(context: AiContext, memory: AiPlayerMemory): string | null {
  const turn = Number(context.game.turnNumber ?? 1);
  const currentEnemyAlive = memory.primaryEnemyId
    ? context.game.players.find((p) => p.id === memory.primaryEnemyId && p.isAlive && (p.towns?.length ?? 0) > 0)
    : null;

  if (currentEnemyAlive && turn - memory.primaryEnemyRefreshedAtTurn < PRIMARY_ENEMY_REFRESH_TURNS) {
    return memory.primaryEnemyId;
  }

  const myTowns = context.player.towns ?? [];
  let bestId: string | null = null;
  let bestScore = -Infinity;

  for (const opponent of context.visibleOpponents) {
    if (!opponent.isAlive) continue;
    const enemyTowns = opponent.towns ?? [];
    const enemyHeroes = opponent.heroes ?? [];
    const enemyPower = enemyHeroes.reduce((total, h) => total + calculateHeroPower(h), 0)
      + enemyTowns.reduce((total, t) => total + calculateStacksPower(t.garrison ?? []), 0);
    const proximity = closestDistance(myTowns, [...enemyTowns, ...enemyHeroes]);
    // Score = on cherche proche et faible.
    const proximityScore = proximity === Infinity ? 0 : Math.max(0, 100 - proximity);
    const weaknessScore = enemyPower === 0 ? 100 : Math.max(0, 1000 - enemyPower / 10);
    const score = proximityScore * 1.5 + weaknessScore;
    if (score > bestScore) {
      bestScore = score;
      bestId = opponent.id;
    }
  }

  return bestId;
}

function closestDistance(
  ours: Array<{ x: number; y: number }>,
  theirs: Array<{ x: number; y: number }>,
): number {
  if (ours.length === 0 || theirs.length === 0) return Infinity;
  let best = Infinity;
  for (const a of ours) {
    for (const b of theirs) {
      const d = CHEBYSHEV(a.x, a.y, b.x, b.y);
      if (d < best) best = d;
    }
  }
  return best;
}
