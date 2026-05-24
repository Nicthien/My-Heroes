import { AdventureBuildingType, MapTile, TerrainType } from "../types";
import { getAdventureBuildingLabel } from "../adventure-buildings";
import {
  CREATURE_BANK_DEFINITIONS,
  CREATURE_BANK_TYPES,
  CreatureBankType,
  getCreatureBankGuardPower,
} from "../creature-banks";
import { EXTERNAL_DWELLING_TYPE, getExternalDwellingLabel, pickExternalDwellingUnit } from "../external-dwellings";
import { PlacementContext } from "./placement";
import { shuffle } from "./rng";
import { tilesInZone } from "./zones";

type AdventurePlacement = {
  tile: MapTile;
  type: AdventureBuildingType | CreatureBankType;
};

type StargatePair = {
  a: MapTile;
  b: MapTile;
};

const WATER_ADVENTURE_TYPES = [
  AdventureBuildingType.MERMAID,
  AdventureBuildingType.BUOY,
  AdventureBuildingType.FLOTSAM,
  AdventureBuildingType.SEA_CHEST,
] as const;

export function placeAdventureBuildings(ctx: PlacementContext): void {
  const stargateCandidates: MapTile[] = [];

  for (let zoneId = 0; zoneId < ctx.zoneGrid.meta.length; zoneId++) {
    const meta = ctx.zoneGrid.meta[zoneId];
    const targetCount = adventureTargetForZone(meta.type, meta.value);
    const choices = pickAdventureTypesForZone(ctx, zoneId, targetCount);

    for (const type of choices) {
      const tile = findAdventureTile(ctx, zoneId, type);
      if (!tile) continue;
      placeAdventureBuilding(tile, type);
    }

    const stargateTile = findAdventureTile(ctx, zoneId, AdventureBuildingType.STARGATE);
    if (stargateTile) stargateCandidates.push(stargateTile);
  }

  placeStargatePairs(ctx, stargateCandidates);
  placeCreatureBanks(ctx);
  placeExternalDwellings(ctx);
  placeWaterAdventureObjects(ctx);
  placeWaterMonsterPatrols(ctx);
}

function adventureTargetForZone(type: string, value: number): number {
  if (value < 1800) return 0;
  if (type === "treasure") return value >= 6000 ? 5 : 3;
  if (type === "junction") return value >= 3600 ? 2 : 1;
  return value >= 4500 ? 3 : 2;
}

