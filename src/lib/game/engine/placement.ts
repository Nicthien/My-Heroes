import { GameMap, MapTile, Position, ResourceBuildingType, TerrainType, ZoneMeta } from "../types";
import { ARTIFACT_GUARDIAN_POWER, type ArtifactClass, pickArtifactId } from "../artifacts";
import { ZoneGrid, tilesInZone } from "./zones";
import {
  BUILDING_SPECS,
  BuildingSpec,
  ObjectSpec,
  PileSpec,
  ResourceSubtype,
  buildingSpec,
  makePileSpec,
} from "./value";
import { RNG, makeRng, randInt, shuffle, weightedPick } from "./rng";
import { DEFAULT_RMG_TUNING, RmgTuning, tuningPercentToMultiplier } from "./rmg-tuning";
import { Chokepoint } from "./connections";
import { GUARD_MULTIPLIER, MONSTER_STRENGTH_MULTIPLIER } from "./template";

const TOWN_FOOTPRINT_OFFSETS = [
  { x: -1, y: -2 },
  { x: 0, y: -2 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
] as const;

const STARTING_MINE_SPECS = [
  {
    type: ResourceBuildingType.SAWMILL,
    role: "start_wood",
    minDistance: 2,
    idealDistance: 3,
    maxDistance: 4,
    guardianPower: 180,
  },
  {
    type: ResourceBuildingType.ORE_PIT,
    role: "start_ore",
    minDistance: 3,
    idealDistance: 4,
    maxDistance: 4,
    guardianPower: 220,
  },
  {
    type: ResourceBuildingType.GOLD_MINE,
    role: "start_gold",
    minDistance: 10,
    idealDistance: 13,
    maxDistance: 20,
    guardianPower: 760,
  },
  {
    type: ResourceBuildingType.CRYSTAL_CAVERN,
    role: "start_rare",
    minDistance: 11,
    idealDistance: 14,
    maxDistance: 21,
    guardianPower: 1350,
  },
] as const;

const ZONE_RESOURCE_BUDGET_MULTIPLIER = 1.9;
const RESOURCE_TOWN_EXCLUSION_RADIUS = 4;

export interface PlacementContext {
  tiles: MapTile[][];
  zoneGrid: ZoneGrid;
  width: number;
  height: number;
  rng: RNG;
}

/** Tirage pondéré d'un objet à placer dans une zone. */
function pickObject(rng: RNG, terrainBias: TerrainType, buildingMultiplier: number): ObjectSpec {
  const buildings = BUILDING_SPECS.map((b) => ({
    value: b as ObjectSpec,
    weight: b.preferredTerrain.includes(terrainBias) ? 1 : 0.4,
  }));
  const piles: { value: ObjectSpec; weight: number }[] = (
    ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"] as ResourceSubtype[]
  ).map((s) => ({ value: makePileSpec(s), weight: s === "gold" ? 5 : 3 }));

  // Buildings rares mais existants, piles fréquentes
  const choices: { value: ObjectSpec; weight: number }[] = [
    ...buildings.map((b) => ({ value: b.value, weight: b.weight * 1.2 * buildingMultiplier })),
    ...piles,
  ];
  return weightedPick(rng, choices);
}

function pickLooseResourceSubtype(rng: RNG, terrainBias: TerrainType): ResourceSubtype {
  const terrainWeights: Record<ResourceSubtype, number> = {
    gold: terrainBias === TerrainType.MOUNTAIN ? 5 : 4,
    wood: terrainBias === TerrainType.FOREST ? 5 : 3,
    ore: terrainBias === TerrainType.MOUNTAIN ? 5 : 3,
    mercury: terrainBias === TerrainType.SNOW ? 3 : 2,
    crystals: terrainBias === TerrainType.MOUNTAIN || terrainBias === TerrainType.SNOW ? 3 : 2,
    gems: terrainBias === TerrainType.SNOW || terrainBias === TerrainType.GRASS ? 3 : 2,
    sulfur: terrainBias === TerrainType.SAND || terrainBias === TerrainType.LAVA ? 3 : 2,
  };

  return weightedPick(
    rng,
    (["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"] as ResourceSubtype[]).map((subtype) => ({
      value: subtype,
      weight: terrainWeights[subtype],
    })),
  );
}

function isTileFree(tile: MapTile): boolean {
  return tile.isPassable && !tile.worldEdge && tile.terrain !== TerrainType.WATER && !tile.object && !tile.decor;
}

function hasMajorObjectNearby(
  ctx: PlacementContext,
  x: number,
  y: number,
  radius: number,
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
      const t = ctx.tiles[ny][nx];
      if (t.object?.type === "building" || t.object?.type === "town" || t.object?.type === "town_footprint") return true;
    }
  }
  return false;
}

function distanceToNearestTown(ctx: PlacementContext, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const row of ctx.tiles) {
    for (const tile of row) {
      if (tile.object?.type !== "town" && tile.object?.type !== "town_footprint") continue;
      best = Math.min(best, Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y)));
    }
  }
  return best;
}

function isTooCloseToTown(ctx: PlacementContext, x: number, y: number, radius: number): boolean {
  return distanceToNearestTown(ctx, x, y) <= radius;
}

function buildingTargetForBudget(budget: number, zoneType: string): number {
  if (budget < 1500) return 0;
  const cap = zoneType === "treasure" ? 14 : zoneType === "junction" ? 12 : 8;
  const divisor = zoneType === "treasure" ? 2400 : zoneType === "junction" ? 2600 : 3000;
  return Math.min(cap, Math.max(1, Math.floor(budget / divisor)));
}

