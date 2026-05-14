import { generateMap, placePlayerStart } from "../src/lib/game/engine";
import { listTemplatesForPlayers, TEMPLATES } from "../src/lib/game/engine/template";
import { GameMap, TerrainType } from "../src/lib/game/types";

interface ValidationIssue {
  severity: "error" | "warning";
  templateId: string;
  seed: string;
  playerCount: number;
  size: number;
  message: string;
}

interface MapStats {
  land: number;
  water: number;
  roads: number;
  bridges: number;
  towns: number;
  buildings: number;
  resources: number;
  adventureBuildings: number;
  monsters: number;
  decor: number;
  blockingDecor: number;
  terrain: Record<string, number>;
}

const sizes = [36, 72, 108];
const playerCounts = [2, 3, 4, 5, 6];
const samplesPerTemplate = Number(process.env.RMG_SAMPLES ?? 8);
const seeds = Array.from({ length: samplesPerTemplate }, (_, index) => `RMG${String(index + 1).padStart(3, "0")}`);

const issues: ValidationIssue[] = [];
const summaries: string[] = [];

for (const playerCount of playerCounts) {
  const templates = listTemplatesForPlayers(playerCount);
  for (const template of templates) {
    for (const size of sizes) {
      for (const seed of seeds) {
        const map = generateMap({
          width: size,
          height: size,
          seed: `${template.id}-${playerCount}-${size}-${seed}`,
          playerCount,
          templateId: template.id,
        });
        const stats = collectStats(map);
        validateMap(map, stats, template.id, seed, playerCount, size);
      }
    }
    summaries.push(`${template.id}: checked ${sizes.length * seeds.length} maps for ${playerCount}p`);
  }
}

const errors = issues.filter((issue) => issue.severity === "error");
const warnings = issues.filter((issue) => issue.severity === "warning");

console.log(`RMG validation checked ${summaries.length} template/player groups.`);
for (const line of summaries) console.log(`- ${line}`);

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const warning of warnings.slice(0, 40)) console.log(formatIssue(warning));
  if (warnings.length > 40) console.log(`... ${warnings.length - 40} more warnings`);
}

if (errors.length > 0) {
  console.error(`\nErrors (${errors.length}):`);
  for (const error of errors.slice(0, 80)) console.error(formatIssue(error));
  if (errors.length > 80) console.error(`... ${errors.length - 80} more errors`);
  process.exit(1);
}

console.log("\nRMG validation passed.");

function validateMap(
  map: GameMap,
  stats: MapStats,
  templateId: string,
  seed: string,
  playerCount: number,
  size: number,
): void {
  const total = map.width * map.height;
  const waterRatio = stats.water / total;
  const landRatio = stats.land / total;
  const template = TEMPLATES.find((item) => item.id === templateId);
  const expectsArchipelago = template?.landStyle === "volcanic-crown" || templateId === "archipelago";

  if (stats.towns < playerCount) {
    addIssue("error", templateId, seed, playerCount, size, `expected at least ${playerCount} towns, got ${stats.towns}`);
  }

  if (stats.buildings < Math.max(2, playerCount)) {
    addIssue("error", templateId, seed, playerCount, size, `too few buildings/mines: ${stats.buildings}`);
  }

  if (stats.monsters < Math.max(4, playerCount)) {
    addIssue("warning", templateId, seed, playerCount, size, `low monster count: ${stats.monsters}`);
  }

  if (stats.adventureBuildings < Math.max(2, Math.floor(playerCount / 2))) {
    addIssue("warning", templateId, seed, playerCount, size, `low adventure building count: ${stats.adventureBuildings}`);
  }

  if (stats.roads < playerCount * 4) {
    addIssue("warning", templateId, seed, playerCount, size, `low road coverage: ${stats.roads} road tiles`);
  }

  if (stats.decor < total * 0.12) {
    addIssue("warning", templateId, seed, playerCount, size, `low decor density: ${percent(stats.decor / total)}`);
  }

  if (expectsArchipelago) {
    if (waterRatio < 0.22) addIssue("warning", templateId, seed, playerCount, size, `water ratio low for archipelago: ${percent(waterRatio)}`);
    if (waterRatio > 0.62) addIssue("error", templateId, seed, playerCount, size, `water ratio too high: ${percent(waterRatio)}`);
  } else {
    if (waterRatio > 0.58) addIssue("warning", templateId, seed, playerCount, size, `water ratio high: ${percent(waterRatio)}`);
  }

  if (landRatio < 0.28) {
    addIssue("error", templateId, seed, playerCount, size, `land ratio too low: ${percent(landRatio)}`);
  }

  const connected = floodReachable(map, placePlayerStart(map, 0));
  const roadStart = findRoadNetworkStart(map);
  const connectedRoads = roadStart ? floodRoadReachable(map, roadStart) : new Set<string>();
  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    const start = placePlayerStart(map, playerIndex);
    if (!map.tiles[start.y]?.[start.x]?.isPassable) {
      addIssue("error", templateId, seed, playerCount, size, `player ${playerIndex + 1} start is not passable at ${start.x},${start.y}`);
    }
    if (!connected.has(`${start.x},${start.y}`)) {
      addIssue("error", templateId, seed, playerCount, size, `player ${playerIndex + 1} start is not connected to player 1`);
    }
  }

  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "town" && !connected.has(`${tile.x},${tile.y}`)) {
        addIssue("warning", templateId, seed, playerCount, size, `town ${tile.object.id} is not connected to player 1`);
      }
      if (tile.object?.type === "building") {
        const key = `${tile.x},${tile.y}`;
        if (!tile.road) {
          addIssue("error", templateId, seed, playerCount, size, `building ${tile.object.id} has no access path at ${tile.x},${tile.y}`);
        } else if (!connectedRoads.has(key)) {
          addIssue("error", templateId, seed, playerCount, size, `building ${tile.object.id} path is not connected to the road network at ${tile.x},${tile.y}`);
        }
      }
      if (tile.object?.type === "adventure_building") {
        if (tile.road) {
          addIssue("error", templateId, seed, playerCount, size, `adventure building ${tile.object.id} is on a road at ${tile.x},${tile.y}`);
        }
        if (tile.object.subtype === "stargate" && !tile.object.targetId) {
          addIssue("error", templateId, seed, playerCount, size, `stargate ${tile.object.id} has no target at ${tile.x},${tile.y}`);
        }
      }
      if (tile.object?.type === "wall" && tile.terrain === TerrainType.WATER) {
        addIssue("error", templateId, seed, playerCount, size, `wall placed on water at ${tile.x},${tile.y}`);
      }
      if ((tile.object?.type === "town" || tile.object?.type === "building") && tile.terrain === TerrainType.WATER) {
        addIssue("error", templateId, seed, playerCount, size, `${tile.object.type} placed on water at ${tile.x},${tile.y}`);
      }
    }
  }
}

