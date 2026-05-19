import { MapTile, Position, ResourceBuildingType, TerrainType } from "../types";
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
import { RNG, randInt, shuffle, weightedPick } from "./rng";
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
    maxDistance: 5,
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

export interface PlacementContext {
  tiles: MapTile[][];
  zoneGrid: ZoneGrid;
  width: number;
  height: number;
  rng: RNG;
}

/** Tirage pondéré d'un objet à placer dans une zone. */
function pickObject(rng: RNG, terrainBias: TerrainType): ObjectSpec {
  const buildings = BUILDING_SPECS.map((b) => ({
    value: b as ObjectSpec,
    weight: b.preferredTerrain.includes(terrainBias) ? 1 : 0.4,
  }));
  const piles: { value: ObjectSpec; weight: number }[] = (
    ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"] as ResourceSubtype[]
  ).map((s) => ({ value: makePileSpec(s), weight: s === "gold" ? 4 : 2 }));

  // Buildings rares mais existants, piles fréquentes
  const choices: { value: ObjectSpec; weight: number }[] = [
    ...buildings.map((b) => ({ value: b.value, weight: b.weight * 0.6 })),
    ...piles,
  ];
  return weightedPick(rng, choices);
}

function isTileFree(tile: MapTile): boolean {
  return tile.isPassable && tile.terrain !== TerrainType.WATER && !tile.object && !tile.decor;
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

function buildingTargetForZone(type: string, budget: number): number {
  if (budget < 1500) return 0;
  if (budget >= 7000) return 5;
  if (type === "treasure") return 4;
  if (budget >= 3000) return 3;
  return 2;
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
      const t = ctx.tiles[ny][nx];
      if (isTileFree(t)) out.push(t);
    }
  }
  return out;
}

/** Crée le château (joueur ou neutre) au centre d'une zone si demandé par le template. */
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
    placed.push({ x: tile.x, y: tile.y, spec, role: entry.role });
  }

  return placed;
}

function canPlaceTownAtDoor(ctx: PlacementContext, zoneId: number, x: number, y: number): boolean {
  const door = ctx.tiles[y]?.[x];
  if (!isTownDoorTileFree(door)) return false;

  for (const offset of TOWN_FOOTPRINT_OFFSETS) {
    const nx = x + offset.x;
    const ny = y + offset.y;
    if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) return false;
    if (ctx.zoneGrid.tilesZone[ny][nx] !== zoneId) return false;
    if (!isTownFootprintTileFree(ctx.tiles[ny][nx])) return false;
  }

  return true;
}

function isTownDoorTileFree(tile: MapTile | undefined): tile is MapTile {
  return Boolean(tile && tile.isPassable && tile.terrain !== TerrainType.WATER && !tile.object && !tile.decor);
}

function isTownFootprintTileFree(tile: MapTile | undefined): tile is MapTile {
  return Boolean(
    tile &&
    tile.isPassable &&
    tile.terrain !== TerrainType.WATER &&
    tile.terrain !== TerrainType.LAVA &&
    !tile.object &&
    !tile.decor
  );
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

  const spacedCandidates = buildCandidates(true);
  if (spacedCandidates.length > 0) return pickBestStartingMineCandidate(spacedCandidates, entry.idealDistance)?.tile ?? null;

  const coastalCandidates = buildCandidates(true, true);
  if (coastalCandidates.length > 0) return pickBestStartingMineCandidate(coastalCandidates, entry.idealDistance)?.tile ?? null;

  const relaxedDistanceCandidates = zoneTiles
    .filter((tile) => canPlaceStartingMineAt(ctx, tile, placed, true, true))
    .map((tile) => makeStartingMineCandidate(ctx, town, spec, tile));
  if (relaxedDistanceCandidates.length > 0) return pickBestStartingMineCandidate(relaxedDistanceCandidates, entry.idealDistance)?.tile ?? null;

  const fallback = buildCandidates(false, true);
  if (fallback.length > 0) return pickBestStartingMineCandidate(fallback, entry.idealDistance)?.tile ?? null;

  const relaxedFallback = zoneTiles
    .filter((tile) => canPlaceStartingMineAt(ctx, tile, placed, false, true))
    .map((tile) => makeStartingMineCandidate(ctx, town, spec, tile));
  return pickBestStartingMineCandidate(relaxedFallback, entry.idealDistance)?.tile ?? null;
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
  if (!isSolidLandTile(tile) && !(allowCoastalWater && tile.terrain === TerrainType.WATER)) return false;
  if (!hasLandSupportNearby(ctx, tile.x, tile.y)) return false;
  if (!respectSpacing) return true;
  return !hasBlockingObjectNearby(ctx, tile.x, tile.y, 1) && !hasPlacedStartingMineNearby(placed, tile.x, tile.y, 1);
}