function resourcePileTargetForBudget(budget: number, zoneType: string): number {
  if (budget < 1000) return 0;
  const cap = zoneType === "treasure" ? 18 : zoneType === "junction" ? 14 : 10;
  const divisor = zoneType === "treasure" || zoneType === "junction" ? 900 : 1300;
  return Math.min(cap, Math.max(2, Math.floor(budget / divisor)));
}

function resourceClusterCount(rng: RNG, spec: BuildingSpec): number {
  const [minC, maxC] = spec.clusterCount;
  return randInt(rng, minC, maxC);
}

function placePile(ctx: PlacementContext, tile: MapTile, pile: PileSpec): void {
  tile.object = {
    type: "resource",
    id: `res-${pile.subtype}-${tile.x}-${tile.y}`,
    subtype: pile.subtype,
    amount: pile.amount,
  };
}

function placeBuilding(
  ctx: PlacementContext,
  tile: MapTile,
  spec: BuildingSpec,
  guardianPower: number,
  metadata: Pick<NonNullable<MapTile["object"]>, "ownerIndex" | "strategicRole"> = {},
): void {
  tile.object = {
    type: "building",
    id: `bld-${spec.buildingType}-${tile.x}-${tile.y}`,
    subtype: spec.buildingType,
    guardianPower,
    ...metadata,
  };
}

function hasFreeAdjacentTileForMine(ctx: PlacementContext, x: number, y: number, zoneId: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
      if (ctx.zoneGrid.tilesZone[ny][nx] !== zoneId) continue;
      if (isTileFree(ctx.tiles[ny][nx])) return true;
    }
  }
  return false;
}

function hasAdjacentResourcePile(ctx: PlacementContext, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (ctx.tiles[y + dy]?.[x + dx]?.object?.type === "resource") return true;
    }
  }
  return false;
}

/** Crée le château (joueur ou neutre) au centre d'une zone si demandé par le template. */
function adjacentFreeTiles(
  ctx: PlacementContext,
  x: number,
  y: number,
  zoneId: number,
): MapTile[] {
  const out: MapTile[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
      if (ctx.zoneGrid.tilesZone[ny][nx] !== zoneId) continue;
      const tile = ctx.tiles[ny][nx];
      if (isTileFree(tile)) out.push(tile);
    }
  }
  return out;
}

function placeMineResourceCluster(
  ctx: PlacementContext,
  x: number,
  y: number,
  zoneId: number,
  spec: BuildingSpec,
  placedPiles?: ZoneFillResult["placedPiles"],
): void {
  const target = resourceClusterCount(ctx.rng, spec);
  if (target <= 0) return;

  const candidates = shuffle(ctx.rng, adjacentFreeTiles(ctx, x, y, zoneId));
  const preferred = candidates.filter((tile) => !isTooCloseToTown(ctx, tile.x, tile.y, RESOURCE_TOWN_EXCLUSION_RADIUS));
  const picks = (preferred.length >= target ? preferred : candidates)
    .sort((a, b) => distanceToNearestTown(ctx, b.x, b.y) - distanceToNearestTown(ctx, a.x, a.y))
    .slice(0, target);

  for (const tile of picks) {
    const pile = makePileSpec(spec.clusterResource);
    placePile(ctx, tile, pile);
    placedPiles?.push({ x: tile.x, y: tile.y, pile });
  }
}

export function placeTownInZone(
  ctx: PlacementContext,
  zoneId: number,
  isNeutral: boolean,
  ownerIndex: number | undefined,
): MapTile | null {
  const meta = ctx.zoneGrid.meta[zoneId];
  // Trouver tile passable au plus près du centre
  const candidates = tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
    .filter((p) => canPlaceTownAtDoor(ctx, zoneId, p.x, p.y))
    .sort(
      (a, b) =>
        (a.x - meta.centerX) ** 2 +
        (a.y - meta.centerY) ** 2 -
        ((b.x - meta.centerX) ** 2 + (b.y - meta.centerY) ** 2),
    );
  if (candidates.length === 0) return null;
  const c = candidates[0];
  const tile = ctx.tiles[c.y][c.x];
  const townId = isNeutral
    ? `neutral-town-${meta.templateZoneId}-${c.x}-${c.y}`
    : `player-town-${ownerIndex}-${c.x}-${c.y}`;

  for (const [index, offset] of TOWN_FOOTPRINT_OFFSETS.entries()) {
    const footprint = ctx.tiles[c.y + offset.y][c.x + offset.x];
    footprint.terrain = downgradeWildTerrain(footprint.terrain);
    footprint.movementCost = 999;
    footprint.elevation = 0;
    footprint.isPassable = false;
    footprint.object = {
      type: "town_footprint",
      id: `${townId}-footprint-${index}`,
      subtype: isNeutral ? "neutral" : `player-${ownerIndex}`,
      targetId: townId,
    };
  }

  // Force tile passable (mais on n'a déjà gardé que les passable)
  tile.terrain = downgradeWildTerrain(tile.terrain);
  tile.movementCost = 100;
  tile.elevation = 0;
  tile.isPassable = true;
  tile.object = {
    type: "town",
    id: townId,
    subtype: isNeutral ? "neutral" : `player-${ownerIndex}`,
  };
  return tile;
}

export interface StartingEconomyPlacement {
  x: number;
  y: number;
  spec: BuildingSpec;
  role: NonNullable<NonNullable<MapTile["object"]>["strategicRole"]>;
}

