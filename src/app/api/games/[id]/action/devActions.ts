import { NextResponse } from "next/server";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { isTileTraversable, computeVisibleTiles, getPlayerVisionCenters, normalizeMapMovement } from "@/lib/game/engine";
import { normalizeMapLevel, withActiveMapLayer } from "@/lib/game/map-levels";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { SKILL_DEFINITIONS, type HeroSkills } from "@/lib/game/skills";
import type { GameMap, Position, Resources } from "@/lib/game/types";
import type { MinimalHero, MinimalPlayer, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;

type GameForDevActions = {
  combats?: Parameters<typeof isHeroInActiveCombat>[0];
  mapData: unknown;
  mapState: unknown;
  turnNumber?: unknown;
};

type HandleDevActionParams = {
  supabase: SupabaseAdminClient;
  game: GameForDevActions;
  gameId: string;
  gamePlayer: MinimalPlayer;
  action: ActionRecord;
  heroInCombatError: string;
  getActionPosition: (value: unknown) => Position | null;
  getLatestMapState: (supabase: SupabaseAdminClient, gameId: string, mapState: Record<string, unknown>) => Promise<Record<string, unknown>>;
  logPlayerAction: (supabase: SupabaseAdminClient, game: { turnNumber?: unknown }, gameId: string, gamePlayer: MinimalPlayer, action: ActionRecord) => Promise<void>;
  updatePlayerResources: (supabase: SupabaseAdminClient, playerId: string, resources: Resources) => Promise<void>;
};

export async function handleDevAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  action,
  heroInCombatError,
  getActionPosition,
  getLatestMapState,
  logPlayerAction,
  updatePlayerResources,
}: HandleDevActionParams) {
  if (action.type === "DEV_GRANT_RESOURCES") {
    const resources: Resources = {
      gold: gamePlayer.gold + 1000,
      wood: gamePlayer.wood + 1000,
      ore: gamePlayer.ore + 1000,
      mercury: gamePlayer.mercury + 1000,
      crystals: gamePlayer.crystals + 1000,
      gems: gamePlayer.gems + 1000,
      sulfur: gamePlayer.sulfur + 1000,
    };
    await updatePlayerResources(supabase, gamePlayer.id, resources);
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, resources });
  }

  if (action.type === "DEV_GRANT_HERO_XP") {
    const hero = findOwnedHero(gamePlayer, action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }

    const amount = 500;
    const experience = hero.experience + amount;
    await applyHeroExperienceGain(supabase, gameId, hero.id, experience);
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, heroId: hero.id, experience, amount });
  }

  if (action.type === "DEV_GRANT_HERO_SKILLS") {
    const hero = findOwnedHero(gamePlayer, action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }

    const skills = Object.fromEntries(SKILL_DEFINITIONS.map((skill) => [skill.id, "expert"])) as HeroSkills;
    const skillUpdate = await supabase.from("heroes").update({ skills }).eq("id", hero.id);
    if (skillUpdate.error) return NextResponse.json({ error: "Impossible d'ajouter les compétences." }, { status: 500 });

    const mapState = (game.mapState as Record<string, unknown>) ?? {};
    const latestMapState = await getLatestMapState(supabase, gameId, mapState);
    const pendingMap = (latestMapState.pendingSkillChoices as Record<string, Array<{ level: number; options: string[] }>> | undefined) ?? {};
    if (pendingMap[hero.id]) {
      const nextPending = { ...pendingMap };
      delete nextPending[hero.id];
      await supabase.from("games").update({
        map_state: { ...latestMapState, pendingSkillChoices: nextPending },
      }).eq("id", gameId);
    }

    await logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, heroId: hero.id, skillCount: SKILL_DEFINITIONS.length });
  }

  if (action.type === "DEV_TELEPORT_HERO") {
    const hero = findOwnedHero(gamePlayer, action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }

    const mapData = withActiveMapLayer(normalizeMapMovement(game.mapData as GameMap), normalizeMapLevel(hero.mapLevel));
    const destination = getActionPosition(action.position);
    if (!destination) return NextResponse.json({ error: "Destination invalide" }, { status: 400 });
    const tile = mapData.tiles[destination.y]?.[destination.x];
    if (!tile || !isTileTraversable(tile)) {
      return NextResponse.json({ error: "Destination infranchissable" }, { status: 400 });
    }

    const { error: heroUpdateError } = await supabase
      .from("heroes")
      .update({ x: destination.x, y: destination.y })
      .eq("id", hero.id);
    if (heroUpdateError) {
      return NextResponse.json({ error: `Erreur mise à jour héros: ${heroUpdateError.message}` }, { status: 500 });
    }

    const movedHeroes: MinimalHero[] = gamePlayer.heroes.map((item) =>
      item.id === hero.id ? { ...hero, x: destination.x, y: destination.y } : item
    );
    const newlyVisible = computeVisibleTiles(
      mapData,
      getPlayerVisionCenters({
        heroes: movedHeroes.map((item) => ({ position: { x: item.x, y: item.y } })),
        towns: gamePlayer.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
      }),
      5
    );
    const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
    for (const key of newlyVisible) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);

    await logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, destination });
  }

  return null;
}

function findOwnedHero(gamePlayer: MinimalPlayer, value: unknown) {
  return gamePlayer.heroes.find((item) => item.id === value);
}
