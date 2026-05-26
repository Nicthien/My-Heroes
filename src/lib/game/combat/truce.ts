import type { CombatTruce } from "@/lib/game/types";

export function isCombatTruceActive(truce: Pick<CombatTruce, "status" | "pauseUntilTurn"> | null | undefined, turnNumber: number) {
  return Boolean(truce && truce.status === "ACTIVE" && truce.pauseUntilTurn > turnNumber);
}

export function findActiveCombatTruce<T extends Pick<CombatTruce, "status" | "pauseUntilTurn">>(
  truces: T[] | null | undefined,
  turnNumber: number
): T | null {
  return truces?.find((truce) => isCombatTruceActive(truce, turnNumber)) ?? null;
}

export function hasPlayerUsedTruce(
  truces: Array<Pick<CombatTruce, "requestedByPlayerId">> | null | undefined,
  playerId: string | null | undefined
) {
  return Boolean(playerId && truces?.some((truce) => truce.requestedByPlayerId === playerId));
}
