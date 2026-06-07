import { SURFACE_LEVEL, UNDERGROUND_LEVEL } from "../map-levels";
import { AdventureBuildingType, DecorKind, GameMap, MapLevelId, MapTile, Position, TerrainType, ZoneMeta } from "../types";
import { getAdventureBuildingLabel } from "../adventure-buildings";
import { paintRoad } from "./roads";
import { pick, shuffle, type RNG } from "./rng";
import type { ConnectionTemplate, MapTemplate, ZoneTemplate } from "./template";
import type { ZoneGrid } from "./zones";

export const UNDERGROUND_ZONE_COMPACTNESS = 4.0;

interface CavernAnchor extends Position {
  radius: number;
  zoneId: number;
  priority: number;
  connects: boolean;
}

export function templateLevel(level: MapLevelId | undefined): MapLevelId {
  return level === UNDERGROUND_LEVEL ? UNDERGROUND_LEVEL : SURFACE_LEVEL;
}

export function hasTemplateLevel(template: MapTemplate, level: MapLevelId): boolean {
  return template.zones.some((zone) => templateLevel(zone.mapLevel) === level);
}

export function filterTemplateForLevel(template: MapTemplate, level: MapLevelId): MapTemplate {
  const zones = template.zones.filter((zone) => templateLevel(zone.mapLevel) === level);
  const kept = new Set(zones.map((zone) => zone.id));
  return {
    ...template,
    zones,
    connections: template.connections.filter((connection) =>
      (connection.connectionType ?? "horizontal") === "horizontal" &&
      kept.has(connection.from) &&
      kept.has(connection.to)
    ),
  };
}

export function buildUndergroundForcedCenters(
  template: MapTemplate,
  _surfaceZones: ZoneMeta[] | undefined,
  width: number,
  height: number,
): Map<string, Position> {
  const undergroundZones = template.zones.filter((zone) => templateLevel(zone.mapLevel) === UNDERGROUND_LEVEL);
  const forced = new Map<string, Position>();
  const occupied: Position[] = [];

  for (const zone of undergroundZones) {
    const target = { x: Math.round(zone.nx * (width - 1)), y: Math.round(zone.ny * (height - 1)) };
    const snapped = snapUndergroundCenter(target, occupied, width, height);
    forced.set(zone.id, snapped);
    occupied.push(snapped);
  }

  return forced;
}

export function normalizeUndergroundTerrain(tiles: MapTile[][], zoneGrid: ZoneGrid): void {
  for (const row of tiles) {
    for (const tile of row) {
      const zone = zoneGrid.meta[tile.zoneId ?? 0];
      const lava = zone?.baseTerrain === TerrainType.LAVA;
      tile.terrain = lava ? terrainWithLavaNoise(tile.x, tile.y) : TerrainType.SUBTERRANEAN;
      tile.elevation = lava && tile.terrain === TerrainType.LAVA ? 1 : 0;
      tile.isPassable = tile.terrain !== TerrainType.LAVA;
      tile.movementCost = tile.isPassable ? 100 : 999;
      tile.worldEdge = undefined;
    }
  }
}

export function carveUndergroundCaverns(
  tiles: MapTile[][],
  zoneGrid: ZoneGrid,
  template: MapTemplate,
  width: number,
  height: number,
): void {
  const open = new Set<string>();
  const zonesById = new Map(template.zones.map((zone) => [zone.id, zone]));

  for (const zone of zoneGrid.meta) {
    const templateZone = zonesById.get(zone.templateZoneId);
    const radius = undergroundRadius(width, height, zoneGrid.meta.length, templateZone);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const dx = x - zone.centerX;
        const dy = y - zone.centerY;
        const wobble = tileNoise(x, y, zone.id) * 2.2 - 1.1;
        if (Math.hypot(dx, dy) <= radius + wobble) open.add(key(x, y));
      }
    }
  }

  for (const connection of template.connections.filter((item) => (item.connectionType ?? "horizontal") === "horizontal")) {
    const from = zoneGrid.meta.find((zone) => zone.templateZoneId === connection.from);
    const to = zoneGrid.meta.find((zone) => zone.templateZoneId === connection.to);
    if (!from || !to) continue;
    carveCorridor(open, from, to, width, height);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      if (open.has(key(x, y))) {
        if (tile.terrain !== TerrainType.LAVA) {
          tile.isPassable = true;
          tile.movementCost = 100;
        }
        continue;
      }
      sealRock(tile);
    }
  }
}

