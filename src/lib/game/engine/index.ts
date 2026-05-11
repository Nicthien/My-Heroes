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
} from "../types";

function isPassable(terrain: TerrainType): boolean {
  return terrain !== TerrainType.WATER && terrain !== TerrainType.LAVA;
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
      return 2;
    case TerrainType.MOUNTAIN:
      return 2.5;
    default:
      return 999;
  }
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
  const mercury = 0;
  const crystals = 0;
  const sulfur = 0;

  for (const town of player.towns) {
    gold += 500;
    if (town.buildings.includes("resource_silo" as BuildingType)) gold += 500;
    wood += 2;
    ore += 1;
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
        const heroPositions = currentPlayer.heroes.map((h: Hero) => h.position);
        const newVisible = computeVisibleTiles(state.map, heroPositions, 5);
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
    players,
    map,
    turnNumber: 1,
    currentTurnPlayerId: players[0].id,
  };
}