function pickAdventureTypesForZone(ctx: PlacementContext, zoneId: number, count: number): AdventureBuildingType[] {
  if (count <= 0) return [];
  const meta = ctx.zoneGrid.meta[zoneId];
  const base: AdventureBuildingType[] = [
    AdventureBuildingType.CAMPFIRE,
    AdventureBuildingType.OBSERVATORY,
    AdventureBuildingType.MERCENARY_CAMP,
    AdventureBuildingType.MARLETTO_TOWER,
    AdventureBuildingType.STAR_AXIS,
    AdventureBuildingType.GARDEN_OF_REVELATION,
    AdventureBuildingType.LEARNING_STONE,
    AdventureBuildingType.ARENA,
    AdventureBuildingType.SCHOOL_OF_WAR,
    AdventureBuildingType.SCHOOL_OF_MAGIC,
    AdventureBuildingType.MYSTICAL_GARDEN,
    AdventureBuildingType.REDWOOD_OBSERVATORY,
    AdventureBuildingType.STABLES,
    AdventureBuildingType.TEMPLE,
    AdventureBuildingType.FOUNTAIN_OF_FORTUNE,
    AdventureBuildingType.IDOL_OF_FORTUNE,
    AdventureBuildingType.MAGIC_WELL,
    AdventureBuildingType.MAGIC_SHRINE,
    AdventureBuildingType.WATER_MILL,
    AdventureBuildingType.WATER_WHEEL,
    AdventureBuildingType.ABANDONED_WAGON,
    AdventureBuildingType.CRATE,
    AdventureBuildingType.SKELETON,
    AdventureBuildingType.OBELISK,
    AdventureBuildingType.WARRIOR_TOMB,
    AdventureBuildingType.CURSED_ALTAR,
    AdventureBuildingType.SPELL_SHRINE_1,
    AdventureBuildingType.SPELL_SHRINE_2,
    AdventureBuildingType.TREE_OF_KNOWLEDGE,
    AdventureBuildingType.SEER_HUT,
    AdventureBuildingType.MERMAID,
    AdventureBuildingType.BUOY,
    AdventureBuildingType.FLOTSAM,
    AdventureBuildingType.SEA_CHEST,
  ];
  const treasureOnly = [
    AdventureBuildingType.LIGHTHOUSE,
    AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT,
    AdventureBuildingType.CARTOGRAPHER,
    AdventureBuildingType.SPELL_SHRINE_3,
  ];
  const pool = meta.type === "treasure" ? [...base, ...treasureOnly] : base;

  return pool
    .map((type) => {
      const terrainMatch = getAdventureBuildingPreferredTerrain(type).includes(meta.baseTerrain);
      const rarity = getAdventureBuildingRarity(type);
      const treasureBoost = meta.type === "treasure" && isRareAdventureBuilding(type) ? 1.5 : 1;
      return {
        type,
        score: (terrainMatch ? 2 : 0.7) * rarity * treasureBoost * (0.65 + ctx.rng() * 0.7),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.type);
}

function findAdventureTile(
  ctx: PlacementContext,
  zoneId: number,
  type: AdventureBuildingType,
): MapTile | null {
  const candidates = shuffle(ctx.rng, tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId));
  for (const roadBuffer of [1, 0]) {
    for (const pos of candidates) {
      const tile = ctx.tiles[pos.y][pos.x];
      if (!isValidAdventureTile(ctx, tile, type, roadBuffer)) continue;
      return tile;
    }
  }
  return null;
}

function placeStargatePairs(ctx: PlacementContext, candidates: MapTile[]): void {
  const shuffled = shuffle(ctx.rng, candidates).filter((tile) =>
    isValidAdventureTile(ctx, tile, AdventureBuildingType.STARGATE, 0)
  );
  const targetPairCount = Math.min(Math.floor(shuffled.length / 2), ctx.width >= 72 ? 2 : 1);
  const pairs = selectStargatePairs(ctx, shuffled, targetPairCount);

  for (const { a, b } of pairs) {
    const idA = `adv-stargate-${a.x}-${a.y}`;
    const idB = `adv-stargate-${b.x}-${b.y}`;
    placeAdventureBuilding(a, AdventureBuildingType.STARGATE, idA, idB);
    placeAdventureBuilding(b, AdventureBuildingType.STARGATE, idB, idA);
  }
}

function selectStargatePairs(ctx: PlacementContext, candidates: MapTile[], targetPairCount: number): StargatePair[] {
  const pairs: StargatePair[] = [];
  const selected: MapTile[] = [];
  const minDistance = getMinimumStargateDistance(ctx.width, ctx.height);

  for (let i = 0; i < candidates.length && pairs.length < targetPairCount; i++) {
    const a = candidates[i];
    if (isTooCloseToAny(a, selected, minDistance)) continue;

    const b = candidates
      .slice(i + 1)
      .filter((tile) =>
        stargateDistance(a, tile) >= minDistance &&
        !isTooCloseToAny(tile, selected, minDistance)
      )
      .sort((left, right) => stargateDistance(right, a) - stargateDistance(left, a))[0];

    if (!b) continue;
    pairs.push({ a, b });
    selected.push(a, b);
  }

  return pairs;
}

export function getMinimumStargateDistance(width: number, height: number): number {
  return Math.max(9, Math.floor(Math.min(width, height) * 0.25));
}

function isTooCloseToAny(tile: MapTile, selected: MapTile[], minDistance: number): boolean {
  return selected.some((other) => stargateDistance(tile, other) < minDistance);
}

function stargateDistance(a: MapTile, b: MapTile): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function placeAdventureBuilding(
  tile: MapTile,
  type: AdventureBuildingType | CreatureBankType,
  id = `adv-${type}-${tile.x}-${tile.y}`,
  targetId?: string,
  guardianPower?: number,
): AdventurePlacement {
  tile.object = {
    type: "adventure_building",
    id,
    subtype: type,
    name: getAdventureBuildingLabel(type),
    targetId,
    guardianPower,
  };
  return { tile, type };
}

function placeCreatureBanks(ctx: PlacementContext): void {
  for (let zoneId = 0; zoneId < ctx.zoneGrid.meta.length; zoneId++) {
    const meta = ctx.zoneGrid.meta[zoneId];
    const targetCount = creatureBankTargetForZone(meta.type, meta.value);
    if (targetCount <= 0) continue;

    const picks = pickCreatureBanksForZone(ctx, zoneId, targetCount);
    for (const type of picks) {
      const tile = findCreatureBankTile(ctx, zoneId, type);
      if (!tile) continue;
      const id = `creature-bank-${type}-${tile.x}-${tile.y}`;
      placeAdventureBuilding(tile, type, id, undefined, getCreatureBankGuardPower(type, id));
    }
  }
}

function placeExternalDwellings(ctx: PlacementContext): void {
  const seed = `${ctx.width}x${ctx.height}`;
  for (let zoneId = 0; zoneId < ctx.zoneGrid.meta.length; zoneId++) {
    const meta = ctx.zoneGrid.meta[zoneId];
    const targetCount = externalDwellingTargetForZone(meta.type, meta.value);
    if (targetCount <= 0) continue;

    for (let index = 0; index < targetCount; index++) {
      const tile = findExternalDwellingTile(ctx, zoneId);
      if (!tile) continue;
      const unitType = pickExternalDwellingUnit(tile, `${seed}:${zoneId}:${index}`, externalDwellingMaxTierForZone(meta.value));
      tile.object = {
        type: "adventure_building",
        id: `external-dwelling-${unitType}-${tile.x}-${tile.y}`,
        subtype: EXTERNAL_DWELLING_TYPE,
        name: getExternalDwellingLabel(unitType),
        targetId: unitType,
      };
    }
  }
}

function externalDwellingTargetForZone(type: string, value: number): number {
  if (value < 2600) return 0;
  if (type === "treasure") return value >= 7000 ? 2 : 1;
  if (type === "junction") return value >= 4200 ? 1 : 0;
  return value >= 5200 ? 1 : 0;
}

function externalDwellingMaxTierForZone(value: number): number {
  if (value >= 9000) return 6;
  if (value >= 7000) return 5;
  if (value >= 5200) return 4;
  if (value >= 3600) return 3;
  return 2;
}

function findExternalDwellingTile(ctx: PlacementContext, zoneId: number): MapTile | null {
  const candidates = shuffle(ctx.rng, tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId));
  for (const roadBuffer of [1, 0]) {
    for (const pos of candidates) {
      const tile = ctx.tiles[pos.y][pos.x];
      if (!isValidExternalDwellingTile(ctx, tile, roadBuffer)) continue;
      return tile;
    }
  }
  return null;
}

