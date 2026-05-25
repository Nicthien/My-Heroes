import { ARTIFACT_GUARDIAN_POWER, type ArtifactClass, pickArtifactId } from "../artifacts";
import { DecorKind, MapTile, TerrainType } from "../types";
import type { PlacementContext } from "./placement";
import { shuffle } from "./rng";
import { GUARD_MULTIPLIER } from "./template";
import { makePileSpec, type ResourceSubtype } from "./value";
import { tilesInZone } from "./zones";

const POCKET_INTERIOR_MIN = 6;
const POCKET_INTERIOR_MAX = 12;
const POCKET_CENTER_BUFFER_NEUTRAL = 4;
const POCKET_CENTER_BUFFER_PLAYER = 7;
const POCKET_ROAD_BUFFER = 2;
// Distance minimale (Chebyshev) entre un seed/interior de pocket et N'IMPORTE QUEL château
// joueur ou neutre. Évite les "tas de ressources devant la porte" d'un joueur quand un
// pocket de zone neutre voisine déborde près d'une frontière.
const POCKET_TOWN_BUFFER = 10;

const BLOCKING_DECOR_BY_TERRAIN: Partial<Record<TerrainType, DecorKind[]>> = {
  [TerrainType.GRASS]: ["grass-oak-copse", "grass-bramble-mound", "grass-sapling-grove", "grass-root-barricade"],
  [TerrainType.FOREST]: ["forest-pine-grove", "forest-broadleaf-grove", "forest-deadfall", "forest-birch-pine-screen"],
  [TerrainType.DIRT]: ["dirt-thorn-scrub", "dirt-dead-brush", "dirt-bramble-ravine", "dirt-root-snarl"],
  [TerrainType.SAND]: ["sand-cactus-cluster", "sand-agave-barrier", "sand-saltbush-clump"],
  [TerrainType.SNOW]: ["snow-pine-grove", "snow-evergreen-drift", "snow-shrub-wall", "snow-deadwood-barrier"],
  [TerrainType.MOUNTAIN]: ["mountain-pine-rock", "mountain-fir-grove", "mountain-deadwood", "mountain-mossy-roots"],
  [TerrainType.SWAMP]: ["swamp-willow-grove", "swamp-mangrove-tangle", "swamp-cypress-cluster", "swamp-bog-bramble"],
  [TerrainType.LAVA]: ["lava-charred-thorns", "lava-scorched-deadwood", "lava-obsidian-bramble"],
};

const RESOURCE_POOL: ResourceSubtype[] = ["gold", "gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"];

export interface PocketPlacementResult {
  zoneId: number;
  interior: { x: number; y: number }[];
  goulet: { x: number; y: number };
  escape: { x: number; y: number };
  /** Tiles marquées en décor "réservé" pour protéger le couloir d'accès du décor random. */
  trail: { x: number; y: number }[];
  artifactPosition: { x: number; y: number };
  guardianPower: number;
}

/**
 * Place guarded "pockets" (cul-de-sacs) inside neutral zones: a small enclosed area sealed
 * with blocking decor, containing an artifact + resource piles + a single strong guardian.
 *
 * Runs after fillZone but before placeDecor/large-obstacles so we own the perimeter sealing.
 */
/**
 * Vérifie après-coup que chaque artefact de poche reste atteignable depuis le réseau
 * principal. Si une passe ultérieure (décor, maze obstacles, massifs) a coupé le couloir,
 * on enlève les objets de la poche pour ne pas laisser de récompense inaccessible.
 */
export function repairUnreachablePockets(
  ctx: PlacementContext,
  pockets: PocketPlacementResult[],
  reachable: Set<string>,
): void {
  for (const pocket of pockets) {
    const key = `${pocket.artifactPosition.x},${pocket.artifactPosition.y}`;
    if (reachable.has(key)) continue;

    // Désactive la récompense : pas d'artefact orphelin, pas de gardien fantôme.
    for (const tile of [...pocket.interior, pocket.goulet]) {
      const t = ctx.tiles[tile.y]?.[tile.x];
      if (!t?.object) continue;
      if (
        t.object.type === "artifact" ||
        t.object.type === "monster" ||
        t.object.type === "resource"
      ) {
        t.object = undefined;
      }
    }

    // Nettoie la route "dirt" du goulet — sinon on garde une route orpheline pointant
    // vers une zone scellée sans récompense.
    for (const tile of pocket.trail) {
      const t = ctx.tiles[tile.y]?.[tile.x];
      if (!t) continue;
      if (t.road === "dirt") t.road = undefined;
    }
  }
}