function collectStats(map: GameMap): MapStats {
  const stats: MapStats = {
    land: 0,
    water: 0,
    roads: 0,
    bridges: 0,
    towns: 0,
    buildings: 0,
    resources: 0,
    adventureBuildings: 0,
    monsters: 0,
    decor: 0,
    blockingDecor: 0,
    terrain: {},
  };

  for (const row of map.tiles) {
    for (const tile of row) {
      stats.terrain[tile.terrain] = (stats.terrain[tile.terrain] ?? 0) + 1;
      if (tile.terrain === TerrainType.WATER) stats.water++;
      else stats.land++;
      if (tile.road) stats.roads++;
      if (tile.road && tile.terrain === TerrainType.WATER) stats.bridges++;
      if (tile.decor) stats.decor++;
      if (tile.decor?.blocking) stats.blockingDecor++;
      if (tile.object?.type === "town") stats.towns++;
      if (tile.object?.type === "building") stats.buildings++;
      if (tile.object?.type === "resource") stats.resources++;
      if (tile.object?.type === "adventure_building") stats.adventureBuildings++;
      if (tile.object?.type === "monster") stats.monsters++;
    }
  }

  return stats;
}

function floodReachable(map: GameMap, start: { x: number; y: number }): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.x},${current.y}`;
    if (seen.has(key)) continue;
    const tile = map.tiles[current.y]?.[current.x];
    if (!tile?.isPassable) continue;
    seen.add(key);
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      if (next.x < 0 || next.x >= map.width || next.y < 0 || next.y >= map.height) continue;
      if (!seen.has(`${next.x},${next.y}`)) queue.push(next);
    }
  }
  return seen;
}

function findRoadNetworkStart(map: GameMap): { x: number; y: number } | null {
  for (let playerIndex = 0; playerIndex < 8; playerIndex++) {
    const start = placePlayerStart(map, playerIndex);
    if (map.tiles[start.y]?.[start.x]?.road) return start;
  }

  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.road) return { x: tile.x, y: tile.y };
    }
  }

  return null;
}

function floodRoadReachable(map: GameMap, start: { x: number; y: number }): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.x},${current.y}`;
    if (seen.has(key)) continue;
    const tile = map.tiles[current.y]?.[current.x];
    if (!tile?.road) continue;
    seen.add(key);
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      if (next.x < 0 || next.x >= map.width || next.y < 0 || next.y >= map.height) continue;
      if (!seen.has(`${next.x},${next.y}`)) queue.push(next);
    }
  }
  return seen;
}

function addIssue(
  severity: ValidationIssue["severity"],
  templateId: string,
  seed: string,
  playerCount: number,
  size: number,
  message: string,
): void {
  issues.push({ severity, templateId, seed, playerCount, size, message });
}

function formatIssue(issue: ValidationIssue): string {
  return `[${issue.severity}] ${issue.templateId} ${issue.playerCount}p ${issue.size} ${issue.seed}: ${issue.message}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
