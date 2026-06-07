import type { CombatBoardUnit, CombatTerrainFeature } from "../types";
import { getUnitRule } from "../units";
import type { HexCell } from "./movement";

export type SiegeElementKind = "wall" | "gate" | "tower";
export type SiegeHp = 0 | 1 | 2;
export type SiegeFaction = "castle";

export interface SiegeWallSection {
  id: string;
  kind: "wall";
  hp: SiegeHp;
  cells: HexCell[];
}

export interface SiegeGate {
  id: string;
  kind: "gate";
  hp: SiegeHp;
  cell: HexCell;
  open: boolean;
}

export interface SiegeTower {
  id: string;
  kind: "tower";
  hp: SiegeHp;
  cell: HexCell;
  damage: number;
}

export interface SiegeMoat {
  cells: HexCell[];
  damage: number;
  defensePenalty: number;
}

export interface SiegeState {
  version: 1;
  faction: SiegeFaction;
  wallColumn: number;
  walls: SiegeWallSection[];
  gate: SiegeGate;
  towers: SiegeTower[];
  moat: SiegeMoat;
  lastCatapultHit?: SiegeCatapultHit;
}

export interface SiegeCatapultHit {
  targetId: string;
  kind: SiegeElementKind;
  damage: 1 | 2;
  critical: boolean;
  destroyed: boolean;
}

export interface SiegeTowerShot {
  towerId: string;
  towerIndex: number;
  targetQ: number;
  targetR: number;
}

export const SIEGE_WALL_COLUMN = 8;
export const SIEGE_GATE_CELL: HexCell = { q: SIEGE_WALL_COLUMN, r: 4 };
export const SIEGE_MOAT_DAMAGE = 25;
export const SIEGE_MOAT_DEFENSE_PENALTY = 3;

const SIEGE_MOAT_CELLS: HexCell[] = Array.from({ length: 10 }, (_, r) => ({ q: SIEGE_WALL_COLUMN - 1, r }));

export function createCastleSiegeState(params: { towerCount: number; towerDamage: number }): SiegeState {
  const towerDamage = Math.max(0, Math.floor(params.towerDamage));
  const towers: SiegeTower[] = [
    ...(params.towerCount >= 1 ? [{ id: "tower-upper", kind: "tower" as const, hp: 2 as const, cell: { q: SIEGE_WALL_COLUMN, r: 1 }, damage: towerDamage }] : []),
    ...(params.towerCount >= 2 ? [{ id: "tower-lower", kind: "tower" as const, hp: 2 as const, cell: { q: SIEGE_WALL_COLUMN, r: 7 }, damage: towerDamage }] : []),
    ...(params.towerCount >= 3 ? [{ id: "tower-keep", kind: "tower" as const, hp: 2 as const, cell: { q: SIEGE_WALL_COLUMN + 1, r: 4 }, damage: towerDamage }] : []),
  ];
  return {
    version: 1,
    faction: "castle",
    wallColumn: SIEGE_WALL_COLUMN,
    walls: [
      { id: "wall-upper", kind: "wall", hp: 2, cells: [{ q: SIEGE_WALL_COLUMN, r: 0 }, { q: SIEGE_WALL_COLUMN, r: 1 }] },
      { id: "wall-mid-upper", kind: "wall", hp: 2, cells: [{ q: SIEGE_WALL_COLUMN, r: 2 }, { q: SIEGE_WALL_COLUMN, r: 3 }] },
      { id: "wall-mid-lower", kind: "wall", hp: 2, cells: [{ q: SIEGE_WALL_COLUMN, r: 5 }, { q: SIEGE_WALL_COLUMN, r: 6 }] },
      { id: "wall-lower", kind: "wall", hp: 2, cells: [{ q: SIEGE_WALL_COLUMN, r: 7 }, { q: SIEGE_WALL_COLUMN, r: 8 }] },
      { id: "wall-bottom", kind: "wall", hp: 2, cells: [{ q: SIEGE_WALL_COLUMN, r: 9 }] },
    ],
    gate: { id: "gate-main", kind: "gate", hp: 2, cell: SIEGE_GATE_CELL, open: false },
    towers,
    moat: {
      cells: SIEGE_MOAT_CELLS,
      damage: SIEGE_MOAT_DAMAGE,
      defensePenalty: SIEGE_MOAT_DEFENSE_PENALTY,
    },
  };
}