export function placeZonePockets(ctx: PlacementContext): PocketPlacementResult[] {
  const results: PocketPlacementResult[] = [];
  const townPositions = collectTownPositions(ctx);

  for (let zoneId = 0; zoneId < ctx.zoneGrid.meta.length; zoneId++) {
    const meta = ctx.zoneGrid.meta[zoneId];
    const target = meta.pocketCount ?? 0;
    if (target <= 0) continue;

    for (let i = 0; i < target; i++) {
      const placed = tryPlacePocket(ctx, zoneId, i, townPositions);
      if (placed) results.push(placed);
    }
  }

  return results;
}

function collectTownPositions(ctx: PlacementContext): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  for (let y = 0; y < ctx.height; y++) {
    for (let x = 0; x < ctx.width; x++) {
      const obj = ctx.tiles[y][x].object;
      if (obj?.type === "town") positions.push({ x, y });
    }
  }
  return positions;
}

function isTooCloseToAnyTown(
  towns: { x: number; y: number }[],
  x: number,
  y: number,
  buffer: number,
): boolean {
  for (const t of towns) {
    if (Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) < buffer) return true;
  }
  return false;
}

function tryPlacePocket(
  ctx: PlacementContext,
  zoneId: number,
  pocketIndex: number,
  townPositions: { x: number; y: number }[],
): PocketPlacementResult | null {
  const meta = ctx.zoneGrid.meta[zoneId];
  const seeds = findSeedCandidates(ctx, zoneId, townPositions);
  if (seeds.length === 0) return null;
  const townBuffer = pocketTownBuffer(ctx);

  const desiredSize = POCKET_INTERIOR_MIN +
    Math.floor(ctx.rng() * (POCKET_INTERIOR_MAX - POCKET_INTERIOR_MIN + 1));

  for (const seed of seeds) {
    const interior = floodPocket(ctx, zoneId, seed.x, seed.y, desiredSize);
    if (interior.length < POCKET_INTERIOR_MIN) continue;

    // Aucune tile de l'intérieur ne doit s'approcher d'un château — un pocket de zone
    // neutre ne doit jamais déborder en face d'un joueur voisin.
    if (interior.some((t) => isTooCloseToAnyTown(townPositions, t.x, t.y, townBuffer))) {
      continue;
    }

    const perimeter = collectPerimeter(ctx, zoneId, interior);
    if (perimeter.length < 3) continue;

    const gouletPick = pickGouletWithEscape(ctx, interior, perimeter);
    if (!gouletPick) continue;
    const { goulet, escape } = gouletPick;

    // Vérifie que le tile d'échappée est lui-même reliable à un large espace passable
    // (au moins 60 tiles), sinon le pocket est piégé dans un recoin déjà isolé.
    if (!escapeIsConnected(ctx, escape, new Set(interior.map((t) => `${t.x},${t.y}`)))) continue;

    const gouletTile = ctx.tiles[goulet.y]?.[goulet.x];
    if (!gouletTile) continue;
    const snapshot = snapshotTiles([...interior, ...perimeter, gouletTile]);
    sealPerimeter(ctx, perimeter, goulet, meta.baseTerrain);
    // Protège uniquement le goulet (1 tile) avec une route dirt — minimal visuellement,
    // évite les "couloirs orphelins" de plusieurs tiles. La tile d'échappée bénéficie
    // du voisinage immédiat de cette route (nearRoadOrObject) qui empêche placeDecor
    // d'y poser du décor bloquant.
    const trail = markGouletAsTrail(ctx, goulet);

    const guardStrength = meta.pocketGuardStrength ?? "strong";
    const guardianPower = Math.max(
      400,
      Math.floor(meta.value * GUARD_MULTIPLIER[guardStrength]),
    );

    const artifactClass = meta.pocketArtifactClass ?? defaultPocketArtifactClass(meta.type, meta.value);
    const interiorByCenter = [...interior].sort((a, b) => {
      const ad = Math.hypot(a.x - seed.x, a.y - seed.y);
      const bd = Math.hypot(b.x - seed.x, b.y - seed.y);
      return ad - bd;
    });

    const artifactTile = interiorByCenter[0];
    placePocketArtifact(ctx, artifactTile, artifactClass, zoneId, pocketIndex);

    placePocketGuardian(ctx, gouletTile, guardianPower, zoneId, pocketIndex);

    const pileTiles = interior.filter((p) =>
      p.x !== artifactTile.x || p.y !== artifactTile.y,
    );
    const pileCount = Math.min(pileTiles.length, 2 + Math.floor(ctx.rng() * 3));
    for (let i = 0; i < pileCount; i++) {
      const tile = ctx.tiles[pileTiles[i].y][pileTiles[i].x];
      const subtype = RESOURCE_POOL[Math.floor(ctx.rng() * RESOURCE_POOL.length)];
      const pile = makePileSpec(subtype);
      tile.object = {
        type: "resource",
        id: `pocket-res-${zoneId}-${pocketIndex}-${tile.x}-${tile.y}`,
        subtype: pile.subtype,
        amount: pile.amount,
      };
    }

    if (
      !canReachPocketArtifact(ctx, escape, { x: artifactTile.x, y: artifactTile.y }) ||
      canReachPocketArtifact(ctx, escape, { x: artifactTile.x, y: artifactTile.y }, goulet)
    ) {
      restoreTiles(snapshot);
      continue;
    }

    return {
      zoneId,
      interior,
      goulet,
      escape,
      trail,
      artifactPosition: { x: artifactTile.x, y: artifactTile.y },
      guardianPower,
    };
  }

  return null;
}

