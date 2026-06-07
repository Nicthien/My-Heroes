import { randomUUID } from "crypto";
import { UNIT_RULES, subtractCost, tierForUnit } from "@/lib/game/economy";
import { createCampfireReward, addVisit, hasPlayerVisited, getAdventureBuildingLabel, isSingleMapRewardBuilding } from "@/lib/game/adventure-buildings";
import {
  createExternalDwellingState,
  getExternalDwellingLabel,
  isExternalDwellingType,
  normalizeExternalDwellingState,
  type ExternalDwellingStateMap,
} from "@/lib/game/external-dwellings";
import { addUnitsToStacks, sortedStacks } from "@/lib/game/army-stacks";
import { makeRng } from "@/lib/game/engine/rng";
import { getEffectiveHeroStatsFromValues } from "@/lib/game/artifacts";
import { AdventureBuildingType, GameMap, MapObject, Position, Resources } from "@/lib/game/types";
import { computeVisibleTiles, isTileTraversable } from "@/lib/game/engine";
import { getObeliskIds, OBELISK_REVEAL_THRESHOLD } from "@/lib/game/grail";
import { SPELLS, getHeroMana, type SpellId } from "@/lib/game/spells";
import { WAR_MACHINE_COST } from "@/lib/game/war-machines-shop";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { getAdventureWeekKey, getLatestMapState } from "./actionHelpers";
import type { HeroStatKey, MinimalHero, MinimalPlayer, MoveInteraction, SupabaseAdminClient } from "./types";

const ADVENTURE_SCHOOL_COST_GOLD = 1000;
const CARTOGRAPHER_COST_GOLD = 10000;
const LEARNING_STONE_EXPERIENCE = 1000;
const STABLES_MOVEMENT_BONUS = 400;
const MAGIC_SHRINE_MANA_RESTORE = 20;
const WATER_MILL_GOLD_REWARD = 1000;
const WATER_WHEEL_GOLD_REWARD = 500;
const OBELISK_REVEAL_RADIUS = 24;
const WARRIOR_TOMB_GOLD_REWARD = 700;
const WARRIOR_TOMB_EXPERIENCE_REWARD = 750;
const TREE_OF_KNOWLEDGE_COST_GOLD = 2000;
const TREE_OF_KNOWLEDGE_EXPERIENCE = 2000;
const SEER_HUT_EXPERIENCE = 1000;

/** Shared, route-owned helpers injected into the adventure building visit flow. */
export type AdventureVisitHelpers = {
  playerResources: (player: MinimalPlayer) => Resources;
  updatePlayerResources: (
    supabase: SupabaseAdminClient,
    playerId: string,
    resources: Partial<Resources>,
  ) => Promise<void>;
  addUnitsToHeroArmy: (
    supabase: SupabaseAdminClient,
    hero: MinimalHero,
    unitType: Parameters<typeof addUnitsToStacks>[1],
    count: number,
    maxHealth: number,
  ) => Promise<void>;
};