function isSolidLandTile(tile: MapTile | undefined): tile is MapTile {
  return Boolean(tile && tile.isPassable && tile.terrain !== TerrainType.WATER && tile.terrain !== TerrainType.LAVA);
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
  options: { allowBuildings?: boolean } = {},
): ZoneFillResult {
  const meta = ctx.zoneGrid.meta[zoneId];
  let budget = meta.value;
  const placedBuildings: ZoneFillResult["placedBuildings"] = [];
  const placedPiles: ZoneFillResult["placedPiles"] = [];
  const allowBuildings = options.allowBuildings !== false;

  // Châteaux : leur valeur a déjà été soustraite à l'extérieur si placé en amont (cf orchestrator)
  // Réduit le budget proportionnellement à la place déjà prise.

  // Liste de tiles candidates : toutes les tiles libres de la zone
  const allTiles = tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
    .filter((p) => isTileFree(ctx.tiles[p.y][p.x]));
  if (allTiles.length === 0) {
    return { zoneId, spentValue: 0, placedBuildings, placedPiles, guardianThreat: 0 };
  }

  // Place les mines en priorite avant que les piles de ressources consomment le budget.
  const buildingTarget = allowBuildings ? buildingTargetForZone(meta.type, budget) : 0;
  const buildingBudgetSlack = 3000;
  let buildingsPlaced = 0;

  const shuffled = shuffle(ctx.rng, allTiles);

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

    const [minC, maxC] = obj.clusterCount;
    const n = randInt(ctx.rng, minC, maxC);
    const adj = shuffle(ctx.rng, adjacentFreeTiles(ctx, placed.x, placed.y, zoneId));
    for (let i = 0; i < Math.min(n, adj.length); i++) {
      const pile = makePileSpec(obj.clusterResource);
      placePile(ctx, adj[i], pile);
      budget -= pile.value;
      placedPiles.push({ x: adj[i].x, y: adj[i].y, pile });
    }
  }

  budget = Math.max(budget, meta.type === "treasure" ? 2200 : 1200);

  let attempts = 0;
  const maxAttempts = 800;
  while (budget > 0 && attempts < maxAttempts) {
    attempts++;
    const obj = pickObject(ctx.rng, meta.baseTerrain);

    if (obj.kind === "building") {
      if (!allowBuildings) continue;
      if (buildingsPlaced >= buildingTarget) continue;
      if (obj.value > budget + buildingBudgetSlack) continue;
      const placed = tryPlaceBuilding(ctx, shuffled, zoneId, obj);
      if (placed) {
        budget -= obj.value;
        buildingsPlaced++;
        placedBuildings.push({ x: placed.x, y: placed.y, spec: obj });
        // Cluster : 1-2 piles adjacentes de la ressource correspondante
        const [minC, maxC] = obj.clusterCount;
        const n = randInt(ctx.rng, minC, maxC);
        const adj = shuffle(ctx.rng, adjacentFreeTiles(ctx, placed.x, placed.y, zoneId));
        for (let i = 0; i < Math.min(n, adj.length); i++) {
          const pile = makePileSpec(obj.clusterResource);
          placePile(ctx, adj[i], pile);
          budget -= pile.value;
          placedPiles.push({ x: adj[i].x, y: adj[i].y, pile });
        }
      }
    } else {
      if (obj.value > budget + 100) continue;
      const placed = tryPlacePile(ctx, shuffled, zoneId, obj);
      if (placed) {
        budget -= obj.value;
        placedPiles.push({ x: placed.x, y: placed.y, pile: obj });
      }
    }
  }

  const spent = meta.value - Math.max(0, budget);
  const guardianThreat = Math.floor(meta.value * MONSTER_STRENGTH_MULTIPLIER[monsterStrength]);

  // Place 1-3 piles de monstres gardiens près des objets les plus précieux
  placeZoneGuardians(ctx, zoneId, placedBuildings, guardianThreat);

  return { zoneId, spentValue: spent, placedBuildings, placedPiles, guardianThreat };
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
    placePile(ctx, tile, pile);
    return { x: t.x, y: t.y };
  }
  return null;
}

function placeZoneGuardians(
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
    const n = Math.min(3, candidates.length);
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

  const patrolCount = Math.min(3, Math.max(1, Math.floor(totalThreat / 2200)));
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
    if (tile.object?.type === "monster") {
      tile.object.guardianPower = threat;
    }
  }
}
