import { CombatBoardUnit, CombatEnvironment, CombatSide, CombatSummary, CombatTerrainFeature, Hero, UnitStack, UnitType } from "../types";
import { getUnitRule } from "../units";
import { autoResolveCombat, applyLossesToArmies } from "./autoResolve";
import {
  COMBAT_COLS,
  COMBAT_ROWS,
  findHexPath,
  findMeleeApproach,
  getBlockedCombatCells,
  getHexDistance,
  getHexNeighbors,
  getOccupiedCombatCells,
  isInsideCombatCell,
  isTerrainBlocked,
} from "./movement";
import {
  applyDamageToStack,
  hasAdjacentEnemy,
  normalizeCombatUnit,
  rollCombatDamage,
  type ManualCombatActionType,
} from "./rules";
import { assignMoraleToBoard, refreshMoraleForRound, rollMorale, type MoraleContext } from "./morale";

export { COMBAT_COLS, COMBAT_ROWS, getHexDistance, getHexNeighbors, isTerrainBlocked };

export interface CombatParticipantSnapshot {
  id: string;
  playerId: string | null;
  heroId?: string | null;
  participantId?: string | null;
  attack: number;
  defense: number;
  morale?: number;
  armies: UnitStack[];
}

export function createCombatBoard(
  attacker: CombatParticipantSnapshot,
  defender: CombatParticipantSnapshot,
  options: { environment?: CombatEnvironment } = {}
) {
  const units: CombatBoardUnit[] = [];
  const terrain = createCombatTerrain();
  addUnits(units, attacker.armies, "attacker", attacker.playerId, attacker.heroId ?? (attacker.playerId ? attacker.id : null), attacker.participantId ?? null, 1, 1, undefined, terrain);
  addUnits(units, defender.armies, "defender", defender.playerId, defender.heroId ?? (defender.playerId ? defender.id : null), defender.participantId ?? null, COMBAT_COLS - 2, 1, undefined, terrain);
  assignMoraleToBoard(units, buildMoraleContext({ attacker, defender, environment: options.environment }));
  const turnQueue = buildTurnQueue(units, 1);
  const initialUnits = cloneCombatUnits(units);
  return {
    boardState: { units, initialUnits, terrain },
    turnQueue,
    currentUnitId: turnQueue[0] ?? null,
    currentPlayerId: units.find((unit) => unit.id === turnQueue[0])?.ownerPlayerId ?? null,
  };
}

export function cloneCombatUnits(units: CombatBoardUnit[]) {
  return units.map((unit) => ({ ...unit }));
}

export function getCurrentCombatPlayerId(
  boardState: { units?: CombatBoardUnit[] } | null | undefined,
  currentUnitId: string | null | undefined,
  fallback: string | null | undefined = null
) {
  const actor = boardState?.units?.find((unit) => unit.id === currentUnitId);
  return actor ? actor.ownerPlayerId ?? null : fallback ?? null;
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
  moraleContext?: MoraleContext;
}) {
  const q = params.side === "attacker" ? 0 : COMBAT_COLS - 1;
  addUnits(params.units, params.armies, params.side, params.ownerPlayerId, params.heroId, params.participantId, q, params.joinsRound, [0, 1, 2, 3, 4, 5, 6, 7, 8], params.terrain ?? []);
  assignMoraleToBoard(params.units, params.moraleContext ?? {});
}