function defaultPocketArtifactClass(zoneType: string, zoneValue: number): ArtifactClass {
  if (zoneType === "treasure") {
    if (zoneValue >= 9000) return "relic";
    if (zoneValue >= 6000) return "major";
    return "minor";
  }
  if (zoneType === "junction") return zoneValue >= 3500 ? "major" : "minor";
  return "minor";
}

function findSeedCandidates(
  ctx: PlacementContext,
  zoneId: number,
  townPositions: { x: number; y: number }[],
): MapTile[] {
  const meta = ctx.zoneGrid.meta[zoneId];
  const reachable = floodPassable(ctx, meta.centerX, meta.centerY);
  const townBuffer = pocketTownBuffer(ctx);
  return shuffle(
    ctx.rng,
    tilesInZone(ctx.zoneGrid, ctx.width, ctx.height, zoneId)
      .map((p) => ctx.tiles[p.y][p.x])
      .filter((tile) =>
        isPocketCandidateTile(ctx, tile, zoneId, meta.centerX, meta.centerY) &&
        reachable.has(`${tile.x},${tile.y}`) &&
        !isTooCloseToAnyTown(townPositions, tile.x, tile.y, townBuffer),
      ),
  ).sort((a, b) => pocketSeedScore(ctx, b.x, b.y, zoneId) - pocketSeedScore(ctx, a.x, a.y, zoneId));
}

function pocketTownBuffer(ctx: PlacementContext): number {
  const mapScale = Math.floor(Math.min(ctx.width, ctx.height) / 7);
  return Math.min(POCKET_TOWN_BUFFER, Math.max(5, mapScale));
}