function creatureBankTargetForZone(type: string, value: number): number {
  if (value < 2200) return 0;
  if (type === "treasure") return value >= 8000 ? 4 : 3;
  if (type === "junction") return value >= 3200 ? 2 : 1;
  return value >= 4200 ? 2 : 1;
}

function pickCreatureBanksForZone(ctx: PlacementContext, zoneId: number, count: number): CreatureBankType[] {
  const meta = ctx.zoneGrid.meta[zoneId];
  return shuffle(ctx.rng, CREATURE_BANK_TYPES)
    .map((type) => {
      const definition = CREATURE_BANK_DEFINITIONS[type];
      const terrainMatch = definition.preferredTerrain.includes(meta.baseTerrain);
      return {
        type,
        score: (terrainMatch ? 2 : 0.65) * definition.rarity * (0.65 + ctx.rng() * 0.7),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.type);
}

function findCreatureBankTile(
  ctx: PlacementContext,
  zoneId: number,
  type: CreatureBankType,
): MapTile | null {
  const candidates = shuffle(ctx.rng, tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId));
  for (const roadBuffer of [2, 1, 0]) {
    for (const pos of candidates) {
      const tile = ctx.tiles[pos.y][pos.x];
      if (!isValidCreatureBankTile(ctx, tile, type, roadBuffer)) continue;
      return tile;
    }
  }
  return null;
}

function isValidCreatureBankTile(ctx: PlacementContext, tile: MapTile, type: CreatureBankType, roadBuffer: number): boolean {
  const definition = CREATURE_BANK_DEFINITIONS[type];
  if (tile.object || tile.decor || tile.road) return false;
  if (tile.terrain === TerrainType.LAVA && !definition.preferredTerrain.includes(TerrainType.LAVA)) return false;
  if (tile.terrain === TerrainType.WATER && !definition.aquatic) return false;
  if (tile.terrain !== TerrainType.WATER && (!tile.isPassable || tile.terrain === TerrainType.LAVA)) return false;
  if (!definition.preferredTerrain.includes(tile.terrain) && ctx.rng() > 0.28) return false;
  if (roadBuffer > 0 && hasRoadNearby(ctx, tile.x, tile.y, roadBuffer)) return false;
  if (hasMajorObjectNearby(ctx, tile.x, tile.y, 3)) return false;
  return true;
}

function isValidExternalDwellingTile(ctx: PlacementContext, tile: MapTile, roadBuffer: number): boolean {
  if (!tile.isPassable || tile.terrain === TerrainType.WATER || tile.terrain === TerrainType.LAVA) return false;
  if (tile.object || tile.decor || tile.road) return false;
  if (roadBuffer > 0 && hasRoadNearby(ctx, tile.x, tile.y, roadBuffer)) return false;
  if (hasMajorObjectNearby(ctx, tile.x, tile.y, 3)) return false;
  return true;
}

function isValidAdventureTile(ctx: PlacementContext, tile: MapTile, type: AdventureBuildingType, roadBuffer: number): boolean {
  const waterAdventure = isWaterAdventureBuilding(type);
  if (!tile.isPassable || tile.terrain === TerrainType.LAVA) return false;
  if (tile.terrain === TerrainType.WATER && !waterAdventure) return false;
  if (tile.terrain !== TerrainType.WATER && waterAdventure && !hasWaterNearby(ctx, tile.x, tile.y, 2)) return false;
  if (tile.object || tile.decor || tile.road) return false;
  if (roadBuffer > 0 && hasRoadNearby(ctx, tile.x, tile.y, roadBuffer)) return false;
  if (hasMajorObjectNearby(ctx, tile.x, tile.y, 2)) return false;
  if (type === AdventureBuildingType.LIGHTHOUSE && !hasWaterNearby(ctx, tile.x, tile.y, 3)) return false;
  if ((type === AdventureBuildingType.WATER_MILL || type === AdventureBuildingType.WATER_WHEEL) && !hasWaterNearby(ctx, tile.x, tile.y, 3)) return false;
  if (isCoastalAdventureBuilding(type) && !hasWaterNearby(ctx, tile.x, tile.y, 2)) return false;
  if (!getAdventureBuildingPreferredTerrain(type).includes(tile.terrain) && ctx.rng() > 0.32) return false;
  return true;
}

function getAdventureBuildingPreferredTerrain(type: AdventureBuildingType): TerrainType[] {
  switch (type) {
    case AdventureBuildingType.CAMPFIRE:
      return [TerrainType.GRASS, TerrainType.FOREST, TerrainType.DIRT, TerrainType.SWAMP];
    case AdventureBuildingType.OBSERVATORY:
      return [TerrainType.MOUNTAIN, TerrainType.GRASS, TerrainType.SNOW];
    case AdventureBuildingType.LIGHTHOUSE:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW];
    case AdventureBuildingType.STARGATE:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.MOUNTAIN];
    case AdventureBuildingType.MERCENARY_CAMP:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.FOREST];
    case AdventureBuildingType.MARLETTO_TOWER:
      return [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN];
    case AdventureBuildingType.STAR_AXIS:
      return [TerrainType.MOUNTAIN, TerrainType.SNOW, TerrainType.DIRT];
    case AdventureBuildingType.GARDEN_OF_REVELATION:
    case AdventureBuildingType.MYSTICAL_GARDEN:
    case AdventureBuildingType.REDWOOD_OBSERVATORY:
      return [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SWAMP];
    case AdventureBuildingType.LEARNING_STONE:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SNOW, TerrainType.MOUNTAIN];
    case AdventureBuildingType.SCHOOL_OF_WAR:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND];
    case AdventureBuildingType.SCHOOL_OF_MAGIC:
    case AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT:
      return [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN];
    case AdventureBuildingType.CARTOGRAPHER:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW];
    case AdventureBuildingType.STABLES:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND];
    case AdventureBuildingType.TEMPLE:
      return [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN];
    case AdventureBuildingType.FOUNTAIN_OF_FORTUNE:
      return [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SNOW];
    case AdventureBuildingType.IDOL_OF_FORTUNE:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SWAMP, TerrainType.MOUNTAIN];
    case AdventureBuildingType.MAGIC_WELL:
      return [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SNOW, TerrainType.SWAMP];
    case AdventureBuildingType.MAGIC_SHRINE:
      return [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN];
    case AdventureBuildingType.WATER_MILL:
    case AdventureBuildingType.WATER_WHEEL:
      return [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SWAMP];
    case AdventureBuildingType.ABANDONED_WAGON:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW];
    case AdventureBuildingType.CRATE:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.SWAMP];
    case AdventureBuildingType.SKELETON:
      return [TerrainType.DIRT, TerrainType.SAND, TerrainType.SWAMP, TerrainType.MOUNTAIN];
    case AdventureBuildingType.OBELISK:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.MOUNTAIN];
    case AdventureBuildingType.WARRIOR_TOMB:
      return [TerrainType.DIRT, TerrainType.SAND, TerrainType.SNOW, TerrainType.MOUNTAIN];
    case AdventureBuildingType.CURSED_ALTAR:
      return [TerrainType.DIRT, TerrainType.SWAMP, TerrainType.MOUNTAIN];
    case AdventureBuildingType.SPELL_SHRINE_1:
      return [TerrainType.GRASS, TerrainType.SNOW, TerrainType.MOUNTAIN];
    case AdventureBuildingType.SPELL_SHRINE_2:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.MOUNTAIN];
    case AdventureBuildingType.SPELL_SHRINE_3:
      return [TerrainType.SNOW, TerrainType.MOUNTAIN, TerrainType.SWAMP];
    case AdventureBuildingType.TREE_OF_KNOWLEDGE:
      return [TerrainType.GRASS, TerrainType.FOREST];
    case AdventureBuildingType.SEER_HUT:
      return [TerrainType.GRASS, TerrainType.FOREST, TerrainType.SWAMP];
    case AdventureBuildingType.MERMAID:
    case AdventureBuildingType.BUOY:
    case AdventureBuildingType.FLOTSAM:
    case AdventureBuildingType.SEA_CHEST:
      return [TerrainType.WATER, TerrainType.SAND, TerrainType.SWAMP, TerrainType.GRASS];
    default:
      return [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SNOW];
  }
}

