import { NextResponse } from "next/server";
import { canAfford, subtractCost } from "@/lib/game/economy";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { computeVisibleTiles, isTileTraversable, normalizeMapMovement } from "@/lib/game/engine";
import { findTownBoatLaunchTile } from "@/lib/game/engine/town-coast";
import { hasShipyardBuilding } from "@/lib/game/town-buildings";
import { Faction, type GameMap, type Position, type Resources } from "@/lib/game/types";
import { normalizeMapLevel, SURFACE_LEVEL, withActiveMapLayer } from "@/lib/game/map-levels";
import type { MinimalBoat, MinimalHero, MinimalPlayer, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;

type HandleBoatActionParams = {
  supabase: SupabaseAdminClient;
  game: {
    combats?: Parameters<typeof isHeroInActiveCombat>[0];
    mapData: unknown;
    turnNumber?: unknown;
  };
  gameId: string;
  gamePlayer: MinimalPlayer;
  boats: MinimalBoat[];
  players: Array<{ heroes?: MinimalHero[] }>;
  action: ActionRecord;
  heroInCombatError: string;
  helpers: {
    areAdjacentOrSame: (a: Position, b: Position) => boolean;
    getActionPosition: (value: unknown) => Position | null;
    isOccupiedByAnyHero: (players: Array<{ heroes?: MinimalHero[] }>, movingHeroId: string, destination: Position) => boolean;
    logPlayerAction: (
      supabase: SupabaseAdminClient,
      game: { turnNumber?: unknown },
      gameId: string,
      gamePlayer: MinimalPlayer,
      action: ActionRecord,
    ) => Promise<void>;
    playerResources: (player: MinimalPlayer) => Resources;
  };
};

export async function handleBoatAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  boats,
  players,
  action,
  heroInCombatError,
  helpers,
}: HandleBoatActionParams) {
  if (action.type === "EMBARK_BOAT") {
    const hero = findHero(gamePlayer, action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (normalizeMapLevel(hero.mapLevel) !== SURFACE_LEVEL) return NextResponse.json({ error: "Impossible d'embarquer dans le souterrain" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    if (boats.some((boat) => boat.heroId === hero.id)) return NextResponse.json({ error: "Ce héros est déjà embarqué" }, { status: 400 });
    const boat = boats.find((item) => item.id === action.boatId);
    if (!boat || boat.heroId) return NextResponse.json({ error: "Bateau indisponible" }, { status: 400 });
    if (normalizeMapLevel(boat.mapLevel) !== SURFACE_LEVEL) return NextResponse.json({ error: "Bateau invalide" }, { status: 400 });
    const mapData = normalizeMapMovement(withActiveMapLayer(game.mapData as GameMap, SURFACE_LEVEL));
    const boatPosition = { x: boat.x, y: boat.y };
    const boatTile = mapData.tiles[boat.y]?.[boat.x];
    if (boatTile?.terrain !== "water") return NextResponse.json({ error: "Bateau invalide" }, { status: 400 });
    if (!helpers.areAdjacentOrSame({ x: hero.x, y: hero.y }, boatPosition)) return NextResponse.json({ error: "Le héros doit être adjacent au bateau" }, { status: 400 });
    await supabase.from("heroes").update({ x: boat.x, y: boat.y, movement: 0 }).eq("id", hero.id);
    await supabase.from("boats").update({ hero_id: hero.id, owner_player_id: gamePlayer.id }).eq("id", boat.id);
    const explored = new Set(gamePlayer.exploredTiles ?? []);
    for (const key of computeVisibleTiles(mapData, [boatPosition], 5)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, interaction: { type: "EMBARK_BOAT", destination: boatPosition, message: "Embarquement effectué." } });
  }

  if (action.type === "DISEMBARK_BOAT") {
    const hero = findHero(gamePlayer, action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (normalizeMapLevel(hero.mapLevel) !== SURFACE_LEVEL) return NextResponse.json({ error: "Impossible de débarquer dans le souterrain" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    const boat = boats.find((item) => item.heroId === hero.id);
    if (!boat) return NextResponse.json({ error: "Ce héros n'est pas embarqué" }, { status: 400 });
    if (normalizeMapLevel(boat.mapLevel) !== SURFACE_LEVEL) return NextResponse.json({ error: "Bateau invalide" }, { status: 400 });
    const mapData = normalizeMapMovement(withActiveMapLayer(game.mapData as GameMap, SURFACE_LEVEL));
    const destination = helpers.getActionPosition(action.position);
    if (!destination) return NextResponse.json({ error: "Destination invalide" }, { status: 400 });
    const tile = mapData.tiles[destination.y]?.[destination.x];
    if (!tile || tile.terrain === "water" || !isTileTraversable(tile)) return NextResponse.json({ error: "Débarquement impossible" }, { status: 400 });
    if (!helpers.areAdjacentOrSame({ x: hero.x, y: hero.y }, destination)) return NextResponse.json({ error: "La rive est trop éloignée" }, { status: 400 });
    if (helpers.isOccupiedByAnyHero(players, hero.id, destination)) return NextResponse.json({ error: "Destination occupée" }, { status: 400 });
    await supabase.from("heroes").update({ x: destination.x, y: destination.y, movement: 0 }).eq("id", hero.id);
    await supabase.from("boats").update({ hero_id: null, x: hero.x, y: hero.y, map_level: SURFACE_LEVEL }).eq("id", boat.id);
    const explored = new Set(gamePlayer.exploredTiles ?? []);
    for (const key of computeVisibleTiles(mapData, [destination], 5)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, interaction: { type: "DISEMBARK_BOAT", destination, message: "Débarquement effectué." } });
  }

  if (action.type === "BUILD_BOAT") {
    const town = gamePlayer.towns.find((item) => item.id === action.townId);
    if (!town) return NextResponse.json({ error: "Ville invalide" }, { status: 400 });
    if (normalizeMapLevel(town.mapLevel) !== SURFACE_LEVEL) {
      return NextResponse.json({ error: "Impossible de construire un bateau dans le souterrain" }, { status: 400 });
    }
    const buildings = town.buildings ?? [];
    const townFaction = (town.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction;
    if (!hasShipyardBuilding(townFaction, buildings)) return NextResponse.json({ error: "Construisez d'abord le Chantier naval" }, { status: 400 });
    const mapData = normalizeMapMovement(game.mapData as GameMap);
    const destination = findTownBoatLaunchTile(mapData, { x: town.x, y: town.y }, boats.map((boat) => ({ x: boat.x, y: boat.y })));
    if (!destination) return NextResponse.json({ error: "Aucune eau côtière libre pour construire un bateau" }, { status: 400 });
    const cost = { gold: 1000, wood: 10 };
    const resources = helpers.playerResources(gamePlayer);
    if (!canAfford(resources, cost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });
    await supabase.from("game_players").update(subtractCost(resources, cost)).eq("id", gamePlayer.id);
    const { error: boatError } = await supabase.from("boats").insert({
      game_id: gameId,
      owner_player_id: gamePlayer.id,
      hero_id: null,
      faction: townFaction,
      x: destination.x,
      y: destination.y,
      map_level: SURFACE_LEVEL,
    });
    if (boatError) return NextResponse.json({ error: `Erreur construction bateau: ${boatError.message}` }, { status: 500 });
    const explored = new Set(gamePlayer.exploredTiles ?? []);
    for (const key of computeVisibleTiles(mapData, [destination], 5)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, interaction: { type: "BUILD_BOAT", destination, message: "Bateau construit." } });
  }

  return null;
}

function findHero(gamePlayer: MinimalPlayer, value: unknown) {
  return gamePlayer.heroes.find((item) => item.id === value);
}