export async function runAdventureBuildingVisit({
  supabase,
  gameId,
  gamePlayer,
  hero,
  turnNumber,
  mapData,
  mapState,
  object,
  position,
  explored,
  choice,
  helpers,
}: {
  supabase: SupabaseAdminClient;
  gameId: string;
  gamePlayer: MinimalPlayer;
  hero: MinimalHero;
  turnNumber: number;
  mapData: GameMap;
  mapState: Record<string, unknown>;
  object: MapObject;
  position: Position;
  explored: Set<string>;
  choice?: HeroStatKey;
  helpers: AdventureVisitHelpers;
}): Promise<MoveInteraction> {
  const { playerResources, updatePlayerResources, addUnitsToHeroArmy } = helpers;
  const buildingType = object.subtype as AdventureBuildingType | undefined;
  const visitedAdventureBuildings = new Set<string>((mapState.visitedAdventureBuildings as string[]) ?? []);
  const playerAdventureVisits = (mapState.playerAdventureVisits as Record<string, string[]> | undefined) ?? {};
  const heroAdventureVisits = (mapState.heroAdventureVisits as Record<string, string[]> | undefined) ?? {};
  const signaledLighthouses = (mapState.signaledLighthouses as Record<string, string[]> | undefined) ?? {};
  const mysticalGardenVisits = (mapState.mysticalGardenVisits as Record<string, string> | undefined) ?? {};
  const weeklyAdventureVisits = (mapState.weeklyAdventureVisits as Record<string, string> | undefined) ?? {};

  if (!buildingType) {
    return { type: "ADVENTURE_BUILDING", buildingType: "unknown", destination: position, message: "Bâtiment d'aventure visité." };
  }

  if (
    (buildingType === AdventureBuildingType.OBSERVATORY || buildingType === AdventureBuildingType.LIGHTHOUSE) &&
    hasPlayerVisited(playerAdventureVisits, gamePlayer.id, object.id)
  ) {
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: `${getAdventureBuildingLabel(buildingType)} déjà visité.`,
      alreadyVisited: true,
    };
  }

  if (isHeroVisitBuilding(buildingType) && hasHeroVisited(heroAdventureVisits, hero.id, object.id)) {
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: `${getAdventureBuildingLabel(buildingType)} déjà visité par ce héros.`,
      alreadyVisited: true,
    };
  }

  if (isSingleMapRewardBuilding(buildingType) && visitedAdventureBuildings.has(object.id)) {
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: `${getAdventureBuildingLabel(buildingType)} déjà fouillé.`,
      alreadyVisited: true,
    };
  }

  if (isExternalDwellingType(buildingType)) {
    const externalDwellings = ((mapState.externalDwellings as ExternalDwellingStateMap | undefined) ?? {});
    const current = normalizeExternalDwellingState(object, externalDwellings[object.id]) ?? createExternalDwellingState(object);
    if (!current) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Cette demeure est vide." };
    }

    const unitRule = UNIT_RULES[current.unitType];
    const recruitCost = tierForUnit(current.unitType)?.tier === 0 ? {} : unitRule.cost;
    const resources = playerResources(gamePlayer);
    const maxByResources = getAffordableCount(resources, recruitCost, current.available);
    const capacity = addUnitsToStacks(sortedStacks(hero.armies), current.unitType, maxByResources, unitRule.health, () => randomUUID());
    const recruitCount = capacity.added;
    const nextState = {
      ...current,
      ownerId: gamePlayer.id,
      available: Math.max(0, current.available - recruitCount),
    };

    if (recruitCount > 0) {
      const totalCost = Object.fromEntries(
        Object.entries(recruitCost).map(([key, value]) => [key, (value ?? 0) * recruitCount])
      );
      await updatePlayerResources(supabase, gamePlayer.id, subtractCost(resources, totalCost));
      await addUnitsToHeroArmy(supabase, hero, current.unitType, recruitCount, unitRule.health);
    }

    await supabase.from("games").update({
      map_state: {
        ...mapState,
        externalDwellings: {
          ...externalDwellings,
          [object.id]: nextState,
        },
      },
    }).eq("id", gameId);

    const label = getExternalDwellingLabel(current.unitType);
    const message = recruitCount > 0
      ? `${label} capturée : ${recruitCount} ${unitRule.label} recruté(e)s.`
      : maxByResources > 0 && capacity.added <= 0
      ? `${label} capturée, mais l'armée du héros est pleine.`
      : `${label} capturée. Recrues disponibles : ${nextState.available}.`;

    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      recruited: recruitCount > 0 ? { unitType: current.unitType, count: recruitCount } : undefined,
      message,
    };
  }

  if (buildingType === AdventureBuildingType.CAMPFIRE) {
    const rng = makeRng(`${gameId}:${object.id}:${gamePlayer.id}`);
    const reward = createCampfireReward(rng);
    const resources = playerResources(gamePlayer);
    const resourceUpdate: Partial<Resources> = { gold: resources.gold + reward.gold };

    for (const [resource, amount] of Object.entries(reward.resources)) {
      const key = resource as keyof Resources;
      resourceUpdate[key] = (resources[key] ?? 0) + (amount ?? 0);
    }

    visitedAdventureBuildings.add(object.id);
    await updatePlayerResources(supabase, gamePlayer.id, resourceUpdate);
    const { error: mapStateUpdateError } = await supabase.from("games").update({
      map_state: {
        ...mapState,
        visitedAdventureBuildings: Array.from(visitedAdventureBuildings),
      },
    }).eq("id", gameId);
    if (mapStateUpdateError) throw mapStateUpdateError;

    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: {
        gold: reward.gold,
        resources: reward.resources as Record<string, number>,
      },
      message: "Feu de camp fouillé.",
    };
  }

  if (buildingType === AdventureBuildingType.OBSERVATORY) {
    const revealed = computeVisibleTiles(mapData, [position], 20);
    for (const key of revealed) explored.add(key);
    await supabase.from("game_players").update({
      explored_tiles: Array.from(explored),
    }).eq("id", gamePlayer.id);
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        playerAdventureVisits: addVisit(playerAdventureVisits, gamePlayer.id, object.id),
      },
    }).eq("id", gameId);

    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: "Observatoire visite : terrain revele.",
    };
  }

  if (buildingType === AdventureBuildingType.LIGHTHOUSE) {
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        playerAdventureVisits: addVisit(playerAdventureVisits, gamePlayer.id, object.id),
        signaledLighthouses: addVisit(signaledLighthouses, gamePlayer.id, object.id),
      },
    }).eq("id", gameId);

    const lighthouseCount = new Set([...(signaledLighthouses[gamePlayer.id] ?? []), object.id]).size;
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: `Phare signale : +${lighthouseCount * 500} mouvement naval potentiel.`,
    };
  }

  if (buildingType === AdventureBuildingType.STARGATE) {
    const target = findStargateDestination(mapData, object.targetId);
    if (!target) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Cette Stargate ne repond pas." };
    }

    const landing = findTeleportLanding(mapData, target);
    if (!landing) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "La sortie de la Stargate est bloquée." };
    }

    await supabase.from("heroes").update({ x: landing.x, y: landing.y }).eq("id", hero.id);
    const visibleAfterTeleport = computeVisibleTiles(mapData, [landing], 5);
    for (const key of visibleAfterTeleport) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);

    return {
      type: "TELEPORT",
      buildingType,
      from: position,
      to: landing,
      destination: landing,
      message: "Stargate activee : teleportation effectuee.",
    };
  }

  if (buildingType === AdventureBuildingType.ARENA) {
    if (!choice || !["attack", "defense"].includes(choice)) {
      return {
        type: "ADVENTURE_BUILDING",
        buildingType,
        destination: position,
        buildingId: object.id,
        message: "Arène : choisissez l'entraînement du héros.",
        choices: [
          { value: "attack", label: "+2 Attaque" },
          { value: "defense", label: "+2 Défense" },
        ],
      };
    }
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, choice, 2);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: choice === "attack" ? "Arène visitée : +2 Attaque." : "Arène visitée : +2 Défense.",
    };
  }

  if (buildingType === AdventureBuildingType.SCHOOL_OF_WAR) {
    if (!choice || !["attack", "defense"].includes(choice)) {
      return {
        type: "ADVENTURE_BUILDING",
        buildingType,
        destination: position,
        buildingId: object.id,
        message: "École de guerre : choisissez l'entraînement pour 1000 Or.",
        choices: [
          { value: "attack", label: "+1 Attaque" },
          { value: "defense", label: "+1 Défense" },
        ],
      };
    }
    if (gamePlayer.gold < ADVENTURE_SCHOOL_COST_GOLD) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Il faut 1000 Or pour suivre cet entraînement." };
    }
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - ADVENTURE_SCHOOL_COST_GOLD });
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, choice, 1);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: choice === "attack" ? "École de guerre : +1 Attaque." : "École de guerre : +1 Défense.",
    };
  }

  if (buildingType === AdventureBuildingType.SCHOOL_OF_MAGIC) {
    if (!choice || !["spellPower", "knowledge"].includes(choice)) {
      return {
        type: "ADVENTURE_BUILDING",
        buildingType,
        destination: position,
        buildingId: object.id,
        message: "École de magie : choisissez l'étude pour 1000 Or.",
        choices: [
          { value: "spellPower", label: "+1 Pouvoir" },
          { value: "knowledge", label: "+1 Savoir" },
        ],
      };
    }
    if (gamePlayer.gold < ADVENTURE_SCHOOL_COST_GOLD) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Il faut 1000 Or pour suivre cette étude." };
    }
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - ADVENTURE_SCHOOL_COST_GOLD });
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, choice, 1);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: choice === "spellPower" ? "École de magie : +1 Pouvoir." : "École de magie : +1 Savoir.",
    };
  }

  if (buildingType === AdventureBuildingType.MERCENARY_CAMP) {
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, "attack", 1);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Camp de mercenaires visite : +1 Attaque." };
  }

  if (buildingType === AdventureBuildingType.MARLETTO_TOWER) {
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, "defense", 1);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Tour de Marletto visitée : +1 Défense." };
  }

  if (buildingType === AdventureBuildingType.STAR_AXIS) {
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, "spellPower", 1);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Axe étoilé visite : +1 Pouvoir." };
  }

  if (buildingType === AdventureBuildingType.GARDEN_OF_REVELATION) {
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, "knowledge", 1);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Jardin de révélation visite : +1 Savoir." };
  }

  if (buildingType === AdventureBuildingType.LEARNING_STONE) {
    await applyHeroExperienceGain(supabase, gameId, hero.id, hero.experience + LEARNING_STONE_EXPERIENCE);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Pierre de savoir visitée : +1000 XP." };
  }

  if (buildingType === AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT) {
    if ((hero.level ?? 1) < 10) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "La bibliothèque exige un héros de niveau 10." };
    }
    await supabase.from("heroes").update({
      attack: (hero.attack ?? 0) + 2,
      defense: (hero.defense ?? 0) + 2,
      spell_power: (hero.spellPower ?? 0) + 2,
      knowledge: (hero.knowledge ?? 0) + 2,
    }).eq("id", hero.id);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Bibliothèque d'illumination : +2 à toutes les caractéristiques." };
  }

  if (buildingType === AdventureBuildingType.CARTOGRAPHER) {
    if (gamePlayer.gold < CARTOGRAPHER_COST_GOLD) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Il faut 10000 Or pour acheter ces cartes." };
    }
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - CARTOGRAPHER_COST_GOLD });
    await supabase.from("game_players").update({ explored_tiles: getAllMapTileKeys(mapData) }).eq("id", gamePlayer.id);
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        playerAdventureVisits: addVisit(playerAdventureVisits, gamePlayer.id, object.id),
      },
    }).eq("id", gameId);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Cartographe consulte : carte revelee." };
  }

  if (buildingType === AdventureBuildingType.REDWOOD_OBSERVATORY) {
    const revealed = computeVisibleTiles(mapData, [position], 28);
    for (const key of revealed) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        playerAdventureVisits: addVisit(playerAdventureVisits, gamePlayer.id, object.id),
      },
    }).eq("id", gameId);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Observatoire sylvestre visite : vaste zone revelee." };
  }

  if (buildingType === AdventureBuildingType.MYSTICAL_GARDEN) {
    const weekKey = `${object.id}:${gamePlayer.id}`;
    const currentWeek = getAdventureWeekKey(turnNumber);
    if (mysticalGardenVisits[weekKey] === currentWeek) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Le jardin mystique a déjà fleuri cette semaine.", alreadyVisited: true };
    }
    const rewardGems = makeRng(`${gameId}:${object.id}:${gamePlayer.id}:${currentWeek}`)() > 0.55;
    const resourceUpdate: Partial<Resources> = rewardGems
      ? { gems: gamePlayer.gems + 5 }
      : { gold: gamePlayer.gold + 1000 };
    await updatePlayerResources(supabase, gamePlayer.id, resourceUpdate);
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        mysticalGardenVisits: {
          ...mysticalGardenVisits,
          [weekKey]: currentWeek,
        },
      },
    }).eq("id", gameId);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: rewardGems ? { resources: { gems: 5 } } : { gold: 1000 },
      message: rewardGems ? "Jardin mystique : +5 Gemmes." : "Jardin mystique : +1000 Or.",
    };
  }

  if (buildingType === AdventureBuildingType.STABLES) {
    const weekKey = `${object.id}:${hero.id}`;
    const currentWeek = getAdventureWeekKey(turnNumber);
    if (weeklyAdventureVisits[weekKey] === currentWeek) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Les écuries ont déjà équipé ce héros cette semaine.", alreadyVisited: true };
    }
    await supabase.from("heroes").update({ movement: hero.movement + STABLES_MOVEMENT_BONUS }).eq("id", hero.id);
    await updateWeeklyAdventureVisit(supabase, gameId, mapState, weeklyAdventureVisits, weekKey, currentWeek);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Ecuries visitees : +400 déplacement cette semaine." };
  }

  if (buildingType === AdventureBuildingType.TEMPLE) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, { morale: Number(hero.morale ?? 0) + 1 });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Temple visite : +1 Moral." };
  }

  if (buildingType === AdventureBuildingType.FOUNTAIN_OF_FORTUNE) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, { luck: Number(hero.luck ?? 0) + 1 });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Fontaine de fortune visitée : +1 Chance." };
  }

  if (buildingType === AdventureBuildingType.IDOL_OF_FORTUNE) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, {
      morale: Number(hero.morale ?? 0) + 1,
      luck: Number(hero.luck ?? 0) + 1,
    });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Idole de fortune visitée : +1 Moral, +1 Chance." };
  }

  if (buildingType === AdventureBuildingType.MAGIC_WELL) {
    const visitKey = `${object.id}:${hero.id}`;
    const currentDay = `day-${turnNumber}`;
    if (weeklyAdventureVisits[visitKey] === currentDay) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Le puits magique est déjà épuisé aujourd'hui.", alreadyVisited: true };
    }
    const effectiveStats = getEffectiveHeroStatsFromValues(hero);
    const maxMana = getHeroMana({ mana: null, knowledge: effectiveStats.knowledge });
    await supabase.from("heroes").update({ mana: maxMana }).eq("id", hero.id);
    await updateWeeklyAdventureVisit(supabase, gameId, mapState, weeklyAdventureVisits, visitKey, currentDay);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Puits magique visite : mana restauree." };
  }

  if (buildingType === AdventureBuildingType.MAGIC_SHRINE) {
    const effectiveStats = getEffectiveHeroStatsFromValues(hero);
    const maxMana = getHeroMana({ mana: null, knowledge: effectiveStats.knowledge });
    const currentMana = getHeroMana({ mana: hero.mana, knowledge: effectiveStats.knowledge });
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, {
      mana: Math.min(maxMana, currentMana + MAGIC_SHRINE_MANA_RESTORE),
    });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Sanctuaire magique visite : +20 mana." };
  }

  if (buildingType === AdventureBuildingType.WATER_MILL || buildingType === AdventureBuildingType.WATER_WHEEL) {
    const weekKey = `${object.id}:${gamePlayer.id}`;
    const currentWeek = getAdventureWeekKey(turnNumber);
    if (weeklyAdventureVisits[weekKey] === currentWeek) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Cette roue à eau a déjà produit cette semaine.", alreadyVisited: true };
    }
    const reward = buildingType === AdventureBuildingType.WATER_MILL ? WATER_MILL_GOLD_REWARD : WATER_WHEEL_GOLD_REWARD;
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold + reward });
    await updateWeeklyAdventureVisit(supabase, gameId, mapState, weeklyAdventureVisits, weekKey, currentWeek);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: { gold: reward },
      message: buildingType === AdventureBuildingType.WATER_MILL ? "Moulin à eau : +1000 Or." : "Roue à eau : +500 Or.",
    };
  }

  if (buildingType === AdventureBuildingType.ABANDONED_WAGON) {
    const rewardGold = makeRng(`${gameId}:${object.id}:wagon`)() > 0.5;
    visitedAdventureBuildings.add(object.id);
    if (rewardGold) {
      await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold + 500 });
    } else {
      await updatePlayerResources(supabase, gamePlayer.id, { wood: gamePlayer.wood + 5, ore: gamePlayer.ore + 5 });
    }
    await updateVisitedAdventureBuildings(supabase, gameId, mapState, visitedAdventureBuildings);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: rewardGold ? { gold: 500 } : { resources: { wood: 5, ore: 5 } },
      message: rewardGold ? "Chariot abandonne fouillé : +500 Or." : "Chariot abandonne fouillé : +5 Bois, +5 Minerai.",
    };
  }

  if (buildingType === AdventureBuildingType.CRATE) {
    const resources = playerResources(gamePlayer);
    const rng = makeRng(`${gameId}:${object.id}:crate`);
    const rewardGold = rng() > 0.45;
    visitedAdventureBuildings.add(object.id);
    let resourceReward: Partial<Record<keyof Resources, number>> | undefined;
    if (rewardGold) {
      await updatePlayerResources(supabase, gamePlayer.id, { gold: resources.gold + 300 });
    } else {
      const resource: keyof Resources = rng() > 0.5 ? "wood" : "ore";
      resourceReward = { [resource]: 6 };
      await updatePlayerResources(supabase, gamePlayer.id, { [resource]: Number(resources[resource] ?? 0) + 6 });
    }
    await updateVisitedAdventureBuildings(supabase, gameId, mapState, visitedAdventureBuildings);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: rewardGold ? { gold: 300 } : { resources: resourceReward },
      message: rewardGold ? "Caisse ouverte : +300 Or." : "Caisse ouverte : ressources trouvees.",
    };
  }

  if (buildingType === AdventureBuildingType.SKELETON) {
    const rewardGems = makeRng(`${gameId}:${object.id}:skeleton`)() > 0.65;
    visitedAdventureBuildings.add(object.id);
    if (rewardGems) {
      await updatePlayerResources(supabase, gamePlayer.id, { gems: gamePlayer.gems + 2 });
    } else {
      await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold + 300 });
    }
    await updateVisitedAdventureBuildings(supabase, gameId, mapState, visitedAdventureBuildings);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: rewardGems ? { resources: { gems: 2 } } : { gold: 300 },
      message: rewardGems ? "Squelette fouillé : +2 Gemmes." : "Squelette fouillé : +300 Or.",
    };
  }

  if (buildingType === AdventureBuildingType.OBELISK) {
    const revealed = computeVisibleTiles(mapData, [position], OBELISK_REVEAL_RADIUS);
    for (const key of revealed) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    const nextPlayerVisits = addVisit(playerAdventureVisits, gamePlayer.id, object.id);
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        playerAdventureVisits: nextPlayerVisits,
      },
    }).eq("id", gameId);

    // Obelisks double as the Grail puzzle map: report progress toward revealing
    // the buried Grail's exact tile (reached at OBELISK_REVEAL_THRESHOLD).
    const obeliskIds = new Set(getObeliskIds(mapData));
    const total = obeliskIds.size;
    const visitedCount = (nextPlayerVisits[gamePlayer.id] ?? []).filter((id: string) => obeliskIds.has(id)).length;
    const required = Math.max(1, Math.ceil(total * OBELISK_REVEAL_THRESHOLD));
    const message = total > 0 && visitedCount >= required
      ? `Obélisque visité : l'emplacement du Graal est révélé ! (${visitedCount}/${total})`
      : `Obélisque visité : la carte-énigme du Graal se précise (${visitedCount}/${total}).`;
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message };
  }

  if (buildingType === AdventureBuildingType.WARRIOR_TOMB) {
    visitedAdventureBuildings.add(object.id);
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold + WARRIOR_TOMB_GOLD_REWARD });
    await supabase.from("heroes").update({ morale: Number(hero.morale ?? 0) - 1 }).eq("id", hero.id);
    await applyHeroExperienceGain(supabase, gameId, hero.id, hero.experience + WARRIOR_TOMB_EXPERIENCE_REWARD);
    await updateVisitedAdventureBuildings(supabase, gameId, mapState, visitedAdventureBuildings);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: { gold: WARRIOR_TOMB_GOLD_REWARD },
      message: "Tombe du guerrier profanee : +700 Or, +750 XP, -1 Moral.",
    };
  }

  if (buildingType === AdventureBuildingType.CURSED_ALTAR) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, {
      spellPower: Number(hero.spellPower ?? 0) + 1,
      luck: Number(hero.luck ?? 0) - 1,
    });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Autel maudit visite : +1 Pouvoir, -1 Chance." };
  }

  if (
    buildingType === AdventureBuildingType.SPELL_SHRINE_1 ||
    buildingType === AdventureBuildingType.SPELL_SHRINE_2 ||
    buildingType === AdventureBuildingType.SPELL_SHRINE_3
  ) {
    const level = buildingType === AdventureBuildingType.SPELL_SHRINE_1 ? 1 : buildingType === AdventureBuildingType.SPELL_SHRINE_2 ? 2 : 3;
    const spell = pickShrineSpell(level, `${gameId}:${object.id}:${hero.id}`);
    const knownSpellIds = addKnownSpell(hero.knownSpellIds, spell.id);
    await supabase.from("heroes").update({
      has_spell_book: true,
      known_spells: knownSpellIds,
    }).eq("id", hero.id);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: `${getAdventureBuildingLabel(buildingType)} visité : ${spell.label} appris.` };
  }

  if (buildingType === AdventureBuildingType.TREE_OF_KNOWLEDGE) {
    if (gamePlayer.gold < TREE_OF_KNOWLEDGE_COST_GOLD) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Il faut 2000 Or pour recevoir l'enseignement de l'arbre." };
    }
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - TREE_OF_KNOWLEDGE_COST_GOLD });
    await applyHeroExperienceGain(supabase, gameId, hero.id, hero.experience + TREE_OF_KNOWLEDGE_EXPERIENCE);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Arbre de connaissance : +2000 XP contre 2000 Or." };
  }

  if (buildingType === AdventureBuildingType.SEER_HUT) {
    const effectiveStats = getEffectiveHeroStatsFromValues(hero);
    const maxMana = getHeroMana({ mana: null, knowledge: effectiveStats.knowledge });
    const currentMana = getHeroMana({ mana: hero.mana, knowledge: effectiveStats.knowledge });
    await supabase.from("heroes").update({ mana: Math.min(maxMana, currentMana + 10) }).eq("id", hero.id);
    await applyHeroExperienceGain(supabase, gameId, hero.id, hero.experience + SEER_HUT_EXPERIENCE);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Hutte d'érudit visitée : +1000 XP, +10 mana." };
  }

  if (buildingType === AdventureBuildingType.MERMAID) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, { luck: Number(hero.luck ?? 0) + 1 });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Sirene rencontree : +1 Chance." };
  }

  if (buildingType === AdventureBuildingType.BUOY) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, { morale: Number(hero.morale ?? 0) + 1 });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Bouée visitée : +1 Moral." };
  }

  if (buildingType === AdventureBuildingType.FLOTSAM) {
    visitedAdventureBuildings.add(object.id);
    await updatePlayerResources(supabase, gamePlayer.id, { wood: gamePlayer.wood + 5, gold: gamePlayer.gold + 250 });
    await updateVisitedAdventureBuildings(supabase, gameId, mapState, visitedAdventureBuildings);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, reward: { gold: 250, resources: { wood: 5 } }, message: "Debris flottants fouilles : +250 Or, +5 Bois." };
  }

  if (buildingType === AdventureBuildingType.SEA_CHEST) {
    const rewardGems = makeRng(`${gameId}:${object.id}:sea_chest`)() > 0.6;
    visitedAdventureBuildings.add(object.id);
    if (rewardGems) {
      await updatePlayerResources(supabase, gamePlayer.id, { gems: gamePlayer.gems + 3 });
    } else {
      await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold + 600 });
    }
    await updateVisitedAdventureBuildings(supabase, gameId, mapState, visitedAdventureBuildings);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: rewardGems ? { resources: { gems: 3 } } : { gold: 600 },
      message: rewardGems ? "Coffre marin ouvert : +3 Gemmes." : "Coffre marin ouvert : +600 Or.",
    };
  }

  if (buildingType === AdventureBuildingType.WAR_MACHINE_FACTORY) {
    // Like an external dwelling, the factory equips the visiting hero with the war
    // machines they still lack, buying as many as the player can afford (cheapest
    // first). It is repeatable, so a hero can return to replace destroyed machines.
    const machineOffers: Array<{ key: "ballista" | "firstAid" | "ammoCart"; label: string; cost: number }> = [
      { key: "firstAid", label: "Tente de premiers secours", cost: WAR_MACHINE_COST.firstAid },
      { key: "ammoCart", label: "Charrette de munitions", cost: WAR_MACHINE_COST.ammoCart },
      { key: "ballista", label: "Baliste", cost: WAR_MACHINE_COST.ballista },
    ];
    const { data: heroRow } = await supabase.from("heroes").select("war_machines").eq("id", hero.id).maybeSingle();
    const owned = (heroRow?.war_machines ?? {}) as Record<string, boolean>;
    let remainingGold = playerResources(gamePlayer).gold;
    const nextMachines = { ...owned };
    const bought: string[] = [];
    for (const offer of machineOffers) {
      if (owned[offer.key] || remainingGold < offer.cost) continue;
      remainingGold -= offer.cost;
      nextMachines[offer.key] = true;
      bought.push(offer.label);
    }
    if (bought.length > 0) {
      await updatePlayerResources(supabase, gamePlayer.id, { gold: remainingGold });
      await supabase.from("heroes").update({ war_machines: nextMachines }).eq("id", hero.id);
    }
    const alreadyHasAll = machineOffers.every((offer) => owned[offer.key]);
    const message = bought.length > 0
      ? `Usine de machines de guerre : ${bought.join(", ")} équipée(s).`
      : alreadyHasAll
        ? "Usine de machines de guerre : ce héros possède déjà toutes les machines."
        : "Usine de machines de guerre : or insuffisant pour acheter une machine.";
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message };
  }

  return {
    type: "ADVENTURE_BUILDING",
    buildingType,
    destination: position,
    message: `${getAdventureBuildingLabel(buildingType)} visité.`,
  };
}