export function normalizeSiegeState(siege: SiegeState | null | undefined): SiegeState | undefined {
  if (!siege || siege.version !== 1) return undefined;
  return {
    ...siege,
    walls: siege.walls.map((wall) => ({ ...wall, hp: normalizeHp(wall.hp), cells: wall.cells.map(copyCell) })),
    gate: { ...siege.gate, hp: normalizeHp(siege.gate.hp), cell: copyCell(siege.gate.cell), open: Boolean(siege.gate.open) },
    towers: siege.towers.map((tower) => ({ ...tower, hp: normalizeHp(tower.hp), cell: copyCell(tower.cell), damage: Math.max(0, Number(tower.damage ?? 0)) })),
    moat: {
      cells: (siege.moat?.cells ?? SIEGE_MOAT_CELLS).map(copyCell),
      damage: Math.max(0, Number(siege.moat?.damage ?? SIEGE_MOAT_DAMAGE)),
      defensePenalty: Math.max(0, Number(siege.moat?.defensePenalty ?? SIEGE_MOAT_DEFENSE_PENALTY)),
    },
  };
}

export function isFlyingUnit(unit: CombatBoardUnit) {
  return (getUnitRule(unit.unitType).abilities ?? []).includes("flying");
}

export function getSiegeBlockingCells(siege: SiegeState | null | undefined, units: CombatBoardUnit[] = [], actor?: CombatBoardUnit | null) {
  const state = normalizeSiegeState(siege);
  const blocked = new Set<string>();
  if (!state || (actor && isFlyingUnit(actor))) return blocked;

  for (const wall of state.walls) {
    if (wall.hp <= 0) continue;
    for (const cell of wall.cells) blocked.add(getCellKey(cell));
  }

  if (!isGatePassable(state, units, actor ?? null)) blocked.add(getCellKey(state.gate.cell));
  return blocked;
}

export function isSiegeLandingBlocked(
  siege: SiegeState | null | undefined,
  cell: HexCell,
  units: CombatBoardUnit[] = [],
  actor?: CombatBoardUnit | null
) {
  const state = normalizeSiegeState(siege);
  if (!state) return false;
  const key = getCellKey(cell);
  if (state.walls.some((wall) => wall.hp > 0 && wall.cells.some((wallCell) => getCellKey(wallCell) === key))) return true;
  return state.gate.hp > 0 && getCellKey(state.gate.cell) === key && !isGatePassable(state, units, actor ?? null);
}

export function isGateForcedOpen(siege: SiegeState | null | undefined, units: CombatBoardUnit[] = []) {
  const state = normalizeSiegeState(siege);
  if (!state) return false;
  const gateKey = getCellKey(state.gate.cell);
  return units.some((unit) => unit.count > 0 && getCellKey(unit) === gateKey);
}

export function isGateEffectivelyOpen(siege: SiegeState | null | undefined, units: CombatBoardUnit[] = []) {
  const state = normalizeSiegeState(siege);
  if (!state) return false;
  return state.gate.hp <= 0 || state.gate.open || isGateForcedOpen(state, units);
}

export function isGatePassable(siege: SiegeState, units: CombatBoardUnit[], actor: CombatBoardUnit | null) {
  if (isGateEffectivelyOpen(siege, units)) return true;
  return Boolean(actor && actor.side === "defender");
}

export function pathTraversesGate(siege: SiegeState | null | undefined, path: HexCell[]) {
  const state = normalizeSiegeState(siege);
  if (!state) return false;
  const gateKey = getCellKey(state.gate.cell);
  return path.some((cell) => getCellKey(cell) === gateKey);
}