export function placeStartingEconomy(
  ctx: PlacementContext,
  zoneId: number,
  town: Position,
  ownerIndex: number,
): StartingEconomyPlacement[] {
  const placed: StartingEconomyPlacement[] = [];

  for (const entry of STARTING_MINE_SPECS) {
    const spec = buildingSpec(entry.type);
    const tile = findStartingMineTile(ctx, zoneId, town, spec, entry, placed);
    if (!tile) continue;

    prepareStartingMineTile(tile);
    placeBuilding(ctx, tile, spec, entry.guardianPower, {
      ownerIndex,
      strategicRole: entry.role,
    });
    placeMineResourceCluster(ctx, tile.x, tile.y, zoneId, spec);
    placed.push({ x: tile.x, y: tile.y, spec, role: entry.role });
  }

  enforceStartingMineStrategicOrder(ctx, town, placed);
  return placed;
}

function enforceStartingMineStrategicOrder(
  ctx: PlacementContext,
  town: Position,
  placed: StartingEconomyPlacement[],
): void {
  const gold = placed.find((item) => item.role === "start_gold");
  if (!gold) return;

  const goldDistance = chebyshevDistance(town, gold);
  const farthestPrimary = placed
    .filter((item) => item.role === "start_wood" || item.role === "start_ore")
    .sort((a, b) => chebyshevDistance(town, b) - chebyshevDistance(town, a))[0];
  if (!farthestPrimary || chebyshevDistance(town, farthestPrimary) <= goldDistance) return;

  swapStartingMineObjects(ctx, gold, farthestPrimary);
  const goldSpec = gold.spec;
  const goldRole = gold.role;
  gold.spec = farthestPrimary.spec;
  gold.role = farthestPrimary.role;
  farthestPrimary.spec = goldSpec;
  farthestPrimary.role = goldRole;
}

function swapStartingMineObjects(
  ctx: PlacementContext,
  a: StartingEconomyPlacement,
  b: StartingEconomyPlacement,
): void {
  const tileA = ctx.tiles[a.y]?.[a.x];
  const tileB = ctx.tiles[b.y]?.[b.x];
  if (!tileA?.object || !tileB?.object) return;

  const objectA = { ...tileA.object };
  const objectB = { ...tileB.object };
  tileA.object = {
    ...objectB,
    id: `bld-${objectB.subtype}-${tileA.x}-${tileA.y}`,
  };
  tileB.object = {
    ...objectA,
    id: `bld-${objectA.subtype}-${tileB.x}-${tileB.y}`,
  };
}

function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

type StartingMineRole = NonNullable<NonNullable<MapTile["object"]>["strategicRole"]>;

export interface StartingEconomyRepair {
  ownerIndex: number;
  zoneId: number;
  mapLevel: string;
  role: StartingMineRole;
  buildingType: ResourceBuildingType;
  x: number | null;
  y: number | null;
  /** false when even the relaxed fallback found no placeable tile in the zone. */
  resolved: boolean;
}

interface RepairLayer {
  tiles: MapTile[][];
  zones: ZoneMeta[];
  width: number;
  height: number;
  mapLevel: string;
}

/**
 * Safety net run once at game start, after every player's faction is known.
 *
 * `placeStartingEconomy` guarantees one mine of each `STARTING_MINE_SPECS` role
 * per player zone at generation time, but a cramped or over-filled zone can make
 * it skip a mine (`if (!tile) continue`). Maps are generated before players join,
 * so this re-checks each player's home zone right before the game turns ACTIVE
 * and forces any missing mine back onto the map — constrained to that player's
 * zone, reusing the same placement logic as generation.
 *
 * Mutates `map` in place (like `finalizeStartingRareMines`) and returns the list
 * of mines it had to re-add. Re-added rare mines keep the generic `start_rare`
 * role/`CRYSTAL_CAVERN` type; call `finalizeStartingRareMines` afterwards to swap
 * their subtype to the owner faction's rare resource.
 */
export function repairStartingEconomy(map: GameMap): StartingEconomyRepair[] {
  const repairs: StartingEconomyRepair[] = [];
  for (const layer of collectRepairLayers(map)) {
    repairLayerStartingEconomy(map.seed ?? "", layer, repairs);
  }
  return repairs;
}

function collectRepairLayers(map: GameMap): RepairLayer[] {
  const levels = map.levels;
  if (levels && Object.keys(levels).length > 0) {
    const layers: RepairLayer[] = [];
    for (const [mapLevel, layer] of Object.entries(levels)) {
      if (!layer) continue;
      layers.push({
        tiles: layer.tiles,
        zones: layer.zones ?? [],
        width: layer.width,
        height: layer.height,
        mapLevel,
      });
    }
    return layers;
  }
  return [{ tiles: map.tiles, zones: map.zones ?? [], width: map.width, height: map.height, mapLevel: "surface" }];
}

function repairLayerStartingEconomy(seed: string, layer: RepairLayer, out: StartingEconomyRepair[]): void {
  const ctx = reconstructPlacementContext(seed, layer);

  for (const town of findPlayerTowns(layer)) {
    const placed = collectExistingStartingMines(layer, town.ownerIndex);
    const presentRoles = new Set(placed.map((item) => item.role));

    for (const entry of STARTING_MINE_SPECS) {
      if (presentRoles.has(entry.role)) continue;

      const spec = buildingSpec(entry.type);
      const tile = findStartingMineTile(ctx, town.zoneId, town.position, spec, entry, placed);
      if (!tile) {
        out.push({
          ownerIndex: town.ownerIndex,
          zoneId: town.zoneId,
          mapLevel: layer.mapLevel,
          role: entry.role,
          buildingType: entry.type,
          x: null,
          y: null,
          resolved: false,
        });
        continue;
      }

      prepareStartingMineTile(tile);
      placeBuilding(ctx, tile, spec, entry.guardianPower, {
        ownerIndex: town.ownerIndex,
        strategicRole: entry.role,
      });
      placeMineResourceCluster(ctx, tile.x, tile.y, town.zoneId, spec);
      placed.push({ x: tile.x, y: tile.y, spec, role: entry.role });
      out.push({
        ownerIndex: town.ownerIndex,
        zoneId: town.zoneId,
        mapLevel: layer.mapLevel,
        role: entry.role,
        buildingType: entry.type,
        x: tile.x,
        y: tile.y,
        resolved: true,
      });
    }
  }
}

