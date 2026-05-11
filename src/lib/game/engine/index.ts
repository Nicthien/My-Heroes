import { createNoise2D } from "simplex-noise";
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
  MapObject,
  ResourceBuildingType,
} from "../types";

import { RESOURCE_BUILDING_RULES } from "../economy";

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

export function normalizeMapMovement(map: GameMap): GameMap {
  for (const row of map.tiles) {
    for (const tile of row) {
      tile.isPassable = isPassable(tile.terrain);
      tile.movementCost = getMovementCost(tile.terrain);
    }
  }

  return map;
}

export function generateMap(width: number, height: number): GameMap {
  const noise2D = createNoise2D(() => Math.random());
  const elevationNoise = (x: number, y: number) => (noise2D(x, y) + 1) / 2;
  const moistureNoise = (x: number, y: number) => (noise2D(x + 1000, y + 1000) + 1) / 2;
  const riverNoise = (x: number, y: number) => (noise2D(x * 2 + 500, y * 2 + 500) + 1) / 2;

  const scale = 0.04; // Fréquence des biomes

  const tiles: MapTile[][] = [];

  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const e =
        elevationNoise(x * scale, y * scale) * 0.6 +
        elevationNoise(x * scale * 2, y * scale * 2) * 0.3 +
        elevationNoise(x * scale * 4, y * scale * 4) * 0.1;

      const m =
        moistureNoise(x * scale * 1.2, y * scale * 1.2) * 0.6 +
        moistureNoise(x * scale * 3, y * scale * 3) * 0.4;

      const river = Math.abs(riverNoise(x * scale * 3, y * scale * 3) - 0.5);

      let terrain: TerrainType;
      let elevation = 0;

      if (river < 0.02 && e > 0.25) {
        terrain = TerrainType.WATER;
        elevation = -1;
      } else if (e < 0.30) {
        terrain = TerrainType.WATER;
        elevation = -2;
      } else if (e < 0.36) {
        terrain = TerrainType.SAND;
        elevation = 0;
      } else if (e < 0.65) {
        if (m < 0.25) {
          terrain = TerrainType.DIRT;
          elevation = 0;
        } else if (m > 0.7) {
          terrain = TerrainType.SWAMP;
          elevation = 0;
        } else {
          terrain = TerrainType.GRASS;
          elevation = 0;
        }
      } else if (e < 0.78) {
        if (m > 0.6) {
          terrain = TerrainType.FOREST;
          elevation = 1;
        } else {
          terrain = TerrainType.GRASS;
          elevation = 1;
        }
      } else if (e < 0.88) {
        terrain = TerrainType.MOUNTAIN;
        elevation = 3;
      } else if (e < 0.95) {
        terrain = TerrainType.SNOW;
        elevation = 4;
      } else {
        terrain = TerrainType.LAVA;
        elevation = 2;
      }

      tiles[y][x] = {
        x,
        y,
        terrain,
        elevation,
        isPassable: isPassable(terrain),
        movementCost: getMovementCost(terrain),
      };
    }
  }

  ensureLandCorners(tiles, width, height);
  placeResources(tiles, width, height, noise2D);

  return { width, height, tiles };
}

function ensureLandCorners(tiles: MapTile[][], width: number, height: number) {
  const cornerSize = 7;
  const corners = [
    { sx: 0, sy: 0 },
    { sx: width - cornerSize, sy: 0 },
    { sx: 0, sy: height - cornerSize },
    { sx: width - cornerSize, sy: height - cornerSize },
  ];

  for (const corner of corners) {
    for (let y = corner.sy; y < corner.sy + cornerSize && y < height; y++) {
      for (let x = corner.sx; x < corner.sx + cornerSize && x < width; x++) {
        if (tiles[y][x].terrain === TerrainType.WATER) {
          tiles[y][x] = {
            ...tiles[y][x],
            terrain: TerrainType.GRASS,
            elevation: 0,
            isPassable: true,
            movementCost: 1,
          };
        }
      }
    }
  }
}

