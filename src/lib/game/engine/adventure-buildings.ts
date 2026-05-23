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
}

function adventureTargetForZone(type: string, value: number): number {
  if (value < 1800) return 0;
  if (type === "treasure") return value >= 6000 ? 3 : 2;
  if (type === "junction") return 1;
  return value >= 4500 ? 2 : 1;
}

function pickAdventureTypesForZone(ctx: PlacementContext, zoneId: number, count: number): AdventureBuildingType[] {
  if (count <= 0) return [];
  const meta = ctx.zoneGrid.meta[zoneId];
  const base: AdventureBuildingType[] = meta.type === "treasure"
    ? [AdventureBuildingType.CAMPFIRE, AdventureBuildingType.OBSERVATORY, AdventureBuildingType.LIGHTHOUSE]
    : [AdventureBuildingType.CAMPFIRE, AdventureBuildingType.OBSERVATORY];

  const out: AdventureBuildingType[] = [];
  for (const type of shuffle(ctx.rng, base)) {
    if (out.length >= count) break;
    out.push(type);
  }
  return out;
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
  if (type === "treasure") return value >= 8000 ? 3 : 2;
  if (type === "junction") return value >= 3200 ? 2 : 1;
  return value >= 4200 ? 1 : 0;
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
  if (!tile.isPassable || tile.terrain === TerrainType.WATER || tile.terrain === TerrainType.LAVA) return false;
  if (tile.object || tile.decor || tile.road) return false;
  if (roadBuffer > 0 && hasRoadNearby(ctx, tile.x, tile.y, roadBuffer)) return false;
  if (hasMajorObjectNearby(ctx, tile.x, tile.y, 2)) return false;
  if (type === AdventureBuildingType.LIGHTHOUSE && !hasWaterNearby(ctx, tile.x, tile.y, 3)) return false;
  return true;
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