/** Rebuild a placement context from a persisted layer (per-tile `zoneId` survives serialization). */
function reconstructPlacementContext(seed: string, layer: RepairLayer): PlacementContext {
  const tilesZone: number[][] = [];
  for (let y = 0; y < layer.height; y++) {
    tilesZone[y] = [];
    for (let x = 0; x < layer.width; x++) {
      tilesZone[y][x] = layer.tiles[y]?.[x]?.zoneId ?? -1;
    }
  }
  const meta: ZoneMeta[] = [];
  for (const zone of layer.zones) meta[zone.id] = zone;

  return {
    tiles: layer.tiles,
    zoneGrid: { tilesZone, meta },
    width: layer.width,
    height: layer.height,
    // Deterministic per (map seed, level) so repeated starts repair identically.
    rng: makeRng(`${seed}:economy-repair:${layer.mapLevel}`),
  };
}

function findPlayerTowns(layer: RepairLayer): Array<{ ownerIndex: number; zoneId: number; position: Position }> {
  const towns: Array<{ ownerIndex: number; zoneId: number; position: Position }> = [];
  for (const row of layer.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (object?.type !== "town") continue;
      const ownerIndex = playerOwnerIndexFromTown(object);
      if (ownerIndex === null) continue;
      const zoneId = tile.zoneId ?? -1;
      if (zoneId < 0) continue;
      towns.push({ ownerIndex, zoneId, position: { x: tile.x, y: tile.y } });
    }
  }
  return towns;
}

/** Player towns are tagged `subtype: "player-{ownerIndex}"`; neutral towns are skipped. */
function playerOwnerIndexFromTown(object: NonNullable<MapTile["object"]>): number | null {
  if (typeof object.ownerIndex === "number") return object.ownerIndex;
  const subtype = object.subtype;
  const prefix = "player-";
  if (!subtype || !subtype.startsWith(prefix)) return null;
  const parsed = Number(subtype.slice(prefix.length));
  return Number.isInteger(parsed) ? parsed : null;
}

function collectExistingStartingMines(layer: RepairLayer, ownerIndex: number): StartingEconomyPlacement[] {
  const placed: StartingEconomyPlacement[] = [];
  for (const row of layer.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (object?.type !== "building" || object.ownerIndex !== ownerIndex) continue;
      const role = object.strategicRole;
      if (!role) continue;
      // `spec` here is only used for spacing bookkeeping by the repair pass, so the
      // canonical role spec is enough even if the rare mine subtype was finalized.
      placed.push({ x: tile.x, y: tile.y, spec: specForStartingMineRole(role), role });
    }
  }
  return placed;
}

function specForStartingMineRole(role: StartingMineRole): BuildingSpec {
  const entry = STARTING_MINE_SPECS.find((item) => item.role === role) ?? STARTING_MINE_SPECS[0];
  return buildingSpec(entry.type);
}

function canPlaceTownAtDoor(ctx: PlacementContext, zoneId: number, x: number, y: number): boolean {
  const door = ctx.tiles[y]?.[x];
  if (!isTownDoorTileFree(door)) return false;
  if (isGateFrameTile(ctx, x, y)) return false;

  for (const offset of TOWN_FOOTPRINT_OFFSETS) {
    const nx = x + offset.x;
    const ny = y + offset.y;
    if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) return false;
    if (ctx.zoneGrid.tilesZone[ny][nx] !== zoneId) return false;
    if (!isTownFootprintTileFree(ctx.tiles[ny][nx])) return false;
    if (isGateFrameTile(ctx, nx, ny)) return false;
  }

  return true;
}

function isTownDoorTileFree(tile: MapTile | undefined): tile is MapTile {
  return Boolean(tile && tile.isPassable && !tile.worldEdge && tile.terrain !== TerrainType.WATER && !tile.object && !tile.decor);
}

function isTownFootprintTileFree(tile: MapTile | undefined): tile is MapTile {
  return Boolean(
    tile &&
    tile.isPassable &&
    !tile.worldEdge &&
    tile.terrain !== TerrainType.WATER &&
    tile.terrain !== TerrainType.LAVA &&
    !tile.object &&
    !tile.decor
  );
}

function isGateFrameTile(ctx: PlacementContext, x: number, y: number): boolean {
  const tile = ctx.tiles[y]?.[x];
  if (tile?.object?.type === "gate") return true;

  for (const gate of [
    ctx.tiles[y]?.[x - 1],
    ctx.tiles[y]?.[x + 1],
    ctx.tiles[y - 1]?.[x],
    ctx.tiles[y + 1]?.[x],
  ]) {
    if (gate?.object?.type !== "gate" || !gate.object.roadAxis) continue;
    const dx = x - gate.x;
    const dy = y - gate.y;
    if (gate.object.roadAxis === "x") {
      if (dy === 0 && Math.abs(dx) === 1) return true;
      if (dx === 0 && Math.abs(dy) === 1) return true;
    } else {
      if (dx === 0 && Math.abs(dy) === 1) return true;
      if (dy === 0 && Math.abs(dx) === 1) return true;
    }
  }

  return false;
}

function downgradeWildTerrain(t: TerrainType): TerrainType {
  if (t === TerrainType.MOUNTAIN || t === TerrainType.LAVA || t === TerrainType.WATER) {
    return TerrainType.GRASS;
  }
  return t;
}

