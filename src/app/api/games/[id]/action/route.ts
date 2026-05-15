import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCurrentUser } from "@/lib/auth";
import {
  RESOURCE_BUILDING_RULES,
  UNIT_RULES,
  canAfford,
  getFactionBuildingRule,
  getGrowthForBuiltTownBuilding,
  subtractCost,
} from "@/lib/game/economy";
import { createCampfireReward, addVisit, hasPlayerVisited, getAdventureBuildingLabel } from "@/lib/game/adventure-buildings";
import { makeRng } from "@/lib/game/engine/rng";
import { AdventureBuildingType, BuildingType, Faction, GameMap, HeroClass, MapObject, Position, Resources, UnitType } from "@/lib/game/types";
import {
  CLASS_STARTING_STATS,
  HERO_RECRUIT_COST_GOLD,
  MAX_HEROES_PER_PLAYER,
  TAVERN_OFFER_SIZE,
  getHeroTemplate,
  pickTavernOffer,
  startingArmyForFaction,
  type TavernOffer,
} from "@/lib/game/heroes";
import {
  canMoveAdventureStep,
  computeVisibleTiles,
  getAdventurePathCost,
  getAdventureStepCost,
  getDailyAdventureMovement,
  getPlayerVisionCenters,
  isTileTraversable,
  normalizeMapMovement,
} from "@/lib/game/engine";
import { getTownCenterLevel, getTownGoldProduction, hasTownBuilding } from "@/lib/game/town-buildings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";

interface MinimalBuilding {
  id: string;
  x: number;
  y: number;
  buildingType?: string;
  guardianPower?: number;
}

interface MinimalTown {
  id: string;
  x: number;
  y: number;
  level?: number;
  townType?: string;
  buildings?: string[];
  garrison?: MinimalArmy[];
  availableRecruits?: Record<string, number>;
  tavernOffer?: TavernOffer[];
  isNeutral?: boolean;
  neutralGarrison?: unknown[];
}

interface MinimalResourceBuilding {
  id: string;
  buildingType: string;
}

interface MinimalTurn {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
}

interface MinimalArmy {
  id: string;
  unitType: UnitType;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

interface MinimalHero {
  id: string;
  x: number;
  y: number;
  movement: number;
  experience: number;
  armies: MinimalArmy[];
}

interface MinimalPlayer {
  id: string;
  isAlive?: boolean;
  turnOrder?: number;
  faction?: string;
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems: number;
  sulfur: number;
  exploredTiles: string[];
  heroes: MinimalHero[];
  towns: MinimalTown[];
  resourceBuildings: MinimalResourceBuilding[];
}

type MoveInteraction =
  | { type: "COLLECT"; resource: string; gold?: number; destination: Position }
  | { type: "ADVENTURE_BUILDING"; buildingType: string; reward?: { gold?: number; resources?: Record<string, number> }; message?: string; destination: Position }
  | { type: "TELEPORT"; buildingType: "stargate"; from: Position; to: Position; message?: string; destination: Position }
  | { type: "COMBAT"; targetId: string; targetType: "hero" | "monster" | "building" | "town"; destination: Position }
  | { type: "CAPTURE_BUILDING"; buildingType?: string; destination: Position }
  | { type: "CAPTURE_TOWN"; destination: Position }
  | { type: "STOP"; message: string; destination: Position };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireCurrentUser(request);
    if (!user) return response;

    const { id } = await params;
    const action = await request.json();
    const supabase = createAdminClient();
    const gamePlayer = await getGamePlayer(supabase, id, user.id) as unknown as MinimalPlayer | null;
    const game = await getGameWithRelations(supabase, id);

    if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
    if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
    if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

    const players = game.players as unknown as Array<{
      id: string;
      isAlive: boolean;
      turnOrder: number;
      resourceBuildings: MinimalBuilding[];
      towns: MinimalTown[];
      heroes?: MinimalHero[];
    }>;
    const turns = game.turns as MinimalTurn[];
    const completedTurn = turns.find((turn) =>
      turn.gamePlayerId === gamePlayer.id && turn.turnNumber === game.turnNumber && turn.isCompleted
    );
    if (completedTurn && action.type !== "END_TURN") {
      return NextResponse.json({ error: "Vous avez deja termine votre tour" }, { status: 403 });
    }

