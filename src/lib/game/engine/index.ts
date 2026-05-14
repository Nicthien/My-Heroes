import {
  GameState,
  GameAction,
  Player,
  Hero,
  GameMap,
  MapTile,
  TerrainType,
  BuildingType,
  Position,
} from "../types";

import { RESOURCE_BUILDING_RULES } from "../economy";
import { makeRng, randomSeed, type RNG } from "./rng";
import { getTemplate, resolveTemplate, listTemplatesForPlayers } from "./template";
import { buildZoneGrid, generateZoneTerrain } from "./zones";
import { buildConnectionsAndWalls } from "./connections";
import { applyChokepointGuards, fillZone, placeTownInZone } from "./placement";
import { buildRoads, buildSecondaryRoads } from "./roads";
import { placeDecor } from "./decor";
import { NEUTRAL_CASTLE_VALUE } from "./value";
import { generateLandmass } from "./landmass";
import { carveHydrology } from "./hydrology";

function isPassable(terrain: TerrainType): boolean {
  return terrain !== TerrainType.LAVA;
}

function getMovementCost(terrain: TerrainType): number {
  switch (terrain) {
    case TerrainType.GRASS:
    case TerrainType.DIRT:
      return 1;
    case TerrainType.SAND:
    case TerrainType.FOREST:
      return 1.5;
    case TerrainType.SWAMP:
    case TerrainType.SNOW:
    case TerrainType.WATER:
      return 2;
    case TerrainType.MOUNTAIN:
      return 2.5;
    default:
      return 999;
  }
}

/** Coût de déplacement effectif d'une tile : les routes priment sur le terrain. */
export function effectiveMovementCost(tile: MapTile): number {
  if (!isTileTraversable(tile)) return 999;
  if (tile.road === "paved") return 0.75;
  if (tile.road === "dirt") return 1.0;
  return tile.movementCost;
}

export function isTileTraversable(tile: MapTile | undefined): boolean {
  return Boolean(tile && tile.isPassable && tile.object?.type !== "wall" && !tile.decor?.blocking);
}

export function normalizeMapMovement(map: GameMap): GameMap {
  for (const row of map.tiles) {
    for (const tile of row) {
      const blockedByObject = tile.object?.type === "wall";
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
        movementCost: 1,
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
  for (let zoneId = 0; zoneId < zoneGrid.meta.length; zoneId++) {
    const meta = zoneGrid.meta[zoneId];
    if (!meta.hasTown) continue;
    const placed = placeTownInZone(
      { tiles, zoneGrid, width, height, rng },
      zoneId,
      !!meta.townIsNeutral,
      meta.ownerIndex,
    );
    if (placed) townPositions.push({ x: placed.x, y: placed.y });
  }

  const miningPositions: Position[] = [];
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
    );
    for (const b of r.placedBuildings) miningPositions.push({ x: b.x, y: b.y });
  }

  // 4) Gardes des chokepoints
  applyChokepointGuards({ tiles, zoneGrid, width, height, rng }, chokepoints);

  // 5) Routes : pavées entre châteaux, dirt vers les mines
  buildRoads(tiles, width, height, townPositions, "paved");
  buildSecondaryRoads(tiles, width, height, townPositions, miningPositions, 10);

  // 6) Décor (passe finale)
  placeDecor(tiles, width, height, rng);

  // 7) Garantir que chaque chokepoint reste praticable même après décor
  for (const cp of chokepoints) {
    const t = tiles[cp.y][cp.x];
    if (t.decor?.blocking) t.decor = undefined;
    t.isPassable = true;
    t.movementCost = getMovementCost(t.terrain);
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

  const heuristic = (a: Position, b: Position) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

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
    if (closedSet.has(key)) continue;
    closedSet.add(key);

    const neighbors = [
      { x: current.pos.x + 1, y: current.pos.y },
      { x: current.pos.x - 1, y: current.pos.y },
      { x: current.pos.x, y: current.pos.y + 1 },
      { x: current.pos.x, y: current.pos.y - 1 },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.x < 0 ||
        neighbor.x >= map.width ||
        neighbor.y < 0 ||
        neighbor.y >= map.height
      )
        continue;

      const tile = map.tiles[neighbor.y][neighbor.x];
      if (!isTileTraversable(tile)) continue;

      const nKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(nKey)) continue;

      const g = current.g + effectiveMovementCost(tile);
      if (g > maxMovement) continue;

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

    const neighbors = [
      { x: current.pos.x + 1, y: current.pos.y },
      { x: current.pos.x - 1, y: current.pos.y },
      { x: current.pos.x, y: current.pos.y + 1 },
      { x: current.pos.x, y: current.pos.y - 1 },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.x < 0 ||
        neighbor.x >= map.width ||
        neighbor.y < 0 ||
        neighbor.y >= map.height
      ) {
        continue;
      }

      const tile = map.tiles[neighbor.y]?.[neighbor.x];
      if (!tile || !isTileTraversable(tile)) continue;

      const nextCost = current.cost + effectiveMovementCost(tile);
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

export function calculateIncome(player: Player): { gold: number; wood: number; ore: number; mercury: number; crystals: number; sulfur: number } {
  let gold = 500;
  let wood = 0;
  let ore = 0;
  let mercury = 0;
  let crystals = 0;
  let sulfur = 0;

  for (const town of player.towns) {
    gold += 500;
    if (town.buildings.includes("resource_silo" as BuildingType)) gold += 500;
    wood += 2;
    ore += 1;
  }

  for (const building of player.resourceBuildings) {
    const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === building.type);
    if (rule && building.ownerId === player.id) {
      gold += rule.production.gold ?? 0;
      wood += rule.production.wood ?? 0;
      ore += rule.production.ore ?? 0;
      mercury += rule.production.mercury ?? 0;
      crystals += rule.production.crystals ?? 0;
      sulfur += rule.production.sulfur ?? 0;
    }
  }

  return { gold, wood, ore, mercury, crystals, sulfur };
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
            const usedMovement = action.path.reduce((sum: number, _: Position, i: number) => {
              if (i === 0) return 0;
              return sum + state.map.tiles[action.path[i].y][action.path[i].x].movementCost;
            }, 0);
            return {
              ...h,
              position: lastPos,
              movement: Math.max(0, h.movement - usedMovement),
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
