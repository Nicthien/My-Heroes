import type { CombatBoardUnit, CombatTerrainFeature } from "../types";

export const COMBAT_COLS = 13;
export const COMBAT_ROWS = 9;

export interface HexCell {
  q: number;
  r: number;
}

export function getHexDistance(a: HexCell, b: HexCell) {
  const ac = offsetToCube(a.q, a.r);
  const bc = offsetToCube(b.q, b.r);
  return Math.max(Math.abs(ac.x - bc.x), Math.abs(ac.y - bc.y), Math.abs(ac.z - bc.z));
}

export function getHexNeighbors(q: number, r: number) {
  const even = r % 2 === 0;
  const deltas = even
    ? [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]]
    : [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];

  return deltas
    .map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
    .filter((cell) => isInsideCombatCell(cell.q, cell.r));
}

export function isInsideCombatCell(q: number, r: number) {
  return Number.isInteger(q) && Number.isInteger(r) && q >= 0 && q < COMBAT_COLS && r >= 0 && r < COMBAT_ROWS;
}

export function isTerrainBlocked(q: number, r: number, terrain: CombatTerrainFeature[] = []) {
  return terrain.some((feature) => feature.q === q && feature.r === r);
}

export function getOccupiedCombatCells(units: CombatBoardUnit[], ignoredUnitId?: string | null) {
  return new Set(
    units
      .filter((unit) => unit.count > 0 && unit.id !== ignoredUnitId)
      .map((unit) => getHexKey(unit))
  );
}

export function getBlockedCombatCells(terrain: CombatTerrainFeature[] = []) {
  return new Set(terrain.map((feature) => getHexKey(feature)));
}

export function findHexPath(
  start: HexCell,
  end: HexCell,
  occupied: Set<string>,
  blocked: Set<string>
) {
  const startKey = getHexKey(start);
  const endKey = getHexKey(end);
  const queue: Array<HexCell & { path: HexCell[] }> = [
    { q: start.q, r: start.r, path: [{ q: start.q, r: start.r }] },
  ];
  const seen = new Set([startKey]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (getHexKey(current) === endKey) return current.path;

    for (const neighbor of getHexNeighbors(current.q, current.r)) {
      const key = getHexKey(neighbor);
      if (seen.has(key) || blocked.has(key)) continue;
      if (occupied.has(key) && key !== startKey && key !== endKey) continue;
      seen.add(key);
      queue.push({ ...neighbor, path: [...current.path, neighbor] });
    }
  }

  return [];
}

export function getReachableCombatCells(
  actor: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[] = []
) {
  const occupied = getOccupiedCombatCells(units, actor.id);
  const blocked = getBlockedCombatCells(terrain);
  const visited = new Set<string>([getHexKey(actor)]);
  const queue: Array<HexCell & { dist: number }> = [{ q: actor.q, r: actor.r, dist: 0 }];
  const cells: HexCell[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.dist >= actor.speed) continue;

    for (const neighbor of getHexNeighbors(current.q, current.r)) {
      const key = getHexKey(neighbor);
      if (visited.has(key) || blocked.has(key) || occupied.has(key)) continue;
      visited.add(key);
      cells.push(neighbor);
      queue.push({ ...neighbor, dist: current.dist + 1 });
    }
  }

  return cells;
}

export function findMeleeApproach(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[] = []
) {
  if (getHexDistance(actor, target) <= 1) {
    return { destination: { q: actor.q, r: actor.r }, path: [{ q: actor.q, r: actor.r }] };
  }

  const occupied = getOccupiedCombatCells(units, actor.id);
  const blocked = getBlockedCombatCells(terrain);
  const candidates = getHexNeighbors(target.q, target.r)
    .filter((cell) => {
      const key = getHexKey(cell);
      return !blocked.has(key) && !occupied.has(key);
    })
    .map((cell) => ({ destination: cell, path: findHexPath(actor, cell, occupied, blocked) }))
    .filter((candidate) => candidate.path.length > 1 && candidate.path.length - 1 <= actor.speed)
    .sort((a, b) => (
      (a.path.length - b.path.length) ||
      (getHexDistance(a.destination, actor) - getHexDistance(b.destination, actor)) ||
      (a.destination.r - b.destination.r) ||
      (a.destination.q - b.destination.q)
    ));

  return candidates[0] ?? null;
}

export function getHexKey(cell: HexCell) {
  return `${cell.q},${cell.r}`;
}

function offsetToCube(q: number, r: number) {
  const x = q - (r - (r & 1)) / 2;
  const z = r;
  const y = -x - z;
  return { x, y, z };
}
