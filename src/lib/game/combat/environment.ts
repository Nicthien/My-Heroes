import { CombatEnvironment, GameMap, Position, TerrainType } from "../types";

const FALLBACK_ENVIRONMENT: CombatEnvironment = {
  terrain: TerrainType.GRASS,
  elevation: 0,
  nearbyTerrains: {},
  hasNearbyWater: false,
  hasNearbyForest: false,
  hasNearbyMountain: false,
  theme: "grass",
};

export function buildCombatEnvironment(map: GameMap | null | undefined, position: Position | null | undefined): CombatEnvironment {
  const tile = position ? map?.tiles?.[position.y]?.[position.x] : undefined;
  if (!tile) return FALLBACK_ENVIRONMENT;

  const nearbyTerrains: Partial<Record<TerrainType, number>> = {};
  const neighbors = [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
    { x: tile.x + 1, y: tile.y - 1 },
    { x: tile.x - 1, y: tile.y + 1 },
  ];

  for (const neighbor of neighbors) {
    const terrain = map?.tiles?.[neighbor.y]?.[neighbor.x]?.terrain;
    if (!terrain) continue;
    nearbyTerrains[terrain] = (nearbyTerrains[terrain] ?? 0) + 1;
  }

  const hasNearbyWater = Boolean(nearbyTerrains[TerrainType.WATER]);
  const hasNearbyForest = Boolean(nearbyTerrains[TerrainType.FOREST]);
  const hasNearbyMountain = Boolean(nearbyTerrains[TerrainType.MOUNTAIN]);

  return {
    terrain: tile.terrain,
    elevation: tile.elevation,
    road: tile.road,
    objectType: tile.object?.type,
    objectSubtype: tile.object?.subtype,
    nearbyTerrains,
    hasNearbyWater,
    hasNearbyForest,
    hasNearbyMountain,
    theme: getCombatEnvironmentTheme({
      terrain: tile.terrain,
      road: tile.road,
      objectType: tile.object?.type,
      hasNearbyWater,
    }),
  };
}

function getCombatEnvironmentTheme(params: {
  terrain: TerrainType;
  road?: string;
  objectType?: string;
  hasNearbyWater: boolean;
}): CombatEnvironment["theme"] {
  if (params.objectType === "town" || params.objectType === "town_footprint") return "settlement";
  if (params.terrain === TerrainType.WATER) return "water";
  if (
    params.hasNearbyWater &&
    (params.terrain === TerrainType.GRASS || params.terrain === TerrainType.DIRT || params.terrain === TerrainType.SAND)
  ) {
    return "coast";
  }

  switch (params.terrain) {
    case TerrainType.FOREST:
      return "forest";
    case TerrainType.DIRT:
      return "dirt";
    case TerrainType.SAND:
      return "sand";
    case TerrainType.SNOW:
      return "snow";
    case TerrainType.SWAMP:
      return "swamp";
    case TerrainType.LAVA:
      return "lava";
    case TerrainType.MOUNTAIN:
      return "mountain";
    case TerrainType.GRASS:
    default:
      return "grass";
  }
}