function floodPassable(ctx: PlacementContext, startX: number, startY: number): Set<string> {
  const seen = new Set<string>();
  if (startX < 0 || startX >= ctx.width || startY < 0 || startY >= ctx.height) return seen;
  const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    const tile = ctx.tiles[y]?.[x];
    if (!tile || !tile.isPassable) continue;
    seen.add(key);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
      if (!seen.has(`${nx},${ny}`)) queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

function isPocketCandidateTile(
  ctx: PlacementContext,
  tile: MapTile,
  zoneId: number,
  centerX: number,
  centerY: number,
): boolean {
  if (!isPocketFreeTile(tile)) return false;
  if (ctx.zoneGrid.tilesZone[tile.y][tile.x] !== zoneId) return false;
  const meta = ctx.zoneGrid.meta[zoneId];
  const buffer = meta.type === "player" ? POCKET_CENTER_BUFFER_PLAYER : POCKET_CENTER_BUFFER_NEUTRAL;
  const centerDist = Math.max(Math.abs(tile.x - centerX), Math.abs(tile.y - centerY));
  if (centerDist < buffer) return false;
  if (hasRoadOrTownNearby(ctx, tile.x, tile.y, POCKET_ROAD_BUFFER)) return false;
  if (countFreeNeighbors(ctx, zoneId, tile.x, tile.y) < 3) return false;
  return true;
}

function floodPocket(
  ctx: PlacementContext,
  zoneId: number,
  startX: number,
  startY: number,
  desiredSize: number,
): MapTile[] {
  const seen = new Set<string>();
  const interior: MapTile[] = [];
  const frontier: { x: number; y: number }[] = [{ x: startX, y: startY }];

  while (frontier.length > 0 && interior.length < desiredSize) {
    const idx = Math.floor(ctx.rng() * frontier.length);
    const { x, y } = frontier.splice(idx, 1)[0];
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const tile = ctx.tiles[y]?.[x];
    if (!tile || !isPocketFreeTile(tile)) continue;
    if (ctx.zoneGrid.tilesZone[y][x] !== zoneId) continue;
    if (hasRoadOrTownNearby(ctx, x, y, 1)) continue;

    interior.push(tile);

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const nKey = `${nx},${ny}`;
      if (!seen.has(nKey)) frontier.push({ x: nx, y: ny });
    }
  }

  return interior;
}

function collectPerimeter(
  ctx: PlacementContext,
  zoneId: number,
  interior: MapTile[],
): MapTile[] {
  const interiorSet = new Set(interior.map((t) => `${t.x},${t.y}`));
  const perimeter: MapTile[] = [];
  const seen = new Set<string>();

  for (const t of interior) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = t.x + dx;
        const ny = t.y + dy;
        const key = `${nx},${ny}`;
        if (interiorSet.has(key) || seen.has(key)) continue;
        seen.add(key);
        const tile = ctx.tiles[ny]?.[nx];
        if (!tile) continue;
        if (tile.worldEdge) continue;
        if (ctx.zoneGrid.tilesZone[ny][nx] !== zoneId) continue;
        perimeter.push(tile);
      }
    }
  }

  return perimeter;
}

function pickGouletWithEscape(
  ctx: PlacementContext,
  interior: MapTile[],
  perimeter: MapTile[],
): { goulet: { x: number; y: number }; escape: { x: number; y: number } } | null {
  const interiorSet = new Set(interior.map((t) => `${t.x},${t.y}`));
  const perimeterSet = new Set(perimeter.map((t) => `${t.x},${t.y}`));

  const candidates: { goulet: MapTile; escape: { x: number; y: number } }[] = [];
  for (const tile of perimeter) {
    if (!isPocketFreeTile(tile)) continue;
    const touchesInterior = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => interiorSet.has(`${tile.x + dx},${tile.y + dy}`));
    if (!touchesInterior) continue;

    let escape: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      const key = `${nx},${ny}`;
      if (interiorSet.has(key) || perimeterSet.has(key)) continue;
      const ext = ctx.tiles[ny]?.[nx];
      if (!ext) continue;
      if (!ext.isPassable || ext.object || ext.decor?.blocking || ext.worldEdge) continue;
      if (ext.terrain === TerrainType.WATER || ext.terrain === TerrainType.LAVA) continue;
      escape = { x: nx, y: ny };
      break;
    }
    if (!escape) continue;
    candidates.push({ goulet: tile, escape });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aRoad = hasRoadOrTownNearby(ctx, a.goulet.x, a.goulet.y, 3) ? 0 : 1;
    const bRoad = hasRoadOrTownNearby(ctx, b.goulet.x, b.goulet.y, 3) ? 0 : 1;
    return aRoad - bRoad;
  });

  const chosen = candidates[0];
  return {
    goulet: { x: chosen.goulet.x, y: chosen.goulet.y },
    escape: chosen.escape,
  };
}