function getAdventureBuildingRarity(type: AdventureBuildingType): number {
  if (type === AdventureBuildingType.CRATE) return 1.1;
  if (type === AdventureBuildingType.LEARNING_STONE) return 1;
  if (type === AdventureBuildingType.ABANDONED_WAGON) return 1;
  if (type === AdventureBuildingType.SKELETON) return 0.9;
  if (type === AdventureBuildingType.MERCENARY_CAMP) return 0.9;
  if (type === AdventureBuildingType.WATER_MILL) return 0.85;
  if (type === AdventureBuildingType.MARLETTO_TOWER) return 0.8;
  if (type === AdventureBuildingType.STABLES || type === AdventureBuildingType.MAGIC_WELL || type === AdventureBuildingType.WATER_WHEEL) return 0.8;
  if (type === AdventureBuildingType.STAR_AXIS || type === AdventureBuildingType.GARDEN_OF_REVELATION) return 0.75;
  if (type === AdventureBuildingType.TEMPLE || type === AdventureBuildingType.FOUNTAIN_OF_FORTUNE) return 0.7;
  if (type === AdventureBuildingType.SPELL_SHRINE_1 || type === AdventureBuildingType.SEA_CHEST) return 0.7;
  if (type === AdventureBuildingType.BUOY) return 0.65;
  if (type === AdventureBuildingType.MYSTICAL_GARDEN) return 0.65;
  if (type === AdventureBuildingType.WARRIOR_TOMB) return 0.65;
  if (type === AdventureBuildingType.SPELL_SHRINE_2 || type === AdventureBuildingType.SEER_HUT || type === AdventureBuildingType.MERMAID) return 0.55;
  if (type === AdventureBuildingType.MAGIC_SHRINE) return 0.55;
  if (type === AdventureBuildingType.ARENA) return 0.55;
  if (type === AdventureBuildingType.REDWOOD_OBSERVATORY) return 0.5;
  if (type === AdventureBuildingType.CURSED_ALTAR) return 0.5;
  if (type === AdventureBuildingType.TREE_OF_KNOWLEDGE) return 0.45;
  if (type === AdventureBuildingType.IDOL_OF_FORTUNE) return 0.45;
  if (type === AdventureBuildingType.SCHOOL_OF_WAR || type === AdventureBuildingType.SCHOOL_OF_MAGIC) return 0.45;
  if (type === AdventureBuildingType.SPELL_SHRINE_3) return 0.4;
  if (type === AdventureBuildingType.OBELISK) return 0.4;
  if (type === AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT || type === AdventureBuildingType.CARTOGRAPHER) return 0.25;
  return 0.8;
}