function findStartingMineTile(
  ctx: PlacementContext,
  zoneId: number,
  town: Position,
  spec: BuildingSpec,
  entry: (typeof STARTING_MINE_SPECS)[number],
  placed: StartingEconomyPlacement[],
): MapTile | null {
  const zoneTiles = tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
    .map((position) => ctx.tiles[position.y][position.x]);
  const buildCandidates = (respectSpacing: boolean, allowCoastalWater = false) => zoneTiles
    .filter((tile) => canPlaceStartingMineAt(ctx, tile, placed, respectSpacing, allowCoastalWater))
    .map((tile) => makeStartingMineCandidate(ctx, town, spec, tile))
    .filter((item) => item.distance >= entry.minDistance && item.distance <= entry.maxDistance);

  const minimumStrategicDistance = getMinimumStrategicMineDistance(town, entry, placed);
  const spacedCandidates = buildCandidates(true);
  if (spacedCandidates.length > 0) {
    return pickBestStartingMineCandidate(
      preferMinimumDistance(spacedCandidates, minimumStrategicDistance),
      entry.idealDistance,
    )?.tile ?? null;
  }

  const coastalCandidates = buildCandidates(true, true);
  if (coastalCandidates.length > 0) {
    return pickBestStartingMineCandidate(
      preferMinimumDistance(coastalCandidates, minimumStrategicDistance),
      entry.idealDistance,
    )?.tile ?? null;
  }

  const relaxedDistanceCandidates = zoneTiles
    .filter((tile) => canPlaceStartingMineAt(ctx, tile, placed, true, true))
    .map((tile) => makeStartingMineCandidate(ctx, town, spec, tile));
  if (relaxedDistanceCandidates.length > 0) {
    return pickBestStartingMineCandidate(
      preferMinimumDistance(relaxedDistanceCandidates, minimumStrategicDistance),
      entry.idealDistance,
    )?.tile ?? null;
  }

  const fallback = buildCandidates(false, true);
  if (fallback.length > 0) {
    return pickBestStartingMineCandidate(
      preferMinimumDistance(fallback, minimumStrategicDistance),
      entry.idealDistance,
    )?.tile ?? null;
  }

  const relaxedFallback = zoneTiles
    .filter((tile) => canPlaceStartingMineAt(ctx, tile, placed, false, true))
    .map((tile) => makeStartingMineCandidate(ctx, town, spec, tile));
  return pickBestStartingMineCandidate(
    preferMinimumDistance(relaxedFallback, minimumStrategicDistance),
    entry.idealDistance,
  )?.tile ?? null;
}

function getMinimumStrategicMineDistance(
  town: Position,
  entry: (typeof STARTING_MINE_SPECS)[number],
  placed: StartingEconomyPlacement[],
): number {
  if (entry.role !== "start_gold" && entry.role !== "start_rare") return 0;
  const primaryDistances = placed
    .filter((item) => item.role === "start_wood" || item.role === "start_ore")
    .map((item) => Math.max(Math.abs(item.x - town.x), Math.abs(item.y - town.y)));
  if (primaryDistances.length === 0) return 0;
  return Math.max(...primaryDistances) + 1;
}

function preferMinimumDistance<T extends { distance: number }>(candidates: T[], minimumDistance: number): T[] {
  if (minimumDistance <= 0) return candidates;
  const preferred = candidates.filter((candidate) => candidate.distance >= minimumDistance);
  return preferred.length > 0 ? preferred : candidates;
}

function makeStartingMineCandidate(ctx: PlacementContext, town: Position, spec: BuildingSpec, tile: MapTile) {
  return {
    tile,
    distance: Math.max(Math.abs(tile.x - town.x), Math.abs(tile.y - town.y)),
    preferredTerrain: spec.preferredTerrain.includes(tile.terrain),
    jitter: ctx.rng(),
  };
}

function canPlaceStartingMineAt(
  ctx: PlacementContext,
  tile: MapTile,
  placed: StartingEconomyPlacement[],
  respectSpacing: boolean,
  allowCoastalWater: boolean,
): boolean {
  if (tile.object || tile.decor) return false;
  if (tile.worldEdge) return false;
  if (isGateFrameTile(ctx, tile.x, tile.y)) return false;
  const isCoastalWater = allowCoastalWater && tile.terrain === TerrainType.WATER;
  if (!isSolidLandTile(tile) && !isCoastalWater) return false;
  if (!hasLandSupportNearby(ctx, tile.x, tile.y)) return false;
  if (!hasFreeAdjacentTileForMine(ctx, tile.x, tile.y, ctx.zoneGrid.tilesZone[tile.y][tile.x])) return false;
  if (hasAdjacentResourcePile(ctx, tile.x, tile.y)) return false;
  if (!respectSpacing) return true;
  return !hasBlockingObjectNearby(ctx, tile.x, tile.y, 1) && !hasPlacedStartingMineNearby(placed, tile.x, tile.y, 1);
}

function isSolidLandTile(tile: MapTile | undefined): tile is MapTile {
  return Boolean(tile && tile.isPassable && !tile.worldEdge && tile.terrain !== TerrainType.WATER && tile.terrain !== TerrainType.LAVA);
}

function hasLandSupportNearby(ctx: PlacementContext, x: number, y: number): boolean {
  let orthogonalLand = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tile = ctx.tiles[y + dy]?.[x + dx];
      if (!isSolidLandTile(tile)) continue;
      if (Math.abs(dx) + Math.abs(dy) === 1) orthogonalLand++;
    }
  }

  return orthogonalLand >= 1;
}