function buildMoraleContext(params: {
  attacker: CombatParticipantSnapshot;
  defender: CombatParticipantSnapshot;
  environment?: CombatEnvironment;
}): MoraleContext {
  return {
    attackerHeroMorale: params.attacker.morale ?? 0,
    defenderHeroMorale: params.defender.morale ?? 0,
    terrain: params.environment?.terrain,
  };
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
    .map(normalizeCombatUnit)
    .filter((unit) => unit.count > 0 && (unit.joinsRound ?? 1) <= round)
    .sort((a, b) => b.speed - a.speed || (a.side === "attacker" ? -1 : 1) - (b.side === "attacker" ? -1 : 1) || a.position - b.position)
    .map((unit) => unit.id);
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
  immortalHeroId?: string | null;
  moraleContext?: MoraleContext;
}) {
  const log: string[] = [];
  let didAct = false;
  let didWait = false;
  let deferredTurnQueue: string[] | null = null;
  const units = params.units.map((unit) => normalizeCombatUnit({ ...unit }));
  const actor = units.find((unit) => unit.id === params.currentUnitId);
  if (!actor) return { units, turnQueue: params.turnQueue, currentUnitId: null, currentPlayerId: null, round: params.round, log, result: null };

  const actorMoraleAppliedBefore = actor.moraleApplied;
  const actorMoraleBonusBefore = actor.moraleBonus;
  if (!actor.moraleApplied) {
    const moraleRoll = rollMorale(actor.morale ?? 0);
    actor.moraleApplied = true;
    if (moraleRoll === "bad") {
      log.push(`${getUnitRule(actor.unitType).label} : moral negatif, le tour est saute.`);
      const livingUnits = units.filter((unit) => unit.count > 0);
      const next = advanceTurn(livingUnits, params.turnQueue, actor.id, params.round, params.moraleContext);
      return {
        units: next.units,
        turnQueue: next.turnQueue,
        currentUnitId: next.currentUnitId,
        currentPlayerId: next.units.find((unit) => unit.id === next.currentUnitId)?.ownerPlayerId ?? null,
        round: next.round,
        log,
        result: null,
      };
    }
    if (moraleRoll === "good") {
      actor.moraleBonus = true;
      log.push(`${getUnitRule(actor.unitType).label} : moral positif, action bonus.`);
    }
  }
  const actorWasDefended = actor.defended;
  actor.defended = false;

  if (params.action.type === "MOVE") {
    const q = Number(params.action.q);
    const r = Number(params.action.r);
    if (isInsideCombatCell(q, r) && !isTerrainBlocked(q, r, params.terrain) && !units.some((unit) => unit.q === q && unit.r === r)) {
      const path = findHexPath(
        actor,
        { q, r },
        getOccupiedCombatCells(units, actor.id),
        getBlockedCombatCells(params.terrain)
      );
      if (path.length > 1 && path.length - 1 <= actor.speed) {
        actor.q = q;
        actor.r = r;
        didAct = true;
        log.push(`${getUnitRule(actor.unitType).label} se déplace.`);
      }
    }
  } else if (params.action.type === "ATTACK" || params.action.type === "SHOOT") {
    const target = units.find((unit) => unit.id === params.action.targetUnitId && unit.side !== actor.side);
    if (target) {
      const actionType = params.action.type as ManualCombatActionType;
      if (actionType === "ATTACK") {
        const approach = findMeleeApproach(actor, target, units, params.terrain ?? []);
        if (approach) {
          actor.q = approach.destination.q;
          actor.r = approach.destination.r;
        }
      }
      const distance = getHexDistance(actor, target);
      const roll = rollCombatDamage({
        attacker: actor,
        defender: target,
        attackerStats: getStats(actor.side, params),
        defenderStats: getStats(target.side, params),
        actionType,
        terrain: params.terrain,
        actorAdjacentToEnemy: hasAdjacentEnemy(actor, units),
      });
      if (roll.profile.canStrike) {
        if (actionType === "SHOOT") actor.shots = Math.max(0, actor.shots - 1);
        applyRolledDamage(actor, target, roll, log, false, params.immortalHeroId);
        didAct = true;
        if (target.count > 0 && distance <= 1 && !target.hasRetaliated) {
          const retaliationRoll = rollCombatDamage({
            attacker: target,
            defender: actor,
            attackerStats: getStats(target.side, params),
            defenderStats: getStats(actor.side, params),
            actionType: "ATTACK",
            terrain: params.terrain,
          });
          applyRolledDamage(target, actor, retaliationRoll, log, true, params.immortalHeroId);
          target.hasRetaliated = true;
        }
      }
    }
  } else if (params.action.type === "DEFEND") {
    actor.defended = true;
    didAct = true;
    log.push(`${getUnitRule(actor.unitType).label} se défend.`);
  } else if (params.action.type === "WAIT") {
    if (!actor.waited) {
      actor.waited = true;
      didWait = true;
      deferredTurnQueue = deferUnitToWaitPhase(params.turnQueue, actor.id, units);
      didAct = true;
      log.push(`${getUnitRule(actor.unitType).label} attend.`);
    }
  }

  if (!didAct) {
    actor.defended = actorWasDefended;
    actor.moraleApplied = actorMoraleAppliedBefore;
    actor.moraleBonus = actorMoraleBonusBefore;
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

  const grantsBonus = !didWait && actor.moraleBonus && actor.count > 0;
  if (grantsBonus) {
    actor.moraleBonus = false;
  }
  const next = grantsBonus
    ? { units: livingUnits, turnQueue: params.turnQueue, currentUnitId: actor.id, round: params.round }
    : didWait
      ? getNextTurn(livingUnits, deferredTurnQueue ?? params.turnQueue, params.round, params.moraleContext)
      : advanceTurn(livingUnits, params.turnQueue, actor.id, params.round, params.moraleContext);
  return {
    units: next.units,
    turnQueue: next.turnQueue,
    currentUnitId: next.currentUnitId,
    currentPlayerId: next.units.find((unit) => unit.id === next.currentUnitId)?.ownerPlayerId ?? null,
    round: next.round,
    log,
    result: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const side = attacker.side === "attacker" ? "Héros" : "Défenseur";
  const verb = retaliation ? "riposte" : "attaque";
  log.push(`${side} - ${getUnitRule(attacker.unitType).label} ${verb}: ${lost} perte(s) ennemie(s).`);
}

function getStats(side: CombatSide, params: { attackerStats: { attack: number; defense: number }; defenderStats: { attack: number; defense: number } }) {
  return side === "attacker" ? params.attackerStats : params.defenderStats;
}

function applyRolledDamage(
  attacker: CombatBoardUnit,
  defender: CombatBoardUnit,
  roll: ReturnType<typeof rollCombatDamage>,
  log: string[],
  retaliation = false,
  immortalHeroId?: string | null
) {
  if (defender.heroId && defender.heroId === immortalHeroId) {
    const side = attacker.side === "attacker" ? "Heros" : "Defenseur";
    const verb = retaliation ? "riposte" : "attaque";
    log.push(`${side} - ${getUnitRule(attacker.unitType).label} ${verb}: mode dieu, aucune perte.`);
    return;
  }
  const { lost } = applyDamageToStack(defender, roll.damage);
  const side = attacker.side === "attacker" ? "Heros" : "Defenseur";
  const verb = retaliation ? "riposte" : "attaque";
  const penalty = roll.profile.penaltyReasons.length > 0 ? ` (${roll.profile.penaltyReasons.join(", ")})` : "";
  log.push(`${side} - ${getUnitRule(attacker.unitType).label} ${verb} ${roll.profile.actionLabel}${penalty}: ${roll.damage} degats, ${lost} perte(s).`);
}

function deferUnitToWaitPhase(turnQueue: string[], currentUnitId: string, units: CombatBoardUnit[]) {
  const livingIds = new Set(units.filter((unit) => unit.count > 0).map((unit) => unit.id));
  const remaining = turnQueue.filter((id) => id !== currentUnitId && livingIds.has(id));
  const nonWaited = remaining.filter((id) => !units.find((unit) => unit.id === id)?.waited);
  const waited = remaining.filter((id) => units.find((unit) => unit.id === id)?.waited);
  return [...nonWaited, ...waited, currentUnitId];
}

function advanceTurn(units: CombatBoardUnit[], turnQueue: string[], currentUnitId: string, round: number, moraleContext?: MoraleContext) {
  const remaining = turnQueue.filter((id) => id !== currentUnitId && units.some((unit) => unit.id === id));
  return getNextTurn(units, remaining, round, moraleContext);
}

function getNextTurn(units: CombatBoardUnit[], turnQueue: string[], round: number, moraleContext?: MoraleContext) {
  const remaining = turnQueue.filter((id) => units.some((unit) => unit.id === id));
  if (remaining.length > 0) return { units, turnQueue: remaining, currentUnitId: remaining[0] ?? null, round };
  const nextRound = round + 1;
  const refreshedUnits = refreshMoraleForRound(
    units.map((unit) => ({ ...unit, hasRetaliated: false, waited: false })),
    moraleContext ?? {}
  );
  const nextQueue = buildTurnQueue(refreshedUnits, nextRound);
  return { units: refreshedUnits, turnQueue: nextQueue, currentUnitId: nextQueue[0] ?? null, round: nextRound };
}

function getCombatResult(units: CombatBoardUnit[]): "attacker" | "defender" | null {
  const attackerAlive = units.some((unit) => unit.side === "attacker" && unit.count > 0);
  const defenderAlive = units.some((unit) => unit.side === "defender" && unit.count > 0);
  if (attackerAlive && defenderAlive) return null;
  return attackerAlive ? "attacker" : "defender";
}

function createCombatTerrain() {
  const terrain: CombatTerrainFeature[] = [];
  const occupied = new Set<string>();
  const addFeature = (type: CombatTerrainFeature["type"], q: number, r: number) => {
    const key = `${q},${r}`;
    if (!isInsideCombatCell(q, r) || q <= 1 || q >= COMBAT_COLS - 2 || occupied.has(key)) return false;
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

export function resolveAutomaticCombat(
  attacker: CombatParticipantSnapshot,
  defender: CombatParticipantSnapshot,
  options: { immortalHeroId?: string | null } = {}
): CombatSummary {
  const result = autoResolveCombat(attacker, defender);
  const attackerIsImmortal = Boolean(options.immortalHeroId && (attacker.heroId === options.immortalHeroId || attacker.id === options.immortalHeroId));
  const defenderIsImmortal = Boolean(options.immortalHeroId && (defender.heroId === options.immortalHeroId || defender.id === options.immortalHeroId));
  const attackerWins = attackerIsImmortal || (!defenderIsImmortal && result.winnerHeroId === attacker.id);
  const winnerLossRatio = attackerIsImmortal || defenderIsImmortal ? 0 : result.winnerLossRatio;
  const attackerLossRatio = attackerWins ? winnerLossRatio : 1;
  const defenderLossRatio = attackerWins ? 1 : winnerLossRatio;
  const attackerNext = applyLossesToArmies(attacker.armies, attackerLossRatio, !attackerWins);
  const defenderNext = applyLossesToArmies(defender.armies, defenderLossRatio, attackerWins);
  return {
    winnerId: attackerWins ? attacker.id : defender.id,
    loserId: attackerWins ? defender.id : attacker.id,
    attackerLosses: getLosses(attacker.armies, attackerNext),
    defenderLosses: getLosses(defender.armies, defenderNext),
    experienceGained: 500,
    log: [`Puissance attaquant ${result.attackerPower}`, `Puissance défenseur ${result.defenderPower}`],
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
    morale: hero.stats.morale,
    armies: hero.armies,
  };
}