export function placeTemplateSubterraneanGatePairs(
  surface: GameMap,
  underground: GameMap,
  template: MapTemplate,
  playerCount = 0,
): void {
  const undergroundMask = buildSurfaceContourMask(surface);
  const verticalConnections = template.connections.filter((connection) => connection.connectionType === "subterranean_gate");
  const nonPlayerSurfaceZones = (surface.zones ?? [])
    .filter((zone) => zone.type !== "player")
    .sort((a, b) => a.id - b.id);
  const undergroundZones = (underground.zones ?? [])
    .filter((zone) => zone.mapLevel === UNDERGROUND_LEVEL)
    .sort((a, b) => a.id - b.id);
  if (nonPlayerSurfaceZones.length === 0 || undergroundZones.length === 0) return;

  const targetPairCount = Math.max(0, playerCount);
  const placedPositions: Position[] = [];
  for (let index = 0; index < targetPairCount; index++) {
    const connection = verticalConnections[index % Math.max(1, verticalConnections.length)];
    const surfaceZoneId = connection ? findZoneIdForLevel(template, connection, SURFACE_LEVEL) : null;
    const undergroundZoneId = connection ? findZoneIdForLevel(template, connection, UNDERGROUND_LEVEL) : null;

    const connectionSurfaceZone = surfaceZoneId
      ? surface.zones?.find((zone) => zone.templateZoneId === surfaceZoneId)
      : undefined;
    const preferredSurfaceZone = connectionSurfaceZone ?? nonPlayerSurfaceZones[index % nonPlayerSurfaceZones.length];
    const undergroundZone = undergroundZoneId
      ? underground.zones?.find((zone) => zone.templateZoneId === undergroundZoneId) ?? undergroundZones[index % undergroundZones.length]
      : undergroundZones[index % undergroundZones.length];
    if (!preferredSurfaceZone || !undergroundZone) continue;

    const surfacePlacement = findMirroredSurfaceGatePlacement(
      surface,
      underground,
      preferredSurfaceZone,
      undergroundMask,
      placedPositions
    );
    if (!surfacePlacement) continue;
    const { zone: surfaceZone, tile: surfaceTile } = surfacePlacement;
    if (!surfaceTile) continue;

    const undergroundTile = prepareMirroredSubterraneanGateTile(underground, surfaceTile, undergroundMask);
    if (!undergroundTile) continue;

    const surfaceId = `adv-subterranean-gate-surface-${index}-${surfaceTile.x}-${surfaceTile.y}`;
    const undergroundId = `adv-subterranean-gate-underground-${index}-${undergroundTile.x}-${undergroundTile.y}`;
    surfaceTile.object = makeSubterraneanGate(surfaceId, undergroundId, UNDERGROUND_LEVEL, undergroundTile);
    undergroundTile.object = makeSubterraneanGate(undergroundId, surfaceId, SURFACE_LEVEL, surfaceTile);
    placedPositions.push({ x: surfaceTile.x, y: surfaceTile.y });
    carveRoadAccess(surface, surfaceTile, surfaceZone);
    carveRoadAccess(underground, undergroundTile, zoneForTile(underground, undergroundTile) ?? undergroundZone, undergroundMask);
  }
}

export function finalizeUndergroundCavernNetwork(
  underground: GameMap,
  template: MapTemplate,
  surface?: GameMap,
): void {
  const mask = surface ? buildSurfaceContourMask(surface) : undefined;
  const anchorsByZone = collectCavernAnchors(underground);
  const open = new Set<string>();

  for (const anchors of anchorsByZone.values()) {
    for (const anchor of anchors) carveRoom(open, underground, anchor, mask);
    const skeletonAnchors = anchors
      .filter((anchor) => anchor.connects);
    for (const [from, to] of buildAnchorSpanningTree(skeletonAnchors)) {
      carveWindingTunnel(open, underground, from, to, mask);
    }
  }

  for (const connection of template.connections.filter((item) => (item.connectionType ?? "horizontal") === "horizontal")) {
    const from = underground.zones?.find((zone) => zone.templateZoneId === connection.from);
    const to = underground.zones?.find((zone) => zone.templateZoneId === connection.to);
    if (!from || !to) continue;
    const tunnelRadius = tunnelRadiusForMap(underground.width, underground.height);
    carveWindingTunnel(
      open,
      underground,
      { x: from.centerX, y: from.centerY, zoneId: from.id, radius: tunnelRadius, priority: 0, connects: true },
      { x: to.centerX, y: to.centerY, zoneId: to.id, radius: tunnelRadius, priority: 0, connects: true },
      mask,
      1,
    );
  }

  preserveExistingPaths(open, underground, mask);

  for (const row of underground.tiles) {
    for (const tile of row) {
      if (mask && !mask[tile.y]?.[tile.x]) {
        sealRock(tile, "ug-contour-rock");
      } else if (open.has(key(tile.x, tile.y))) {
        openUndergroundTile(tile);
      } else {
        sealRock(tile);
      }
    }
  }
}

function preserveExistingPaths(open: Set<string>, map: GameMap, mask?: boolean[][]): void {
  const seeds: Position[] = [];
  for (const row of map.tiles) {
    for (const tile of row) {
      if (mask && !mask[tile.y]?.[tile.x]) continue;
      const hasObject = tile.object && tile.object.type !== "wall";
      if (!tile.road && !hasObject) continue;
      seeds.push({ x: tile.x, y: tile.y });
    }
  }
  if (seeds.length === 0) return;

  const seedKeys = new Set(seeds.map((p) => key(p.x, p.y)));
  for (const seedKey of seedKeys) open.add(seedKey);

  for (const seed of seeds) {
    const tile = map.tiles[seed.y]?.[seed.x];
    if (!tile?.road) continue;
    for (const offset of CARDINAL_OFFSETS) {
      const nx = seed.x + offset.x;
      const ny = seed.y + offset.y;
      if (!isInsideMap(map, nx, ny)) continue;
      if (mask && !mask[ny]?.[nx]) continue;
      open.add(key(nx, ny));
    }
  }
}

