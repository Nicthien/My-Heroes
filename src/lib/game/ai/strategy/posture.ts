import type { AiContext } from "../types";
import { calculateHeroPower, calculateStacksPower } from "../combat";
import type { AiPlayerMemory, AiPosture } from "./memory";

const DEFEND_THREAT_RADIUS = 5;
const CHEBYSHEV = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function computePosture(context: AiContext, memory: AiPlayerMemory): AiPosture {
  const turn = Number(context.game.turnNumber ?? 1);
  const myPower = totalArmyPower(context);

  if (context.visibleOpponents.length > 0) {
    const enemyAliveCount = (context.game.players ?? []).filter(
      (p) => p.isAlive && p.id !== context.player.id,
    ).length;
    const enemyHasTowns = (context.game.players ?? []).some(
      (p) => p.isAlive && p.id !== context.player.id && (p.towns?.length ?? 0) > 0,
    );
    if (enemyAliveCount <= 1 && !enemyHasTowns) return "FINISH";
  }

  if (isUnderImmediateThreat(context)) return "DEFEND";

  if (turn >= 25 && myPower > enemyTotalKnownPower(context) * 1.4) return "FINISH";

  // Phase EXPLORE : tours initiaux ou tant qu'une grande partie de la carte voisine n'est pas révélée.
  if (turn <= 4) return "EXPLORE";
  if (turn <= 10 && exploredRatioAroundBase(context) < 0.55) return "EXPLORE";

  if (turn <= 12) return "EXPAND";

  if (myPower < enemyTotalKnownPower(context) * 0.7) return "CONSOLIDATE";

  if (memory.posture === "DEFEND" && !isUnderImmediateThreat(context)) return "CONSOLIDATE";

  return "EXPAND";
}

const BASE_EXPLORE_RADIUS = 14;

function exploredRatioAroundBase(context: AiContext): number {
  const towns = context.player.towns ?? [];
  if (towns.length === 0) return 1;
  const center = towns[0];
  const map = context.map;
  let total = 0;
  let explored = 0;
  for (let dy = -BASE_EXPLORE_RADIUS; dy <= BASE_EXPLORE_RADIUS; dy++) {
    for (let dx = -BASE_EXPLORE_RADIUS; dx <= BASE_EXPLORE_RADIUS; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      total++;
      if (context.explored.has(`${x},${y}`)) explored++;
    }
  }
  return total === 0 ? 1 : explored / total;
}

function isUnderImmediateThreat(context: AiContext): boolean {
  const towns = context.player.towns ?? [];
  if (towns.length === 0) return false;
  for (const threat of context.threats) {
    if (threat.kind !== "human") continue;
    for (const town of towns) {
      const distance = CHEBYSHEV(threat.position.x, threat.position.y, town.x, town.y);
      if (distance <= DEFEND_THREAT_RADIUS) {
        const garrisonPower = calculateStacksPower(town.garrison ?? []);
        if (threat.power > garrisonPower * 0.6) return true;
      }
    }
  }
  return false;
}

function totalArmyPower(context: AiContext): number {
  let total = 0;
  for (const hero of context.player.heroes ?? []) {
    total += calculateHeroPower(hero);
  }
  for (const town of context.player.towns ?? []) {
    total += calculateStacksPower(town.garrison ?? []);
  }
  return total;
}

function enemyTotalKnownPower(context: AiContext): number {
  let total = 0;
  for (const opponent of context.visibleOpponents) {
    for (const hero of opponent.heroes ?? []) {
      total += calculateHeroPower(hero);
    }
    for (const town of opponent.towns ?? []) {
      total += calculateStacksPower(town.garrison ?? []);
    }
  }
  return Math.max(1, total);
}
