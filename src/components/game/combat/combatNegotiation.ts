import { computeSurrenderGoldCost } from "@/lib/game/combat/surrender";
import { PersistentCombat, Resources } from "@/lib/game/types";

export const RESOURCE_KEYS: Array<keyof Resources> = ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"];

export const RESOURCE_LABELS: Record<keyof Resources, string> = {
  gold: "Or",
  wood: "Bois",
  ore: "Minerai",
  mercury: "Mercure",
  crystals: "Cristaux",
  gems: "Gemmes",
  sulfur: "Soufre",
};

export function computeSurrenderCostForSide(
  combat: PersistentCombat,
  playerId: string,
  skills: Partial<Record<string, "basic" | "advanced" | "expert">>
) {
  const playerUnit = combat.boardState.units.find((unit) => unit.ownerPlayerId === playerId && unit.heroId && unit.count > 0);
  const side = playerUnit?.side ?? (combat.attackerPlayerId === playerId ? "attacker" : combat.defenderPlayerId === playerId ? "defender" : combat.participants?.find((participant) => participant.playerId === playerId)?.side ?? null);
  if (!side) return 0;
  const heroId = playerUnit?.heroId ??
    (side === "attacker" && combat.attackerPlayerId === playerId ? combat.attackerHeroId : null) ??
    (side === "defender" && combat.defenderPlayerId === playerId ? combat.defenderHeroId : null) ??
    combat.participants?.find((participant) => participant.playerId === playerId && participant.side === side)?.heroId ??
    null;
  const units = combat.boardState.units.filter((unit) => unit.heroId === heroId || (unit.ownerPlayerId === playerId && !unit.heroId));
  return computeSurrenderGoldCost(units, side, skills);
}

export function combatHasPlayerHeroesOnBothSides(combat: PersistentCombat) {
  const attackerHasHero = Boolean(combat.attackerPlayerId) || combat.boardState.units.some((unit) => unit.side === "attacker" && unit.ownerPlayerId && unit.heroId);
  const defenderHasHero = Boolean(combat.defenderPlayerId && combat.defenderHeroId) || combat.boardState.units.some((unit) => unit.side === "defender" && unit.ownerPlayerId && unit.heroId);
  return attackerHasHero && defenderHasHero;
}