export function openGateForDefenderPath(siege: SiegeState | null | undefined, actor: CombatBoardUnit, path: HexCell[]) {
  const state = normalizeSiegeState(siege);
  if (!state || actor.side !== "defender" || state.gate.hp <= 0 || !pathTraversesGate(state, path)) return state;
  return { ...state, gate: { ...state.gate, open: true } };
}

export function closeGateIfClear(siege: SiegeState | null | undefined, units: CombatBoardUnit[]) {
  const state = normalizeSiegeState(siege);
  if (!state || state.gate.hp <= 0 || isGateForcedOpen(state, units)) return state;
  return { ...state, gate: { ...state.gate, open: false } };
}

export function findFirstMoatCellInPath(siege: SiegeState | null | undefined, actor: CombatBoardUnit, path: HexCell[]) {
  const state = normalizeSiegeState(siege);
  if (!state || isFlyingUnit(actor)) return null;
  const moat = new Set(state.moat.cells.map(getCellKey));
  return path.slice(1).find((cell) => moat.has(getCellKey(cell))) ?? null;
}

export function applyMoatToUnit(unit: CombatBoardUnit, siege: SiegeState, log: string[]) {
  const damage = Math.max(0, siege.moat.damage);
  const beforeCount = unit.count;
  const result = applyDamageToStack(unit, damage);
  unit.defensePenalty = Math.max(unit.defensePenalty ?? 0, siege.moat.defensePenalty);
  log.push(`Douves : ${damage} dégâts, ${Math.max(0, result.lost)} perte(s).`);
  return beforeCount > 0 && unit.count <= 0;
}

export function refreshMoatPenalties(units: CombatBoardUnit[], siege: SiegeState | null | undefined) {
  const state = normalizeSiegeState(siege);
  if (!state) return units.map((unit) => ({ ...unit, defensePenalty: 0 }));
  const moat = new Set(state.moat.cells.map(getCellKey));
  return units.map((unit) => ({
    ...unit,
    defensePenalty: !isFlyingUnit(unit) && moat.has(getCellKey(unit)) ? state.moat.defensePenalty : 0,
  }));
}

export function getSiegeReservedCells(siege: SiegeState | null | undefined) {
  const state = normalizeSiegeState(siege);
  const cells = new Set<string>();
  if (!state) return cells;
  for (const wall of state.walls) {
    for (const cell of wall.cells) cells.add(getCellKey(cell));
  }
  cells.add(getCellKey(state.gate.cell));
  for (const cell of state.moat.cells) cells.add(getCellKey(cell));
  return cells;
}

export function isSiegeReservedCell(siege: SiegeState | null | undefined, cell: HexCell) {
  return getSiegeReservedCells(siege).has(getCellKey(cell));
}

export function filterSiegeTerrain(terrain: CombatTerrainFeature[] = [], siege: SiegeState | null | undefined) {
  const reserved = getSiegeReservedCells(siege);
  if (reserved.size === 0) return terrain;
  return terrain.filter((feature) => !reserved.has(getCellKey(feature)));
}

