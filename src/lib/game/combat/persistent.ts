import { CombatBoardUnit, CombatSide, CombatSummary, CombatTerrainFeature, Hero, UnitStack, UnitType } from "../types";
import { getUnitRule } from "../units";
import { autoResolveCombat, applyLossesToArmies } from "./autoResolve";

export const COMBAT_COLS = 13;
export const COMBAT_ROWS = 9;

export interface CombatParticipantSnapshot {
  id: string;
  playerId: string | null;
  heroId?: string | null;
  participantId?: string | null;
  attack: number;
  defense: number;
  armies: UnitStack[];
}

export function createCombatBoard(
  attacker: CombatParticipantSnapshot,
  defender: CombatParticipantSnapshot
) {
  const units: CombatBoardUnit[] = [];
  const terrain = createCombatTerrain();
  addUnits(units, attacker.armies, "attacker", attacker.playerId, attacker.heroId ?? (attacker.playerId ? attacker.id : null), attacker.participantId ?? null, 1, 1, undefined, terrain);
  addUnits(units, defender.armies, "defender", defender.playerId, defender.heroId ?? (defender.playerId ? defender.id : null), defender.participantId ?? null, COMBAT_COLS - 2, 1, undefined, terrain);
  const turnQueue = buildTurnQueue(units, 1);
  return {
    boardState: { units, terrain },
    turnQueue,
    currentUnitId: turnQueue[0] ?? null,
    currentPlayerId: units.find((unit) => unit.id === turnQueue[0])?.ownerPlayerId ?? null,
  };
}

function addUnits(
  units: CombatBoardUnit[],
  armies: UnitStack[],
  side: CombatSide,
  ownerPlayerId: string | null,
  heroId: string | null,
  participantId: string | null,
  q: number,
  joinsRound: number,
  preferredRows = [1, 2, 3, 4, 5, 6, 7],
  terrain: CombatTerrainFeature[] = []
) {
  armies.filter((army) => army.count > 0).forEach((army, index) => {
    const rule = getUnitRule(army.unitType);
    const r = findFreeRow(units, q, preferredRows[index % preferredRows.length], terrain);
    units.push({
      ...army,
      side,
      ownerPlayerId,
      heroId,
      participantId,
      joinsRound,
      q,
      r,
      speed: rule.speed,
      minDamage: rule.minDamage,
      maxDamage: rule.maxDamage,
      ranged: Boolean(rule.ranged),
      shots: rule.shots ?? 0,
      hasRetaliated: false,
      defended: false,
      waited: false,
    });
  });
}

export function addReinforcementUnits(params: {
  units: CombatBoardUnit[];
  terrain?: CombatTerrainFeature[];
  armies: UnitStack[];
  side: CombatSide;
  ownerPlayerId: string;
  heroId: string;
  participantId: string;
  joinsRound: number;
}) {
  const q = params.side === "attacker" ? 0 : COMBAT_COLS - 1;
  addUnits(params.units, params.armies, params.side, params.ownerPlayerId, params.heroId, params.participantId, q, params.joinsRound, [0, 1, 2, 3, 4, 5, 6, 7, 8], params.terrain ?? []);
}

function findFreeRow(units: CombatBoardUnit[], q: number, preferredRow: number, terrain: CombatTerrainFeature[]) {
  for (let offset = 0; offset < COMBAT_ROWS; offset++) {
    const candidates = [preferredRow + offset, preferredRow - offset];
    for (const r of candidates) {
      if (r < 0 || r >= COMBAT_ROWS) continue;
      if (!isTerrainBlocked(q, r, terrain) && !units.some((unit) => unit.q === q && unit.r === r)) return r;
    }
  }

  return Math.max(0, Math.min(COMBAT_ROWS - 1, preferredRow));
}

export function buildTurnQueue(units: CombatBoardUnit[], round = 1) {
  return [...units]
    .filter((unit) => unit.count > 0 && (unit.joinsRound ?? 1) <= round)
    .sort((a, b) => b.speed - a.speed || (a.side === "attacker" ? -1 : 1) || a.position - b.position)
    .map((unit) => unit.id);
}

export function getHexDistance(a: { q: number; r: number }, b: { q: number; r: number }) {
  const ac = offsetToCube(a.q, a.r);
  const bc = offsetToCube(b.q, b.r);
  return Math.max(Math.abs(ac.x - bc.x), Math.abs(ac.y - bc.y), Math.abs(ac.z - bc.z));
}

function offsetToCube(q: number, r: number) {
  const x = q - (r - (r & 1)) / 2;
  const z = r;
  const y = -x - z;
  return { x, y, z };
}