function isCoastalAdventureBuilding(type: AdventureBuildingType): boolean {
  return isWaterAdventureBuilding(type);
}

function isWaterAdventureBuilding(type: AdventureBuildingType): boolean {
  return (WATER_ADVENTURE_TYPES as readonly AdventureBuildingType[]).includes(type);
}

function isRareAdventureBuilding(type: AdventureBuildingType): boolean {
  return type === AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT ||
    type === AdventureBuildingType.CARTOGRAPHER ||
    type === AdventureBuildingType.OBELISK;
}

function hasRoadNearby(ctx: PlacementContext, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tile = ctx.tiles[y + dy]?.[x + dx];
      if (tile?.road) return true;
    }
  }
  return false;
}

function hasWaterNearby(ctx: PlacementContext, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tile = ctx.tiles[y + dy]?.[x + dx];
      if (tile?.terrain === TerrainType.WATER) return true;
    }
  }
  return false;
}

function hasMajorObjectNearby(ctx: PlacementContext, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tile = ctx.tiles[y + dy]?.[x + dx];
      if (!tile?.object) continue;
      if (tile.object.type !== "resource") return true;
    }
  }
  return false;
}

function placeWaterAdventureObjects(ctx: PlacementContext): void {
  for (let zoneId = 0; zoneId < ctx.zoneGrid.meta.length; zoneId++) {
    const meta = ctx.zoneGrid.meta[zoneId];
    const targetCount = waterAdventureTargetForZone(ctx, zoneId);
    if (targetCount <= 0) continue;

    const waterTypes = pickWaterAdventureTypes(ctx, targetCount);
    for (const type of waterTypes) {
      const tile = findWaterAdventureTile(ctx, zoneId, type);
      if (!tile) continue;
      placeAdventureBuilding(tile, type);
    }

    const bankCount = waterCreatureBankTargetForZone(meta.type, meta.value, targetCount);
    const bankPicks = pickWaterCreatureBanks(ctx, bankCount);
    for (const type of bankPicks) {
      const tile = findCreatureBankTile(ctx, zoneId, type);
      if (!tile) continue;
      const id = `creature-bank-${type}-${tile.x}-${tile.y}`;
      placeAdventureBuilding(tile, type, id, undefined, getCreatureBankGuardPower(type, id));
    }
  }
}

