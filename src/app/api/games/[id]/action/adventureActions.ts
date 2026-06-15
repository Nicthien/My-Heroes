import { NextResponse } from "next/server";
import { getEffectiveHeroStatsFromValues } from "@/lib/game/artifacts";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { normalizeMapMovement } from "@/lib/game/engine";
import { normalizeMapLevel, withActiveMapLayer } from "@/lib/game/map-levels";
import { GRAIL_ARTIFACT_ID, normalizeArtifactBag } from "@/lib/game/artifacts";
import { getGrailLocation } from "@/lib/game/grail";
import { getHeroMana, getSpell, getSpellCost, heroKnowsSpell, type SpellId } from "@/lib/game/spells";
import { AdventureBuildingType, type GameMap, type Position, type Resources } from "@/lib/game/types";
import { WAR_MACHINE_COST, type WarMachineKey } from "@/lib/game/war-machines-shop";
import type { HeroStatKey, MapBuildingLocation, MinimalBoat, MinimalBuilding, MinimalHero, MinimalPlayer, MinimalTown, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;
type CombatLike = {
  status?: unknown;
  attackerHeroId?: unknown;
  defenderHeroId?: unknown;
  participants?: Array<{ heroId?: unknown }> | null;
};

type AdventureActionHelpers = {
  applyAdventureSpell: (params: {
    supabase: SupabaseAdminClient;
    gamePlayer: MinimalPlayer;
    players: Array<{ id: string; isAlive: boolean; turnOrder: number; resourceBuildings: MinimalBuilding[]; towns: MinimalTown[]; heroes?: MinimalHero[] }>;
    boats: MinimalBoat[];
    hero: MinimalHero;
    spellId: SpellId;
    target: unknown;
    mapData: GameMap;
    mapState: Record<string, unknown>;
    explored: Set<string>;
  }) => Promise<{ ok: true; interaction: unknown } | { ok: false; error: string }>;
  areAdjacentOrSame: (a: Position, b: Position) => boolean;
  findAdventureBuildingById: (mapData: GameMap, buildingId: string) => MapBuildingLocation | null;
  handleAdventureBuildingVisit: (params: {
    supabase: SupabaseAdminClient;
    gameId: string;
    gamePlayer: MinimalPlayer;
    hero: MinimalHero;
    turnNumber: number;
    mapData: GameMap;
    mapState: Record<string, unknown>;
    object: MapBuildingLocation["object"];
    position: Position;
    explored: Set<string>;
    choice?: HeroStatKey | "gold" | "experience";
  }) => Promise<unknown>;
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: ActionRecord,
  ) => Promise<void>;
  normalizeHeroStatChoice: (value: unknown) => HeroStatKey | "gold" | "experience" | undefined;
  updatePlayerResources: (
    supabase: SupabaseAdminClient,
    playerId: string,
    resources: Partial<Resources>,
  ) => Promise<void>;
};

type HandleAdventureActionParams = {
  supabase: SupabaseAdminClient;
  game: { turnNumber?: unknown; mapData?: unknown; mapState?: unknown; gameConfig?: unknown; combats?: CombatLike[] | null };
  gameId: string;
  gamePlayer: MinimalPlayer;
  players: Array<{ id: string; isAlive: boolean; turnOrder: number; resourceBuildings: MinimalBuilding[]; towns: MinimalTown[]; heroes?: MinimalHero[] }>;
  boats: MinimalBoat[];
  action: ActionRecord;
  heroInCombatError: string;
  helpers: AdventureActionHelpers;
};