function markGouletAsTrail(
  ctx: PlacementContext,
  goulet: { x: number; y: number },
): { x: number; y: number }[] {
  const tile = ctx.tiles[goulet.y]?.[goulet.x];
  if (!tile) return [];
  if (tile.object || tile.decor?.blocking || tile.worldEdge) return [];
  if (tile.terrain === TerrainType.WATER || tile.terrain === TerrainType.LAVA) return [];
  tile.road = tile.road ?? "dirt";
  tile.decor = undefined;
  tile.isPassable = true;
  tile.movementCost = 75;
  return [{ x: goulet.x, y: goulet.y }];
}

function sealPerimeter(
  ctx: PlacementContext,
  perimeter: MapTile[],
  goulet: { x: number; y: number },
  baseTerrain: TerrainType,
): void {
  for (const tile of perimeter) {
    if (tile.x === goulet.x && tile.y === goulet.y) continue;
    if (!isPocketFreeTile(tile)) continue;
    if (tile.road) continue;
    if (tile.worldEdge) continue;

    const palette =
      BLOCKING_DECOR_BY_TERRAIN[tile.terrain] ??
      BLOCKING_DECOR_BY_TERRAIN[baseTerrain] ??
      (["boulder-cluster", "deadwood-thicket", "bramble-thicket"] as DecorKind[]);
    const kind = palette[Math.floor(ctx.rng() * palette.length)];
    tile.decor = { type: kind, blocking: true, variant: Math.floor(ctx.rng() * 3) };
    tile.isPassable = false;
    tile.movementCost = 999;
  }
}

function placePocketArtifact(
  ctx: PlacementContext,
  tile: MapTile,
  artifactClass: ArtifactClass,
  zoneId: number,
  pocketIndex: number,
): void {
  const artifactId = pickArtifactId(
    artifactClass,
    `pocket:${zoneId}:${pocketIndex}:${tile.x}:${tile.y}`,
  );
  tile.object = {
    type: "artifact",
    id: `pocket-art-${artifactId}-${tile.x}-${tile.y}`,
    subtype: artifactId,
    guardianPower: ARTIFACT_GUARDIAN_POWER[artifactClass],
  };
}

function placePocketGuardian(
  ctx: PlacementContext,
  tile: MapTile,
  guardianPower: number,
  zoneId: number,
  pocketIndex: number,
): void {
  tile.object = {
    type: "monster",
    id: `pocket-mon-${zoneId}-${pocketIndex}-${tile.x}-${tile.y}`,
    subtype: "guardian",
    guardianPower,
  };
}

function escapeIsConnected(
  ctx: PlacementContext,
  escape: { x: number; y: number },
  excluded: Set<string>,
): boolean {
  const seen = new Set<string>();
  const queue: { x: number; y: number }[] = [escape];
  let count = 0;
  const target = 60;
  while (queue.length > 0 && count < target) {
    const { x, y } = queue.shift()!;
    const key = `${x},${y}`;
    if (seen.has(key) || excluded.has(key)) continue;
    const tile = ctx.tiles[y]?.[x];
    if (!tile || !tile.isPassable) continue;
    seen.add(key);
    count++;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
      if (!seen.has(`${nx},${ny}`)) queue.push({ x: nx, y: ny });
    }
  }
  return count >= target;
}

function isPocketFreeTile(tile: MapTile): boolean {
  return (
    tile.isPassable &&
    !tile.worldEdge &&
    tile.terrain !== TerrainType.WATER &&
    tile.terrain !== TerrainType.LAVA &&
    !tile.object &&
    !tile.decor &&
    !tile.road
  );
}

function hasRoadOrTownNearby(
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
      const tile = ctx.tiles[ny][nx];
      if (tile.road) return true;
      const obj = tile.object;
      if (obj?.type === "town" || obj?.type === "town_footprint" || obj?.type === "gate") return true;
    }
  }
  return false;
}

