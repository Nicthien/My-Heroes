import { MapTile, Position, RoadType, TerrainType } from "../types";
import { findBorderTiles, ZoneGrid } from "./zones";
import { MapTemplate, ConnectionTemplate, WallType } from "./template";

export interface Chokepoint {
  x: number;
  y: number;
  roadAxis: GateRoadAxis;
  fromZoneId: number;
  toZoneId: number;
  guardStrength: ConnectionTemplate["guardStrength"];
  wallType: WallType;
}

export type GateRoadAxis = "x" | "y";

/**
 * Pour chaque connexion :
 *  - identifie la frontière entre les deux zones
 *  - scelle toutes les tiles de frontière (mur naturel ou brick)
 *  - perce 1 tile au centre géométrique de la frontière comme chokepoint
 *
 * Les frontières entre zones non listées dans `template.connections` sont aussi scellées
 * (totalement infranchissables) — c'est ce qui force le passage par les portes.
 */
export function buildConnectionsAndWalls(
  tiles: MapTile[][],
  zoneGrid: ZoneGrid,
  template: MapTemplate,
  width: number,
  height: number,
): Chokepoint[] {
  if (template.sealZoneBorders === false) return [];

  const templateZoneToZoneId = new Map<string, number>();
  zoneGrid.meta.forEach((m) => templateZoneToZoneId.set(m.templateZoneId, m.id));

  const connectionByPair = new Map<string, ConnectionTemplate>();
  for (const c of template.connections) {
    const a = templateZoneToZoneId.get(c.from);
    const b = templateZoneToZoneId.get(c.to);
    if (a === undefined || b === undefined) continue;
    connectionByPair.set(pairKey(a, b), c);
  }

  // 1) Sceller toutes les frontières
  const sealedTiles = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const zoneHere = zoneGrid.tilesZone[y][x];
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      let isBorder = false;
      let otherZone = -1;
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const z = zoneGrid.tilesZone[ny][nx];
        if (z !== zoneHere) {
          isBorder = true;
          otherZone = z;
          break;
        }
      }
      if (!isBorder) continue;
      if (zoneHere > otherZone) continue;
      if (tiles[y][x].terrain === TerrainType.WATER) continue;

      const pair = pairKey(zoneHere, otherZone);
      const conn = connectionByPair.get(pair);
      const wallType: WallType = conn?.wallType ?? "natural";

      sealTile(tiles[y][x], wallType);
      sealedTiles.add(`${x},${y}`);
    }
  }

  // 2) Pour chaque connexion : percer un chokepoint au milieu de la frontière
  const chokepoints: Chokepoint[] = [];
  for (const c of template.connections) {
    const from = templateZoneToZoneId.get(c.from);
    const to = templateZoneToZoneId.get(c.to);
    if (from === undefined || to === undefined) continue;

    const borderA = findBorderTiles(zoneGrid, width, height, from, to)
      .filter((p) => tiles[p.y][p.x].terrain !== TerrainType.WATER);
    const borderB = findBorderTiles(zoneGrid, width, height, to, from)
      .filter((p) => tiles[p.y][p.x].terrain !== TerrainType.WATER);
    const borderTiles = [...borderA, ...borderB];
    if (borderTiles.length === 0) continue;

    // Centre géométrique de la frontière
    let cx = 0;
    let cy = 0;
    for (const p of borderTiles) {
      cx += p.x;
      cy += p.y;
    }
    cx /= borderTiles.length;
    cy /= borderTiles.length;

    // Tile la plus proche du centre
    const sealedBorder = borderTiles.filter((p) => sealedTiles.has(`${p.x},${p.y}`));
    const gateCandidates = sealedBorder.length > 0 ? sealedBorder : borderTiles;
    const gate = pickGateCandidate(tiles, zoneGrid, gateCandidates, from, to, cx, cy, width, height);
    if (!gate) continue;

    // Élargir la porte sur 1-2 tiles voisines de la frontière pour faciliter le passage
    prepareGateFrame(tiles, width, height, gate, c.wallType);

    // Place la porte fortifiée sur la tile principale.
    tiles[gate.y][gate.x].object = {
      type: "gate",
      id: `gate-${c.from}-${c.to}-${gate.x}-${gate.y}`,
      subtype: c.wallType,
      roadAxis: gate.roadAxis,
      // guardianPower est rempli plus tard par le value system
    };

    chokepoints.push({
      x: gate.x,
      y: gate.y,
      roadAxis: gate.roadAxis,
      fromZoneId: from,
      toZoneId: to,
      guardStrength: c.guardStrength,
      wallType: c.wallType,
    });
  }

  // Cleanup : si une tile murée a un objet préexistant (sécurité), on l'efface
  for (const key of sealedTiles) {
    const [sx, sy] = key.split(",").map(Number);
    const tile = tiles[sy][sx];
    if (tile.object?.type === "wall") {
      // ok
    }
  }

  return chokepoints;
}

export function enforceChokepointGateFrames(
  tiles: MapTile[][],
  width: number,
  height: number,
  chokepoints: Chokepoint[],
  road: RoadType = "paved",
): void {
  for (const cp of chokepoints) {
    const tile = tiles[cp.y]?.[cp.x];
    if (!tile?.object || tile.object.type !== "gate") continue;

    const id = tile.object.id;
    const guardianPower = tile.object.guardianPower;
    prepareGateFrame(tiles, width, height, cp, cp.wallType);

    tile.object = {
      type: "gate",
      id,
      subtype: cp.wallType,
      roadAxis: cp.roadAxis,
      guardianPower,
    };
    tile.road = road;

    for (const offset of getRoadAxisOffsets(cp.roadAxis)) {
      const lane = tiles[cp.y + offset.y]?.[cp.x + offset.x];
      if (!lane || lane.object?.type === "town_footprint") continue;
      lane.road = road;
    }
  }
}

