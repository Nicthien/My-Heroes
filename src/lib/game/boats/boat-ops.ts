import { canAfford } from "@/lib/game/economy";
import { isTileTraversable } from "@/lib/game/engine";
import { findTownBoatLaunchTile } from "@/lib/game/engine/town-coast";
import { normalizeMapLevel, SURFACE_LEVEL } from "@/lib/game/map-levels";
import { hasShipyardBuilding } from "@/lib/game/town-buildings";
import { Faction, type GameMap, type Position, type Resources } from "@/lib/game/types";

/** Shared boat cost — used by the HTTP handler and the AI economy. */
export const BOAT_COST = { gold: 1000, wood: 10 } as const;

export type BoatOpHero = { id: string; x: number; y: number; mapLevel?: string | null };
export type BoatOpBoat = { id: string; heroId?: string | null; x: number; y: number; mapLevel?: string | null };
export type BoatOpTown = { x: number; y: number; mapLevel?: string | null; townType?: string; buildings?: string[] };

export type BoatCheck = { ok: true } | { ok: false; reason: string };
export type BuildBoatCheck = { ok: true; destination: Position } | { ok: false; reason: string };

function areAdjacentOrSame(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

/**
 * Validates whether `hero` may embark on `boat`. Pure: combat checks stay in the
 * caller. `mapData` must be normalized and on the surface layer.
 */
export function canEmbark(params: {
  hero: BoatOpHero;
  boat: BoatOpBoat | undefined;
  boats: BoatOpBoat[];
  mapData: GameMap;
}): BoatCheck {
  const { hero, boat, boats, mapData } = params;
  if (normalizeMapLevel(hero.mapLevel) !== SURFACE_LEVEL) return { ok: false, reason: "Impossible d'embarquer dans le souterrain" };
  if (boats.some((item) => item.heroId === hero.id)) return { ok: false, reason: "Ce héros est déjà embarqué" };
  if (!boat || boat.heroId) return { ok: false, reason: "Bateau indisponible" };
  if (normalizeMapLevel(boat.mapLevel) !== SURFACE_LEVEL) return { ok: false, reason: "Bateau invalide" };
  if (mapData.tiles[boat.y]?.[boat.x]?.terrain !== "water") return { ok: false, reason: "Bateau invalide" };
  if (!areAdjacentOrSame({ x: hero.x, y: hero.y }, { x: boat.x, y: boat.y })) return { ok: false, reason: "Le héros doit être adjacent au bateau" };
  return { ok: true };
}

/**
 * Validates whether the embarked `hero` may disembark onto `destination`.
 * `isOccupied` reports whether another hero already stands on the destination.
 * `mapData` must be normalized and on the surface layer.
 */
export function canDisembark(params: {
  hero: BoatOpHero;
  boat: BoatOpBoat | undefined;
  destination: Position;
  mapData: GameMap;
  isOccupied: (position: Position) => boolean;
}): BoatCheck {
  const { hero, boat, destination, mapData, isOccupied } = params;
  if (normalizeMapLevel(hero.mapLevel) !== SURFACE_LEVEL) return { ok: false, reason: "Impossible de débarquer dans le souterrain" };
  if (!boat) return { ok: false, reason: "Ce héros n'est pas embarqué" };
  if (normalizeMapLevel(boat.mapLevel) !== SURFACE_LEVEL) return { ok: false, reason: "Bateau invalide" };
  const tile = mapData.tiles[destination.y]?.[destination.x];
  if (!tile || tile.terrain === "water" || !isTileTraversable(tile)) return { ok: false, reason: "Débarquement impossible" };
  if (!areAdjacentOrSame({ x: hero.x, y: hero.y }, destination)) return { ok: false, reason: "La rive est trop éloignée" };
  if (isOccupied(destination)) return { ok: false, reason: "Destination occupée" };
  return { ok: true };
}

/**
 * Validates whether `town` may build a boat and, if so, returns the launch tile.
 * `mapData` must be normalized (movement costs computed). `faction` is the town's
 * effective faction (townType, falling back to the owner faction).
 */
export function canBuildBoat(params: {
  town: BoatOpTown;
  faction: Faction;
  resources: Resources;
  mapData: GameMap;
  boats: BoatOpBoat[];
}): BuildBoatCheck {
  const { town, faction, resources, mapData, boats } = params;
  if (normalizeMapLevel(town.mapLevel) !== SURFACE_LEVEL) return { ok: false, reason: "Impossible de construire un bateau dans le souterrain" };
  if (!hasShipyardBuilding(faction, town.buildings ?? [])) return { ok: false, reason: "Construisez d'abord le Chantier naval" };
  const destination = findTownBoatLaunchTile(mapData, { x: town.x, y: town.y }, boats.map((boat) => ({ x: boat.x, y: boat.y })));
  if (!destination) return { ok: false, reason: "Aucune eau côtière libre pour construire un bateau" };
  if (!canAfford(resources, BOAT_COST)) return { ok: false, reason: "Ressources insuffisantes" };
  return { ok: true, destination };
}