function isHeroVisitBuilding(type: AdventureBuildingType) {
  return [
    AdventureBuildingType.ARENA,
    AdventureBuildingType.MERCENARY_CAMP,
    AdventureBuildingType.MARLETTO_TOWER,
    AdventureBuildingType.STAR_AXIS,
    AdventureBuildingType.GARDEN_OF_REVELATION,
    AdventureBuildingType.LEARNING_STONE,
    AdventureBuildingType.SCHOOL_OF_WAR,
    AdventureBuildingType.SCHOOL_OF_MAGIC,
    AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT,
    AdventureBuildingType.TEMPLE,
    AdventureBuildingType.FOUNTAIN_OF_FORTUNE,
    AdventureBuildingType.IDOL_OF_FORTUNE,
    AdventureBuildingType.MAGIC_SHRINE,
    AdventureBuildingType.CURSED_ALTAR,
    AdventureBuildingType.SPELL_SHRINE_1,
    AdventureBuildingType.SPELL_SHRINE_2,
    AdventureBuildingType.SPELL_SHRINE_3,
    AdventureBuildingType.TREE_OF_KNOWLEDGE,
    AdventureBuildingType.SEER_HUT,
    AdventureBuildingType.MERMAID,
    AdventureBuildingType.BUOY,
  ].includes(type);
}