const CARDINAL_OFFSETS: Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function applySurfaceContourToUnderground(surface: GameMap, underground: GameMap): void {
  const mask = buildSurfaceContourMask(surface);
  for (let y = 0; y < underground.height; y++) {
    for (let x = 0; x < underground.width; x++) {
      if (mask[y]?.[x]) continue;
      sealRock(underground.tiles[y][x], "ug-contour-rock");
    }
  }
}

export function ensureUndergroundObjectAccess(underground: GameMap, surface?: GameMap): void {
  const mask = surface ? buildSurfaceContourMask(surface) : undefined;
  const starts = collectUndergroundAccessStarts(underground);
  if (starts.length === 0) return;
  const reachable = floodReachableUnderground(underground, starts);
  const objects = collectUsefulUndergroundObjectTiles(underground)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (const tile of objects) {
    if (isTileOrAdjacentReachable(underground, tile, reachable)) continue;
    const anchor = findNearestReachableTile(underground, tile, reachable, mask);
    if (!anchor) continue;
    const path = maskAwarePath(anchor, tile, underground.width, underground.height, mask);
    for (const position of path) {
      const pathTile = underground.tiles[position.y]?.[position.x];
      if (!pathTile || (mask && !mask[position.y]?.[position.x])) continue;
      openUndergroundTile(pathTile);
      reachable.add(key(position.x, position.y));
    }
  }
  clearBlockingDecorFromPassableUnderground(underground);
}

export function prefixMapObjectIds(map: GameMap, prefix: string): void {
  for (const row of map.tiles) {
    for (const tile of row) {
      if (!tile.object) continue;
      tile.object.id = `${prefix}-${tile.object.id}`;
      if (tile.object.targetId) tile.object.targetId = `${prefix}-${tile.object.targetId}`;
    }
  }
}

const UNDERGROUND_BLOCKING_DECOR: DecorKind[] = [
  "underground-stalagmite-cluster",
  "underground-crystal-ribs",
  "underground-mushroom-thicket",
  "underground-rubble-pillar",
  "underground-root-snarl",
];

const UNDERGROUND_DECOR_FILL_RATIO = 0.95;
const UNDERGROUND_ROAD_CLEARANCE = 1;
const UNDERGROUND_OBJECT_CLEARANCE = 1;

export function placeUndergroundBlockingDecor(map: GameMap, rng: RNG): void {
  const candidates = collectUndergroundDecorCandidates(map, rng);
  const target = Math.floor(candidates.length * UNDERGROUND_DECOR_FILL_RATIO);
  if (target <= 0) return;

  let placed = 0;
  for (const candidate of candidates) {
    if (placed >= target) return;
    const tile = map.tiles[candidate.y]?.[candidate.x];
    if (!tile || !canPlaceUndergroundDecor(map, candidate.x, candidate.y)) continue;
    tile.decor = {
      type: pick(rng, UNDERGROUND_BLOCKING_DECOR),
      blocking: true,
      variant: Math.floor(rng() * UNDERGROUND_BLOCKING_DECOR.length),
    };
    tile.isPassable = false;
    tile.movementCost = 999;
    placed++;
  }
}

function collectUndergroundDecorCandidates(
  map: GameMap,
  rng: RNG,
): Position[] {
  const candidates: Position[] = [];
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      if (!canPlaceUndergroundDecor(map, x, y)) continue;
      candidates.push({ x, y });
    }
  }
  return shuffle(rng, candidates);
}

function canPlaceUndergroundDecor(
  map: GameMap,
  x: number,
  y: number,
): boolean {
  const tile = map.tiles[y]?.[x];
  if (!tile || !tile.isPassable || tile.worldEdge || tile.object || tile.decor?.blocking || tile.road) return false;
  if (tile.elevation > 0) return false;
  if (tile.terrain === TerrainType.WATER || tile.terrain === TerrainType.LAVA || tile.terrain === TerrainType.MOUNTAIN) return false;
  if (hasRaisedWallBehind(map, x, y)) return false;
  if (hasRoadNearby(map, x, y, UNDERGROUND_ROAD_CLEARANCE)) return false;
  if (hasImportantUndergroundObjectNearby(map, x, y, UNDERGROUND_OBJECT_CLEARANCE)) return false;
  return true;
}

function hasRoadNearby(map: GameMap, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (map.tiles[y + dy]?.[x + dx]?.road) return true;
    }
  }
  return false;
}