function countFreeNeighbors(ctx: PlacementContext, zoneId: number, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
      if (ctx.zoneGrid.tilesZone[ny][nx] !== zoneId) continue;
      if (isPocketFreeTile(ctx.tiles[ny][nx])) n++;
    }
  }
  return n;
}

function pocketSeedScore(ctx: PlacementContext, x: number, y: number, zoneId: number): number {
  const meta = ctx.zoneGrid.meta[zoneId];
  const centerDistance = Math.max(Math.abs(x - meta.centerX), Math.abs(y - meta.centerY));
  const peripheryBonus = centerDistance / Math.max(1, Math.min(ctx.width, ctx.height));
  const cluster = tileNoise(x, y, `${meta.templateZoneId}:pocket-cluster`);
  const ridge = tileNoise(Math.floor(x / 3), Math.floor(y / 3), `${meta.templateZoneId}:pocket-ridge`);
  const roadPenalty = hasRoadOrTownNearby(ctx, x, y, 4) ? 0.35 : 0;
  return cluster * 0.55 + ridge * 0.3 + peripheryBonus * 0.25 - roadPenalty;
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

function canReachPocketArtifact(
  ctx: PlacementContext,
  start: { x: number; y: number },
  target: { x: number; y: number },
  blocked?: { x: number; y: number },
): boolean {
  const seen = new Set<string>();
  const queue: { x: number; y: number }[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.x},${current.y}`;
    if (seen.has(key)) continue;
    if (blocked && current.x === blocked.x && current.y === blocked.y) continue;
    const tile = ctx.tiles[current.y]?.[current.x];
    if (!tile || !isPocketPathTile(tile, target)) continue;
    if (current.x === target.x && current.y === target.y) return true;
    seen.add(key);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const next = { x: current.x + dx, y: current.y + dy };
        if (next.x < 0 || next.x >= ctx.width || next.y < 0 || next.y >= ctx.height) continue;
        if (seen.has(`${next.x},${next.y}`)) continue;
        if (dx !== 0 && dy !== 0 && !canTakeDiagonalStep(ctx, current, next)) continue;
        queue.push(next);
      }
    }
  }
  return false;
}

function canTakeDiagonalStep(
  ctx: PlacementContext,
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const sideA = ctx.tiles[from.y]?.[to.x];
  const sideB = ctx.tiles[to.y]?.[from.x];
  return isPocketPathTile(sideA) && isPocketPathTile(sideB);
}

function isPocketPathTile(tile: MapTile | undefined, target?: { x: number; y: number }): boolean {
  if (!tile) return false;
  if (target && tile.x === target.x && tile.y === target.y) return tile.isPassable;
  return Boolean(tile.isPassable && !tile.decor?.blocking && tile.object?.type !== "wall" && tile.object?.type !== "town_footprint");
}

function snapshotTiles(tiles: MapTile[]): Array<{ tile: MapTile; object: MapTile["object"]; decor: MapTile["decor"]; road: MapTile["road"]; isPassable: boolean; movementCost: number }> {
  const seen = new Set<string>();
  const snapshot: Array<{ tile: MapTile; object: MapTile["object"]; decor: MapTile["decor"]; road: MapTile["road"]; isPassable: boolean; movementCost: number }> = [];
  for (const tile of tiles) {
    const key = `${tile.x},${tile.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    snapshot.push({
      tile,
      object: tile.object ? { ...tile.object } : undefined,
      decor: tile.decor ? { ...tile.decor } : undefined,
      road: tile.road,
      isPassable: tile.isPassable,
      movementCost: tile.movementCost,
    });
  }
  return snapshot;
}

function restoreTiles(snapshot: ReturnType<typeof snapshotTiles>): void {
  for (const entry of snapshot) {
    entry.tile.object = entry.object;
    entry.tile.decor = entry.decor;
    entry.tile.road = entry.road;
    entry.tile.isPassable = entry.isPassable;
    entry.tile.movementCost = entry.movementCost;
  }
}
