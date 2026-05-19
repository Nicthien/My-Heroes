import {
  GameState,
  GameAction,
  Player,
  Hero,
  GameMap,
  MapTile,
  TerrainType,
  Position,
  Resources,
  UnitStack,
} from "../types";

import { RESOURCE_BUILDING_RULES, getFactionBuildingRule } from "../economy";
import { getTownGoldProduction } from "../town-buildings";
import { getUnitRule } from "../units";
import { makeRng, randomSeed, type RNG } from "./rng";
import { getTemplate, resolveTemplate, listTemplatesForPlayers } from "./template";
import { buildZoneGrid, generateZoneTerrain } from "./zones";
import { buildConnectionsAndWalls } from "./connections";
import { applyChokepointGuards, fillZone, placeStartingEconomy, placeTownInZone } from "./placement";
import { buildRoads, buildSecondaryRoads } from "./roads";
import { placeDecor } from "./decor";
import { NEUTRAL_CASTLE_VALUE } from "./value";
import { generateLandmass } from "./landmass";
import { carveHydrology } from "./hydrology";
import { placeAdventureBuildings } from "./adventure-buildings";
export { finalizeStartingRareMines, rareMineForFaction } from "./starting-economy";

function isPassable(terrain: TerrainType): boolean {
  return terrain !== TerrainType.LAVA;
}

function getMovementCost(terrain: TerrainType): number {
  switch (terrain) {
    case TerrainType.GRASS:
    case TerrainType.DIRT:
      return 100;
    case TerrainType.SAND:
    case TerrainType.FOREST:
    case TerrainType.SNOW:
      return 150;
    case TerrainType.SWAMP:
      return 175;
    case TerrainType.WATER:
      return 200;
    case TerrainType.MOUNTAIN:
      return 250;
    default:
      return 999;
  }
}

/** Coût de déplacement effectif d'une tile : les routes priment sur le terrain. */
const ORTHOGONAL_BASE = 100;
const DIAGONAL_BASE = 141;
export const MINIMUM_ADVENTURE_STEP_COST = 50;

export function effectiveMovementCost(tile: MapTile): number {
  if (!isTileTraversable(tile)) return 999;
  if (tile.road === "paved") return 50;
  if (tile.road === "gravel") return 65;
  if (tile.road === "dirt") return 75;
  return getMovementCost(tile.terrain);
}

export function isTileTraversable(tile: MapTile | undefined): boolean {
  return Boolean(
    tile &&
    tile.isPassable &&
    tile.object?.type !== "wall" &&
    tile.object?.type !== "town_footprint" &&
    !tile.decor?.blocking
  );
}

function getAdventureNeighbors(pos: Position): Position[] {
  const neighbors: Position[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      neighbors.push({ x: pos.x + dx, y: pos.y + dy });
    }
  }
  return neighbors;
}

function isInsideMap(map: GameMap, pos: Position): boolean {
  return pos.x >= 0 && pos.x < map.width && pos.y >= 0 && pos.y < map.height;
}

function positionKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}

function toPositionKeySet(positions: Position[]): Set<string> {
  return new Set(positions.map(positionKey));
}

function isBlockedPosition(pos: Position, blocked: Set<string>): boolean {
  return blocked.has(positionKey(pos));
}

export function canMoveAdventureStep(map: GameMap, from: Position, to: Position): boolean {
  if (!isInsideMap(map, from) || !isInsideMap(map, to)) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx > 1 || absDy > 1 || (absDx === 0 && absDy === 0)) return false;

  const targetTile = map.tiles[to.y]?.[to.x];
  if (!isTileTraversable(targetTile)) return false;

  if (absDx === 1 && absDy === 1) {
    const sideA = map.tiles[from.y]?.[from.x + dx];
    const sideB = map.tiles[from.y + dy]?.[from.x];
    if (!isTileTraversable(sideA) || !isTileTraversable(sideB)) return false;
  }

  return true;
}

function canMoveAdventureStepAvoiding(map: GameMap, from: Position, to: Position, blocked: Set<string>): boolean {
  if (isBlockedPosition(to, blocked)) return false;
  if (!canMoveAdventureStep(map, from, to)) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    if (isBlockedPosition({ x: from.x + dx, y: from.y }, blocked)) return false;
    if (isBlockedPosition({ x: from.x, y: from.y + dy }, blocked)) return false;
  }

  return true;
}