function hasImportantUndergroundObjectNearby(map: GameMap, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const object = map.tiles[y + dy]?.[x + dx]?.object;
      if (!object || object.type === "wall") continue;
      if (
        object.type === "town" ||
        object.type === "town_footprint" ||
        object.type === "gate" ||
        object.type === "building" ||
        object.type === "resource" ||
        object.type === "artifact" ||
        object.type === "monster" ||
        object.type === "adventure_building"
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasRaisedWallBehind(map: GameMap, x: number, y: number): boolean {
  const tile = map.tiles[y - 1]?.[x];
  if (!tile) return false;
  return tile.elevation > 0 || Boolean(tile.worldEdge) || tile.terrain === TerrainType.MOUNTAIN || tile.object?.type === "wall";
}


function snapUndergroundCenter(target: Position, occupied: Position[], width: number, height: number): Position {
  const margin = Math.max(4, Math.floor(Math.min(width, height) * 0.08));
  const clamped = {
    x: clamp(target.x, margin, width - margin - 1),
    y: clamp(target.y, margin, height - margin - 1),
  };
  if (!occupied.some((item) => Math.hypot(item.x - clamped.x, item.y - clamped.y) < margin)) return clamped;

  for (let radius = margin; radius < Math.max(width, height); radius += 2) {
    const candidates: Position[] = [
      { x: clamped.x + radius, y: clamped.y },
      { x: clamped.x - radius, y: clamped.y },
      { x: clamped.x, y: clamped.y + radius },
      { x: clamped.x, y: clamped.y - radius },
    ].map((item) => ({
      x: clamp(item.x, margin, width - margin - 1),
      y: clamp(item.y, margin, height - margin - 1),
    }));
    const found = candidates.find((item) => !occupied.some((other) => Math.hypot(other.x - item.x, other.y - item.y) < margin));
    if (found) return found;
  }
  return clamped;
}

function terrainWithLavaNoise(x: number, y: number): TerrainType {
  return tileNoise(x, y, 991) > 0.56 ? TerrainType.LAVA : TerrainType.DIRT;
}

function undergroundRadius(width: number, height: number, zoneCount: number, zone?: ZoneTemplate): number {
  const mapScale = Math.sqrt((width * height) / Math.max(1, zoneCount));
  const size = Math.sqrt(zone?.sizeWeight ?? 1);
  return Math.max(5, mapScale * size / Math.sqrt(UNDERGROUND_ZONE_COMPACTNESS));
}

function carveCorridor(open: Set<string>, from: ZoneMeta, to: ZoneMeta, width: number, height: number): void {
  const steps = Math.max(Math.abs(from.centerX - to.centerX), Math.abs(from.centerY - to.centerY), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(from.centerX + (to.centerX - from.centerX) * t);
    const y = Math.round(from.centerY + (to.centerY - from.centerY) * t);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx <= 0 || nx >= width - 1 || ny <= 0 || ny >= height - 1) continue;
        open.add(key(nx, ny));
      }
    }
  }
}

function collectCavernAnchors(map: GameMap): Map<number, CavernAnchor[]> {
  const anchorsByZone = new Map<number, CavernAnchor[]>();
  const baseRadius = roomRadiusForMap(map.width, map.height, map.zones?.length ?? 1);

  for (const zone of map.zones ?? []) {
    pushAnchor(anchorsByZone, {
      x: zone.centerX,
      y: zone.centerY,
      zoneId: zone.id,
      radius: baseRadius,
      priority: 0,
      connects: true,
    });
  }

  for (const row of map.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (!object || object.type === "wall" || tile.zoneId === undefined) continue;
      pushAnchor(anchorsByZone, {
        x: tile.x,
        y: tile.y,
        zoneId: tile.zoneId,
        radius: roomRadiusForObject(object.type, baseRadius),
        priority: objectAnchorPriority(object.type),
        connects: objectShouldConnectToSkeleton(object.type),
      });
    }
  }

  for (const [zoneId, anchors] of anchorsByZone) {
    const unique = new Map<string, CavernAnchor>();
    for (const anchor of anchors.sort((a, b) => a.priority - b.priority)) {
      unique.set(key(anchor.x, anchor.y), anchor);
    }
    anchorsByZone.set(zoneId, [...unique.values()].sort((a, b) => a.priority - b.priority));
  }

  return anchorsByZone;
}

function pushAnchor(anchorsByZone: Map<number, CavernAnchor[]>, anchor: CavernAnchor): void {
  const anchors = anchorsByZone.get(anchor.zoneId) ?? [];
  anchors.push(anchor);
  anchorsByZone.set(anchor.zoneId, anchors);
}

function roomRadiusForMap(width: number, height: number, zoneCount: number): number {
  const zoneScale = Math.sqrt((width * height) / Math.max(1, zoneCount));
  return clamp(Math.round(zoneScale / 10), 2, 5);
}

function tunnelRadiusForMap(width: number, height: number): number {
  return Math.min(width, height) >= 108 ? 2 : 1;
}

function roomRadiusForObject(type: NonNullable<MapTile["object"]>["type"], baseRadius: number): number {
  switch (type) {
    case "town":
      return baseRadius + 2;
    case "town_footprint":
      return Math.max(3, baseRadius - 1);
    case "building":
      return baseRadius;
    case "gate":
      return Math.max(3, baseRadius - 1);
    case "adventure_building":
      return Math.max(3, baseRadius - 1);
    case "resource":
    case "artifact":
    case "monster":
      return Math.max(1, baseRadius - 3);
    default:
      return Math.max(1, baseRadius - 2);
  }
}

function objectAnchorPriority(type: NonNullable<MapTile["object"]>["type"]): number {
  switch (type) {
    case "town":
      return 0;
    case "building":
    case "gate":
      return 1;
    case "adventure_building":
      return 2;
    case "monster":
    case "artifact":
    case "resource":
      return 3;
    default:
      return 4;
  }
}

