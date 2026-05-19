import {
  finalizeStartingRareMines,
  findPathToAdjacent,
  generateMap,
  getAdventurePathCostAvoiding,
  placePlayerStart,
  rareMineForFaction,
} from "../src/lib/game/engine";
import { getMinimumStargateDistance } from "../src/lib/game/engine/adventure-buildings";
import { listTemplatesForPlayers, TEMPLATES } from "../src/lib/game/engine/template";
import { RESOURCE_BUILDING_RULES } from "../src/lib/game/economy";
import { Faction, GameMap, MapTile, ResourceBuildingType, TerrainType } from "../src/lib/game/types";

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
  townFootprints: number;
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
const VALIDATION_FACTIONS = [
  Faction.CASTLE,
  Faction.RAMPART,
  Faction.TOWER,
  Faction.INFERNO,
  Faction.NECROPOLIS,
  Faction.DUNGEON,
] as const;
const PRIMARY_MINE_DAILY_MOVEMENT = 1500;

const issues: ValidationIssue[] = [];
const summaries: string[] = [];
const TOWN_FOOTPRINT_OFFSETS = [
  { x: -1, y: -2 },
  { x: 0, y: -2 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
] as const;

validateResourceProductionRules();

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
        finalizeStartingRareMines(map, validationFactionsFor(playerCount));
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
  const allowsSplitRoadNetworks = template?.allowRoadBridges === false;

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
    const maxWaterRatio = allowsSplitRoadNetworks ? 0.68 : 0.62;
    if (waterRatio > maxWaterRatio) addIssue("error", templateId, seed, playerCount, size, `water ratio too high: ${percent(waterRatio)}`);
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

  validateStartingEconomy(map, templateId, seed, playerCount, size);
  validateStargateSpacing(map, templateId, seed, playerCount, size);

  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "town" && !connected.has(`${tile.x},${tile.y}`)) {
        addIssue("warning", templateId, seed, playerCount, size, `town ${tile.object.id} is not connected to player 1`);
      }
      if (tile.object?.type === "town") {
        const key = `${tile.x},${tile.y}`;
        if (!tile.isPassable) {
          addIssue("error", templateId, seed, playerCount, size, `town door ${tile.object.id} is not passable at ${tile.x},${tile.y}`);
        }
        if (!tile.road) {
          addIssue("error", templateId, seed, playerCount, size, `town door ${tile.object.id} has no south road at ${tile.x},${tile.y}`);
        } else if (!allowsSplitRoadNetworks && !connectedRoads.has(key)) {
          addIssue("error", templateId, seed, playerCount, size, `town door ${tile.object.id} road is not connected at ${tile.x},${tile.y}`);
        }
        for (const footprint of getTownFootprintTiles(map, tile.x, tile.y)) {
          if (footprint?.object?.type !== "town_footprint" || footprint.object.targetId !== tile.object.id) {
            addIssue("error", templateId, seed, playerCount, size, `town ${tile.object.id} is missing a 2x2 footprint near ${tile.x},${tile.y}`);
            break;
          }
        }
      }
      if (tile.object?.type === "town_footprint") {
        if (tile.isPassable) {
          addIssue("error", templateId, seed, playerCount, size, `town footprint ${tile.object.id} is passable at ${tile.x},${tile.y}`);
        }
        if (tile.road) {
          addIssue("error", templateId, seed, playerCount, size, `road crosses town footprint ${tile.object.id} at ${tile.x},${tile.y}`);
        }
      }
      if (tile.object?.type === "building") {
        const key = `${tile.x},${tile.y}`;
        if (!tile.road) {
          addIssue("error", templateId, seed, playerCount, size, `building ${tile.object.id} has no access path at ${tile.x},${tile.y}`);
        } else if (!allowsSplitRoadNetworks && !connectedRoads.has(key)) {
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
      if ((tile.object?.type === "town" || tile.object?.type === "town_footprint" || tile.object?.type === "building") && tile.terrain === TerrainType.WATER) {
        addIssue("error", templateId, seed, playerCount, size, `${tile.object.type} placed on water at ${tile.x},${tile.y}`);
      }
      if (allowsSplitRoadNetworks && tile.road && tile.terrain === TerrainType.WATER) {
        addIssue("error", templateId, seed, playerCount, size, `road bridge placed on water at ${tile.x},${tile.y}`);
      }
    }
  }
}

