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
