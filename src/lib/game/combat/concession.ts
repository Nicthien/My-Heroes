import { buildTurnQueue, getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import type { CombatBoardUnit, CombatSide } from "@/lib/game/types";

export type CombatConcessionParticipant = {
  id?: string | null;
  player_id: string;
  hero_id: string;
  side?: CombatSide | null;
  joined_at?: string | null;
};

export function isHeroCombatUnit(unit: CombatBoardUnit, heroId: string, playerId: string) {
  return unit.heroId === heroId || (unit.ownerPlayerId === playerId && !unit.heroId);
}

export function getHeroCombatUnits(units: CombatBoardUnit[], heroId: string, playerId: string) {
  return units.filter((unit) => isHeroCombatUnit(unit, heroId, playerId));
}

export function sideHasActivePlayerUnits(units: CombatBoardUnit[], side: CombatSide) {
  return units.some((unit) => unit.side === side && unit.count > 0 && Boolean(unit.ownerPlayerId && unit.heroId));
}

export function findNextPrimaryParticipant(
  participants: CombatConcessionParticipant[],
  units: CombatBoardUnit[],
  side: CombatSide
) {
  return [...participants]
    .filter((participant) =>
      participant.side === side &&
      units.some((unit) => unit.heroId === participant.hero_id && unit.ownerPlayerId === participant.player_id && unit.count > 0)
    )
    .sort((a, b) => String(a.joined_at ?? "").localeCompare(String(b.joined_at ?? "")))[0] ?? null;
}

export function buildConcessionBoardState(params: {
  units: CombatBoardUnit[];
  heroId: string;
  playerId: string;
  round: number;
  currentUnitId: string | null | undefined;
}) {
  const units = params.units.map((unit) =>
    isHeroCombatUnit(unit, params.heroId, params.playerId)
      ? { ...unit, count: 0, health: 0 }
      : unit
  );
  const turnQueue = buildTurnQueue(units, params.round);
  const currentUnitId = params.currentUnitId && turnQueue.includes(params.currentUnitId)
    ? params.currentUnitId
    : turnQueue[0] ?? null;
  return {
    units,
    turnQueue,
    currentUnitId,
    currentPlayerId: getCurrentCombatPlayerId({ units }, currentUnitId),
  };
}

/** HP the King loses every time he flees a combat (permanent — he never heals). */
export const KING_FLEE_HP_PENALTY = 5;

/** Apply the flat flee penalty to a King stack; he dies if it brings him to 0 HP. */
export function applyKingFleePenalty<T extends { unitType: string; count: number; health: number }>(unit: T): T {
  const nextHealth = Math.max(0, unit.health - KING_FLEE_HP_PENALTY);
  return { ...unit, count: nextHealth > 0 ? 1 : 0, health: nextHealth };
}

/**
 * True when applying the flee penalty would drop this hero's King to 0 HP — i.e.
 * fleeing would kill him. The flee handlers use this to refuse a suicidal retreat
 * (the King keeps the -5 HP cost otherwise, but can never die by fleeing).
 */
export function wouldFleeKillKing(units: CombatBoardUnit[], heroId: string, playerId: string): boolean {
  const king = units.find(
    (unit) => unit.unitType === "king" && unit.count > 0 && isHeroCombatUnit(unit, heroId, playerId),
  );
  return Boolean(king && king.health - KING_FLEE_HP_PENALTY <= 0);
}

export function buildHalfLossConcessionPersistenceUnits(params: {
  units: CombatBoardUnit[];
  heroId: string;
  playerId: string;
}) {
  return params.units.map((unit) => {
    if (!isHeroCombatUnit(unit, params.heroId, params.playerId)) return unit;
    // The King keeps his single body but bleeds a flat 5 HP for fleeing.
    if (unit.unitType === "king") return applyKingFleePenalty(unit);
    const lostCount = Math.floor(Math.max(0, unit.count) / 2);
    const nextCount = Math.max(0, unit.count - lostCount);
    const nextHealth = Math.max(0, Math.min(unit.health - lostCount * unit.maxHealth, nextCount * unit.maxHealth));
    return { ...unit, count: nextCount, health: nextHealth };
  });
}
