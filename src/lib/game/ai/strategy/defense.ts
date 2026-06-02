import { findPath, getAdventurePathCost } from "@/lib/game/engine";
import { normalizeMapLevel } from "@/lib/game/map-levels";
import type { AiContext, AiHero, AiObjective } from "../types";
import { calculateStacksPower } from "../combat";

const DEFEND_RADIUS = 5;

const CHEBYSHEV = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function generateDefenseObjectives(context: AiContext, hero: AiHero): AiObjective[] {
  const towns = context.player.towns ?? [];
  if (towns.length === 0) return [];
  const start = { x: hero.x, y: hero.y };
  const objectives: AiObjective[] = [];

  for (const town of towns) {
    if (normalizeMapLevel(town.mapLevel) !== context.activeLevel) continue;
    if (town.x === start.x && town.y === start.y) continue;
    const threat = nearestHumanThreat(context, town);
    if (!threat) continue;
    const garrisonPower = calculateStacksPower(town.garrison ?? []);
    // L'objectif n'a de sens que si la menace est crédible vs la garnison.
    if (threat.power < garrisonPower * 0.5) continue;
    const path = findPath(context.map, start, { x: town.x, y: town.y }, hero.movement);
    if (path.length <= 1) continue;
    const pathCost = getAdventurePathCost(context.map, path);
    if (!Number.isFinite(pathCost) || pathCost > hero.movement) continue;
    objectives.push({
      type: "defend_town",
      id: `defend:${town.id}`,
      position: { x: town.x, y: town.y },
      path,
      pathCost,
      baseValue: 3500 + threat.power * 0.4,
      targetPower: 0,
      targetTownId: town.id,
    });
  }

  return objectives;
}

function nearestHumanThreat(context: AiContext, town: { x: number; y: number }) {
  let best: { power: number; distance: number } | null = null;
  for (const threat of context.threats) {
    if (threat.kind !== "human") continue;
    const distance = CHEBYSHEV(threat.position.x, threat.position.y, town.x, town.y);
    if (distance > DEFEND_RADIUS) continue;
    if (!best || distance < best.distance) best = { power: threat.power, distance };
  }
  return best;
}