function hasBlockingObjectNearby(ctx: PlacementContext, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
      const object = ctx.tiles[ny][nx].object;
      if (object?.type === "building" || object?.type === "town" || object?.type === "town_footprint") return true;
    }
  }
  return false;
}

function hasPlacedStartingMineNearby(placed: StartingEconomyPlacement[], x: number, y: number, radius: number): boolean {
  return placed.some((item) => Math.max(Math.abs(item.x - x), Math.abs(item.y - y)) <= radius);
}

function prepareStartingMineTile(tile: MapTile): void {
  if (tile.terrain === TerrainType.WATER) {
    tile.terrain = TerrainType.GRASS;
    tile.elevation = 0;
  }
  tile.isPassable = true;
  tile.movementCost = movementCostForPreparedMine(tile.terrain);
}

function movementCostForPreparedMine(terrain: TerrainType): number {
  if (terrain === TerrainType.MOUNTAIN) return 250;
  if (terrain === TerrainType.SWAMP) return 175;
  if (terrain === TerrainType.SAND || terrain === TerrainType.SNOW || terrain === TerrainType.FOREST) return 150;
  return 100;
}

function pickBestStartingMineCandidate<T extends { distance: number; preferredTerrain: boolean; jitter: number }>(
  candidates: T[],
  idealDistance: number,
): T | undefined {
  return candidates.sort((a, b) => {
    const distanceScore = Math.abs(a.distance - idealDistance) - Math.abs(b.distance - idealDistance);
    if (distanceScore !== 0) return distanceScore;
    if (a.preferredTerrain !== b.preferredTerrain) return a.preferredTerrain ? -1 : 1;
    if (a.distance !== b.distance) return b.distance - a.distance;
    return a.jitter - b.jitter;
  })[0];
}

export interface ZoneFillResult {
  zoneId: number;
  spentValue: number;
  placedBuildings: { x: number; y: number; spec: BuildingSpec }[];
  placedPiles: { x: number; y: number; pile: PileSpec }[];
  guardianThreat: number;
}

/** Remplit une zone selon son budget (value system). */
export function fillZone(
  ctx: PlacementContext,
  zoneId: number,
  monsterStrength: "weak" | "normal" | "strong",
  options: { tuning?: RmgTuning } = {},
): ZoneFillResult {
  const meta = ctx.zoneGrid.meta[zoneId];
  const tuning = options.tuning ?? DEFAULT_RMG_TUNING;
  const densityBoost = meta.treasureDensity ?? 1;
  const resourceBudgetMultiplier = tuningPercentToMultiplier(tuning.resourceBudgetPercent);
  const buildingMultiplier = tuningPercentToMultiplier(tuning.buildingPercent) * densityBoost;
  const monsterMultiplier = tuningPercentToMultiplier(tuning.monsterPercent);
  const resourceBudget = Math.floor(meta.value * ZONE_RESOURCE_BUDGET_MULTIPLIER * resourceBudgetMultiplier * densityBoost);
  let budget = resourceBudget;
  const placedBuildings: ZoneFillResult["placedBuildings"] = [];
  const placedPiles: ZoneFillResult["placedPiles"] = [];

  // Châteaux : leur valeur a déjà été soustraite à l'extérieur si placé en amont (cf orchestrator)
  // Réduit le budget proportionnellement à la place déjà prise.

  // Liste de tiles candidates : toutes les tiles libres de la zone
  const allTiles = tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
    .filter((p) => isTileFree(ctx.tiles[p.y][p.x]) && !isGateFrameTile(ctx, p.x, p.y));
  if (allTiles.length === 0) {
    return { zoneId, spentValue: 0, placedBuildings, placedPiles, guardianThreat: 0 };
  }

  // Place les mines en priorite avant que les piles de ressources consomment le budget.
  const buildingTarget = Math.floor(buildingTargetForBudget(budget, meta.type) * buildingMultiplier);
  const pileTarget = Math.floor(resourcePileTargetForBudget(budget, meta.type) * tuningPercentToMultiplier(tuning.looseResourcePercent) * densityBoost);
  const buildingBudgetSlack = 4200;
  let buildingsPlaced = 0;
  let pilesPlaced = 0;

  const shuffled = shuffle(ctx.rng, allTiles).sort((a, b) =>
    organicPlacementScore(ctx, b.x, b.y, zoneId) - organicPlacementScore(ctx, a.x, a.y, zoneId)
  );

  const prioritizedBuildings = shuffle(ctx.rng, BUILDING_SPECS).sort((a, b) => {
    const aPreferred = a.preferredTerrain.includes(meta.baseTerrain) ? 0 : 1;
    const bPreferred = b.preferredTerrain.includes(meta.baseTerrain) ? 0 : 1;
    return aPreferred - bPreferred;
  });

  for (const obj of prioritizedBuildings) {
    if (buildingsPlaced >= buildingTarget) break;
    if (obj.value > budget + buildingBudgetSlack) continue;
    const placed = tryPlaceBuilding(ctx, shuffled, zoneId, obj);
    if (!placed) continue;

    budget -= obj.value;
    buildingsPlaced++;
    placedBuildings.push({ x: placed.x, y: placed.y, spec: obj });
    placeMineResourceCluster(ctx, placed.x, placed.y, zoneId, obj, placedPiles);
  }

  budget = Math.max(budget, meta.type === "treasure" ? 1200 : 700);

  let attempts = 0;
  const maxAttempts = 1500;
  while (budget > 0 && attempts < maxAttempts) {
    if (buildingsPlaced >= buildingTarget && pilesPlaced >= pileTarget) break;
    attempts++;
    const obj = pickObject(ctx.rng, meta.baseTerrain, buildingMultiplier);

    if (obj.kind === "building") {
      if (buildingsPlaced >= buildingTarget) continue;
      if (obj.value > budget + buildingBudgetSlack) continue;
      const placed = tryPlaceBuilding(ctx, shuffled, zoneId, obj);
      if (placed) {
        budget -= obj.value;
        buildingsPlaced++;
        placedBuildings.push({ x: placed.x, y: placed.y, spec: obj });
        placeMineResourceCluster(ctx, placed.x, placed.y, zoneId, obj, placedPiles);
      }
    } else {
      if (pilesPlaced >= pileTarget) continue;
      if (obj.value > budget + 100) continue;
      const placed = tryPlacePile(ctx, shuffled, zoneId, obj);
      if (placed) {
        budget -= obj.value;
        pilesPlaced++;
        placedPiles.push({ x: placed.x, y: placed.y, pile: obj });
      }
    }
  }

  const bonusSpent = placeBonusResourcePiles(ctx, zoneId, meta.value, placedPiles, tuning);
  budget -= bonusSpent;

  const spent = resourceBudget - Math.max(0, budget);
  const guardianThreat = Math.floor(meta.value * MONSTER_STRENGTH_MULTIPLIER[monsterStrength] * monsterMultiplier);

  return { zoneId, spentValue: spent, placedBuildings, placedPiles, guardianThreat };
}

