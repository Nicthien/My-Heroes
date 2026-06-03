import { Faction } from "./types";

export const PLAYABLE_FACTIONS: readonly Faction[] = [
  Faction.CASTLE,
  Faction.RAMPART,
  Faction.TOWER,
  Faction.INFERNO,
  Faction.NECROPOLIS,
  Faction.DUNGEON,
  Faction.STRONGHOLD,
  Faction.FORTRESS,
];

export function isPlayableFaction(value: unknown): value is Faction {
  return typeof value === "string" && PLAYABLE_FACTIONS.includes(value as Faction);
}

export function normalizePlayableFaction(value: unknown, fallback: Faction = Faction.CASTLE): Faction {
  return isPlayableFaction(value) ? value : fallback;
}