function sealTile(tile: MapTile, wallType: WallType): void {
  tile.road = undefined;
  tile.decor = undefined;
  tile.isPassable = false;
  tile.movementCost = 999;
  if (wallType === "brick") {
    tile.object = {
      type: "wall",
      id: `wall-${tile.x}-${tile.y}`,
      subtype: "brick",
    };
  } else {
    // mur naturel : on garde le terrain mais on bloque, le décor ajoutera des rochers/arbres
    tile.object = {
      type: "wall",
      id: `wall-${tile.x}-${tile.y}`,
      subtype: "natural",
    };
    if (tile.terrain !== TerrainType.MOUNTAIN && tile.terrain !== TerrainType.FOREST) {
      // Force un peu de relief pour la lisibilité
      tile.elevation = Math.max(tile.elevation, 1);
    }
  }
}

function openTile(tile: MapTile): void {
  tile.isPassable = true;
  tile.movementCost = movementCostFor(tile.terrain);
  if (tile.object?.type === "wall") tile.object = undefined;
  if (tile.decor?.blocking) tile.decor = undefined;
}

function pickGateCandidate(
  tiles: MapTile[][],
  zoneGrid: ZoneGrid,
  gateCandidates: Position[],
  fromZoneId: number,
  toZoneId: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
): (Position & { roadAxis: GateRoadAxis }) | null {
  let best: (Position & { roadAxis: GateRoadAxis }) | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const p of gateCandidates) {
    const hereZone = zoneGrid.tilesZone[p.y]?.[p.x];
    for (const next of getOrthogonalNeighbors(p)) {
      if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
      const nextZone = zoneGrid.tilesZone[next.y]?.[next.x];
      if (nextZone === hereZone) continue;
      if (!((hereZone === fromZoneId && nextZone === toZoneId) || (hereZone === toZoneId && nextZone === fromZoneId))) continue;
      if (tiles[next.y][next.x].terrain === TerrainType.WATER) continue;

      const roadAxis: GateRoadAxis = next.x !== p.x ? "x" : "y";
      const sidePenalty = getGateSideOffsets(roadAxis).reduce((penalty, offset) => {
        const side = tiles[p.y + offset.y]?.[p.x + offset.x];
        if (!side) return penalty + 100;
        return penalty + (side.terrain === TerrainType.WATER ? 20 : 0);
      }, 0);
      const score = (p.x - cx) ** 2 + (p.y - cy) ** 2 + sidePenalty;
      if (score < bestScore) {
        bestScore = score;
        best = { x: p.x, y: p.y, roadAxis };
      }
    }
  }

  if (best) return best;

  let fallback = gateCandidates[0];
  let fallbackDist = Number.POSITIVE_INFINITY;
  for (const p of gateCandidates) {
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d < fallbackDist) {
      fallbackDist = d;
      fallback = p;
    }
  }

  return fallback ? { ...fallback, roadAxis: inferGateRoadAxisFromWalls(tiles, fallback) } : null;
}

function prepareGateFrame(
  tiles: MapTile[][],
  width: number,
  height: number,
  gate: Position & { roadAxis: GateRoadAxis },
  wallType: WallType,
): void {
  for (const offset of getRoadAxisOffsets(gate.roadAxis)) {
    const lane = tiles[gate.y + offset.y]?.[gate.x + offset.x];
    if (!lane || lane.object?.type === "town_footprint") continue;
    openTile(lane);
  }

  for (const offset of getGateSideOffsets(gate.roadAxis)) {
    const x = gate.x + offset.x;
    const y = gate.y + offset.y;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const side = tiles[y][x];
    if (side.object?.type === "town" || side.object?.type === "town_footprint") continue;
    if (side.terrain === TerrainType.WATER || side.terrain === TerrainType.LAVA) {
      side.terrain = TerrainType.GRASS;
      side.elevation = 0;
    }
    sealTile(side, wallType);
  }
}

function getRoadAxisOffsets(roadAxis: GateRoadAxis): Position[] {
  return roadAxis === "x"
    ? [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }]
    : [{ x: 0, y: -1 }, { x: 0, y: 0 }, { x: 0, y: 1 }];
}

function getGateSideOffsets(roadAxis: GateRoadAxis): Position[] {
  return roadAxis === "x"
    ? [{ x: 0, y: -1 }, { x: 0, y: 1 }]
    : [{ x: -1, y: 0 }, { x: 1, y: 0 }];
}

function getOrthogonalNeighbors(pos: Position): Position[] {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];
}

function inferGateRoadAxisFromWalls(tiles: MapTile[][], pos: Position): GateRoadAxis {
  const xWalls = Number(isWall(tiles[pos.y]?.[pos.x - 1])) + Number(isWall(tiles[pos.y]?.[pos.x + 1]));
  const yWalls = Number(isWall(tiles[pos.y - 1]?.[pos.x])) + Number(isWall(tiles[pos.y + 1]?.[pos.x]));
  return yWalls >= xWalls ? "x" : "y";
}

function isWall(tile: MapTile | undefined): boolean {
  return tile?.object?.type === "wall";
}

function movementCostFor(t: TerrainType): number {
  switch (t) {
    case TerrainType.GRASS:
    case TerrainType.DIRT:
      return 100;
    case TerrainType.SAND:
    case TerrainType.FOREST:
      return 150;
    case TerrainType.SNOW:
      return 150;
    case TerrainType.SWAMP:
      return 175;
    case TerrainType.WATER:
      return 200;
    case TerrainType.MOUNTAIN:
      return 250;
    default:
      return 999;
  }
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