function validateStartingEconomy(
  map: GameMap,
  templateId: string,
  seed: string,
  playerCount: number,
  size: number,
): void {
  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    const start = placePlayerStart(map, playerIndex);
    const mines = findStartingMines(map, playerIndex);
    const wood = requireStartingMine(mines, "start_wood", templateId, seed, playerCount, size, playerIndex);
    const ore = requireStartingMine(mines, "start_ore", templateId, seed, playerCount, size, playerIndex);
    const gold = requireStartingMine(mines, "start_gold", templateId, seed, playerCount, size, playerIndex);
    const rare = requireStartingMine(mines, "start_rare", templateId, seed, playerCount, size, playerIndex);

    if (wood) validateMineType(wood, ResourceBuildingType.SAWMILL, "starting sawmill", templateId, seed, playerCount, size, playerIndex);
    if (ore) validateMineType(ore, ResourceBuildingType.ORE_PIT, "starting ore pit", templateId, seed, playerCount, size, playerIndex);
    if (gold) validateMineType(gold, ResourceBuildingType.GOLD_MINE, "starting gold mine", templateId, seed, playerCount, size, playerIndex);
    if (rare) {
      validateMineType(
        rare,
        rareMineForFaction(VALIDATION_FACTIONS[playerIndex], playerIndex),
        "starting rare mine",
        templateId,
        seed,
        playerCount,
        size,
        playerIndex,
      );
    }
    validateStartingMineSpacing(mines, templateId, seed, playerCount, size, playerIndex);
    validateStartingMineLandSupport(map, mines, templateId, seed, playerCount, size, playerIndex);

    for (const mine of [wood, ore].filter(Boolean) as MapTile[]) {
      const path = findPathToAdjacent(map, start, { x: mine.x, y: mine.y }, PRIMARY_MINE_DAILY_MOVEMENT);
      const cost = getAdventurePathCostAvoiding(map, path, [{ x: mine.x, y: mine.y }]);
      if (path.length === 0 || !Number.isFinite(cost) || cost > PRIMARY_MINE_DAILY_MOVEMENT) {
        addIssue(
          "error",
          templateId,
          seed,
          playerCount,
          size,
          `player ${playerIndex + 1} primary mine ${mine.object?.subtype} is not reachable in one day at ${mine.x},${mine.y}`,
        );
      }
    }

    if (wood && ore && gold) {
      const primaryDistance = Math.max(distance(start, wood), distance(start, ore));
      if (distance(start, gold) < primaryDistance) {
        addIssue(
          "error",
          templateId,
          seed,
          playerCount,
          size,
          `player ${playerIndex + 1} gold mine is not farther than primary mines at ${gold.x},${gold.y} (gold ${distance(start, gold)}, primary ${primaryDistance})`,
        );
      }
    }
  }
}

function validateStargateSpacing(
  map: GameMap,
  templateId: string,
  seed: string,
  playerCount: number,
  size: number,
): void {
  const stargates = map.tiles
    .flatMap((row) => row)
    .filter((tile) => tile.object?.type === "adventure_building" && tile.object.subtype === "stargate");
  const minDistance = getMinimumStargateDistance(map.width, map.height);

  for (let i = 0; i < stargates.length; i++) {
    for (let j = i + 1; j < stargates.length; j++) {
      const actual = distance(stargates[i], stargates[j]);
      if (actual >= minDistance) continue;
      addIssue(
        "error",
        templateId,
        seed,
        playerCount,
        size,
        `stargates are too close: ${stargates[i].x},${stargates[i].y} and ${stargates[j].x},${stargates[j].y} (${actual} < ${minDistance})`,
      );
    }
  }
}

function validateStartingMineLandSupport(
  map: GameMap,
  mines: MapTile[],
  templateId: string,
  seed: string,
  playerCount: number,
  size: number,
  playerIndex: number,
): void {
  for (const mine of mines) {
    const support = countLandSupport(map, mine.x, mine.y);
    if (mine.terrain === TerrainType.WATER || mine.terrain === TerrainType.LAVA || support.orthogonal < 1) {
      addIssue(
        "error",
        templateId,
        seed,
        playerCount,
        size,
        `player ${playerIndex + 1} starting mine ${mine.object?.subtype} has poor land support at ${mine.x},${mine.y}`,
      );
    }
  }
}