    if (action.type === "MOVE_HERO") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });

      const mapData = normalizeMapMovement(game.mapData as GameMap);
      const validation = validateMovePath(mapData, { x: hero.x, y: hero.y }, action.path, hero.movement);
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

      const mapState = (game.mapState as Record<string, unknown>) ?? {};
      const collected = new Set<string>((mapState.collected as string[]) ?? []);
      const killed = new Set<string>((mapState.killed as string[]) ?? []);
      const visitedAdventureBuildings = new Set<string>((mapState.visitedAdventureBuildings as string[]) ?? []);
      for (const army of ((game.neutralArmies ?? []) as Array<{ id: string; status: string }>)) {
        if (army.status !== "ACTIVE") killed.add(army.id);
      }
      const firstStop = findFirstMoveStop({
        path: action.path,
        map: mapData,
        movingHeroId: hero.id,
        movingPlayerId: gamePlayer.id,
        players,
        collected,
        killed,
        visitedAdventureBuildings,
      });
      const movePath = firstStop ? action.path.slice(0, firstStop.pathIndex + 1) : action.path;
      const usedMovement = getPathMovementCost(mapData, movePath);
      const lastPos = movePath[movePath.length - 1];
      const { error: heroUpdateError } = await supabase.from("heroes").update({
        x: lastPos.x,
        y: lastPos.y,
        movement: Math.max(0, hero.movement - usedMovement),
      }).eq("id", hero.id);
      if (heroUpdateError) {
        console.error("heroes.update failed:", heroUpdateError, { heroId: hero.id, x: lastPos.x, y: lastPos.y, movement: hero.movement, used: usedMovement });
        return NextResponse.json({ error: `Erreur mise à jour héros: ${heroUpdateError.message}` }, { status: 500 });
      }

      const movedHeroes: MinimalHero[] = gamePlayer.heroes.map((item) =>
        item.id === hero.id ? { ...hero, x: lastPos.x, y: lastPos.y } : item
      );
      const newlyVisible = computeVisibleTiles(
        mapData,
        getPlayerVisionCenters({
          heroes: movedHeroes.map((h) => ({ position: { x: h.x, y: h.y } })),
          towns: gamePlayer.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
        }),
        5
      );
      const currentlyVisible = computeVisibleTiles(
        mapData,
        getPlayerVisionCenters({
          heroes: gamePlayer.heroes.map((h) => ({ position: { x: h.x, y: h.y } })),
          towns: gamePlayer.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
        }),
        5
      );
      const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
      for (const key of currentlyVisible) explored.add(key);
      for (const key of newlyVisible) explored.add(key);
      await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);

      const tile = mapData.tiles?.[lastPos.y]?.[lastPos.x];
      let interaction: MoveInteraction | null = null;

      if (tile?.object?.type === "resource" && !collected.has(tile.object.id)) {
        collected.add(tile.object.id);
        const resourceType = tile.object.subtype ?? "gold";
        const amount = resourceType === "gold" ? 500 : 2;
        await incrementPlayerResource(supabase, gamePlayer.id, resourceType, amount);
        await supabase.from("games").update({ map_state: { ...mapState, collected: Array.from(collected) } }).eq("id", id);
        interaction = { type: "COLLECT", resource: resourceType, gold: resourceType === "gold" ? amount : undefined, destination: lastPos };
      }

      if (firstStop?.hero) {
        if (firstStop.hero.playerId === gamePlayer.id) {
          interaction = { type: "STOP", message: "Un de vos heros bloque le chemin.", destination: lastPos };
        } else {
          interaction = { type: "COMBAT", targetId: firstStop.hero.id, targetType: "hero", destination: lastPos };
        }
      } else if (tile?.object?.type === "monster" && !killed.has(tile.object.id)) {
        interaction = { type: "COMBAT", targetId: tile.object.id, targetType: "monster", destination: lastPos };
      } else if (tile?.object?.type === "artifact") {
        interaction = { type: "STOP", message: "Artefact atteint.", destination: lastPos };
      } else if (tile?.object?.type === "building") {
        const building = players.flatMap((player) => player.resourceBuildings)
          .find((item) => item.id === tile.object?.id || (item.x === lastPos.x && item.y === lastPos.y))
          ?? await getResourceBuilding(supabase, id, tile.object.id);
        const owner = players.find((player) =>
          player.resourceBuildings.some((item) => item.id === building?.id || (item.x === lastPos.x && item.y === lastPos.y))
        );
        const guardianPower = Number(building?.guardianPower ?? tile.object.guardianPower ?? 0);
        if (owner?.id === gamePlayer.id) {
          interaction = { type: "STOP", message: "Batiment deja controle.", destination: lastPos };
        } else if (guardianPower > 0) {
          interaction = { type: "COMBAT", targetId: tile.object.id, targetType: "building", destination: lastPos };
        } else if (building) {
          await supabase.from("resource_buildings").update({ game_player_id: gamePlayer.id, guardian_power: 0 }).eq("id", building.id);
          interaction = { type: "CAPTURE_BUILDING", buildingType: building.buildingType, destination: lastPos };
        }
      } else if (tile?.object?.type === "adventure_building" && !visitedAdventureBuildings.has(tile.object.id)) {
        interaction = await handleAdventureBuildingVisit({
          supabase,
          gameId: id,
          gamePlayer,
          hero,
          mapData,
          mapState,
          object: tile.object,
          position: lastPos,
          explored,
        });
      }

      // Capture d'un château neutre : si garnison vide → capture immédiate.
      // (Le déclenchement du combat vs garnison est branché côté combat flow standard.)
      if (tile?.object?.type === "town") {
        const { data: neutralTown } = await supabase
          .from("towns")
          .select("id, is_neutral, neutral_garrison, town_type, name")
          .eq("game_id", id)
          .eq("x", lastPos.x)
          .eq("y", lastPos.y)
          .eq("is_neutral", true)
          .maybeSingle();
        if (neutralTown) {
          const garrison = (neutralTown.neutral_garrison ?? []) as unknown[];
          if (garrison.length > 0) {
            interaction = { type: "COMBAT", targetId: neutralTown.id, targetType: "town", destination: lastPos };
          } else {
            await supabase
              .from("towns")
              .update({
                game_player_id: gamePlayer.id,
                is_neutral: false,
                neutral_garrison: [],
              })
              .eq("id", neutralTown.id);
            await supabase
              .from("heroes")
              .update({ experience: hero.experience + 250 })
              .eq("id", hero.id);
            interaction = { type: "CAPTURE_TOWN", destination: lastPos };
          }
        }
      }

      return NextResponse.json({ success: true, interaction, path: movePath, stoppedAt: firstStop ? lastPos : null });
    }

    if (action.type === "CAPTURE_BUILDING") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      const building = players.flatMap((player) => player.resourceBuildings)
        .find((item) => item.id === action.buildingId)
        ?? await getResourceBuilding(supabase, id, String(action.buildingId ?? ""));
      if (!hero || !building) return NextResponse.json({ error: "Capture invalide" }, { status: 400 });
      if (Number(building.guardianPower ?? 0) > 0) {
        return NextResponse.json({ error: "Ce batiment est garde" }, { status: 400 });
      }

      const mapData = normalizeMapMovement(game.mapData as GameMap);
      const movement = await validateAndApplyActionPath({
        supabase,
        mapData,
        gamePlayer,
        hero,
        path: action.path,
        destination: { x: building.x, y: building.y },
      });
      if (!movement.ok) return NextResponse.json({ error: movement.error }, { status: 400 });

      await supabase.from("resource_buildings").update({ game_player_id: gamePlayer.id, guardian_power: 0 }).eq("id", building.id);
      await supabase.from("heroes").update({ experience: hero.experience + 150 }).eq("id", hero.id);
      return NextResponse.json({ success: true, interaction: { type: "CAPTURE_BUILDING", buildingType: building.buildingType } });
    }

    if (action.type === "CAPTURE_TOWN") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      let town = players.flatMap((player) => player.towns).find((item) => item.id === action.townId);
      if (!town) {
        const mapData = game.mapData as GameMap;
        const mapTownTile = mapData.tiles
          .flatMap((row) => row)
          .find((tile) => tile.object?.type === "town" && tile.object.id === action.townId);

        if (mapTownTile) {
          const { data: neutralTown } = await supabase
            .from("towns")
            .select("id,x,y,town_type,buildings,neutral_garrison,is_neutral")
            .eq("game_id", id)
            .eq("x", mapTownTile.x)
            .eq("y", mapTownTile.y)
            .eq("is_neutral", true)
            .maybeSingle();

          if (neutralTown) {
            town = {
              id: neutralTown.id,
              x: neutralTown.x,
              y: neutralTown.y,
              townType: neutralTown.town_type,
              buildings: neutralTown.buildings ?? [],
              isNeutral: neutralTown.is_neutral,
              neutralGarrison: neutralTown.neutral_garrison ?? [],
            };
          }
        }
      }
      if (!hero || !town) return NextResponse.json({ error: "Chateau invalide" }, { status: 400 });
      if (town.isNeutral && (town.neutralGarrison?.length ?? 0) > 0) {
        return NextResponse.json({ error: "Ce château neutre est gardé" }, { status: 400 });
      }
      const mapData = normalizeMapMovement(game.mapData as GameMap);
      const movement = await validateAndApplyActionPath({
        supabase,
        mapData,
        gamePlayer,
        hero,
        path: action.path,
        destination: { x: town.x, y: town.y },
      });
      if (!movement.ok) return NextResponse.json({ error: movement.error }, { status: 400 });

      const capturedBuildings = (town.buildings ?? []) as string[];
      const hasAnotherCapitol = gamePlayer.towns.some((item) => (item.buildings ?? []).includes(BuildingType.CAPITOL));
      const townOwnershipUpdate: Record<string, unknown> = {
        game_player_id: gamePlayer.id,
        is_neutral: false,
        neutral_garrison: [],
      };
      if (hasAnotherCapitol && capturedBuildings.includes(BuildingType.CAPITOL)) {
        const demotedBuildings = capturedBuildings
          .filter((item) => item !== BuildingType.CAPITOL)
          .concat(capturedBuildings.includes(BuildingType.CITY_HALL) ? [] : [BuildingType.CITY_HALL]);
        townOwnershipUpdate.buildings = demotedBuildings;
        townOwnershipUpdate.level = getTownCenterLevel(demotedBuildings);
      }
      await supabase
        .from("towns")
        .update(townOwnershipUpdate)
        .eq("id", town.id);
      await supabase.from("heroes").update({ experience: hero.experience + 250 }).eq("id", hero.id);
      return NextResponse.json({ success: true, interaction: { type: "CAPTURE" } });
    }

    if (action.type === "BUILD") {
      const town = gamePlayer.towns.find((item: { id: string }) => item.id === action.townId);
      const building = action.building as BuildingType;
      const townFaction = ((town?.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction);
      const rule = getFactionBuildingRule(townFaction, building);
      if (!town || !rule) return NextResponse.json({ error: "Batiment invalide" }, { status: 400 });

      const buildings = (town.buildings ?? []) as string[];
      if (buildings.includes(building)) return NextResponse.json({ error: "Batiment deja construit" }, { status: 400 });
      const missingRequirement = rule.requires?.find((requirement) => !hasTownBuilding(buildings, requirement));
      if (missingRequirement) return NextResponse.json({ error: "Prérequis manquant" }, { status: 400 });
      if (
        building === BuildingType.CAPITOL &&
        gamePlayer.towns.some((item) => item.id !== town.id && (item.buildings ?? []).includes(BuildingType.CAPITOL))
      ) {
        return NextResponse.json({ error: "Un seul Capitole est autorisé par joueur" }, { status: 400 });
      }
      const resources = playerResources(gamePlayer);
      if (!canAfford(resources, rule.cost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });

      await supabase.from("game_players").update(subtractCost(resources, rule.cost)).eq("id", gamePlayer.id);
      const nextBuildings = [...buildings, building];
      const townUpdate: Record<string, unknown> = {
        buildings: nextBuildings,
        level: getTownCenterLevel(nextBuildings),
        last_built_turn: game.turnNumber,
      };
      if (building === BuildingType.TAVERN && (!town.tavernOffer || town.tavernOffer.length === 0)) {
        const townFaction = ((town.townType ?? gamePlayer.faction ?? "castle") as Faction);
        townUpdate.tavern_offer = pickTavernOffer(townFaction);
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
      return NextResponse.json({ success: true });
    }

    if (action.type === "RECRUIT_HERO") {
      const town = gamePlayer.towns.find((item) => item.id === action.townId);
      if (!town) return NextResponse.json({ error: "Ville invalide" }, { status: 400 });

      const buildings = (town.buildings ?? []) as string[];
      if (!buildings.includes(BuildingType.TAVERN)) {
        return NextResponse.json({ error: "Construisez d'abord la Taverne" }, { status: 400 });
      }

      const offer = (town.tavernOffer ?? []) as TavernOffer[];
      const picked = offer.find((entry) => entry.templateId === action.templateId);
      if (!picked) return NextResponse.json({ error: "Héros indisponible" }, { status: 400 });

      const template = getHeroTemplate(action.templateId);
      if (!template) return NextResponse.json({ error: "Héros inconnu" }, { status: 400 });

      if (gamePlayer.heroes.length >= MAX_HEROES_PER_PLAYER) {
        return NextResponse.json({ error: `Maximum ${MAX_HEROES_PER_PLAYER} héros par joueur` }, { status: 400 });
      }

      const resources = playerResources(gamePlayer);
      if (resources.gold < HERO_RECRUIT_COST_GOLD) {
        return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });
      }

      const stats = CLASS_STARTING_STATS[template.class as HeroClass];
      const army = startingArmyForFaction(template.faction);
      const dailyMovement = getDailyAdventureMovement([{ unitType: army.unitType }]);

      await supabase.from("game_players").update({ gold: resources.gold - HERO_RECRUIT_COST_GOLD }).eq("id", gamePlayer.id);

      const { data: heroRow, error: heroError } = await supabase
        .from("heroes")
        .insert({
          game_player_id: gamePlayer.id,
          name: template.name,
          hero_class: template.class,
          specialty: template.specialty,
          attack: stats.attack,
          defense: stats.defense,
          spell_power: stats.spellPower,
          knowledge: stats.knowledge,
          x: town.x,
          y: town.y,
          movement: dailyMovement,
          max_movement: dailyMovement,
        })
        .select("*")
        .single();
      if (heroError || !heroRow) {
        return NextResponse.json({ error: `Erreur création héros: ${heroError?.message ?? "inconnue"}` }, { status: 500 });
      }

      const unitRule = UNIT_RULES[army.unitType];
      if (unitRule) {
        await supabase.from("armies").insert({
          hero_id: heroRow.id,
          unit_type: army.unitType,
          count: army.count,
          health: unitRule.health * army.count,
          max_health: unitRule.health,
          position: 0,
        });
      }

      const remaining = offer.filter((entry) => entry.templateId !== action.templateId);
      const excludeIds = remaining.map((entry) => entry.templateId);
      const replacements = pickTavernOffer(
        ((town.townType ?? gamePlayer.faction ?? "castle") as Faction),
        excludeIds,
        Math.max(0, TAVERN_OFFER_SIZE - remaining.length)
      );
      await supabase.from("towns").update({ tavern_offer: [...remaining, ...replacements] }).eq("id", town.id);

      return NextResponse.json({ success: true });
    }

    if (action.type === "RECRUIT_UNIT") {
      const unitType = action.unitType as UnitType;
      const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
      const rule = UNIT_RULES[unitType];
      const town = gamePlayer.towns.find((item: { id: string }) => item.id === action.townId);
      if (!rule || !town) return NextResponse.json({ error: "Unite invalide" }, { status: 400 });

      const available = (town.availableRecruits?.[unitType] ?? 0);
      if (available < count) return NextResponse.json({ error: "Pas assez d'unités disponibles" }, { status: 400 });

      const totalCost = Object.fromEntries(Object.entries(rule.cost).map(([key, value]) => [key, (value ?? 0) * count]));
      const resources = playerResources(gamePlayer);
      if (!canAfford(resources, totalCost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });

      await supabase.from("game_players").update(subtractCost(resources, totalCost)).eq("id", gamePlayer.id);
      const nextGarrison = addUnitsToStackList(town.garrison ?? [], unitType, count, rule.health);
      await supabase.from("towns").update({
        available_recruits: { ...(town.availableRecruits ?? {}), [unitType]: available - count },
        garrison: nextGarrison,
      }).eq("id", town.id);

      return NextResponse.json({ success: true });
    }

    if (action.type === "TRANSFER_GARRISON_TO_HERO") {
      const unitType = action.unitType as UnitType;
      const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
      const rule = UNIT_RULES[unitType];
      const town = gamePlayer.towns.find((item: { id: string }) => item.id === action.townId);
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!rule || !town || !hero) return NextResponse.json({ error: "Transfert invalide" }, { status: 400 });
      if (hero.x !== town.x || hero.y !== town.y) {
        return NextResponse.json({ error: "Le héros doit être au château pour recevoir la garnison" }, { status: 400 });
      }

      const garrison = town.garrison ?? [];
      const source = garrison.find((unit) => unit.unitType === unitType);
      if (!source || source.count < count) {
        return NextResponse.json({ error: "Garnison insuffisante" }, { status: 400 });
      }

      const nextGarrison = removeUnitsFromStackList(garrison, unitType, count, rule.health);
      await supabase.from("towns").update({ garrison: nextGarrison }).eq("id", town.id);

      const existing = hero.armies.find((army) => army.unitType === unitType);
      if (existing) {
        await supabase.from("armies").update({
          count: existing.count + count,
          health: existing.health + rule.health * count,
        }).eq("id", existing.id);
      } else {
        await supabase.from("armies").insert({
          hero_id: hero.id,
          unit_type: unitType,
          count,
          health: rule.health * count,
          max_health: rule.health,
          position: hero.armies.length,
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action.type === "END_TURN") {
      await completePlayerTurn(supabase, id, Number(game.turnNumber), gamePlayer.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
    console.error("Action error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function playerResources(player: {
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems?: number;
  sulfur: number;
}): Resources {
  return {
    gold: player.gold,
    wood: player.wood,
    ore: player.ore,
    mercury: player.mercury,
    crystals: player.crystals,
    gems: player.gems ?? 0,
    sulfur: player.sulfur,
  };
}

function addUnitsToStackList(stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) {
  const existing = stacks.find((unit) => unit.unitType === unitType);
  if (existing) {
    return stacks.map((unit) =>
      unit.id === existing.id
        ? { ...unit, count: unit.count + count, health: unit.health + maxHealth * count }
        : unit
    );
  }

  return [
    ...stacks,
    {
      id: randomUUID(),
      unitType,
      count,
      health: maxHealth * count,
      maxHealth,
      position: stacks.length,
    },
  ];
}

function removeUnitsFromStackList(stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) {
  return stacks
    .map((unit) =>
      unit.unitType === unitType
        ? { ...unit, count: unit.count - count, health: Math.max(0, unit.health - maxHealth * count) }
        : unit
    )
    .filter((unit) => unit.count > 0)
    .map((unit, position) => ({ ...unit, position }));
}

async function incrementPlayerResource(supabase: ReturnType<typeof createAdminClient>, playerId: string, resource: string, amount: number) {
  const game = await getGameRowForPlayer(supabase, playerId);
  if (!game) return;
  const current = Number(game[resource] ?? 0);
  await supabase.from("game_players").update({ [resource]: current + amount }).eq("id", playerId);
}

async function getGameRowForPlayer(supabase: ReturnType<typeof createAdminClient>, playerId: string) {
  const { data } = await supabase.from("game_players").select("*").eq("id", playerId).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getResourceBuilding(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  buildingId: string
): Promise<MinimalBuilding | null> {
  const { data } = await supabase
    .from("resource_buildings")
    .select("id,x,y,building_type,guardian_power")
    .eq("game_id", gameId)
    .eq("id", buildingId)
    .maybeSingle();

  return data
    ? { id: data.id, x: data.x, y: data.y, buildingType: data.building_type, guardianPower: data.guardian_power }
    : null;
}

async function handleAdventureBuildingVisit({
  supabase,
  gameId,
  gamePlayer,
  hero,
  mapData,
  mapState,
  object,
  position,
  explored,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  gameId: string;
  gamePlayer: MinimalPlayer;
  hero: MinimalHero;
  mapData: GameMap;
  mapState: Record<string, unknown>;
  object: MapObject;
  position: Position;
  explored: Set<string>;
}): Promise<MoveInteraction> {
  const buildingType = object.subtype as AdventureBuildingType | undefined;
  const visitedAdventureBuildings = new Set<string>((mapState.visitedAdventureBuildings as string[]) ?? []);
  const playerAdventureVisits = (mapState.playerAdventureVisits as Record<string, string[]> | undefined) ?? {};
  const signaledLighthouses = (mapState.signaledLighthouses as Record<string, string[]> | undefined) ?? {};

  if (!buildingType) {
    return { type: "ADVENTURE_BUILDING", buildingType: "unknown", destination: position, message: "Batiment d'aventure visite." };
  }

  if (
    (buildingType === AdventureBuildingType.OBSERVATORY || buildingType === AdventureBuildingType.LIGHTHOUSE) &&
    hasPlayerVisited(playerAdventureVisits, gamePlayer.id, object.id)
  ) {
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: `${getAdventureBuildingLabel(buildingType)} deja visite.`,
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
    await supabase.from("game_players").update(resourceUpdate).eq("id", gamePlayer.id);
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        visitedAdventureBuildings: Array.from(visitedAdventureBuildings),
      },
    }).eq("id", gameId);

    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: {
        gold: reward.gold,
        resources: reward.resources as Record<string, number>,
      },
      message: "Feu de camp fouille.",
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
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "La sortie de la Stargate est bloquee." };
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

  return {
    type: "ADVENTURE_BUILDING",
    buildingType,
    destination: position,
    message: `${getAdventureBuildingLabel(buildingType)} visite.`,
  };
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

async function completePlayerTurn(supabase: ReturnType<typeof createAdminClient>, gameId: string, turnNumber: number, gamePlayerId: string) {
  await supabase.from("turns").upsert({
    game_id: gameId,
    game_player_id: gamePlayerId,
    turn_number: turnNumber,
    actions: [],
    is_completed: true,
  }, { onConflict: "game_id,game_player_id,turn_number" });

  const game = await getGameWithRelations(supabase, gameId);
  if (!game) return;
  const alivePlayers = (game.players as unknown as MinimalPlayer[]).filter((player) => player.isAlive);
  const turns = game.turns as MinimalTurn[];
  const completedPlayerIds = new Set(
    turns
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );
  if (completedPlayerIds.size < alivePlayers.length) {
    const sortedPlayers = [...alivePlayers].sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0));
    const currentIndex = sortedPlayers.findIndex((player) => player.id === gamePlayerId);
    const nextPlayer = sortedPlayers
      .slice(currentIndex + 1)
      .concat(sortedPlayers.slice(0, Math.max(0, currentIndex + 1)))
      .find((player) => !completedPlayerIds.has(player.id));

    await supabase.from("games").update({
      current_turn_player_id: nextPlayer?.id ?? null,
    }).eq("id", gameId);
    return;
  }

  const nextTurnNumber = turnNumber + 1;
  const mapState = (game.mapState as Record<string, unknown>) ?? {};
  const signaledLighthouses = (mapState.signaledLighthouses as Record<string, string[]> | undefined) ?? {};
  const mapData = game.mapData as GameMap | undefined;
  for (const player of alivePlayers) {
    let goldIncome = 0, woodIncome = 0, oreIncome = 0;
    let mercuryIncome = 0, crystalsIncome = 0, gemsIncome = 0, sulfurIncome = 0;

    for (const building of player.resourceBuildings ?? []) {
      const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === building.buildingType);
      if (rule) {
        goldIncome += rule.production.gold ?? 0;
        woodIncome += rule.production.wood ?? 0;
        oreIncome += rule.production.ore ?? 0;
        mercuryIncome += rule.production.mercury ?? 0;
        crystalsIncome += rule.production.crystals ?? 0;
        gemsIncome += rule.production.gems ?? 0;
        sulfurIncome += rule.production.sulfur ?? 0;
      }
    }

    for (const town of player.towns ?? []) {
      const buildings = (town.buildings ?? []) as string[];
      const townFaction = ((town as { townType?: string }).townType ?? player.faction ?? Faction.CASTLE) as Faction;
      goldIncome += getTownGoldProduction(buildings);
      for (const building of buildings) {
        const rule = getFactionBuildingRule(townFaction, building);
        goldIncome += rule?.dailyProduction?.gold ?? 0;
        woodIncome += rule?.dailyProduction?.wood ?? 0;
        oreIncome += rule?.dailyProduction?.ore ?? 0;
        mercuryIncome += rule?.dailyProduction?.mercury ?? 0;
        crystalsIncome += rule?.dailyProduction?.crystals ?? 0;
        gemsIncome += rule?.dailyProduction?.gems ?? 0;
        sulfurIncome += rule?.dailyProduction?.sulfur ?? 0;
      }
    }

    await updatePlayerResourcesForIncome(supabase, player.id, {
      gold: player.gold + goldIncome,
      wood: player.wood + woodIncome,
      ore: player.ore + oreIncome,
      mercury: player.mercury + mercuryIncome,
      crystals: player.crystals + crystalsIncome,
      gems: (player.gems ?? 0) + gemsIncome,
      sulfur: player.sulfur + sulfurIncome,
    });
    const lighthouseCount = new Set(signaledLighthouses[player.id] ?? []).size;
    for (const hero of player.heroes ?? []) {
      const isOnWater = mapData?.tiles?.[hero.y]?.[hero.x]?.terrain === "water";
      const dailyMovement = getDailyAdventureMovement(hero.armies) + (isOnWater ? lighthouseCount * 500 : 0);
      await supabase.from("heroes").update({
        movement: dailyMovement,
        max_movement: dailyMovement,
      }).eq("id", hero.id);
    }

    for (const town of player.towns ?? []) {
      const buildings = (town.buildings ?? []) as string[];
      const recruits: Record<string, number> = { ...(town.availableRecruits ?? {}) };
      const townFaction = ((town as { townType?: string }).townType ?? player.faction ?? Faction.CASTLE) as Faction;
      for (const building of buildings) {
        const growth = getGrowthForBuiltTownBuilding(townFaction, building);
        for (const [unitType, amount] of Object.entries(growth)) {
          recruits[unitType] = (recruits[unitType] ?? 0) + (amount ?? 0);
        }
      }
      await supabase.from("towns").update({ available_recruits: recruits }).eq("id", town.id);
    }
  }
  const firstPlayer = alivePlayers.sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0))[0];
  await supabase.from("games").update({
    turn_number: nextTurnNumber,
    current_turn_player_id: firstPlayer?.id ?? null,
  }).eq("id", gameId);
}

