import { MapTile, TerrainType } from "../types";
import { findBorderTiles, ZoneGrid } from "./zones";
import { MapTemplate, ConnectionTemplate, WallType } from "./template";

export interface Chokepoint {
  x: number;
  y: number;
  fromZoneId: number;
  toZoneId: number;
  guardStrength: ConnectionTemplate["guardStrength"];
  wallType: WallType;
}

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
    if (borderA.length === 0) continue;

    // Centre géométrique de la frontière
    let cx = 0;
    let cy = 0;
    for (const p of borderA) {
      cx += p.x;
      cy += p.y;
    }
    cx /= borderA.length;
    cy /= borderA.length;

    // Tile la plus proche du centre
    let best = borderA[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const p of borderA) {
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }

    // Élargir la porte sur 1-2 tiles voisines de la frontière pour faciliter le passage
    const gateTiles = [best];
    const candidates = borderA
      .filter((p) => p !== best)
      .sort((a, b) => (a.x - best.x) ** 2 + (a.y - best.y) ** 2 - ((b.x - best.x) ** 2 + (b.y - best.y) ** 2));
    if (candidates.length > 0) gateTiles.push(candidates[0]);

    for (const gt of gateTiles) {
      openTile(tiles[gt.y][gt.x]);
    }

    // Place le monstre garde sur la tile principale
    tiles[best.y][best.x].object = {
      type: "monster",
      id: `gate-mon-${c.from}-${c.to}-${best.x}-${best.y}`,
      subtype: "guard",
      // guardianPower est rempli plus tard par le value system
    };

    chokepoints.push({
      x: best.x,
      y: best.y,
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

function sealTile(tile: MapTile, wallType: WallType): void {
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