function objectShouldConnectToSkeleton(type: NonNullable<MapTile["object"]>["type"]): boolean {
  return type !== "town_footprint";
}

function buildAnchorSpanningTree(anchors: CavernAnchor[]): Array<[CavernAnchor, CavernAnchor]> {
  if (anchors.length < 2) return [];
  const connected = [anchors[0]];
  const remaining = anchors.slice(1);
  const edges: Array<[CavernAnchor, CavernAnchor]> = [];

  while (remaining.length > 0) {
    let best: { connectedIndex: number; remainingIndex: number; distance: number } | null = null;
    for (let i = 0; i < connected.length; i++) {
      for (let j = 0; j < remaining.length; j++) {
        const distance = squaredDistance(connected[i], remaining[j]);
        if (!best || distance < best.distance) best = { connectedIndex: i, remainingIndex: j, distance };
      }
    }
    if (!best) break;
    const next = remaining.splice(best.remainingIndex, 1)[0];
    edges.push([connected[best.connectedIndex], next]);
    connected.push(next);
  }

  return edges;
}

function carveRoom(open: Set<string>, map: GameMap, anchor: CavernAnchor, mask?: boolean[][]): void {
  for (let dy = -anchor.radius; dy <= anchor.radius; dy++) {
    for (let dx = -anchor.radius; dx <= anchor.radius; dx++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (!isInsideMap(map, x, y) || (mask && !mask[y]?.[x])) continue;
      const distance = Math.hypot(dx, dy);
      const edgeNoise = tileNoise(x, y, anchor.zoneId + anchor.radius * 17) * 2.4 - 1.2;
      if (distance <= anchor.radius + edgeNoise) open.add(key(x, y));
    }
  }
}

function carveWindingTunnel(
  open: Set<string>,
  map: GameMap,
  from: CavernAnchor,
  to: CavernAnchor,
  mask?: boolean[][],
  radiusAdjustment = 0,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const steps = Math.max(Math.ceil(distance * 1.7), 1);
  const normal = { x: -dy / distance, y: dx / distance };
  const salt = from.zoneId * 7349 + to.zoneId * 193 + from.x * 17 + to.y * 31;
  const radius = Math.max(1, tunnelRadiusForMap(map.width, map.height) + radiusAdjustment);
  const amplitude = Math.min(7, Math.max(2, distance / 10));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin((t * Math.PI * 2) + tileNoise(from.x, to.y, salt) * Math.PI);
    const jitter = tileNoise(Math.round(from.x + dx * t), Math.round(from.y + dy * t), salt + i) * 2 - 1;
    const offset = (wave * 0.65 + jitter * 0.35) * amplitude;
    const x = Math.round(from.x + dx * t + normal.x * offset);
    const y = Math.round(from.y + dy * t + normal.y * offset);
    carveBrush(open, map, x, y, radius, mask, salt + i);
  }
}

function carveBrush(
  open: Set<string>,
  map: GameMap,
  centerX: number,
  centerY: number,
  radius: number,
  mask: boolean[][] | undefined,
  salt: number,
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (!isInsideMap(map, x, y) || (mask && !mask[y]?.[x])) continue;
      const noise = tileNoise(x, y, salt) * 0.8 - 0.4;
      if (Math.hypot(dx, dy) <= radius + noise) open.add(key(x, y));
    }
  }
}

function openUndergroundTile(tile: MapTile): void {
  if (tile.object?.type === "wall") tile.object = undefined;
  if (tile.decor?.blocking) tile.decor = undefined;
  tile.worldEdge = undefined;
  if (tile.terrain === TerrainType.WATER || tile.terrain === TerrainType.MOUNTAIN || tile.terrain === TerrainType.LAVA) {
    tile.terrain = TerrainType.SUBTERRANEAN;
    tile.elevation = 0;
  }
  if (tile.object?.type === "town_footprint") {
    tile.isPassable = false;
    tile.movementCost = 999;
    return;
  }
  tile.isPassable = true;
  tile.movementCost = 100;
}

function sealRock(tile: MapTile, idPrefix = "ug-rock"): void {
  tile.terrain = TerrainType.MOUNTAIN;
  tile.elevation = Math.max(2, tile.elevation);
  tile.isPassable = false;
  tile.movementCost = 999;
  tile.road = undefined;
  tile.decor = undefined;
  tile.object = {
    type: "wall",
    id: `${idPrefix}-${tile.x}-${tile.y}`,
    subtype: "natural",
  };
}

function isInsideMap(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && x < map.width && y >= 0 && y < map.height;
}

function squaredDistance(a: Position, b: Position): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function findZoneIdForLevel(template: MapTemplate, connection: ConnectionTemplate, level: MapLevelId): string | null {
  const from = template.zones.find((zone) => zone.id === connection.from);
  const to = template.zones.find((zone) => zone.id === connection.to);
  if (from && templateLevel(from.mapLevel) === level) return from.id;
  if (to && templateLevel(to.mapLevel) === level) return to.id;
  return null;
}