function hasHeroVisited(visits: Record<string, string[]> | undefined, heroId: string, buildingId: string) {
  return visits?.[heroId]?.includes(buildingId) ?? false;
}

async function applyHeroStatVisit(
  supabase: SupabaseAdminClient,
  gameId: string,
  mapState: Record<string, unknown>,
  hero: MinimalHero,
  visits: Record<string, string[]>,
  buildingId: string,
  stat: HeroStatKey,
  amount: number,
) {
  await supabase.from("heroes").update({
    [heroStatColumn(stat)]: Number(heroStatValue(hero, stat)) + amount,
  }).eq("id", hero.id);
  await updateHeroAdventureVisits(supabase, gameId, mapState, visits, hero.id, buildingId);
}

async function updateHeroAdventureVisits(
  supabase: SupabaseAdminClient,
  gameId: string,
  mapState: Record<string, unknown>,
  visits: Record<string, string[]>,
  heroId: string,
  buildingId: string,
) {
  const latestMapState = await getLatestMapState(supabase, gameId, mapState);
  await supabase.from("games").update({
    map_state: {
      ...latestMapState,
      heroAdventureVisits: addVisit(visits, heroId, buildingId),
    },
  }).eq("id", gameId);
}

async function applyHeroAttributeVisit(
  supabase: SupabaseAdminClient,
  gameId: string,
  mapState: Record<string, unknown>,
  hero: MinimalHero,
  visits: Record<string, string[]>,
  buildingId: string,
  update: Partial<Pick<MinimalHero, "morale" | "luck" | "mana" | "spellPower">>,
) {
  const payload = {
    morale: update.morale,
    luck: update.luck,
    mana: update.mana,
    spell_power: update.spellPower,
  };
  await supabase.from("heroes").update(
    Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
  ).eq("id", hero.id);
  await updateHeroAdventureVisits(supabase, gameId, mapState, visits, hero.id, buildingId);
}