export function areAdventurePositionsAdjacent(a: Position, b: Position): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
}

export function getAdventureStepCost(map: GameMap, from: Position, to: Position): number {
  if (!canMoveAdventureStep(map, from, to)) return Number.POSITIVE_INFINITY;

  const targetTile = map.tiles[to.y]?.[to.x];
  if (!targetTile) return Number.POSITIVE_INFINITY;

  const surfaceCost = effectiveMovementCost(targetTile);
  const isDiagonal = from.x !== to.x && from.y !== to.y;
  return isDiagonal ? Math.floor(surfaceCost * DIAGONAL_BASE / ORTHOGONAL_BASE) : surfaceCost;
}

export function getAdventurePathCost(map: GameMap, path: Position[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const stepCost = getAdventureStepCost(map, path[i - 1], path[i]);
    if (!Number.isFinite(stepCost)) return Number.POSITIVE_INFINITY;
    total += stepCost;
  }
  return total;
}

export function getAdventurePathCostAvoiding(map: GameMap, path: Position[], blockedPositions: Position[]): number {
  const blocked = toPositionKeySet(blockedPositions);
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    if (!canMoveAdventureStepAvoiding(map, from, to, blocked)) return Number.POSITIVE_INFINITY;

    const targetTile = map.tiles[to.y]?.[to.x];
    if (!targetTile) return Number.POSITIVE_INFINITY;

    const surfaceCost = effectiveMovementCost(targetTile);
    const isDiagonal = from.x !== to.x && from.y !== to.y;
    total += isDiagonal ? Math.floor(surfaceCost * DIAGONAL_BASE / ORTHOGONAL_BASE) : surfaceCost;
  }
  return total;
}

export function getMinimumAdjacentAdventureStepCost(map: GameMap, position: Position): number | null {
  let minimum = Number.POSITIVE_INFINITY;

  for (const neighbor of getAdventureNeighbors(position)) {
    if (!isInsideMap(map, neighbor)) continue;
    if (!canMoveAdventureStep(map, position, neighbor)) continue;

    const stepCost = getAdventureStepCost(map, position, neighbor);
    if (Number.isFinite(stepCost)) minimum = Math.min(minimum, stepCost);
  }

  return Number.isFinite(minimum) ? minimum : null;
}

export function getUsableAdventureMovement(map: GameMap, position: Position, movement: number): number {
  const remaining = Number.isFinite(movement) ? Math.max(0, movement) : 0;
  if (remaining === 0) return 0;

  const minimumStepCost = getMinimumAdjacentAdventureStepCost(map, position);
  return minimumStepCost !== null && remaining < minimumStepCost ? 0 : remaining;
}