function bonusResourcePileTarget(zoneType: string, zoneValue: number, freeTileCount: number): number {
  // Seuil plus permissif : 8 tiles libres suffisent pour amorcer la passe bonus. Évite
  // que les zones serrées (joueur avec château + mines + adventures) ne reçoivent zéro.
  if (freeTileCount < 10 || zoneValue < 2500) return 0;
  const cap = zoneType === "treasure" ? 18 : zoneType === "junction" ? 14 : 6;
  const divisor = zoneType === "treasure" || zoneType === "junction" ? 900 : 1800;
  return Math.min(cap, Math.max(1, Math.floor(zoneValue / divisor)));
}

function placeBonusResourcePiles(
  ctx: PlacementContext,
  zoneId: number,
  zoneValue: number,
  placedPiles: ZoneFillResult["placedPiles"],
  tuning: RmgTuning,
): number {
  const meta = ctx.zoneGrid.meta[zoneId];
  const candidates = shuffle(ctx.rng, tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId))
    .map((position) => ctx.tiles[position.y][position.x])
    .filter((tile) =>
      isTileFree(tile) &&
      !tile.road &&
      !isGateFrameTile(ctx, tile.x, tile.y) &&
      !hasMajorObjectNearby(ctx, tile.x, tile.y, meta.type === "player" ? 1 : 0) &&
      !isTooCloseToTown(
        ctx,
        tile.x,
        tile.y,
        RESOURCE_TOWN_EXCLUSION_RADIUS,
      )
    )
    .sort((a, b) =>
      organicPlacementScore(ctx, b.x, b.y, zoneId) - organicPlacementScore(ctx, a.x, a.y, zoneId)
    );

  const densityBoost = meta.treasureDensity ?? 1;
  const target = Math.floor(
    bonusResourcePileTarget(meta.type, zoneValue, candidates.length) *
      tuningPercentToMultiplier(tuning.looseResourcePercent) *
      densityBoost,
  );
  let spent = 0;
  for (let index = 0; index < Math.min(target, candidates.length); index++) {
    const tile = candidates[index];
    const pile = makePileSpec(pickLooseResourceSubtype(ctx.rng, meta.baseTerrain));
    placePile(ctx, tile, pile);
    placedPiles.push({ x: tile.x, y: tile.y, pile });
    spent += pile.value;
  }
  return spent;
}

function tryPlaceBuilding(
  ctx: PlacementContext,
  tiles: { x: number; y: number }[],
  zoneId: number,
  spec: BuildingSpec,
): { x: number; y: number } | null {
  for (const t of tiles) {
    const tile = ctx.tiles[t.y][t.x];
    if (!isTileFree(tile)) continue;
    if (!hasFreeAdjacentTileForMine(ctx, t.x, t.y, zoneId)) continue;
    if (hasAdjacentResourcePile(ctx, t.x, t.y)) continue;
    if (!spec.preferredTerrain.includes(tile.terrain)) {
      // Permet quand même, mais avec proba réduite
      if (ctx.rng() > 0.3) continue;
    }
    if (hasMajorObjectNearby(ctx, t.x, t.y, 2)) continue;
    placeBuilding(ctx, tile, spec, 0); // guardianPower rempli par les guardians de zone
    return { x: t.x, y: t.y };
  }
  return null;
}

function organicPlacementScore(ctx: PlacementContext, x: number, y: number, zoneId: number): number {
  const meta = ctx.zoneGrid.meta[zoneId];
  const centerDistance = Math.max(Math.abs(x - meta.centerX), Math.abs(y - meta.centerY));
  // Léger push périphérie + interdiction stricte des 2 tiles collées au château
  // (pour éviter le tas direct devant la porte). Tout le reste est libre — la
  // distribution suit principalement le noise pour rester organique.
  const peripheryBonus = centerDistance / Math.max(1, Math.min(ctx.width, ctx.height));
  const cluster = tileNoise(x, y, `${meta.templateZoneId}:cluster`);
  const ridge = tileNoise(Math.floor(x / 3), Math.floor(y / 3), `${meta.templateZoneId}:ridge`);
  const stuckToCastle = meta.hasTown && centerDistance <= 1 ? 1 : 0;
  return cluster * 0.55 + ridge * 0.35 + peripheryBonus * 0.15 - stuckToCastle * 0.8;
}