async function updateWeeklyAdventureVisit(
  supabase: SupabaseAdminClient,
  gameId: string,
  mapState: Record<string, unknown>,
  visits: Record<string, string>,
  visitKey: string,
  weekKey: string,
) {
  await supabase.from("games").update({
    map_state: {
      ...mapState,
      weeklyAdventureVisits: {
        ...visits,
        [visitKey]: weekKey,
      },
    },
  }).eq("id", gameId);
}

async function updateVisitedAdventureBuildings(
  supabase: SupabaseAdminClient,
  gameId: string,
  mapState: Record<string, unknown>,
  visitedAdventureBuildings: Set<string>,
) {
  await supabase.from("games").update({
    map_state: {
      ...mapState,
      visitedAdventureBuildings: Array.from(visitedAdventureBuildings),
    },
  }).eq("id", gameId);
}

function heroStatColumn(stat: HeroStatKey) {
  if (stat === "spellPower") return "spell_power";
  return stat;
}

function heroStatValue(hero: MinimalHero, stat: HeroStatKey) {
  if (stat === "attack") return hero.attack ?? 0;
  if (stat === "defense") return hero.defense ?? 0;
  if (stat === "spellPower") return hero.spellPower ?? 0;
  return hero.knowledge ?? 0;
}

function pickShrineSpell(level: number, seed: string) {
  const candidates = SPELLS.filter((spell) => spell.level === level && spell.context === "combat");
  const pool = candidates.length > 0 ? candidates : SPELLS.filter((spell) => spell.level === level);
  return pool[Math.floor(makeRng(seed)() * pool.length)] ?? SPELLS[0];
}