export function getDailyAdventureMovement(heroArmies: Pick<UnitStack, "unitType">[] | undefined | null): number {
  if (!heroArmies || heroArmies.length === 0) return 2000;

  const slowestSpeed = heroArmies.reduce((slowest, army) => {
    const speed = getUnitRule(army.unitType).speed;
    return Math.min(slowest, speed);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(slowestSpeed)) return 2000;
  if (slowestSpeed <= 3) return 1500;
  if (slowestSpeed >= 11) return 2000;

  const movementBySpeed: Record<number, number> = {
    4: 1560,
    5: 1630,
    6: 1700,
    7: 1760,
    8: 1830,
    9: 1900,
    10: 1960,
  };
  return movementBySpeed[Math.floor(slowestSpeed)] ?? 1500;
}

export function normalizeMapMovement(map: GameMap): GameMap {
  for (const row of map.tiles) {
    for (const tile of row) {
      const blockedByObject = tile.object?.type === "wall" || tile.object?.type === "town_footprint";
      const blockedByDecor = tile.decor?.blocking === true;
      tile.isPassable = isPassable(tile.terrain) && !blockedByObject && !blockedByDecor;
      tile.movementCost = tile.isPassable ? getMovementCost(tile.terrain) : 999;
    }
  }

  return map;
}

export interface GenerateMapOptions {
  width: number;
  height: number;
  seed?: string;
  templateId?: string;
  playerCount: number;
}

export function generateMap(opts: GenerateMapOptions): GameMap;
/** @deprecated forme legacy (width, height) — utilise GenerateMapOptions */
export function generateMap(width: number, height: number): GameMap;
export function generateMap(arg1: GenerateMapOptions | number, arg2?: number): GameMap {
  let opts: GenerateMapOptions;
  if (typeof arg1 === "number") {
    opts = { width: arg1, height: arg2 ?? arg1, playerCount: 4 };
  } else {
    opts = arg1;
  }
  const { width, height, playerCount } = opts;
  const seed = opts.seed && opts.seed.length > 0 ? opts.seed : randomSeed();
  const rng = makeRng(seed);

  // Choix du template
  const templateId =
    opts.templateId ?? pickDefaultTemplate(playerCount, rng);
  const fullTemplate = getTemplate(templateId);
  const template = resolveTemplate(fullTemplate, playerCount, rng);

  // 1) Zones + terrain
  const tiles: MapTile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = {
        x,
        y,
        terrain: TerrainType.GRASS,
        elevation: 0,
        isPassable: true,
        movementCost: 100,
      };
    }
  }

  const landmass = generateLandmass(width, height, rng, fullTemplate.landStyle);
  const zoneGrid = buildZoneGrid(template, width, height, rng, landmass);
  generateZoneTerrain(tiles, zoneGrid, width, height, rng, landmass);
  carveHydrology(tiles, width, height, rng);

  // 2) Murs + chokepoints
  const chokepoints = buildConnectionsAndWalls(tiles, zoneGrid, template, width, height);

  // 3) Châteaux (joueurs + neutres) puis remplissage value-system
  const townPositions: Position[] = [];
  const playerTownPositions = new Map<number, { zoneId: number; position: Position }>();
  for (let zoneId = 0; zoneId < zoneGrid.meta.length; zoneId++) {
    const meta = zoneGrid.meta[zoneId];
    if (!meta.hasTown) continue;
    const placed = placeTownInZone(
      { tiles, zoneGrid, width, height, rng },
      zoneId,
      !!meta.townIsNeutral,
      meta.ownerIndex,
    );
    if (placed) {
      const position = { x: placed.x, y: placed.y };
      townPositions.push(position);
      if (!meta.townIsNeutral && meta.ownerIndex !== undefined) {
        playerTownPositions.set(meta.ownerIndex, { zoneId, position });
      }
    }
  }

  const miningPositions: Position[] = [];
  for (const [ownerIndex, start] of playerTownPositions) {
    const placed = placeStartingEconomy(
      { tiles, zoneGrid, width, height, rng },
      start.zoneId,
      start.position,
      ownerIndex,
    );
    for (const b of placed) miningPositions.push({ x: b.x, y: b.y });
  }

  for (let zoneId = 0; zoneId < zoneGrid.meta.length; zoneId++) {
    const meta = zoneGrid.meta[zoneId];
    const tplZone = template.zones.find((z) => z.id === meta.templateZoneId)!;
    // Déduit une partie de la valeur du château neutre sans vider le budget de zone.
    const budgetMeta = { ...meta };
    if (meta.hasTown && meta.townIsNeutral) {
      const castleBudgetShare = Math.min(NEUTRAL_CASTLE_VALUE, Math.floor(meta.value * 0.35));
      budgetMeta.value = Math.max(2000, meta.value - castleBudgetShare);
    }
    zoneGrid.meta[zoneId] = budgetMeta;
    const r = fillZone(
      { tiles, zoneGrid, width, height, rng },
      zoneId,
      tplZone.monsterStrength,
      { allowBuildings: meta.type !== "player" },
    );
    for (const b of r.placedBuildings) miningPositions.push({ x: b.x, y: b.y });
  }

  // 4) Gardes des chokepoints
  applyChokepointGuards({ tiles, zoneGrid, width, height, rng }, chokepoints);

  // 5) Routes : pavées entre châteaux, dirt vers les mines
  const roadOptions = { allowWaterRoads: fullTemplate.allowRoadBridges !== false };
  buildRoads(tiles, width, height, townPositions, "paved", roadOptions);
  buildSecondaryRoads(tiles, width, height, townPositions, miningPositions, 10, roadOptions);

  // Batiments d'aventure hors route pour recompenser l'exploration.
  placeAdventureBuildings({ tiles, zoneGrid, width, height, rng });

  // 6) Décor (passe finale)
  placeDecor(tiles, width, height, rng);

  // 7) Garantir que chaque chokepoint reste praticable même après décor
  for (const cp of chokepoints) {
    const t = tiles[cp.y][cp.x];
    if (t.decor?.blocking) t.decor = undefined;
    t.isPassable = true;
    t.movementCost = getMovementCost(t.terrain);
    t.road ??= "paved";
  }

  return {
    width,
    height,
    tiles,
    seed,
    templateId,
    zones: zoneGrid.meta,
  };
}