function waterAdventureTargetForZone(ctx: PlacementContext, zoneId: number): number {
  const waterTiles = tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
    .filter((position) => isFreeWaterTile(ctx.tiles[position.y][position.x]));
  if (waterTiles.length < 6) return 0;

  const meta = ctx.zoneGrid.meta[zoneId];
  const byWater = waterTiles.length >= 56 ? 3 : waterTiles.length >= 22 ? 2 : 1;
  return meta.type === "treasure" ? Math.min(4, byWater + 1) : byWater;
}

function pickWaterAdventureTypes(ctx: PlacementContext, count: number): AdventureBuildingType[] {
  return shuffle(ctx.rng, [...WATER_ADVENTURE_TYPES])
    .sort((left, right) => getAdventureBuildingRarity(right) - getAdventureBuildingRarity(left))
    .slice(0, count);
}

function findWaterAdventureTile(
  ctx: PlacementContext,
  zoneId: number,
  type: AdventureBuildingType,
): MapTile | null {
  const candidates = shuffle(ctx.rng, tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId));
  for (const pos of candidates) {
    const tile = ctx.tiles[pos.y][pos.x];
    if (!isValidAdventureTile(ctx, tile, type, 0)) continue;
    if (tile.terrain !== TerrainType.WATER) continue;
    return tile;
  }
  return null;
}