async function updatePlayerResourcesForIncome(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
  resources: Resources,
) {
  const { error } = await supabase.from("game_players").update(resources).eq("id", playerId);
  if (!error) return;

  if (error.message.toLowerCase().includes("gems")) {
    const resourcesWithoutGems: Partial<Resources> = { ...resources };
    delete resourcesWithoutGems.gems;
    const { error: fallbackError } = await supabase.from("game_players").update(resourcesWithoutGems).eq("id", playerId);
    if (!fallbackError) return;
    throw fallbackError;
  }

  throw error;
}

function findFirstMoveStop({
  path,
  map,
  movingHeroId,
  movingPlayerId,
  players,
  collected,
  killed,
  visitedAdventureBuildings,
}: {
  path: Position[];
  map: GameMap;
  movingHeroId: string;
  movingPlayerId: string;
  players: Array<{
    id: string;
    resourceBuildings: MinimalBuilding[];
    heroes?: MinimalHero[];
  }>;
  collected: Set<string>;
  killed: Set<string>;
  visitedAdventureBuildings: Set<string>;
}): { pathIndex: number; object?: MapObject; hero?: MinimalHero & { playerId: string } } | null {
  for (let i = 1; i < path.length; i++) {
    const position = path[i];
    const hero = players
      .flatMap((player) => (player.heroes ?? []).map((item) => ({ ...item, playerId: player.id })))
      .find((item) => item.id !== movingHeroId && item.x === position.x && item.y === position.y);
    if (hero) return { pathIndex: i, hero };

    const object = map.tiles[position.y]?.[position.x]?.object;
    if (!object) continue;
    if (object.type === "resource" && collected.has(object.id)) continue;
    if (object.type === "monster" && killed.has(object.id)) continue;
    if (object.type === "adventure_building" && object.subtype === AdventureBuildingType.CAMPFIRE && visitedAdventureBuildings.has(object.id)) continue;
    if (object.type === "wall" || object.type === "gate") continue;
    if (object.type === "building") {
      const owner = players.find((player) =>
        player.id === movingPlayerId &&
        player.resourceBuildings.some((building) =>
          building.id === object.id || (building.x === position.x && building.y === position.y)
        )
      );
      if (owner) return { pathIndex: i, object };
    }
    return { pathIndex: i, object };
  }

  return null;
}