function pickDefaultTemplate(playerCount: number, rng: RNG): string {
  const compatible = listTemplatesForPlayers(playerCount);
  if (compatible.length === 0) {
    // fallback à JEBUS_CROSS si rien ne matche
    return "jebus-cross";
  }
  return compatible[Math.floor(rng() * compatible.length)].id;
}

export function placePlayerStart(
  mapData: GameMap | Record<string, unknown>,
  playerIndex: number,
): Position {
  const map = mapData as GameMap;
  const width = map.width ?? 36;
  const height = map.height ?? 36;

  // 1) Si la map a des zones avec un ownerIndex correspondant, utiliser le château de cette zone
  if (map.zones && map.tiles) {
    const zone = map.zones.find((z) => z.ownerIndex === playerIndex && z.hasTown);
    if (zone) {
      // Trouver la tile town dans la zone (parcours autour du centre)
      for (let r = 0; r < 6; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = zone.centerX + dx;
            const y = zone.centerY + dy;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            const t = map.tiles[y]?.[x];
            if (t?.object?.type === "town") return { x, y };
          }
        }
      }
      return { x: zone.centerX, y: zone.centerY };
    }
  }

  // 2) Fallback legacy : coins
  const margin = 3;
  const corners: Position[] = [
    { x: margin, y: margin },
    { x: width - margin - 1, y: margin },
    { x: margin, y: height - margin - 1 },
    { x: width - margin - 1, y: height - margin - 1 },
    { x: Math.floor(width / 2), y: margin },
    { x: Math.floor(width / 2), y: height - margin - 1 },
    { x: margin, y: Math.floor(height / 2) },
    { x: width - margin - 1, y: Math.floor(height / 2) },
  ];
  return corners[playerIndex % corners.length];
}

export function findPath(
  map: GameMap,
  start: Position,
  end: Position,
  maxMovement: number
): Position[] {
  const openSet: { pos: Position; g: number; f: number; path: Position[] }[] = [];
  const closedSet = new Set<string>();
  const bestCost = new Map<string, number>([[`${start.x},${start.y}`, 0]]);

  const heuristic = (a: Position, b: Position) => {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const diagonal = Math.min(dx, dy);
    const straight = Math.max(dx, dy) - diagonal;
    return diagonal * 70 + straight * 50;
  };

  openSet.push({
    pos: start,
    g: 0,
    f: heuristic(start, end),
    path: [start],
  });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;

    if (current.pos.x === end.x && current.pos.y === end.y) {
      return current.path;
    }

    const key = `${current.pos.x},${current.pos.y}`;
    if (current.g > (bestCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
    if (closedSet.has(key)) continue;
    closedSet.add(key);

    const neighbors = getAdventureNeighbors(current.pos);

    for (const neighbor of neighbors) {
      if (!isInsideMap(map, neighbor)) continue;
      if (!canMoveAdventureStep(map, current.pos, neighbor)) continue;

      const nKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(nKey)) continue;

      const g = current.g + getAdventureStepCost(map, current.pos, neighbor);
      if (g > maxMovement) continue;
      if (g >= (bestCost.get(nKey) ?? Number.POSITIVE_INFINITY)) continue;

      bestCost.set(nKey, g);
      const f = g + heuristic(neighbor, end);

      openSet.push({
        pos: neighbor,
        g,
        f,
        path: [...current.path, neighbor],
      });
    }
  }

  return [];
}

