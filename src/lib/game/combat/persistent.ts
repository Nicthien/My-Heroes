import { CombatBoardUnit, CombatEnvironment, CombatSide, CombatSideStatsSnapshot, CombatSummary, CombatTerrainFeature, Hero, UnitStack, UnitType } from "../types";
import { canRegenerateHealth, getUnitRule } from "../units";
import { autoResolveCombat, applyLossesToArmies } from "./autoResolve";
import {
  COMBAT_BASE_ROWS,
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
import { clampLuck } from "./luck";
import { assignMoraleToBoard, refreshMoraleForRound, rollMorale, type MoraleContext } from "./morale";
import {
  applyMoatToUnit,
  closeGateIfClear,
  damageSiegeWithCatapult,
  findFirstMoatCellInPath,
  openGateForDefenderPath,
  refreshMoatPenalties,
  isSiegeLandingBlocked,
  type SiegeState,
} from "./siege";

export { COMBAT_BASE_ROWS, COMBAT_COLS, COMBAT_ROWS, getHexDistance, getHexNeighbors, isTerrainBlocked };

export interface CombatParticipantSnapshot {
  id: string;
  playerId: string | null;
  heroId?: string | null;
  participantId?: string | null;
  attack: number;
  defense: number;
  skills?: CombatSideStatsSnapshot["skills"];
  morale?: number;
  luck?: number;
  armies: UnitStack[];
}

export function createCombatBoard(
  attacker: CombatParticipantSnapshot,
  defender: CombatParticipantSnapshot,
  options: { environment?: CombatEnvironment; tacticsAdvance?: { attacker?: number; defender?: number } } = {}
) {
  const units: CombatBoardUnit[] = [];
  const attackerAdvance = Math.max(0, Math.min(3, options.tacticsAdvance?.attacker ?? 0));
  const defenderAdvance = Math.max(0, Math.min(3, options.tacticsAdvance?.defender ?? 0));
  const rowCount = getInitialCombatRows(attacker.armies.length, defender.armies.length);
  const terrain = createCombatTerrain(rowCount, options.environment);
  addUnits(units, attacker.armies, "attacker", attacker.playerId, attacker.heroId ?? (attacker.playerId ? attacker.id : null), attacker.participantId ?? null, getInitialColumns("attacker", attackerAdvance), 1, rowCount, terrain, attacker.luck);
  addUnits(units, defender.armies, "defender", defender.playerId, defender.heroId ?? (defender.playerId ? defender.id : null), defender.participantId ?? null, getInitialColumns("defender", defenderAdvance), 1, rowCount, terrain, defender.luck);
  assignMoraleToBoard(units, buildMoraleContext({ attacker, defender, environment: options.environment }));
  const turnQueue = buildTurnQueue(units, 1);
  const initialUnits = cloneCombatUnits(units);
  return {
    boardState: {
      units,
      initialUnits,
      terrain,
      sideStats: {
        attacker: snapshotSideStats(attacker),
        defender: snapshotSideStats(defender),
      },
    },
    turnQueue,
    currentUnitId: turnQueue[0] ?? null,
    currentPlayerId: units.find((unit) => unit.id === turnQueue[0])?.ownerPlayerId ?? null,
  };
}

function snapshotSideStats(participant: CombatParticipantSnapshot): CombatSideStatsSnapshot {
  return {
    attack: Number(participant.attack ?? 0),
    defense: Number(participant.defense ?? 0),
    skills: participant.skills ?? {},
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
  qColumns: number[],
  joinsRound: number,
  rowCount = COMBAT_BASE_ROWS,
  terrain: CombatTerrainFeature[] = [],
  luck = 0
) {
  const preferredRows = Array.from({ length: rowCount }, (_, row) => row);
  armies.filter((army) => army.count > 0).forEach((army, index) => {
    const rule = getUnitRule(army.unitType);
    const lane = Math.floor(index / rowCount);
    const q = qColumns[Math.min(lane, qColumns.length - 1)];
    const r = findFreeRow(units, q, preferredRows[index % preferredRows.length], terrain, rowCount);
    const count = Math.max(0, Number(army.count ?? 0));
    const maxHealth = rule.health;
    const health = Math.max(0, Math.min(Number(army.health ?? count * maxHealth), count * maxHealth));
    units.push({
      ...army,
      count,
      health,
      maxHealth,
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
      luck: clampLuck(luck),
      luckTriggered: false,
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
  const rowCount = getReinforcementCombatRows(params.units, params.armies.length, q, params.terrain ?? []);
  addUnits(params.units, params.armies, params.side, params.ownerPlayerId, params.heroId, params.participantId, [q], params.joinsRound, rowCount, params.terrain ?? [], getHeroLuckForSide(params.side, params.moraleContext));
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

function getHeroLuckForSide(side: CombatSide, context: { attackerHeroLuck?: number; defenderHeroLuck?: number } = {}) {
  return clampLuck(side === "attacker" ? Number(context.attackerHeroLuck ?? 0) : Number(context.defenderHeroLuck ?? 0));
}

function getInitialCombatRows(attackerStackCount: number, defenderStackCount: number) {
  const maxStacks = Math.max(attackerStackCount, defenderStackCount);
  return maxStacks > COMBAT_BASE_ROWS * 2 ? COMBAT_ROWS : COMBAT_BASE_ROWS;
}

function getVisibleCombatRows(units: CombatBoardUnit[], terrain: CombatTerrainFeature[] = []) {
  const maxRow = [...units, ...terrain].reduce((max, item) => Math.max(max, Number(item.r ?? 0)), COMBAT_BASE_ROWS - 1);
  return Math.max(COMBAT_BASE_ROWS, Math.min(COMBAT_ROWS, maxRow + 1));
}

function getReinforcementCombatRows(units: CombatBoardUnit[], incomingStacks: number, q: number, terrain: CombatTerrainFeature[] = []) {
  const occupiedRows = new Set(units.filter((unit) => unit.count > 0 && unit.q === q).map((unit) => unit.r));
  const neededRows = occupiedRows.size + incomingStacks;
  return Math.max(getVisibleCombatRows(units, terrain), Math.min(COMBAT_ROWS, neededRows));
}

function getInitialColumns(side: CombatSide, advance: number) {
  return side === "attacker"
    ? [1 + advance, 0]
    : [COMBAT_COLS - 2 - advance, COMBAT_COLS - 1];
}

function findFreeRow(units: CombatBoardUnit[], q: number, preferredRow: number, terrain: CombatTerrainFeature[], rowCount = COMBAT_BASE_ROWS) {
  for (let offset = 0; offset < rowCount; offset++) {
    const candidates = [preferredRow + offset, preferredRow - offset];
    for (const r of candidates) {
      if (r < 0 || r >= rowCount) continue;
      if (!isTerrainBlocked(q, r, terrain) && !units.some((unit) => unit.q === q && unit.r === r)) return r;
    }
  }

  return Math.max(0, Math.min(rowCount - 1, preferredRow));
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
  action: { type: "MOVE" | "ATTACK" | "SHOOT" | "WAIT" | "DEFEND" | "HEAL"; q?: number; r?: number; targetUnitId?: string };
  attackerStats: { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> };
  defenderStats: { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> };
  immortalHeroId?: string | null;
  moraleContext?: MoraleContext;
  siege?: SiegeState | null;
}) {
  const log: string[] = [];
  let didAct = false;
  let didWait = false;
  let deferredTurnQueue: string[] | null = null;
  const units = params.units.map((unit) => normalizeCombatUnit({ ...unit, luckTriggered: false, moraleTriggered: undefined }));
  let siege = closeGateIfClear(params.siege, units);
  const actor = units.find((unit) => unit.id === params.currentUnitId);
  if (!actor) return { units, turnQueue: params.turnQueue, currentUnitId: null, currentPlayerId: null, round: params.round, log, result: null, siege };

  // Machines de guerre : comportement automatique
  if (actor.unitType === "catapult") {
    const catapult = damageSiegeWithCatapult(siege);
    siege = catapult.siege;
    if (catapult.hit) {
      const targetLabel = catapult.hit.kind === "gate" ? "la porte" : catapult.hit.kind === "tower" ? "une tour" : "un mur";
      const critical = catapult.hit.critical ? " critique" : "";
      const destroyed = catapult.hit.destroyed ? " et le detruit" : "";
      log.push(`Catapulte frappe ${targetLabel}${critical}${destroyed}.`);
    } else {
      log.push(`Catapulte n'a plus de cible.`);
    }
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
      siege,
    };
  }
  if (actor.unitType === "first_aid_tent" || actor.unitType === "ammo_cart") {
    if (actor.unitType === "first_aid_tent") {
      // Cible explicite si le joueur a passé targetUnitId, sinon allié le plus blessé adjacent
      const explicit = params.action.targetUnitId
        ? units.find((u) => u.id === params.action.targetUnitId && u.side === actor.side && u.count > 0 && canRegenerateHealth(u.unitType) && getHexDistance(actor, u) <= 1)
        : null;
      const wounded = explicit ?? units
        .filter((u) => u.id !== actor.id && u.side === actor.side && u.count > 0 && canRegenerateHealth(u.unitType) && u.health < u.count * u.maxHealth && getHexDistance(actor, u) <= 1)
        .sort((a, b) => (b.count * b.maxHealth - b.health) - (a.count * a.maxHealth - a.health))[0];
      if (wounded) {
        const heroSkills = getStats(actor.side, params).skills ?? {};
        const lvl = heroSkills.first_aid === "expert" ? 3 : heroSkills.first_aid === "advanced" ? 2 : heroSkills.first_aid === "basic" ? 1 : 0;
        const healAmount = 50 + lvl * 50;
        const maxHealth = wounded.count * wounded.maxHealth;
        wounded.health = Math.min(maxHealth, wounded.health + healAmount);
        log.push(`Tente de premiers secours soigne ${getUnitRule(wounded.unitType).label} (+${healAmount} PV).`);
      } else {
        log.push(`Tente de premiers secours : aucun allié blessé adjacent.`);
      }
    } else {
      log.push(`Chariot de munitions : actif (tirs alliés illimités).`);
    }
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
      siege,
    };
  }

  const actorMoraleAppliedBefore = actor.moraleApplied;
  const actorMoraleBonusBefore = actor.moraleBonus;
  if (!actor.moraleApplied) {
    const moraleRoll = rollMorale(actor.morale ?? 0);
    actor.moraleApplied = true;
    if (moraleRoll === "bad") {
      actor.moraleTriggered = "bad";
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
        siege,
      };
    }
    if (moraleRoll === "good") {
      actor.moraleBonus = true;
      actor.moraleTriggered = "good";
      log.push(`${getUnitRule(actor.unitType).label} : moral positif, action bonus.`);
    }
  }
  const actorWasDefended = actor.defended;
  actor.defended = false;

  if (params.action.type === "MOVE") {
    const q = Number(params.action.q);
    const r = Number(params.action.r);
    if (isInsideCombatCell(q, r) && !isTerrainBlocked(q, r, params.terrain) && !isSiegeLandingBlocked(siege, { q, r }, units, actor) && !units.some((unit) => unit.q === q && unit.r === r)) {
      const path = findHexPath(
        actor,
        { q, r },
        getOccupiedCombatCells(units, actor.id),
        getBlockedCombatCells(params.terrain, siege, units, actor)
      );
      if (path.length > 1 && path.length - 1 <= actor.speed) {
        siege = openGateForDefenderPath(siege, actor, path);
        const moatCell = findFirstMoatCellInPath(siege, actor, path);
        actor.q = moatCell?.q ?? q;
        actor.r = moatCell?.r ?? r;
        if (moatCell && siege) applyMoatToUnit(actor, siege, log);
        didAct = true;
        log.push(`${getUnitRule(actor.unitType).label} se déplace.`);
      }
    }
  } else if (params.action.type === "ATTACK" || params.action.type === "SHOOT") {
    const target = units.find((unit) => unit.id === params.action.targetUnitId && unit.side !== actor.side);
    if (target) {
      const actionType = params.action.type as ManualCombatActionType;
      let stoppedByMoat = false;
      if (actionType === "ATTACK") {
        const approach = findMeleeApproach(actor, target, units, params.terrain ?? [], siege);
        if (approach) {
          siege = openGateForDefenderPath(siege, actor, approach.path);
          const moatCell = findFirstMoatCellInPath(siege, actor, approach.path);
          actor.q = moatCell?.q ?? approach.destination.q;
          actor.r = moatCell?.r ?? approach.destination.r;
          if (moatCell && siege) {
            applyMoatToUnit(actor, siege, log);
            didAct = true;
            stoppedByMoat = true;
          }
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
      if (!stoppedByMoat && roll.profile.canStrike) {
        const allyAmmoCart = units.some((u) => u.side === actor.side && u.unitType === "ammo_cart" && u.count > 0);
        if (actionType === "SHOOT" && !allyAmmoCart) actor.shots = Math.max(0, actor.shots - 1);
        actor.luckTriggered = roll.luckTriggered;
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
          target.luckTriggered = retaliationRoll.luckTriggered;
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
      siege,
    };
  }

  const grantsBonus = !didWait && actor.moraleBonus && actor.count > 0;
  if (grantsBonus) {
    actor.moraleBonus = false;
  }
  const livingUnits = refreshMoatPenalties(units.filter((unit) => unit.count > 0), siege);
  siege = closeGateIfClear(siege, livingUnits);
  const result = getCombatResult(livingUnits);
  if (result) return { units: livingUnits, turnQueue: [], currentUnitId: null, currentPlayerId: null, round: params.round, log, result, siege };

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
    siege,
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

function getStats(side: CombatSide, params: { attackerStats: { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> }; defenderStats: { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> } }) {
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
    const side = attacker.side === "attacker" ? "Héros" : "Defenseur";
    const verb = retaliation ? "riposte" : "attaque";
    log.push(`${side} - ${getUnitRule(attacker.unitType).label} ${verb}: mode dieu, aucune perte.`);
    return;
  }
  const { lost } = applyDamageToStack(defender, roll.damage);
  const side = attacker.side === "attacker" ? "Héros" : "Defenseur";
  const verb = retaliation ? "riposte" : "attaque";
  const penalty = roll.profile.penaltyReasons.length > 0 ? ` (${roll.profile.penaltyReasons.join(", ")})` : "";
  log.push(`${side} - ${getUnitRule(attacker.unitType).label} ${verb} ${roll.profile.actionLabel}${penalty}: ${roll.damage} dégâts, ${lost} perte(s).`);
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

function createCombatTerrain(rowCount = COMBAT_BASE_ROWS, environment?: CombatEnvironment) {
  const terrain: CombatTerrainFeature[] = [];
  const occupied = new Set<string>();
  const theme = environment?.theme ?? "grass";
  const addFeature = (type: CombatTerrainFeature["type"], q: number, r: number) => {
    const key = `${q},${r}`;
    if (!isInsideCombatCell(q, r) || q <= 1 || q >= COMBAT_COLS - 2 || occupied.has(key)) return false;
    occupied.add(key);
    terrain.push({ type, q, r });
    return true;
  };

  const waterPoolCount =
    theme === "water" || theme === "coast" || theme === "swamp"
      ? 2
      : environment?.hasNearbyWater
        ? 1
        : 0;
  for (let pool = 0; pool < waterPoolCount; pool++) {
    let current = { q: 4 + Math.floor(Math.random() * 5), r: Math.min(rowCount - 1, 2 + Math.floor(Math.random() * 5)) };
    const size = 2 + Math.floor(Math.random() * 2);
    for (let index = 0; index < size; index++) {
      addFeature("water", current.q, current.r);
      const neighbors = getHexNeighbors(current.q, current.r).filter((cell) => cell.q > 1 && cell.q < COMBAT_COLS - 2);
      current = neighbors[Math.floor(Math.random() * neighbors.length)] ?? current;
    }
  }

  const blockers = getCombatBlockerPool(theme);
  const blockerCount = 3 + Math.floor(Math.random() * 3);
  let visibleBlockerCount = 0;
  for (let blocker = 0; blocker < blockerCount; blocker++) {
    const type = blockers[Math.floor(Math.random() * blockers.length)] ?? "bramble";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (addFeature(type, 3 + Math.floor(Math.random() * (COMBAT_COLS - 6)), Math.floor(Math.random() * rowCount))) {
        visibleBlockerCount++;
        break;
      }
    }
  }

  const fallbackBlockerCells = [
    { q: 3, r: 1 },
    { q: COMBAT_COLS - 4, r: Math.min(rowCount - 2, 2) },
    { q: 5, r: Math.min(rowCount - 1, 4) },
    { q: COMBAT_COLS - 5, r: Math.min(rowCount - 1, 5) },
  ];
  for (const cell of fallbackBlockerCells) {
    if (visibleBlockerCount >= 4) break;
    const type = blockers[(cell.q + cell.r) % blockers.length] ?? "bramble";
    if (addFeature(type, cell.q, cell.r)) {
      visibleBlockerCount++;
    }
  }

  // Boulders make no sense on a wooden deck; every other theme scatters a few.
  if (theme !== "water") {
    for (let rock = 0; rock < 4; rock++) {
      addFeature("rock", 3 + Math.floor(Math.random() * (COMBAT_COLS - 6)), Math.floor(Math.random() * rowCount));
    }
  }

  return terrain;
}

function getCombatBlockerPool(theme: CombatEnvironment["theme"]): CombatTerrainFeature["type"][] {
  switch (theme) {
    case "forest":
      return ["fallen_log", "deadwood", "root_snarl", "bramble"];
    case "dirt":
    case "road":
    case "building":
      return ["deadwood", "root_snarl", "bramble"];
    case "sand":
      return ["cactus", "fallen_log", "bramble"];
    case "snow":
      return ["deadwood", "fallen_log", "bramble"];
    case "swamp":
    case "coast":
      return ["reed_thicket", "root_snarl", "fallen_log"];
    case "water":
      // Naval combat is fought on a ship's deck: the only "obstacles" are loose
      // timber/spars (fallen_log), never reeds, roots or boulders.
      return ["fallen_log"];
    case "lava":
    case "mountain":
      return ["crystal", "deadwood", "rock"];
    case "settlement":
      return ["fallen_log", "deadwood", "bramble"];
    case "grass":
    default:
      return ["bramble", "fallen_log", "root_snarl", "reed_thicket"];
  }
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
    luck: hero.stats.luck,
    skills: hero.skills,
    armies: hero.armies,
  };
}