function isVerticalTransportTo(tile: MapTile, targetLevel: MapLevelId): boolean {
  return Boolean(
    tile.object?.type === "adventure_building" &&
    (tile.object.subtype === AdventureBuildingType.SUBTERRANEAN_GATE || tile.object.subtype === AdventureBuildingType.STARGATE) &&
    tile.object.targetLevel === targetLevel
  );
}

function collectUndergroundAccessStarts(map: GameMap): Position[] {
  const starts: Position[] = [];
  for (const row of map.tiles) {
    for (const tile of row) {
      if (isVerticalTransportTo(tile, SURFACE_LEVEL) && tile.isPassable) starts.push({ x: tile.x, y: tile.y });
    }
  }
  return starts;
}

function collectUsefulUndergroundObjectTiles(map: GameMap): MapTile[] {
  const objects: MapTile[] = [];
  for (const row of map.tiles) {
    for (const tile of row) {
      if (!tile.object || tile.object.type === "wall" || tile.object.type === "town_footprint") continue;
      objects.push(tile);
    }
  }
  return objects;
}

function clearBlockingDecorFromPassableUnderground(map: GameMap): void {
  for (const row of map.tiles) {
    for (const tile of row) {
      if (!tile.isPassable) continue;
      if (tile.decor?.blocking) tile.decor = undefined;
      if (tile.object?.type === "wall") tile.object = undefined;
    }
  }
}

function floodReachableUnderground(map: GameMap, starts: Position[]): Set<string> {
  const seen = new Set<string>();
  const queue = starts.slice();
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = key(current.x, current.y);
    if (seen.has(currentKey)) continue;
    const tile = map.tiles[current.y]?.[current.x];
    if (!tile?.isPassable) continue;
    seen.add(currentKey);
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      if (!isInsideMap(map, next.x, next.y) || seen.has(key(next.x, next.y))) continue;
      queue.push(next);
    }
  }
  return seen;
}

function isTileOrAdjacentReachable(map: GameMap, tile: MapTile, reachable: Set<string>): boolean {
  if (tile.isPassable && reachable.has(key(tile.x, tile.y))) return true;
  return [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ].some((position) => {
    const neighbor = map.tiles[position.y]?.[position.x];
    return Boolean(neighbor?.isPassable && reachable.has(key(position.x, position.y)));
  });
}

function findNearestReachableTile(
  map: GameMap,
  target: Position,
  reachable: Set<string>,
  mask?: boolean[][],
): Position | null {
  let best: { position: Position; distance: number } | null = null;
  for (const item of reachable) {
    const [xRaw, yRaw] = item.split(",");
    const position = { x: Number(xRaw), y: Number(yRaw) };
    if (mask && !mask[position.y]?.[position.x]) continue;
    const distance = squaredDistance(position, target);
    if (!best || distance < best.distance) best = { position, distance };
  }
  return best?.position ?? null;
}

const MIN_GATE_TOWN_DISTANCE = 8;

function findMirroredSubterraneanGateSurfaceTile(
  surface: GameMap,
  underground: GameMap,
  zone: ZoneMeta,
  undergroundMask: boolean[][],
  placedPositions: Position[],
  requireSpacing = false,
): MapTile | null {
  const townPositions = collectTownPositions(surface, zone.id);
  const minimumPairDistance = getMinimumSubterraneanGateDistance(surface.width, surface.height);
  const candidates: MapTile[] = [];

  for (const row of surface.tiles) {
    for (const tile of row) {
      if (tile.zoneId !== zone.id || !isValidSubterraneanGateTile(tile)) continue;
      if (!canPlaceMirroredSubterraneanGate(underground, tile, undergroundMask)) continue;
      const tooCloseTown = townPositions.some(
        (town) => Math.abs(tile.x - town.x) + Math.abs(tile.y - town.y) < MIN_GATE_TOWN_DISTANCE
      );
      if (!tooCloseTown) candidates.push(tile);
    }
  }

  const fallbackCandidates = candidates.length > 0
    ? candidates
    : collectAllValidGateTiles(surface, zone).filter((tile) => canPlaceMirroredSubterraneanGate(underground, tile, undergroundMask));
  const spacedCandidates = fallbackCandidates.filter((tile) => isFarFromPlacedGates(tile, placedPositions, minimumPairDistance));
  if (requireSpacing && placedPositions.length > 0) {
    return pickBestMirroredGateTile(spacedCandidates, zone, placedPositions);
  }
  const pool = spacedCandidates.length > 0 ? spacedCandidates : fallbackCandidates;
  return pickBestMirroredGateTile(pool, zone, placedPositions);
}

function pickBestMirroredGateTile(candidates: MapTile[], zone: ZoneMeta, placedPositions: Position[]): MapTile | null {
  let best: { tile: MapTile; score: number } | null = null;
  for (const tile of candidates) {
    const zoneDistance = Math.abs(tile.x - zone.centerX) + Math.abs(tile.y - zone.centerY);
    const pairDistance = nearestPlacedGateDistance(tile, placedPositions);
    const score = zoneDistance - pairDistance * 1.25;
    if (!best || score < best.score) best = { tile, score };
  }
  return best?.tile ?? null;
}

