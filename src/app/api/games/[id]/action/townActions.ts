import { NextResponse } from "next/server";
import {
  UNIT_RULES,
  canAfford,
  getFactionBuildingRule,
  getFactionBuildingRules,
  getGrowthForBuiltTownBuilding,
  remapRecruitsToFaction,
  subtractCost,
} from "@/lib/game/economy";
import { getDailyAdventureMovement, normalizeMapMovement } from "@/lib/game/engine";
import {
  CLASS_STARTING_STATS,
  HERO_RECRUIT_COST_GOLD,
  MAX_HEROES_PER_PLAYER,
  getHeroTemplate,
  getRecruitedHeroTemplateIds,
  pickTavernOffer,
  startingArmyForFaction,
  type TavernOffer,
} from "@/lib/game/heroes";
import {
  TOWN_CONVERSION_COST_GOLD,
  convertTownBuildingsToFaction,
  getTownCenterLevel,
  hasTownBuilding,
  isShipyardBuilding,
} from "@/lib/game/town-buildings";
import { GRAIL_ARTIFACT_ID, normalizeArtifactBag } from "@/lib/game/artifacts";
import { SPELLS } from "@/lib/game/spells";
import { BuildingType, Faction, type GameMap, type HeroClass, type Resources, type UnitType } from "@/lib/game/types";
import type { MinimalHero, MinimalPlayer, MinimalTown, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;

type TownActionHelpers = {
  addRecruitGrowth: (
    available: Record<string, number>,
    growth: Partial<Record<UnitType, number>>,
  ) => Partial<Record<UnitType, number>>;
  applyOwnTownVisitBonuses: (params: {
    supabase: SupabaseAdminClient;
    gameId: string;
    mapState: Record<string, unknown>;
    hero: MinimalHero;
    town: MinimalTown;
    playerFaction: Faction;
    turnNumber: number;
  }) => Promise<void>;
  getArtifactMerchantBuilding: (faction: Faction) => BuildingType | null;
  isMissingSpellSchemaError: (error: { message?: string; details?: string | null; code?: string }) => boolean;
  isTownCoastalForBoats: (mapData: GameMap, town: { x: number; y: number }) => boolean;
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown; mapState?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: ActionRecord,
  ) => Promise<void>;
  playerResources: (player: MinimalPlayer) => Resources;
  rollMageGuildSpells: (seed: string, count: number) => string[];
  rollMageGuildSpellsForLevel: (seed: string, count: number, level: number) => string[];
  rollTownArtifactOffer: (seed: string, count: number) => string[];
};

type HandleTownActionParams = {
  supabase: SupabaseAdminClient;
  game: { turnNumber?: unknown; mapData?: unknown; mapState?: unknown };
  gameId: string;
  gamePlayer: MinimalPlayer;
  action: ActionRecord;
  helpers: TownActionHelpers;
};

