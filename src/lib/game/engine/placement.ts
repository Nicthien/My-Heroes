import { MapTile, TerrainType } from "../types";
import { ZoneGrid, tilesInZone } from "./zones";
import {
  BUILDING_SPECS,
  BuildingSpec,
  ObjectSpec,
  PileSpec,
  ResourceSubtype,
  makePileSpec,
} from "./value";
import { RNG, randInt, shuffle, weightedPick } from "./rng";
import { Chokepoint } from "./connections";
import { GUARD_MULTIPLIER, MONSTER_STRENGTH_MULTIPLIER } from "./template";

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
    ["gold", "wood", "ore", "mercury", "crystals", "sulfur"] as ResourceSubtype[]
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
      if (t.object?.type === "building" || t.object?.type === "town") return true;
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
): void {
  tile.object = {
    type: "building",
    id: `bld-${spec.buildingType}-${tile.x}-${tile.y}`,
    subtype: spec.buildingType,
    guardianPower,
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
    .filter((p) => {
      const tile = ctx.tiles[p.y][p.x];
      return tile.isPassable && tile.terrain !== TerrainType.WATER && !tile.object;
    })
    .sort(
      (a, b) =>
        (a.x - meta.centerX) ** 2 +
        (a.y - meta.centerY) ** 2 -
        ((b.x - meta.centerX) ** 2 + (b.y - meta.centerY) ** 2),
    );
  if (candidates.length === 0) return null;
  const c = candidates[0];
  const tile = ctx.tiles[c.y][c.x];
  // Force tile passable (mais on n'a déjà gardé que les passable)
  tile.terrain = downgradeWildTerrain(tile.terrain);
  tile.movementCost = 1;
  tile.elevation = 0;
  tile.object = {
    type: "town",
    id: isNeutral
      ? `neutral-town-${meta.templateZoneId}-${c.x}-${c.y}`
      : `player-town-${ownerIndex}-${c.x}-${c.y}`,
    subtype: isNeutral ? "neutral" : `player-${ownerIndex}`,
  };
  return tile;
}

function downgradeWildTerrain(t: TerrainType): TerrainType {
  if (t === TerrainType.MOUNTAIN || t === TerrainType.LAVA || t === TerrainType.WATER) {
    return TerrainType.GRASS;
  }
  return t;
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
): ZoneFillResult {
  const meta = ctx.zoneGrid.meta[zoneId];
  let budget = meta.value;
  const placedBuildings: ZoneFillResult["placedBuildings"] = [];
  const placedPiles: ZoneFillResult["placedPiles"] = [];

  // Châteaux : leur valeur a déjà été soustraite à l'extérieur si placé en amont (cf orchestrator)
  // Réduit le budget proportionnellement à la place déjà prise.

  // Liste de tiles candidates : toutes les tiles libres de la zone
  const allTiles = tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
    .filter((p) => isTileFree(ctx.tiles[p.y][p.x]));
  if (allTiles.length === 0) {
    return { zoneId, spentValue: 0, placedBuildings, placedPiles, guardianThreat: 0 };
  }

  // Place les mines en priorite avant que les piles de ressources consomment le budget.
  const buildingTarget = buildingTargetForZone(meta.type, budget);
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