function findMirroredSurfaceGatePlacement(
  surface: GameMap,
  underground: GameMap,
  preferredZone: ZoneMeta,
  undergroundMask: boolean[][],
  placedPositions: Position[],
): { zone: ZoneMeta; tile: MapTile } | null {
  const nonPlayerZones = (surface.zones ?? [])
    .filter((zone) => zone.type !== "player")
    .sort((a, b) =>
      squaredDistance({ x: a.centerX, y: a.centerY }, { x: preferredZone.centerX, y: preferredZone.centerY }) -
      squaredDistance({ x: b.centerX, y: b.centerY }, { x: preferredZone.centerX, y: preferredZone.centerY })
    );
  const zones = preferredZone.type === "player"
    ? nonPlayerZones
    : [preferredZone, ...nonPlayerZones.filter((zone) => zone.id !== preferredZone.id)];

  for (const zone of zones) {
    const tile =
      findMirroredSubterraneanGateSurfaceTile(surface, underground, zone, undergroundMask, placedPositions, true) ??
      prepareGateTileAtZoneCenter(surface, zone, undefined, placedPositions, true);
    if (tile && canPlaceMirroredSubterraneanGate(underground, tile, undergroundMask)) return { zone, tile };
  }

  for (const zone of zones) {
    const tile =
      findMirroredSubterraneanGateSurfaceTile(surface, underground, zone, undergroundMask, placedPositions) ??
      prepareGateTileAtZoneCenter(surface, zone, undefined, placedPositions);
    if (tile && canPlaceMirroredSubterraneanGate(underground, tile, undergroundMask)) return { zone, tile };
  }
  return null;
}

function zoneForTile(map: GameMap, tile: MapTile): ZoneMeta | null {
  return (map.zones ?? []).find((zone) => zone.id === tile.zoneId) ?? null;
}

function prepareMirroredSubterraneanGateTile(map: GameMap, surfaceTile: Pick<MapTile, "x" | "y">, mask?: boolean[][]): MapTile | null {
  const tile = map.tiles[surfaceTile.y]?.[surfaceTile.x];
  if (!tile || tile.worldEdge || (mask && !mask[surfaceTile.y]?.[surfaceTile.x])) return null;
  if (tile.object?.type === "town" || tile.object?.type === "town_footprint") return null;
  return openTileForGate(tile);
}

function canPlaceMirroredSubterraneanGate(map: GameMap, surfaceTile: Pick<MapTile, "x" | "y">, mask: boolean[][]): boolean {
  const tile = map.tiles[surfaceTile.y]?.[surfaceTile.x];
  return Boolean(
    tile &&
    !tile.worldEdge &&
    mask[surfaceTile.y]?.[surfaceTile.x] &&
    tile.object?.type !== "town" &&
    tile.object?.type !== "town_footprint"
  );
}

function getMinimumSubterraneanGateDistance(width: number, height: number): number {
  return Math.max(4, Math.floor(Math.min(width, height) / 14));
}

function isFarFromPlacedGates(tile: Pick<MapTile, "x" | "y">, placedPositions: Position[], minDistance: number): boolean {
  return placedPositions.every((position) => chebyshevDistance(tile, position) >= minDistance);
}

function nearestPlacedGateDistance(tile: Pick<MapTile, "x" | "y">, placedPositions: Position[]): number {
  if (placedPositions.length === 0) return 0;
  return Math.min(...placedPositions.map((position) => chebyshevDistance(tile, position)));
}

function chebyshevDistance(a: Pick<Position, "x" | "y">, b: Pick<Position, "x" | "y">): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function collectTownPositions(map: GameMap, zoneId: number): Position[] {
  const positions: Position[] = [];
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.zoneId === zoneId && tile.object?.type === "town") {
        positions.push({ x: tile.x, y: tile.y });
      }
    }
  }
  return positions;
}

function collectAllValidGateTiles(map: GameMap, zone: ZoneMeta, mask?: boolean[][]): MapTile[] {
  const tiles: MapTile[] = [];
  for (const row of map.tiles) {
    for (const tile of row) {
      if (mask && !mask[tile.y]?.[tile.x]) continue;
      if (tile.zoneId === zone.id && isValidSubterraneanGateTile(tile)) tiles.push(tile);
    }
  }
  return tiles;
}

function openTileForGate(tile: MapTile): MapTile {
  tile.object = undefined;
  tile.decor = undefined;
  tile.road = undefined;
  if (
    tile.terrain === TerrainType.WATER ||
    tile.terrain === TerrainType.MOUNTAIN ||
    tile.terrain === TerrainType.LAVA
  ) {
    tile.terrain = TerrainType.DIRT;
    tile.elevation = 0;
  }
  tile.isPassable = true;
  tile.movementCost = 100;
  return tile;
}

function isValidSubterraneanGateTile(tile: MapTile): boolean {
  return Boolean(
    tile.isPassable &&
    tile.terrain !== TerrainType.WATER &&
    tile.terrain !== TerrainType.LAVA &&
    !tile.road &&
    !tile.decor?.blocking &&
    !tile.object &&
    !tile.worldEdge
  );
}