export async function handleAdventureAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  players,
  boats,
  action,
  heroInCombatError,
  helpers,
}: HandleAdventureActionParams) {
  if (action.type === "VISIT_ADVENTURE_BUILDING") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }

    const mapData = withActiveMapLayer(normalizeMapMovement(game.mapData as GameMap), normalizeMapLevel(hero.mapLevel));
    const found = helpers.findAdventureBuildingById(mapData, String(action.buildingId ?? ""));
    if (!found) return NextResponse.json({ error: "Bâtiment d'aventure introuvable" }, { status: 404 });
    if (!helpers.areAdjacentOrSame({ x: hero.x, y: hero.y }, found.position)) {
      return NextResponse.json({ error: "Le héros doit être sur place pour visiter ce bâtiment" }, { status: 400 });
    }

    const mapState = (game.mapState as Record<string, unknown>) ?? {};
    const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
    const interaction = await helpers.handleAdventureBuildingVisit({
      supabase,
      gameId,
      gamePlayer,
      hero,
      turnNumber: Number(game.turnNumber ?? 1),
      mapData,
      mapState,
      object: found.object,
      position: found.position,
      explored,
      choice: helpers.normalizeHeroStatChoice(action.choice),
    });

    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, interaction });
  }

  if (action.type === "BUY_FACTORY_MACHINE") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }

    const mapData = withActiveMapLayer(normalizeMapMovement(game.mapData as GameMap), normalizeMapLevel(hero.mapLevel));
    const found = helpers.findAdventureBuildingById(mapData, String(action.buildingId ?? ""));
    if (!found || found.object.subtype !== AdventureBuildingType.WAR_MACHINE_FACTORY) {
      return NextResponse.json({ error: "Usine de machines de guerre introuvable" }, { status: 404 });
    }
    if (!helpers.areAdjacentOrSame({ x: hero.x, y: hero.y }, found.position)) {
      return NextResponse.json({ error: "Le héros doit être sur place pour acheter une machine" }, { status: 400 });
    }

    const machine = String(action.machine ?? "") as WarMachineKey;
    if (!(machine in WAR_MACHINE_COST)) {
      return NextResponse.json({ error: "Machine de guerre invalide" }, { status: 400 });
    }
    const cost = WAR_MACHINE_COST[machine];
    if (gamePlayer.gold < cost) return NextResponse.json({ error: "Or insuffisant" }, { status: 400 });

    const { data: heroRow } = await supabase.from("heroes").select("war_machines").eq("id", hero.id).maybeSingle();
    const warMachines = ((heroRow?.war_machines ?? {}) as Record<string, boolean>);
    if (warMachines[machine]) {
      return NextResponse.json({ error: "Ce héros possède déjà cette machine" }, { status: 400 });
    }

    await helpers.updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - cost });
    const update = await supabase.from("heroes").update({ war_machines: { ...warMachines, [machine]: true } }).eq("id", hero.id);
    if (update.error) {
      console.error("BUY_FACTORY_MACHINE: failed to persist war machines", update.error);
      return NextResponse.json({ error: "Impossible d'enregistrer la machine de guerre (DB)" }, { status: 500 });
    }
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true });
  }

  if (action.type === "DIG_GRAIL") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }
    if (hero.movement <= 0) {
      return NextResponse.json({ error: "Le héros doit disposer de points de mouvement pour creuser" }, { status: 400 });
    }
    const bag = normalizeArtifactBag(hero.artifacts);
    if (bag.inventory.includes(GRAIL_ARTIFACT_ID)) {
      return NextResponse.json({ error: "Ce héros porte déjà le Graal" }, { status: 400 });
    }

    const grail = getGrailLocation(game.gameConfig);
    const mapState = (game.mapState as Record<string, unknown>) ?? {};
    const grailFound = Boolean(mapState.grailFound);

    // Digging always burns the rest of the day's movement.
    await supabase.from("heroes").update({ movement: 0 }).eq("id", hero.id);

    const onSpot = Boolean(
      grail &&
      !grailFound &&
      hero.x === grail.x &&
      hero.y === grail.y &&
      normalizeMapLevel(hero.mapLevel) === normalizeMapLevel(grail.mapLevel),
    );

    if (onSpot) {
      await supabase.from("heroes").update({
        artifacts: { ...bag, inventory: [...bag.inventory, GRAIL_ARTIFACT_ID] },
      }).eq("id", hero.id);
      await supabase.from("games").update({ map_state: { ...mapState, grailFound: true } }).eq("id", gameId);
      await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
      return NextResponse.json({
        success: true,
        interaction: {
          type: "DIG_GRAIL",
          found: true,
          message: "Vous avez déterré le Graal ! Conduisez ce héros dans une ville alliée pour ériger la structure monumentale.",
        },
      });
    }

    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({
      success: true,
      interaction: {
        type: "DIG_GRAIL",
        found: false,
        message: grailFound
          ? "Le Graal a déjà été déterré ailleurs sur la carte."
          : "Vous creusez longuement... mais il n'y a rien à cet endroit.",
      },
    });
  }

  if (action.type === "CAST_ADVENTURE_SPELL") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }

    const spell = getSpell(String(action.spellId ?? ""));
    if (!spell || spell.context !== "adventure") return NextResponse.json({ error: "Sort d'aventure invalide" }, { status: 400 });
    // The infinite-mana dev cheat also grants every spell: skip the spell-book and
    // known-spell gates so any spell is castable on the selected hero.
    const hasDevInfiniteMana = action.devInfiniteManaHeroId === hero.id;
    if (!hasDevInfiniteMana && hero.hasSpellBook === false) return NextResponse.json({ error: "Ce héros n'a pas de livre de sorts" }, { status: 400 });
    if (!hasDevInfiniteMana && !heroKnowsSpell(hero, spell.id)) return NextResponse.json({ error: "Sort inconnu" }, { status: 400 });

    const effectiveStats = getEffectiveHeroStatsFromValues(hero);
    const mana = getHeroMana({ mana: hero.mana, knowledge: effectiveStats.knowledge, skills: hero.skills });
    const cost = getSpellCost(spell);
    if (!spell.implemented) return NextResponse.json({ error: "Sort non implemente" }, { status: 400 });
    if (!hasDevInfiniteMana && mana < cost) return NextResponse.json({ error: "Mana insuffisant" }, { status: 400 });

    const mapData = withActiveMapLayer(normalizeMapMovement(game.mapData as GameMap), normalizeMapLevel(hero.mapLevel));
    const mapState = (game.mapState as Record<string, unknown>) ?? {};
    const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
    const result = await helpers.applyAdventureSpell({
      supabase,
      gamePlayer,
      players,
      boats,
      hero,
      spellId: spell.id,
      target: action.target,
      mapData,
      mapState,
      explored,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const nextMana = hasDevInfiniteMana ? mana : mana - cost;
    if (!hasDevInfiniteMana) await supabase.from("heroes").update({ mana: nextMana }).eq("id", hero.id);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, mana: nextMana, interaction: result.interaction });
  }

  return null;
}