function waterCreatureBankTargetForZone(type: string, value: number, waterAdventureCount: number): number {
  if (waterAdventureCount <= 0 || value < 2600) return 0;
  if (type === "treasure") return value >= 8000 ? 2 : 1;
  if (type === "junction") return value >= 4200 ? 1 : 0;
  return value >= 5600 ? 1 : 0;
}

function pickWaterCreatureBanks(ctx: PlacementContext, count: number): CreatureBankType[] {
  if (count <= 0) return [];
  return shuffle(ctx.rng, CREATURE_BANK_TYPES)
    .filter((type) => CREATURE_BANK_DEFINITIONS[type].aquatic)
    .map((type) => ({
      type,
      score: CREATURE_BANK_DEFINITIONS[type].rarity * (0.65 + ctx.rng() * 0.7),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.type);
}

function placeWaterMonsterPatrols(ctx: PlacementContext): void {
  for (let zoneId = 0; zoneId < ctx.zoneGrid.meta.length; zoneId++) {
    const candidates = shuffle(ctx.rng, tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId))
      .map((position) => ctx.tiles[position.y][position.x])
      .filter((tile) =>
        isFreeWaterTile(tile) &&
        !hasMajorObjectNearby(ctx, tile.x, tile.y, 2) &&
        !hasRoadNearby(ctx, tile.x, tile.y, 1)
      );
    if (candidates.length < 8) continue;

    const meta = ctx.zoneGrid.meta[zoneId];
    const patrolCount = Math.min(meta.type === "treasure" ? 3 : 2, Math.floor(candidates.length / 18) + 1);
    const basePower = Math.max(220, Math.floor(meta.value * (meta.type === "treasure" ? 0.18 : 0.12)));
    for (const tile of candidates.slice(0, patrolCount)) {
      tile.object = {
        type: "monster",
        id: `sea-mon-patrol-${zoneId}-${tile.x}-${tile.y}`,
        subtype: "sea_patrol",
        guardianPower: basePower,
      };
    }
  }
}

function isFreeWaterTile(tile: MapTile): boolean {
  return tile.isPassable && !tile.worldEdge && tile.terrain === TerrainType.WATER && !tile.object && !tile.decor && !tile.road;
}