export function damageSiegeWithCatapult(
  siege: SiegeState | null | undefined,
  ballisticsLevel = 0,
  random = Math.random,
) {
  const state = normalizeSiegeState(siege);
  if (!state) return { siege: state, hit: null };
  // Ballistics improves the catapult's odds of a critical (double-damage) hit:
  // none 20%, basic 30%, advanced 40%, expert 50%.
  const critChance = 0.2 + 0.1 * Math.max(0, Math.min(3, ballisticsLevel));
  const critical = random() < critChance;
  const damage = critical ? 2 : 1;

  const gateTarget = state.gate.hp > 0 ? { kind: "gate" as const, id: state.gate.id } : null;
  const wallTarget = state.walls.find((wall) => wall.hp > 0);
  const towerTarget = state.towers.find((tower) => tower.hp > 0);
  const target = gateTarget ?? (wallTarget ? { kind: "wall" as const, id: wallTarget.id } : null) ?? (towerTarget ? { kind: "tower" as const, id: towerTarget.id } : null);
  if (!target) return { siege: state, hit: null };

  if (target.kind === "gate") {
    const hp = reduceHp(state.gate.hp, damage);
    const next = {
      ...state,
      gate: { ...state.gate, hp, open: hp <= 0 ? true : state.gate.open },
    };
    const hit = buildHit(target.id, "gate", damage, critical, hp <= 0);
    return { siege: { ...next, lastCatapultHit: hit }, hit };
  }

  if (target.kind === "wall") {
    const nextWalls = state.walls.map((wall) => wall.id === target.id ? { ...wall, hp: reduceHp(wall.hp, damage) } : wall);
    const wall = nextWalls.find((item) => item.id === target.id);
    const hit = buildHit(target.id, "wall", damage, critical, (wall?.hp ?? 0) <= 0);
    return { siege: { ...state, walls: nextWalls, lastCatapultHit: hit }, hit };
  }

  const nextTowers = state.towers.map((tower) => tower.id === target.id ? { ...tower, hp: reduceHp(tower.hp, damage) } : tower);
  const tower = nextTowers.find((item) => item.id === target.id);
  const hit = buildHit(target.id, "tower", damage, critical, (tower?.hp ?? 0) <= 0);
  return { siege: { ...state, towers: nextTowers, lastCatapultHit: hit }, hit };
}

export function applyTowerVolleyInRound(units: CombatBoardUnit[], siege: SiegeState | null | undefined) {
  const state = normalizeSiegeState(siege);
  const activeTowers = state?.towers.filter((tower) => tower.hp > 0 && tower.damage > 0) ?? [];
  if (activeTowers.length === 0) return { units, shots: [] as SiegeTowerShot[], killed: 0 };

  const next = units.map((unit) => ({ ...unit }));
  const attackers = next.filter((unit) => unit.side === "attacker" && unit.count > 0);
  const shots: SiegeTowerShot[] = [];
  let killed = 0;
  for (const [index, tower] of activeTowers.entries()) {
    const target = attackers[index % attackers.length];
    if (!target) continue;
    const before = target.count;
    applyDamageToStack(target, tower.damage);
    killed += Math.max(0, before - target.count);
    shots.push({ towerId: tower.id, towerIndex: getTowerVisualIndex(tower.id), targetQ: target.q, targetR: target.r });
  }
  return { units: next.filter((unit) => unit.count > 0), shots, killed };
}

export function getCellKey(cell: HexCell) {
  return `${cell.q},${cell.r}`;
}

function buildHit(targetId: string, kind: SiegeElementKind, damage: 1 | 2, critical: boolean, destroyed: boolean): SiegeCatapultHit {
  return { targetId, kind, damage, critical, destroyed };
}

function reduceHp(hp: SiegeHp, amount: 1 | 2): SiegeHp {
  return Math.max(0, Math.min(2, hp - amount)) as SiegeHp;
}

function normalizeHp(value: unknown): SiegeHp {
  const hp = Number(value);
  if (hp <= 0) return 0;
  if (hp === 1) return 1;
  return 2;
}

function copyCell(cell: HexCell): HexCell {
  return { q: Number(cell.q), r: Number(cell.r) };
}

function getTowerVisualIndex(towerId: string) {
  if (towerId.includes("upper")) return 0;
  if (towerId.includes("lower")) return 2;
  return 1;
}

function applyDamageToStack(defender: CombatBoardUnit, damage: number) {
  const nextHealth = Math.max(0, defender.health - damage);
  const nextCount = nextHealth > 0 ? Math.ceil(nextHealth / defender.maxHealth) : 0;
  const lost = Math.max(0, defender.count - nextCount);
  defender.health = nextHealth;
  defender.count = nextCount;
  return { lost, nextHealth, nextCount };
}