async function validateAndApplyActionPath({
  supabase,
  mapData,
  gamePlayer,
  hero,
  path,
  destination,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  mapData: GameMap;
  gamePlayer: MinimalPlayer;
  hero: MinimalHero;
  path: unknown;
  destination: Position;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(path) || path.length < 2) {
    if (hero.x === destination.x && hero.y === destination.y) return { ok: true };
    return { ok: false, error: "Chemin requis pour cette capture" };
  }

  const typedPath = path as Array<{ x: number; y: number }>;
  const lastPos = typedPath[typedPath.length - 1];
  if (lastPos?.x !== destination.x || lastPos?.y !== destination.y) {
    return { ok: false, error: "Le chemin ne termine pas sur la cible" };
  }

  const validation = validateMovePath(mapData, { x: hero.x, y: hero.y }, typedPath, hero.movement);
  if (!validation.ok) return validation;

  const { error: heroUpdateError } = await supabase.from("heroes").update({
    x: destination.x,
    y: destination.y,
    movement: Math.max(0, hero.movement - validation.usedMovement),
  }).eq("id", hero.id);
  if (heroUpdateError) return { ok: false, error: `Erreur mise a jour heros: ${heroUpdateError.message}` };

  const movedHeroes: MinimalHero[] = gamePlayer.heroes.map((item) =>
    item.id === hero.id ? { ...hero, x: destination.x, y: destination.y } : item
  );
  const newlyVisible = computeVisibleTiles(
    mapData,
    getPlayerVisionCenters({
      heroes: movedHeroes.map((h) => ({ position: { x: h.x, y: h.y } })),
      towns: gamePlayer.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
    }),
    5
  );
  const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
  for (const key of newlyVisible) explored.add(key);
  await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);

  return { ok: true };
}

function getPathMovementCost(map: GameMap, path: Position[]) {
  return getAdventurePathCost(map, path);
}

function validateMovePath(
  map: GameMap,
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
  movement: number
): { ok: true; usedMovement: number } | { ok: false; error: string } {
  if (!Array.isArray(path) || path.length < 2) return { ok: false, error: "Chemin invalide" };
  if (path[0]?.x !== start.x || path[0]?.y !== start.y) return { ok: false, error: "Le chemin ne commence pas sur le héros" };

  let usedMovement = 0;
  for (let i = 1; i < path.length; i++) {
    const previous = path[i - 1];
    const current = path[i];
    if (!canMoveAdventureStep(map, previous, current)) {
      return { ok: false, error: "Chemin invalide" };
    }
    const stepCost = getAdventureStepCost(map, previous, current);
    if (!Number.isFinite(stepCost)) return { ok: false, error: "Terrain infranchissable" };
    usedMovement += stepCost;
  }
  if (usedMovement > movement) return { ok: false, error: "Deplacement insuffisant" };
  return { ok: true, usedMovement };
}