function countLandSupport(map: GameMap, x: number, y: number) {
  let orthogonal = 0;
  let surrounding = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tile = map.tiles[y + dy]?.[x + dx];
      if (!tile || tile.terrain === TerrainType.WATER || tile.terrain === TerrainType.LAVA || !tile.isPassable) continue;
      surrounding++;
      if (Math.abs(dx) + Math.abs(dy) === 1) orthogonal++;
    }
  }

  return { orthogonal, surrounding };
}

function validateStartingMineSpacing(
  mines: MapTile[],
  templateId: string,
  seed: string,
  playerCount: number,
  size: number,
  playerIndex: number,
): void {
  for (let i = 0; i < mines.length; i++) {
    for (let j = i + 1; j < mines.length; j++) {
      if (distance(mines[i], mines[j]) > 1) continue;
      addIssue(
        "error",
        templateId,
        seed,
        playerCount,
        size,
        `player ${playerIndex + 1} starting mines are adjacent at ${mines[i].x},${mines[i].y} and ${mines[j].x},${mines[j].y}`,
      );
    }
  }
}

function findStartingMines(map: GameMap, ownerIndex: number) {
  return map.tiles
    .flatMap((row) => row)
    .filter((tile) => tile.object?.type === "building" && tile.object.ownerIndex === ownerIndex);
}

function requireStartingMine(
  mines: MapTile[],
  role: NonNullable<NonNullable<MapTile["object"]>["strategicRole"]>,
  templateId: string,
  seed: string,
  playerCount: number,
  size: number,
  playerIndex: number,
) {
  const found = mines.filter((tile) => tile.object?.strategicRole === role);
  if (found.length !== 1) {
    addIssue(
      "error",
      templateId,
      seed,
      playerCount,
      size,
      `player ${playerIndex + 1} expected exactly one ${role} mine, got ${found.length}`,
    );
  }
  return found[0];
}

function validateMineType(
  tile: MapTile,
  expected: ResourceBuildingType,
  label: string,
  templateId: string,
  seed: string,
  playerCount: number,
  size: number,
  playerIndex: number,
) {
  if (tile.object?.subtype !== expected) {
    addIssue(
      "error",
      templateId,
      seed,
      playerCount,
      size,
      `player ${playerIndex + 1} ${label} expected ${expected}, got ${tile.object?.subtype ?? "none"} at ${tile.x},${tile.y}`,
    );
  }
}

function validateResourceProductionRules(): void {
  const expected: Partial<Record<ResourceBuildingType, Record<string, number>>> = {
    [ResourceBuildingType.GOLD_MINE]: { gold: 1000 },
    [ResourceBuildingType.SAWMILL]: { wood: 2 },
    [ResourceBuildingType.ORE_PIT]: { ore: 2 },
    [ResourceBuildingType.ALCHEMIST_LAB]: { mercury: 1 },
    [ResourceBuildingType.CRYSTAL_CAVERN]: { crystals: 1 },
    [ResourceBuildingType.GEM_POND]: { gems: 1 },
    [ResourceBuildingType.SULFUR_DUNE]: { sulfur: 1 },
  };

  for (const [type, production] of Object.entries(expected)) {
    const rule = RESOURCE_BUILDING_RULES.find((item) => item.type === type);
    if (!rule || JSON.stringify(rule.production) !== JSON.stringify(production)) {
      addIssue("error", "economy", "rules", 0, 0, `unexpected production for ${type}`);
    }
  }
}

function validationFactionsFor(playerCount: number): Faction[] {
  return Array.from({ length: playerCount }, (_, index) => VALIDATION_FACTIONS[index % VALIDATION_FACTIONS.length]);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function collectStats(map: GameMap): MapStats {
  const stats: MapStats = {
    land: 0,
    water: 0,
    roads: 0,
    bridges: 0,
    towns: 0,
    townFootprints: 0,
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
      if (tile.object?.type === "town_footprint") stats.townFootprints++;
      if (tile.object?.type === "building") stats.buildings++;
      if (tile.object?.type === "resource") stats.resources++;
      if (tile.object?.type === "adventure_building") stats.adventureBuildings++;
      if (tile.object?.type === "monster") stats.monsters++;
    }
  }

  return stats;
}

function getTownFootprintTiles(map: GameMap, doorX: number, doorY: number) {
  return TOWN_FOOTPRINT_OFFSETS.map((offset) => map.tiles[doorY + offset.y]?.[doorX + offset.x]);
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