function prepareGateTileAtZoneCenter(
  map: GameMap,
  zone: ZoneMeta,
  mask?: boolean[][],
  placedPositions: Position[] = [],
  requireSpacing = false,
): MapTile | null {
  const minimumPairDistance = getMinimumSubterraneanGateDistance(map.width, map.height);
  let fallback: MapTile | null = null;
  for (let radius = 0; radius < Math.max(map.width, map.height); radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = zone.centerX + dx;
        const y = zone.centerY + dy;
        const tile = map.tiles[y]?.[x];
        if (mask && !mask[y]?.[x]) continue;
        if (!tile || tile.worldEdge || tile.object?.type === "town" || tile.object?.type === "town_footprint") continue;
        if (tile.zoneId !== zone.id) continue;
        if (fallback === null) fallback = tile;
        if (!isFarFromPlacedGates(tile, placedPositions, minimumPairDistance)) continue;
        return openTileForGate(tile);
      }
    }
  }
  if (requireSpacing && placedPositions.length > 0) return null;
  return fallback ? openTileForGate(fallback) : null;
}

function buildSurfaceContourMask(surface: GameMap): boolean[][] {
  const mask: boolean[][] = [];
  for (let y = 0; y < surface.height; y++) {
    mask[y] = [];
    for (let x = 0; x < surface.width; x++) {
      const tile = surface.tiles[y]?.[x];
      mask[y][x] = Boolean(tile && !tile.worldEdge);
    }
  }
  return mask;
}

function makeSubterraneanGate(
  id: string,
  targetId: string,
  targetLevel: MapLevelId,
  target: Pick<MapTile, "x" | "y">,
): NonNullable<MapTile["object"]> {
  return {
    type: "adventure_building",
    id,
    subtype: AdventureBuildingType.SUBTERRANEAN_GATE,
    name: getAdventureBuildingLabel(AdventureBuildingType.SUBTERRANEAN_GATE),
    targetId,
    targetLevel,
    targetPosition: { x: target.x, y: target.y, level: targetLevel },
  };
}

function carveRoadAccess(map: GameMap, gate: MapTile, zone: ZoneMeta, mask?: boolean[][]): void {
  const anchor = findNearestTown(map, zone) ?? { x: zone.centerX, y: zone.centerY };
  const path = maskAwarePath(anchor, gate, map.width, map.height, mask);
  if (path.length <= 1) return;
  if (mask) {
    for (const position of path) {
      const tile = map.tiles[position.y]?.[position.x];
      if (!tile || !mask[position.y]?.[position.x]) continue;
      openUndergroundTile(tile);
    }
  }
  paintRoad(map.tiles, path.slice(0, -1), "dirt", { allowWaterRoads: false });
  gate.road = undefined;
}

function findNearestTown(map: GameMap, zone: ZoneMeta): Position | null {
  let best: { position: Position; distance: number } | null = null;
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.zoneId !== zone.id || tile.object?.type !== "town") continue;
      const distance = Math.abs(tile.x - zone.centerX) + Math.abs(tile.y - zone.centerY);
      if (!best || distance < best.distance) best = { position: { x: tile.x, y: tile.y }, distance };
    }
  }
  return best?.position ?? null;
}

function manhattanPath(from: Position, to: Position, width: number, height: number): Position[] {
  const path: Position[] = [];
  let x = clamp(from.x, 0, width - 1);
  let y = clamp(from.y, 0, height - 1);
  path.push({ x, y });
  while (x !== to.x) {
    x += Math.sign(to.x - x);
    path.push({ x, y });
  }
  while (y !== to.y) {
    y += Math.sign(to.y - y);
    path.push({ x, y });
  }
  return path;
}

function maskAwarePath(
  from: Position,
  to: Position,
  width: number,
  height: number,
  mask?: boolean[][],
): Position[] {
  const direct = manhattanPath(from, to, width, height);
  if (!mask || direct.every((position) => mask[position.y]?.[position.x])) return direct;
  return maskedPath(from, to, width, height, mask);
}

function maskedPath(from: Position, to: Position, width: number, height: number, mask: boolean[][]): Position[] {
  const start = { x: clamp(from.x, 0, width - 1), y: clamp(from.y, 0, height - 1) };
  const goal = { x: clamp(to.x, 0, width - 1), y: clamp(to.y, 0, height - 1) };
  if (!mask[start.y]?.[start.x] || !mask[goal.y]?.[goal.x]) return [];

  const queue: Position[] = [start];
  const seen = new Set([key(start.x, start.y)]);
  const previous = new Map<string, Position>();
  const directions: Position[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (current.x === goal.x && current.y === goal.y) break;
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
      if (!mask[next.y]?.[next.x]) continue;
      const nextKey = key(next.x, next.y);
      if (seen.has(nextKey)) continue;
      seen.add(nextKey);
      previous.set(nextKey, current);
      queue.push(next);
    }
  }

  const goalKey = key(goal.x, goal.y);
  if (!seen.has(goalKey)) return [];
  const path: Position[] = [goal];
  let currentKey = goalKey;
  while (currentKey !== key(start.x, start.y)) {
    const parent = previous.get(currentKey);
    if (!parent) return [];
    path.push(parent);
    currentKey = key(parent.x, parent.y);
  }
  return path.reverse();
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function tileNoise(x: number, y: number, salt: number): number {
  let value = 2166136261;
  const input = `${x}:${y}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  value += value << 13;
  value ^= value >>> 7;
  return (value >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