export function findPathToAdjacent(
  map: GameMap,
  start: Position,
  target: Position,
  maxMovement: number,
  blockedPositions: Position[] = [target]
): Position[] {
  if (!isInsideMap(map, start) || !isInsideMap(map, target)) return [];
  if (areAdventurePositionsAdjacent(start, target)) return [start];

  const blocked = toPositionKeySet(blockedPositions);
  const goals = new Set(
    getAdventureNeighbors(target)
      .filter((position) =>
        isInsideMap(map, position) &&
        !isBlockedPosition(position, blocked) &&
        isTileTraversable(map.tiles[position.y]?.[position.x])
      )
      .map(positionKey)
  );
  if (goals.size === 0) return [];

  const openSet: { pos: Position; g: number; f: number; path: Position[] }[] = [];
  const closedSet = new Set<string>();
  const bestCost = new Map<string, number>([[positionKey(start), 0]]);

  const heuristic = (a: Position) => {
    const dx = Math.max(0, Math.abs(a.x - target.x) - 1);
    const dy = Math.max(0, Math.abs(a.y - target.y) - 1);
    const diagonal = Math.min(dx, dy);
    const straight = Math.max(dx, dy) - diagonal;
    return diagonal * 70 + straight * 50;
  };

  openSet.push({
    pos: start,
    g: 0,
    f: heuristic(start),
    path: [start],
  });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    const key = positionKey(current.pos);

    if (goals.has(key)) return current.path;
    if (current.g > (bestCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
    if (closedSet.has(key)) continue;
    closedSet.add(key);

    for (const neighbor of getAdventureNeighbors(current.pos)) {
      if (!isInsideMap(map, neighbor)) continue;
      if (!canMoveAdventureStepAvoiding(map, current.pos, neighbor, blocked)) continue;

      const neighborKey = positionKey(neighbor);
      if (closedSet.has(neighborKey)) continue;

      const g = current.g + getAdventurePathCostAvoiding(map, [current.pos, neighbor], blockedPositions);
      if (g > maxMovement) continue;
      if (g >= (bestCost.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;

      bestCost.set(neighborKey, g);
      openSet.push({
        pos: neighbor,
        g,
        f: g + heuristic(neighbor),
        path: [...current.path, neighbor],
      });
    }
  }

  return [];
}

export function computeReachableTiles(
  map: GameMap,
  start: Position,
  maxMovement: number
): Set<string> {
  const reachable = new Set<string>([`${start.x},${start.y}`]);
  const bestCost = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
  const openSet: { pos: Position; cost: number }[] = [{ pos: start, cost: 0 }];

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.cost - b.cost);
    const current = openSet.shift()!;
    const currentKey = `${current.pos.x},${current.pos.y}`;
    if (current.cost > (bestCost.get(currentKey) ?? Number.POSITIVE_INFINITY)) continue;

    const neighbors = getAdventureNeighbors(current.pos);

    for (const neighbor of neighbors) {
      if (!isInsideMap(map, neighbor)) continue;
      if (!canMoveAdventureStep(map, current.pos, neighbor)) continue;

      const nextCost = current.cost + getAdventureStepCost(map, current.pos, neighbor);
      if (nextCost > maxMovement) continue;

      const neighborKey = `${neighbor.x},${neighbor.y}`;
      if (nextCost >= (bestCost.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;

      bestCost.set(neighborKey, nextCost);
      reachable.add(neighborKey);
      openSet.push({ pos: neighbor, cost: nextCost });
    }
  }

  return reachable;
}

export function calculateIncome(player: Player): Resources {
  let gold = 0;
  let wood = 0;
  let ore = 0;
  let mercury = 0;
  let crystals = 0;
  let gems = 0;
  let sulfur = 0;

  for (const town of player.towns) {
    gold += getTownGoldProduction(town.buildings);
    for (const building of town.buildings) {
      const rule = getFactionBuildingRule(town.townType ?? town.faction, building);
      gold += rule?.dailyProduction?.gold ?? 0;
      wood += rule?.dailyProduction?.wood ?? 0;
      ore += rule?.dailyProduction?.ore ?? 0;
      mercury += rule?.dailyProduction?.mercury ?? 0;
      crystals += rule?.dailyProduction?.crystals ?? 0;
      gems += rule?.dailyProduction?.gems ?? 0;
      sulfur += rule?.dailyProduction?.sulfur ?? 0;
    }
  }

  for (const building of player.resourceBuildings) {
    const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === building.type);
    if (rule && building.ownerId === player.id) {
      gold += rule.production.gold ?? 0;
      wood += rule.production.wood ?? 0;
      ore += rule.production.ore ?? 0;
      mercury += rule.production.mercury ?? 0;
      crystals += rule.production.crystals ?? 0;
      gems += rule.production.gems ?? 0;
      sulfur += rule.production.sulfur ?? 0;
    }
  }

  return { gold, wood, ore, mercury, crystals, gems, sulfur };
}

export function computeVisibleTiles(map: GameMap, centers: Position[], radius: number): Set<string> {
  const visible = new Set<string>();
  for (const center of centers) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
        if (Math.abs(dx) + Math.abs(dy) <= radius) {
          visible.add(`${x},${y}`);
        }
      }
    }
  }
  return visible;
}