export function executeManualCombatAction(params: {
  units: CombatBoardUnit[];
  terrain?: CombatTerrainFeature[];
  turnQueue: string[];
  round: number;
  currentUnitId: string | null;
  action: { type: "MOVE" | "ATTACK" | "SHOOT" | "WAIT" | "DEFEND"; q?: number; r?: number; targetUnitId?: string };
  attackerStats: { attack: number; defense: number };
  defenderStats: { attack: number; defense: number };
}) {
  const log: string[] = [];
  let didAct = false;
  const units = params.units.map((unit) => ({ ...unit }));
  const actor = units.find((unit) => unit.id === params.currentUnitId);
  if (!actor) return { units, turnQueue: params.turnQueue, currentUnitId: null, currentPlayerId: null, round: params.round, log, result: null };

  if (params.action.type === "MOVE") {
    const q = Number(params.action.q);
    const r = Number(params.action.r);
    if (isInside(q, r) && !isTerrainBlocked(q, r, params.terrain) && !units.some((unit) => unit.q === q && unit.r === r)) {
      const path = findPath(actor, { q, r }, units, params.terrain ?? []);
      if (path.length > 1 && path.length - 1 <= actor.speed) {
        actor.q = q;
        actor.r = r;
        didAct = true;
        log.push(`${getUnitRule(actor.unitType).label} se deplace.`);
      }
    }
  } else if (params.action.type === "ATTACK" || params.action.type === "SHOOT") {
    const target = units.find((unit) => unit.id === params.action.targetUnitId && unit.side !== actor.side);
    if (target) {
      const distance = getHexDistance(actor, target);
      const canShoot = params.action.type === "SHOOT" && actor.ranged && actor.shots > 0;
      if (distance <= 1 || canShoot) {
        if (canShoot) actor.shots = Math.max(0, actor.shots - 1);
        applyDamage(actor, target, getStats(actor.side, params), log);
        didAct = true;
        if (target.count > 0 && distance <= 1 && !target.hasRetaliated) {
          applyDamage(target, actor, getStats(target.side, params), log, true);
          target.hasRetaliated = true;
        }
      }
    }
  } else if (params.action.type === "DEFEND") {
    actor.defended = true;
    didAct = true;
    log.push(`${getUnitRule(actor.unitType).label} se defend.`);
  } else if (params.action.type === "WAIT") {
    actor.waited = true;
    didAct = true;
    log.push(`${getUnitRule(actor.unitType).label} attend.`);
  }

  if (!didAct) {
    return {
      units,
      turnQueue: params.turnQueue,
      currentUnitId: params.currentUnitId,
      currentPlayerId: actor.ownerPlayerId,
      round: params.round,
      log: ["Action impossible."],
      result: null,
    };
  }

  const livingUnits = units.filter((unit) => unit.count > 0);
  const result = getCombatResult(livingUnits);
  if (result) return { units: livingUnits, turnQueue: [], currentUnitId: null, currentPlayerId: null, round: params.round, log, result };

  const next = advanceTurn(livingUnits, params.turnQueue, actor.id, params.round);
  return {
    units: livingUnits,
    turnQueue: next.turnQueue,
    currentUnitId: next.currentUnitId,
    currentPlayerId: livingUnits.find((unit) => unit.id === next.currentUnitId)?.ownerPlayerId ?? null,
    round: next.round,
    log,
    result: null,
  };
}

function applyDamage(attacker: CombatBoardUnit, defender: CombatBoardUnit, stats: { attack: number; defense: number }, log: string[], retaliation = false) {
  const attackValue = getUnitRule(attacker.unitType).attack + stats.attack;
  const defenseValue = getUnitRule(defender.unitType).defense + stats.defense + (defender.defended ? 2 : 0);
  const diff = attackValue - defenseValue;
  const multiplier = diff >= 0 ? 1 + diff * 0.05 : 1 / (1 + Math.abs(diff) * 0.05);
  const damagePerUnit = Math.floor((attacker.minDamage + attacker.maxDamage) / 2);
  const damage = Math.max(1, Math.floor(damagePerUnit * attacker.count * multiplier));
  const nextHealth = Math.max(0, defender.health - damage);
  const lost = Math.max(0, defender.count - Math.ceil(nextHealth / defender.maxHealth));
  defender.health = nextHealth;
  defender.count = nextHealth > 0 ? Math.ceil(nextHealth / defender.maxHealth) : 0;
  log.push(`${getUnitRule(attacker.unitType).label}${retaliation ? " riposte" : " attaque"}: ${lost} pertes.`);
}

function getStats(side: CombatSide, params: { attackerStats: { attack: number; defense: number }; defenderStats: { attack: number; defense: number } }) {
  return side === "attacker" ? params.attackerStats : params.defenderStats;
}

function advanceTurn(units: CombatBoardUnit[], turnQueue: string[], currentUnitId: string, round: number) {
  const remaining = turnQueue.filter((id) => id !== currentUnitId && units.some((unit) => unit.id === id));
  if (remaining.length > 0) return { turnQueue: remaining, currentUnitId: remaining[0] ?? null, round };
  const nextRound = round + 1;
  const refreshedUnits = units.map((unit) => ({ ...unit, hasRetaliated: false, defended: false, waited: false }));
  const nextQueue = buildTurnQueue(refreshedUnits, nextRound);
  return { turnQueue: nextQueue, currentUnitId: nextQueue[0] ?? null, round: nextRound };
}