function placeResources(
  tiles: MapTile[][],
  width: number,
  height: number,
  noise2D: (x: number, y: number) => number
) {
  const resourceNoise = (x: number, y: number) =>
    (noise2D(x * 0.08 + 2000, y * 0.08 + 2000) + 1) / 2;

  const resourceTypes: MapObject["subtype"][] = [
    "gold",
    "wood",
    "ore",
    "mercury",
    "crystals",
    "sulfur",
  ];

  const buildingTypes: { type: ResourceBuildingType; preferredTerrain: TerrainType[] }[] = [
    { type: ResourceBuildingType.GOLD_MINE, preferredTerrain: [TerrainType.MOUNTAIN, TerrainType.GRASS] },
    { type: ResourceBuildingType.SAWMILL, preferredTerrain: [TerrainType.FOREST, TerrainType.GRASS] },
    { type: ResourceBuildingType.ORE_PIT, preferredTerrain: [TerrainType.MOUNTAIN, TerrainType.GRASS] },
    { type: ResourceBuildingType.ALCHEMIST_LAB, preferredTerrain: [TerrainType.SNOW, TerrainType.MOUNTAIN, TerrainType.GRASS] },
    { type: ResourceBuildingType.CRYSTAL_CAVERN, preferredTerrain: [TerrainType.MOUNTAIN, TerrainType.SNOW, TerrainType.GRASS] },
    { type: ResourceBuildingType.SULFUR_DUNE, preferredTerrain: [TerrainType.SAND, TerrainType.GRASS, TerrainType.LAVA] },
  ];

  const cornerSize = 7;
  const margin = 5;
  const startAnchors: Position[] = [
    { x: 3, y: 3 },
    { x: width - 4, y: 3 },
    { x: 3, y: height - 4 },
    { x: width - 4, y: height - 4 },
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      if (!tile.isPassable) continue;
      if (tile.object) continue;

      const val = resourceNoise(x, y);
      if (val > 0.88) {
        const subtype = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
        tile.object = {
          type: "resource",
          id: `res-${x}-${y}`,
          subtype,
        };
      } else if (val > 0.84 && Math.random() > 0.7) {
        tile.object = {
          type: "monster",
          id: `mon-${x}-${y}`,
          subtype: "neutral",
        };
      }
    }
  }

  for (const buildingDef of buildingTypes) {
    const count = 2 + Math.floor(Math.random() * 2);
    const candidates: { x: number; y: number; startDistance: number; terrainPenalty: number }[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (!tile.isPassable || tile.object) continue;
        if (x < margin || x >= width - margin || y < margin || y >= height - margin) continue;

        const inCorner =
          (x < cornerSize && y < cornerSize) ||
          (x >= width - cornerSize && y < cornerSize) ||
          (x < cornerSize && y >= height - cornerSize) ||
          (x >= width - cornerSize && y >= height - cornerSize);
        if (inCorner) continue;

        const terrainPenalty = buildingDef.preferredTerrain.includes(tile.terrain) ? 0 : 6;
        const startDistance = Math.min(
          ...startAnchors.map((start) => Math.abs(x - start.x) + Math.abs(y - start.y))
        );
        candidates.push({ x, y, startDistance, terrainPenalty });
      }
    }

    const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === buildingDef.type);
    const basePower = rule?.guardianBasePower ?? 200;
    const maxStartDistance = Math.max(1, Math.floor((width + height) / 2));

    let placed = 0;
    for (let targetIndex = 0; targetIndex < count; targetIndex++) {
      if (placed >= count) break;

      const targetDistance = count === 1
        ? maxStartDistance * 0.45
        : maxStartDistance * (0.22 + (targetIndex / Math.max(1, count - 1)) * 0.56);

      const orderedCandidates = [...candidates].sort((a, b) => {
        const aScore = Math.abs(a.startDistance - targetDistance) + a.terrainPenalty;
        const bScore = Math.abs(b.startDistance - targetDistance) + b.terrainPenalty;
        return aScore - bScore;
      });

      for (const candidate of orderedCandidates) {
        if (placed > targetIndex) break;

        const tile = tiles[candidate.y][candidate.x];
        if (tile.object) continue;

        const tooClose = checkBuildingProximity(tiles, width, height, candidate.x, candidate.y, 5);
        if (tooClose) continue;

        const distFactor = Math.min(1, candidate.startDistance / maxStartDistance);
        // Near starts: ~10% of base power (weak); far from starts: ~200% (very strong)
        const guardianPower = Math.max(30, Math.floor(basePower * (0.1 + distFactor * 1.9)));

        tile.object = {
          type: "building",
          id: `bld-${buildingDef.type}-${candidate.x}-${candidate.y}`,
          subtype: buildingDef.type,
          guardianPower,
        };
        placed++;
      }
    }
  }
}

function checkBuildingProximity(
  tiles: MapTile[][],
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const tile = tiles[ny][nx];
      if (tile.object?.type === "building") return true;
    }
  }
  return false;
}

export function placePlayerStart(mapData: GameMap | Record<string, unknown>, playerIndex: number): Position {
  const width = (mapData as GameMap).width || (mapData as Record<string, unknown>).width as number || 36;
  const height = (mapData as GameMap).height || (mapData as Record<string, unknown>).height as number || 36;
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
      if (!tile.isPassable) continue;

      const nKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(nKey)) continue;

      const g = current.g + tile.movementCost;
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