export async function handleTownAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  action,
  helpers,
}: HandleTownActionParams) {
  if (action.type === "BUILD") {
    const town = gamePlayer.towns.find((item) => item.id === action.townId);
    const building = action.building as BuildingType;
    const townFaction = ((town?.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction);
    const rule = getFactionBuildingRule(townFaction, building);
    if (!town || !rule) return NextResponse.json({ error: "Bâtiment invalide" }, { status: 400 });

    const buildings = (town.buildings ?? []) as string[];
    if (buildings.includes(building)) return NextResponse.json({ error: "Bâtiment déjà construit" }, { status: 400 });
    // One building per town per day. The UI hides the build buttons, but the
    // limit must be enforced server-side or a replayed/crafted request could build
    // unlimited buildings in a single turn.
    const currentTurn = Number(game.turnNumber ?? 1);
    if (town.lastBuiltTurn != null && Number(town.lastBuiltTurn) === currentTurn) {
      return NextResponse.json({ error: "Un seul bâtiment par ville et par jour" }, { status: 400 });
    }
    if (isShipyardBuilding(townFaction, building) && !helpers.isTownCoastalForBoats(normalizeMapMovement(game.mapData as GameMap), { x: town.x, y: town.y })) {
      return NextResponse.json({ error: "Le Chantier naval doit être construit dans une ville côtière" }, { status: 400 });
    }
    const missingRequirement = rule.requires?.find((requirement) => !hasTownBuilding(buildings, requirement));
    if (missingRequirement) return NextResponse.json({ error: "Prérequis manquant" }, { status: 400 });
    if (
      building === BuildingType.CAPITOL &&
      gamePlayer.towns.some((item) => item.id !== town.id && (item.buildings ?? []).includes(BuildingType.CAPITOL))
    ) {
      return NextResponse.json({ error: "Un seul Capitole est autorisé par joueur" }, { status: 400 });
    }

    // The Grail structure escapes the normal tree: it can only be erected when a
    // hero carrying the dug-up Grail artifact stands in this town, and only once
    // per map. The artifact is consumed on success (see below).
    let grailCarrier: MinimalHero | undefined;
    if (rule.grail) {
      const mapStateForGrail = (game.mapState as Record<string, unknown>) ?? {};
      if (mapStateForGrail.grailBuilt) {
        return NextResponse.json({ error: "Le Graal a déjà été érigé sur cette carte" }, { status: 400 });
      }
      grailCarrier = (gamePlayer.heroes ?? []).find(
        (hero) => hero.x === town.x && hero.y === town.y && normalizeArtifactBag(hero.artifacts).inventory.includes(GRAIL_ARTIFACT_ID),
      );
      if (!grailCarrier) {
        return NextResponse.json({ error: "Un héros porteur du Graal doit se trouver dans cette ville" }, { status: 400 });
      }
    }

    const resources = helpers.playerResources(gamePlayer);
    if (!canAfford(resources, rule.cost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });

    await supabase.from("game_players").update(subtractCost(resources, rule.cost)).eq("id", gamePlayer.id);
    const nextBuildings = [...buildings, building];
    const townUpdate: Record<string, unknown> = {
      buildings: nextBuildings,
      level: getTownCenterLevel(nextBuildings),
      last_built_turn: game.turnNumber,
    };
    const immediateGrowth = getGrowthForBuiltTownBuilding(townFaction, building);
    let nextRecruits = town.availableRecruits ?? {};
    let recruitsChanged = false;
    // Base and upgraded dwellings keep separate recruit pools that grow
    // independently: building the upgrade does NOT migrate or replace the base
    // pool — it just starts its own (upgraded) pool alongside it.
    if (Object.keys(immediateGrowth).length > 0) {
      nextRecruits = helpers.addRecruitGrowth(nextRecruits, immediateGrowth);
      recruitsChanged = true;
    }
    if (recruitsChanged) {
      townUpdate.available_recruits = nextRecruits;
    }
    if (building === BuildingType.TAVERN && (!town.tavernOffer || town.tavernOffer.length === 0)) {
      const tavernFaction = ((town.townType ?? gamePlayer.faction ?? "castle") as Faction);
      townUpdate.tavern_offer = pickTavernOffer(tavernFaction, getRecruitedHeroTemplateIds(gamePlayer.heroes ?? []));
    }

    let { error: townErr } = await supabase.from("towns").update(townUpdate).eq("id", town.id);
    if (townErr && "tavern_offer" in townUpdate) {
      delete townUpdate.tavern_offer;
      ({ error: townErr } = await supabase.from("towns").update(townUpdate).eq("id", town.id));
    }
    if (townErr) {
      console.error("towns.update failed:", townErr, { townId: town.id, update: townUpdate });
      return NextResponse.json({ error: `Erreur construction: ${townErr.message}` }, { status: 500 });
    }

    const mapStateForBuild = (game.mapState as Record<string, unknown>) ?? {};
    let mapStatePatched = false;
    const mapStateNext: Record<string, unknown> = { ...mapStateForBuild };

    const mageGuildLevelMap: Partial<Record<BuildingType, number>> = {
      [BuildingType.MAGE_GUILD]: 1,
      [BuildingType.MAGE_GUILD_2]: 2,
      [BuildingType.MAGE_GUILD_3]: 3,
      [BuildingType.MAGE_GUILD_4]: 4,
      [BuildingType.MAGE_GUILD_5]: 5,
    };
    const mageGuildLevel = mageGuildLevelMap[building];
    if (mageGuildLevel) {
      const slotsPerLevel: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };
      const hasLibrary = townFaction === Faction.TOWER && (town.buildings ?? []).includes(BuildingType.UNIQUE_2);
      const count = slotsPerLevel[mageGuildLevel] + (hasLibrary ? 1 : 0);
      const newSpells = helpers.rollMageGuildSpellsForLevel(`${gameId}:${town.id}:mageguild:${mageGuildLevel}`, count, mageGuildLevel);
      const townSpellLibraries = (mapStateForBuild.townSpellLibraries as Record<string, string[]> | undefined) ?? {};
      const existing = townSpellLibraries[town.id] ?? [];
      mapStateNext.townSpellLibraries = { ...townSpellLibraries, [town.id]: [...existing, ...newSpells.filter((spell) => !existing.includes(spell))] };
      mapStatePatched = true;
    } else if (townFaction === Faction.TOWER && building === BuildingType.UNIQUE_2) {
      const townSpellLibraries = (mapStateForBuild.townSpellLibraries as Record<string, string[]> | undefined) ?? {};
      const existing = townSpellLibraries[town.id];
      if (existing) {
        const extra = helpers.rollMageGuildSpells(`${gameId}:${town.id}:library`, 1).filter((spell) => !existing.includes(spell));
        mapStateNext.townSpellLibraries = { ...townSpellLibraries, [town.id]: [...existing, ...extra] };
        mapStatePatched = true;
      }
    }

    const artifactMerchantBuilding = helpers.getArtifactMerchantBuilding(townFaction);
    if (artifactMerchantBuilding && building === artifactMerchantBuilding) {
      const artifactOffer = helpers.rollTownArtifactOffer(`${gameId}:${town.id}:artmerchant`, 4);
      const townArtifactOffers = (mapStateForBuild.townArtifactOffers as Record<string, string[]> | undefined) ?? {};
      mapStateNext.townArtifactOffers = { ...townArtifactOffers, [town.id]: artifactOffer };
      mapStatePatched = true;
    }

    if (rule.grail && grailCarrier) {
      // Consume the carried Grail and lock the map to a single Grail structure.
      const bag = normalizeArtifactBag(grailCarrier.artifacts);
      const grailIndex = bag.inventory.indexOf(GRAIL_ARTIFACT_ID);
      const nextInventory = grailIndex >= 0 ? bag.inventory.filter((_, index) => index !== grailIndex) : bag.inventory;
      await supabase.from("heroes").update({ artifacts: { ...bag, inventory: nextInventory } }).eq("id", grailCarrier.id);
      mapStateNext.grailBuilt = true;
      mapStatePatched = true;

      // Conflux monumental effect (Aurora Borealis): every combat spell appears
      // in this town's Mage Guild.
      if (townFaction === Faction.CONFLUX) {
        const allSpells = SPELLS.filter((spell) => spell.context === "combat" && spell.implemented).map((spell) => spell.id);
        const townSpellLibraries = (mapStateNext.townSpellLibraries as Record<string, string[]> | undefined) ?? {};
        mapStateNext.townSpellLibraries = { ...townSpellLibraries, [town.id]: allSpells };
      }
    }

    if (mapStatePatched) {
      await supabase.from("games").update({ map_state: mapStateNext }).eq("id", gameId);
    }

    const heroesInTown = (gamePlayer.heroes ?? []).filter((hero) => hero.x === town.x && hero.y === town.y);
    if (heroesInTown.length > 0) {
      const updatedTown = { ...town, buildings: nextBuildings };
      for (const heroInTown of heroesInTown) {
        await helpers.applyOwnTownVisitBonuses({
          supabase,
          gameId,
          mapState: mapStateNext,
          hero: heroInTown,
          town: updatedTown,
          playerFaction: (gamePlayer.faction ?? Faction.CASTLE) as Faction,
          turnNumber: Number(game.turnNumber ?? 1),
        });
      }
    }

    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true });
  }

  if (action.type === "CONVERT_TOWN_FACTION") {
    const town = gamePlayer.towns.find((item) => item.id === action.townId);
    if (!town) return NextResponse.json({ error: "Château invalide" }, { status: 400 });
    if (town.isNeutral) return NextResponse.json({ error: "Ce château est neutre" }, { status: 400 });

    const playerFaction = (gamePlayer.faction ?? Faction.CASTLE) as Faction;
    const currentFaction = (town.townType ?? playerFaction) as Faction;
    if (currentFaction === playerFaction) {
      return NextResponse.json({ error: "Ce château est déjà de votre faction" }, { status: 400 });
    }

    // The Grail structure is a once-per-map, faction-unique building. Converting
    // would demolish it like any other unique, but the map stays flagged as
    // "Grail built", so it could never be rebuilt — block the conversion instead
    // of silently destroying it.
    const buildings = (town.buildings ?? []) as BuildingType[];
    const hasGrail = getFactionBuildingRules(currentFaction).some(
      (rule) => rule.grail && buildings.includes(rule.type),
    );
    if (hasGrail) {
      return NextResponse.json({ error: "Impossible de convertir un château abritant le Graal" }, { status: 400 });
    }

    const resources = helpers.playerResources(gamePlayer);
    if (!canAfford(resources, { gold: TOWN_CONVERSION_COST_GOLD })) {
      return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });
    }

    const nextBuildings = convertTownBuildingsToFaction(buildings, playerFaction);
    const nextRecruits = remapRecruitsToFaction(
      (town.availableRecruits ?? {}) as Partial<Record<UnitType, number>>,
      playerFaction,
    );

    await supabase
      .from("game_players")
      .update(subtractCost(resources, { gold: TOWN_CONVERSION_COST_GOLD }))
      .eq("id", gamePlayer.id);
    const { error: convertErr } = await supabase
      .from("towns")
      .update({
        town_type: playerFaction,
        buildings: nextBuildings,
        level: getTownCenterLevel(nextBuildings),
        available_recruits: nextRecruits,
      })
      .eq("id", town.id);
    if (convertErr) {
      console.error("towns.update (convert) failed:", convertErr, { townId: town.id });
      return NextResponse.json({ error: `Erreur conversion: ${convertErr.message}` }, { status: 500 });
    }

    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, interaction: { type: "CONVERT_TOWN_FACTION" } });
  }

  if (action.type === "RECRUIT_HERO") {
    const town = gamePlayer.towns.find((item) => item.id === action.townId);
    if (!town) return NextResponse.json({ error: "Ville invalide" }, { status: 400 });

    const buildings = (town.buildings ?? []) as string[];
    if (!buildings.includes(BuildingType.TAVERN)) {
      return NextResponse.json({ error: "Construisez d'abord la Taverne" }, { status: 400 });
    }

    const offer = (town.tavernOffer ?? []) as TavernOffer[];
    const returningHeroId = typeof action.heroId === "string" ? action.heroId : null;
    if (returningHeroId) {
      const returningHero = ((gamePlayer as { tavernHeroes?: Array<{ heroId?: string }> }).tavernHeroes ?? [])
        .find((hero) => hero.heroId === returningHeroId);
      if (!returningHero) return NextResponse.json({ error: "Héros indisponible" }, { status: 400 });
      if (gamePlayer.heroes.length >= MAX_HEROES_PER_PLAYER) {
        return NextResponse.json({ error: `Maximum ${MAX_HEROES_PER_PLAYER} héros par joueur` }, { status: 400 });
      }
      const resources = helpers.playerResources(gamePlayer);
      if (resources.gold < HERO_RECRUIT_COST_GOLD) {
        return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });
      }
      const { data: armies } = await supabase
        .from("armies")
        .select("unit_type")
        .eq("hero_id", returningHeroId);
      const dailyMovement = getDailyAdventureMovement(
        ((armies ?? []) as Array<{ unit_type: UnitType }>).map((army) => ({ unitType: army.unit_type }))
      );

      await supabase.from("game_players").update({ gold: resources.gold - HERO_RECRUIT_COST_GOLD }).eq("id", gamePlayer.id);
      await supabase.from("heroes").update({
        status: "ACTIVE",
        x: town.x,
        y: town.y,
        movement: dailyMovement,
        max_movement: dailyMovement,
        is_moving: false,
      }).eq("id", returningHeroId).eq("game_player_id", gamePlayer.id);

      await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

      return NextResponse.json({ success: true });
    }

    const picked = offer.find((entry) => entry.templateId === action.templateId);
    if (!picked) return NextResponse.json({ error: "Héros indisponible" }, { status: 400 });

    const templateId = String(action.templateId ?? "");
    const template = getHeroTemplate(templateId);
    if (!template) return NextResponse.json({ error: "Héros inconnu" }, { status: 400 });

    if (gamePlayer.heroes.length >= MAX_HEROES_PER_PLAYER) {
      return NextResponse.json({ error: `Maximum ${MAX_HEROES_PER_PLAYER} héros par joueur` }, { status: 400 });
    }

    const resources = helpers.playerResources(gamePlayer);
    if (resources.gold < HERO_RECRUIT_COST_GOLD) {
      return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });
    }

    const stats = CLASS_STARTING_STATS[template.class as HeroClass];
    const army = startingArmyForFaction(template.faction);
    const dailyMovement = getDailyAdventureMovement([{ unitType: army.unitType }]);

    await supabase.from("game_players").update({ gold: resources.gold - HERO_RECRUIT_COST_GOLD }).eq("id", gamePlayer.id);

    const heroInsert: Record<string, unknown> = {
      game_player_id: gamePlayer.id,
      name: template.name,
      hero_class: template.class,
      specialty: template.specialty,
      attack: stats.attack,
      defense: stats.defense,
      spell_power: stats.spellPower,
      knowledge: stats.knowledge,
      morale: stats.morale,
      luck: stats.luck,
      mana: stats.knowledge * 10,
      has_spell_book: true,
      known_spells: null,
      artifacts: { inventory: [], equipment: {} },
      x: town.x,
      y: town.y,
      movement: dailyMovement,
      max_movement: dailyMovement,
    };

    let { data: heroRow, error: heroError } = await supabase
      .from("heroes")
      .insert(heroInsert)
      .select("*")
      .single();
    if (heroError && helpers.isMissingSpellSchemaError(heroError)) {
      delete heroInsert.mana;
      delete heroInsert.has_spell_book;
      delete heroInsert.known_spells;
      delete heroInsert.morale;
      delete heroInsert.luck;
      delete heroInsert.artifacts;
      ({ data: heroRow, error: heroError } = await supabase
        .from("heroes")
        .insert(heroInsert)
        .select("*")
        .single());
    }
    if (heroError || !heroRow) {
      return NextResponse.json({ error: `Erreur création héros: ${heroError?.message ?? "inconnue"}` }, { status: 500 });
    }

    const unitRule = UNIT_RULES[army.unitType];
    if (unitRule) {
      await supabase.from("armies").insert({
        hero_id: (heroRow as { id: string }).id,
        unit_type: army.unitType,
        count: army.count,
        health: unitRule.health * army.count,
        max_health: unitRule.health,
        position: 0,
      });
    }

    const remaining = offer.filter((entry) => entry.templateId !== action.templateId);
    await supabase.from("towns").update({ tavern_offer: remaining }).eq("id", town.id);

    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true });
  }

  return null;
}