function getCombatResult(units: CombatBoardUnit[]): "attacker" | "defender" | null {
  const attackerAlive = units.some((unit) => unit.side === "attacker" && unit.count > 0);
  const defenderAlive = units.some((unit) => unit.side === "defender" && unit.count > 0);
  if (attackerAlive && defenderAlive) return null;
  return attackerAlive ? "attacker" : "defender";
}

function isInside(q: number, r: number) {
  return Number.isInteger(q) && Number.isInteger(r) && q >= 0 && q < COMBAT_COLS && r >= 0 && r < COMBAT_ROWS;
}

export function isTerrainBlocked(q: number, r: number, terrain: CombatTerrainFeature[] = []) {
  return terrain.some((feature) => feature.q === q && feature.r === r);
}

export function getHexNeighbors(q: number, r: number) {
  const even = r % 2 === 0;
  const deltas = even
    ? [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]]
    : [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];

  return deltas
    .map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
    .filter((cell) => isInside(cell.q, cell.r));
}

function findPath(start: { q: number; r: number }, end: { q: number; r: number }, units: CombatBoardUnit[], terrain: CombatTerrainFeature[]) {
  const startKey = `${start.q},${start.r}`;
  const endKey = `${end.q},${end.r}`;
  const occupied = new Set(units.map((unit) => `${unit.q},${unit.r}`));
  const queue: { q: number; r: number; path: { q: number; r: number }[] }[] = [{ q: start.q, r: start.r, path: [{ q: start.q, r: start.r }] }];
  const seen = new Set([startKey]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (`${current.q},${current.r}` === endKey) return current.path;

    for (const neighbor of getHexNeighbors(current.q, current.r)) {
      const key = `${neighbor.q},${neighbor.r}`;
      if (seen.has(key)) continue;
      if (isTerrainBlocked(neighbor.q, neighbor.r, terrain)) continue;
      if (occupied.has(key) && key !== startKey && key !== endKey) continue;
      seen.add(key);
      queue.push({ ...neighbor, path: [...current.path, neighbor] });
    }
  }

  return [];
}

function createCombatTerrain() {
  const terrain: CombatTerrainFeature[] = [];
  const occupied = new Set<string>();
  const addFeature = (type: CombatTerrainFeature["type"], q: number, r: number) => {
    const key = `${q},${r}`;
    if (!isInside(q, r) || q <= 1 || q >= COMBAT_COLS - 2 || occupied.has(key)) return false;
    occupied.add(key);
    terrain.push({ type, q, r });
    return true;
  };

  for (let pool = 0; pool < 2; pool++) {
    let current = { q: 4 + Math.floor(Math.random() * 5), r: 2 + Math.floor(Math.random() * 5) };
    const size = 2 + Math.floor(Math.random() * 2);
    for (let index = 0; index < size; index++) {
      addFeature("water", current.q, current.r);
      const neighbors = getHexNeighbors(current.q, current.r).filter((cell) => cell.q > 1 && cell.q < COMBAT_COLS - 2);
      current = neighbors[Math.floor(Math.random() * neighbors.length)] ?? current;
    }
  }

  for (let rock = 0; rock < 4; rock++) {
    addFeature("rock", 3 + Math.floor(Math.random() * (COMBAT_COLS - 6)), Math.floor(Math.random() * COMBAT_ROWS));
  }

  return terrain;
}

export function resolveAutomaticCombat(attacker: CombatParticipantSnapshot, defender: CombatParticipantSnapshot): CombatSummary {
  const result = autoResolveCombat(attacker, defender);
  const attackerWins = result.winnerHeroId === attacker.id;
  const attackerLossRatio = attackerWins ? result.winnerLossRatio : 1;
  const defenderLossRatio = attackerWins ? 1 : result.winnerLossRatio;
  const attackerNext = applyLossesToArmies(attacker.armies, attackerLossRatio, !attackerWins);
  const defenderNext = applyLossesToArmies(defender.armies, defenderLossRatio, attackerWins);
  return {
    winnerId: result.winnerHeroId,
    loserId: result.loserHeroId,
    attackerLosses: getLosses(attacker.armies, attackerNext),
    defenderLosses: getLosses(defender.armies, defenderNext),
    experienceGained: 500,
    log: [`Puissance attaquant ${result.attackerPower}`, `Puissance defenseur ${result.defenderPower}`],
  };
}

export function getLosses(before: UnitStack[], after: UnitStack[]) {
  return before.map((army) => {
    const next = after.find((item) => item.id === army.id);
    return { unitType: army.unitType as UnitType, lost: army.count - (next?.count ?? 0) };
  }).filter((loss) => loss.lost > 0);
}

export function heroToParticipant(hero: Hero, playerId: string): CombatParticipantSnapshot {
  return {
    id: hero.id,
    playerId,
    attack: hero.stats.attack,
    defense: hero.stats.defense,
    armies: hero.armies,
  };
}