export function getPlayerVisionCenters(player: { heroes: { position: Position }[]; towns: { position: Position }[] }): Position[] {
  return [
    ...player.heroes.map((h) => h.position),
    ...player.towns.map((town) => town.position),
  ];
}

export function processAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "END_TURN": {
      const alivePlayers = state.players.filter((player) => player.isAlive);
      if (alivePlayers.length === 0) return state;

      const currentAliveIndex = alivePlayers.findIndex(
        (p: Player) => p.id === state.currentTurnPlayerId
      );
      const nextIndex = (currentAliveIndex + 1) % alivePlayers.length;
      const didWrapTurn = nextIndex === 0;

      if (didWrapTurn) {
        return {
          ...state,
          turnNumber: state.turnNumber + 1,
          currentTurnPlayerId: alivePlayers[nextIndex].id,
          players: state.players.map((p: Player) => {
            if (!p.isAlive) return p;
            const income = calculateIncome(p);
            return {
              ...p,
              resources: {
                gold: p.resources.gold + income.gold,
                wood: p.resources.wood + income.wood,
                ore: p.resources.ore + income.ore,
                mercury: p.resources.mercury + income.mercury,
                crystals: p.resources.crystals + income.crystals,
                gems: p.resources.gems + income.gems,
                sulfur: p.resources.sulfur + income.sulfur,
              },
              heroes: p.heroes.map((h: Hero) => ({ ...h, movement: h.maxMovement })),
            };
          }),
        };
      }
      return {
        ...state,
        currentTurnPlayerId: alivePlayers[nextIndex].id,
      };
    }
    case "MOVE_HERO": {
      const players = state.players.map((p: Player) => {
        if (p.id !== state.currentTurnPlayerId) return p;
        return {
          ...p,
          heroes: p.heroes.map((h: Hero) => {
            if (h.id !== action.heroId) return h;
            const lastPos = action.path[action.path.length - 1];
            const usedMovement = getAdventurePathCost(state.map, action.path);
            return {
              ...h,
              position: lastPos,
              movement: getUsableAdventureMovement(state.map, lastPos, h.movement - usedMovement),
            };
          }),
        };
      });

      const currentPlayer = players.find((p: Player) => p.id === state.currentTurnPlayerId);
      if (currentPlayer) {
        const newVisible = computeVisibleTiles(state.map, getPlayerVisionCenters(currentPlayer), 5);
        const exploredSet = new Set(currentPlayer.exploredTiles);
        for (const key of newVisible) {
          exploredSet.add(key);
        }
        const playerIndex = players.findIndex((p: Player) => p.id === state.currentTurnPlayerId);
        players[playerIndex] = { ...players[playerIndex], exploredTiles: Array.from(exploredSet) };
      }

      return { ...state, players };
    }
    default:
      return state;
  }
}

export function initializeGameState(
  id: string,
  players: Player[],
  map: GameMap
): GameState {
  return {
    id,
    status: "ACTIVE",
    maxPlayers: players.length,
    players,
    map,
    turnNumber: 1,
    calendar: {
      dayNumber: 1,
      dayOfWeek: 1,
      weekNumber: 1,
      weekOfMonth: 1,
      monthNumber: 1,
      monthOfYear: 1,
      yearNumber: 1,
    },
    currentTurnPlayerId: players[0].id,
  };
}