function tileNoise(x: number, y: number, salt: string): number {
  let value = 2166136261;
  const input = `${x}:${y}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

export function placeZoneArtifacts(ctx: PlacementContext, zoneId: number, zoneValue: number): void {
  const meta = ctx.zoneGrid.meta[zoneId];
  const targetCount = meta.type === "treasure"
    ? zoneValue >= 9000 ? 3 : zoneValue >= 5500 ? 2 : 1
    : zoneValue >= 7000 && ctx.rng() < 0.35 ? 1 : 0;
  if (targetCount <= 0) return;

  const classes = artifactClassesForZone(meta.type, zoneValue);
  const candidates = shuffle(ctx.rng, tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId))
    .map((position) => ctx.tiles[position.y][position.x])
    .filter((tile) =>
      isTileFree(tile) &&
      !tile.road &&
      !isGateFrameTile(ctx, tile.x, tile.y) &&
      !hasMajorObjectNearby(ctx, tile.x, tile.y, 2)
    );

  for (let index = 0; index < Math.min(targetCount, candidates.length); index++) {
    const artifactClass = classes[Math.min(index, classes.length - 1)];
    const tile = candidates[index];
    const artifactId = pickArtifactId(artifactClass, `artifact:${zoneId}:${tile.x}:${tile.y}:${index}`);
    tile.object = {
      type: "artifact",
      id: `art-${artifactId}-${tile.x}-${tile.y}`,
      subtype: artifactId,
      guardianPower: ARTIFACT_GUARDIAN_POWER[artifactClass],
    };
  }
}

function artifactClassesForZone(type: string, value: number): ArtifactClass[] {
  // Minor artifacts are reserved for neutral-monster loot and never spawn loose on the map;
  // ground slots that used to be minor are promoted to major (one tier up).
  if (type === "treasure") {
    if (value >= 10000) return ["relic", "major", "major"];
    if (value >= 6500) return ["major", "major"];
    return ["major", "treasure"];
  }
  return ["major"];
}

function tryPlacePile(
  ctx: PlacementContext,
  tiles: { x: number; y: number }[],
  zoneId: number,
  pile: PileSpec,
): { x: number; y: number } | null {
  for (const t of tiles) {
    const tile = ctx.tiles[t.y][t.x];
    if (!isTileFree(tile)) continue;
    if (ctx.zoneGrid.tilesZone[t.y][t.x] !== zoneId) continue;
    if (hasMajorObjectNearby(ctx, t.x, t.y, 1)) continue;
    if (isTooCloseToTown(
      ctx,
      t.x,
      t.y,
      RESOURCE_TOWN_EXCLUSION_RADIUS,
    )) continue;
    placePile(ctx, tile, pile);
    return { x: t.x, y: t.y };
  }
  return null;
}

export function placeZoneGuardians(
  ctx: PlacementContext,
  zoneId: number,
  buildings: ZoneFillResult["placedBuildings"],
  totalThreat: number,
): void {
  if (totalThreat <= 0) return;
  if (buildings.length === 0) {
    // Place quelques monstres aléatoires dans la zone
    const candidates = tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
      .filter((p) => isTileFree(ctx.tiles[p.y][p.x]));
    if (candidates.length === 0) return;
    const n = Math.min(5, candidates.length);
    const picks = shuffle(ctx.rng, candidates).slice(0, n);
    const per = Math.floor(totalThreat / n);
    for (const p of picks) {
      ctx.tiles[p.y][p.x].object = {
        type: "monster",
        id: `mon-zone-${zoneId}-${p.x}-${p.y}`,
        subtype: "wandering",
        guardianPower: per,
      };
    }
    return;
  }

  // Concentre les gardiens sur les bâtiments (≈ "treasure piles guarded")
  const per = Math.floor(totalThreat / buildings.length);
  for (const b of buildings) {
    const tile = ctx.tiles[b.y][b.x];
    if (tile.object?.type === "building") {
      tile.object.guardianPower = per;
    }
  }

  const patrolCount = Math.min(5, Math.max(2, Math.floor(totalThreat / 1600)));
  const candidates = tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
    .filter((p) => isTileFree(ctx.tiles[p.y][p.x]));
  for (const p of shuffle(ctx.rng, candidates).slice(0, patrolCount)) {
    ctx.tiles[p.y][p.x].object = {
      type: "monster",
      id: `mon-patrol-${zoneId}-${p.x}-${p.y}`,
      subtype: "patrol",
      guardianPower: Math.max(120, Math.floor(totalThreat / (patrolCount * 2))),
    };
  }
}

/** Calcule et applique les gardiens aux chokepoints. */
export function applyChokepointGuards(
  ctx: PlacementContext,
  chokepoints: Chokepoint[],
): void {
  for (const cp of chokepoints) {
    const targetZone = ctx.zoneGrid.meta[cp.toZoneId];
    const threat = Math.floor(targetZone.value * GUARD_MULTIPLIER[cp.guardStrength]);
    const tile = ctx.tiles[cp.y][cp.x];
    if (tile.object?.type === "gate") {
      tile.object.guardianPower = threat;
    }
  }
}

export function capResourcesAdjacentToMines(ctx: PlacementContext): void {
  for (const row of ctx.tiles) {
    for (const tile of row) {
      if (tile.object?.type !== "building") continue;
      const resources = adjacentResourceTiles(ctx, tile.x, tile.y);
      if (resources.length <= 2) continue;
      for (const extra of resources.slice(2)) extra.object = undefined;
    }
  }
}

function adjacentResourceTiles(ctx: PlacementContext, x: number, y: number): MapTile[] {
  const tiles: MapTile[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tile = ctx.tiles[y + dy]?.[x + dx];
      if (tile?.object?.type === "resource") tiles.push(tile);
    }
  }
  return tiles;
}