function addKnownSpell(current: string[] | null | undefined, spellId: SpellId) {
  return Array.from(new Set([...(current ?? []), spellId]));
}

function getAllMapTileKeys(map: GameMap) {
  const keys: string[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      keys.push(`${x},${y}`);
    }
  }
  return keys;
}

function findStargateDestination(map: GameMap, targetId: string | undefined): Position | null {
  if (!targetId) return null;
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "adventure_building" && tile.object.id === targetId) {
        return { x: tile.x, y: tile.y };
      }
    }
  }
  return null;
}

function findTeleportLanding(map: GameMap, target: Position): Position | null {
  const positions = [
    target,
    { x: target.x + 1, y: target.y },
    { x: target.x - 1, y: target.y },
    { x: target.x, y: target.y + 1 },
    { x: target.x, y: target.y - 1 },
  ];

  for (const position of positions) {
    const tile = map.tiles[position.y]?.[position.x];
    if (isTileTraversable(tile)) return position;
  }
  return null;
}

function getAffordableCount(resources: Resources, cost: Partial<Resources>, available: number) {
  let limit = Math.max(0, Math.floor(available));
  for (const [resource, amount] of Object.entries(cost)) {
    const unitCost = Number(amount ?? 0);
    if (unitCost <= 0) continue;
    const owned = Number(resources[resource as keyof Resources] ?? 0);
    limit = Math.min(limit, Math.floor(owned / unitCost));
  }
  return Math.max(0, limit);
}
