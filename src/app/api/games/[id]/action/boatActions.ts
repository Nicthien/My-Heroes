import { NextResponse } from "next/server";
import { subtractCost } from "@/lib/game/economy";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { computeVisibleTiles, normalizeMapMovement } from "@/lib/game/engine";
import { BOAT_COST, canBuildBoat, canDisembark, canEmbark } from "@/lib/game/boats/boat-ops";
import { Faction, type GameMap, type Position, type Resources } from "@/lib/game/types";
import { SURFACE_LEVEL, withActiveMapLayer } from "@/lib/game/map-levels";
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
    if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    const boat = boats.find((item) => item.id === action.boatId);
    const mapData = normalizeMapMovement(withActiveMapLayer(game.mapData as GameMap, SURFACE_LEVEL));
    const check = canEmbark({ hero, boat, boats, mapData });
    if (!check.ok || !boat) return NextResponse.json({ error: check.ok ? "Bateau indisponible" : check.reason }, { status: 400 });
    const boatPosition = { x: boat.x, y: boat.y };
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
    if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    const boat = boats.find((item) => item.heroId === hero.id);
    const mapData = normalizeMapMovement(withActiveMapLayer(game.mapData as GameMap, SURFACE_LEVEL));
    const destination = helpers.getActionPosition(action.position);
    if (!destination) return NextResponse.json({ error: "Destination invalide" }, { status: 400 });
    const check = canDisembark({
      hero,
      boat,
      destination,
      mapData,
      isOccupied: (position) => helpers.isOccupiedByAnyHero(players, hero.id, position),
    });
    if (!check.ok || !boat) return NextResponse.json({ error: check.ok ? "Ce héros n'est pas embarqué" : check.reason }, { status: 400 });
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
    const townFaction = (town.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction;
    const mapData = normalizeMapMovement(game.mapData as GameMap);
    const resources = helpers.playerResources(gamePlayer);
    const check = canBuildBoat({ town, faction: townFaction, resources, mapData, boats });
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
    const destination = check.destination;
    await supabase.from("game_players").update(subtractCost(resources, BOAT_COST)).eq("id", gamePlayer.id);
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
