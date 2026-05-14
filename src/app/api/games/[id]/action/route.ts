import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCurrentUser } from "@/lib/auth";
import { AdventureEffect, getAdventureObjectRule } from "@/lib/game/adventure-objects";
import {
  RESOURCE_BUILDING_RULES,
  UNIT_RULES,
  canAfford,
  getFactionBuildingRule,
  getGrowthForBuiltTownBuilding,
  subtractCost,
} from "@/lib/game/economy";
import { BuildingType, Faction, GameMap, HeroClass, MapObject, Position, Resources, UnitType } from "@/lib/game/types";
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
import { computeVisibleTiles, getPlayerVisionCenters, isTileTraversable, normalizeMapMovement } from "@/lib/game/engine";
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
  attack?: number;
  defense?: number;
  spellPower?: number;
  knowledge?: number;
  mana?: number;
  maxMana?: number;
  morale?: number;
  luck?: number;
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
  | { type: "COMBAT"; targetId: string; targetType: "hero" | "monster" | "building" | "town" | "adventure"; destination: Position }
  | { type: "CAPTURE_BUILDING"; buildingType?: string; destination: Position }
  | { type: "VISIT_ADVENTURE_OBJECT"; objectType?: string; message: string; destination: Position }
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
      } else if (tile?.object?.type === "adventure") {
        const adventure = await getAdventureObject(supabase, id, tile.object.id);
        const guardianPower = Number(adventure?.guardianPower ?? tile.object.guardianPower ?? 0);
        if (guardianPower > 0) {
          interaction = { type: "COMBAT", targetId: tile.object.id, targetType: "adventure", destination: lastPos };
        } else if (adventure) {
          interaction = await resolveAdventureObjectVisit({
            supabase,
            gameId: id,
            game,
            gamePlayer,
            hero: { ...hero, x: lastPos.x, y: lastPos.y },
            adventure,
            destination: lastPos,
          });
        }
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

      return NextResponse.json({ success: true, interaction, stoppedAt: firstStop ? lastPos : null });
    }

    if (action.type === "CAPTURE_BUILDING") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      const building = players.flatMap((player) => player.resourceBuildings)
        .find((item) => item.id === action.buildingId)
        ?? await getResourceBuilding(supabase, id, String(action.buildingId ?? ""));
      if (!hero || !building) return NextResponse.json({ error: "Capture invalide" }, { status: 400 });

      await supabase.from("resource_buildings").update({ game_player_id: gamePlayer.id, guardian_power: 0 }).eq("id", building.id);
      await supabase.from("heroes").update({ x: building.x, y: building.y, experience: hero.experience + 150 }).eq("id", hero.id);
      return NextResponse.json({ success: true, interaction: { type: "CAPTURE_BUILDING", buildingType: building.buildingType } });
    }

    if (action.type === "VISIT_ADVENTURE_OBJECT") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      const adventure = await getAdventureObject(supabase, id, String(action.objectId ?? ""));
      if (!hero || !adventure) return NextResponse.json({ error: "Objet d'aventure invalide" }, { status: 400 });
      if (hero.x !== adventure.x || hero.y !== adventure.y) {
        return NextResponse.json({ error: "Le héros doit être sur l'objet pour le visiter" }, { status: 400 });
      }
      if ((adventure.guardianPower ?? 0) > 0) {
        return NextResponse.json({ error: "Cet objet est gardé" }, { status: 400 });
      }

      const interaction = await resolveAdventureObjectVisit({
        supabase,
        gameId: id,
        game,
        gamePlayer,
        hero,
        adventure,
        destination: { x: adventure.x, y: adventure.y },
      });
      return NextResponse.json({ success: true, interaction });
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
      await supabase
        .from("towns")
        .update({ game_player_id: gamePlayer.id, is_neutral: false, neutral_garrison: [] })
        .eq("id", town.id);
      await supabase.from("heroes").update({ x: town.x, y: town.y, experience: hero.experience + 250 }).eq("id", hero.id);
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
      const missingRequirement = rule.requires?.find((requirement) => !buildings.includes(requirement));
      if (missingRequirement) return NextResponse.json({ error: "Prérequis manquant" }, { status: 400 });
      const resources = playerResources(gamePlayer);
      if (!canAfford(resources, rule.cost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });

      await supabase.from("game_players").update(subtractCost(resources, rule.cost)).eq("id", gamePlayer.id);
      const townUpdate: Record<string, unknown> = {
        buildings: [...buildings, building],
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

interface MinimalAdventureObject {
  id: string;
  x: number;
  y: number;
  objectType: string;
  guardianPower: number;
  gamePlayerId: string | null;
  state: Record<string, unknown>;
}

async function getAdventureObject(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  objectId: string
): Promise<MinimalAdventureObject | null> {
  const { data } = await supabase
    .from("adventure_objects")
    .select("id,x,y,object_type,guardian_power,game_player_id,state")
    .eq("game_id", gameId)
    .eq("id", objectId)
    .maybeSingle();

  return data
    ? {
      id: data.id,
      x: data.x,
      y: data.y,
      objectType: data.object_type,
      guardianPower: data.guardian_power,
      gamePlayerId: data.game_player_id,
      state: data.state ?? {},
    }
    : null;
}

async function resolveAdventureObjectVisit(params: {
  supabase: ReturnType<typeof createAdminClient>;
  gameId: string;
  game: { turnNumber?: unknown; mapData?: unknown };
  gamePlayer: MinimalPlayer;
  hero: MinimalHero;
  adventure: MinimalAdventureObject;
  destination: Position;
}): Promise<MoveInteraction> {
  const { supabase, gameId, game, gamePlayer, hero, adventure } = params;
  const rule = getAdventureObjectRule(adventure.objectType);
  if (!rule) {
    return { type: "STOP", message: "Objet d'aventure inconnu.", destination: params.destination };
  }

  const visitCheck = canVisitAdventureObject(adventure.state, rule.visitFrequency, hero.id, gamePlayer.id, Number(game.turnNumber ?? 1));
  if (!visitCheck.ok) {
    return { type: "STOP", message: visitCheck.message, destination: params.destination };
  }

  const messages: string[] = [];
  let finalDestination = params.destination;
  for (const effect of rule.effects) {
    const result = await applyAdventureEffect({ supabase, gameId, game, gamePlayer, hero, adventure, effect });
    if (result.message) messages.push(result.message);
    if (result.destination) finalDestination = result.destination;
  }

  const nextState = markAdventureVisited(
    adventure.state,
    rule.visitFrequency,
    hero.id,
    gamePlayer.id,
    Number(game.turnNumber ?? 1),
    rule.consumesOnVisit === true,
  );
  await supabase
    .from("adventure_objects")
    .update({
      game_player_id: rule.category === "mine" ? gamePlayer.id : adventure.gamePlayerId,
      guardian_power: 0,
      state: nextState,
    })
    .eq("game_id", gameId)
    .eq("id", adventure.id);

  return {
    type: "VISIT_ADVENTURE_OBJECT",
    objectType: adventure.objectType,
    message: messages[0] ?? `${rule.label} visite.`,
    destination: finalDestination,
  };
}

async function applyAdventureEffect(params: {
  supabase: ReturnType<typeof createAdminClient>;
  gameId: string;
  game: { turnNumber?: unknown; mapData?: unknown };
  gamePlayer: MinimalPlayer;
  hero: MinimalHero;
  adventure: MinimalAdventureObject;
  effect: AdventureEffect;
}): Promise<{ message?: string; destination?: Position }> {
  const { supabase, gameId, game, gamePlayer, hero, adventure, effect } = params;
  switch (effect.type) {
    case "resource": {
      const resources = resolveResourceReward(effect.resources, effect.randomResource);
      await addPlayerResources(supabase, gamePlayer.id, resources);
      return { message: formatResourceReward(resources) };
    }
    case "combat_reward": {
      const resources = pickRewardResources(effect.reward);
      if (Object.keys(resources).length > 0) await addPlayerResources(supabase, gamePlayer.id, resources);
      if (effect.reward.experience) {
        await supabase.from("heroes").update({ experience: hero.experience + effect.reward.experience }).eq("id", hero.id);
      }
      if (effect.reward.artifactTier) await grantArtifact(supabase, hero.id, `artifact_${effect.reward.artifactTier}`);
      if (effect.reward.recruit) await addUnitsToHero(supabase, hero, effect.reward.recruit, 1);
      return { message: "Les gardiens sont vaincus et la recompense est obtenue." };
    }
    case "stat": {
      const stat = effect.stat === "choice_attack_defense" ? "attack" : effect.stat === "choice_magic" ? "spellPower" : effect.stat;
      const column = stat === "spellPower" ? "spell_power" : stat;
      await supabase.from("heroes").update({ [column]: Number(hero[stat] ?? 0) + effect.amount }).eq("id", hero.id);
      return { message: `+${effect.amount} ${formatHeroStat(stat)}.` };
    }
    case "movement": {
      await supabase.from("heroes").update({ movement: Math.max(0, Number(hero.movement ?? 0) + effect.amount) }).eq("id", hero.id);
      return { message: `${effect.amount >= 0 ? "+" : ""}${effect.amount} mouvement.` };
    }
    case "morale":
    case "luck": {
      await supabase.from("heroes").update({ [effect.type]: Number(hero[effect.type] ?? 0) + effect.amount }).eq("id", hero.id);
      await supabase.from("hero_status_effects").insert({
        hero_id: hero.id,
        effect_type: effect.type,
        amount: effect.amount,
        expires_on: effect.duration,
      });
      return { message: `${effect.type === "morale" ? "Moral" : "Chance"} ${effect.amount >= 0 ? "+" : ""}${effect.amount}.` };
    }
    case "mana": {
      const maxMana = Number(hero.maxMana ?? (hero.knowledge ?? 1) * 10);
      const currentMana = Number(hero.mana ?? maxMana);
      const mana = effect.mode === "restore"
        ? maxMana
        : effect.mode === "multiply"
          ? maxMana * effect.amount
          : currentMana + effect.amount;
      await supabase.from("heroes").update({ mana }).eq("id", hero.id);
      return { message: "Points de magie recuperes." };
    }
    case "experience": {
      await supabase.from("heroes").update({ experience: hero.experience + effect.amount }).eq("id", hero.id);
      return { message: `+${effect.amount} experience.` };
    }
    case "reveal": {
      await revealForPlayer(supabase, gamePlayer, game.mapData as GameMap, hero, effect);
      return { message: "La carte est revelee." };
    }
    case "skill": {
      await supabase.from("hero_skills").upsert({
        hero_id: hero.id,
        skill: effect.skill,
        level: 1,
      }, { onConflict: "hero_id,skill" });
      return { message: `Competence apprise : ${effect.skill}.` };
    }
    case "spell": {
      await supabase.from("hero_spellbook").upsert({
        hero_id: hero.id,
        spell: effect.spell,
      }, { onConflict: "hero_id,spell" });
      return { message: `Sort appris : ${effect.spell}.` };
    }
    case "artifact": {
      await grantArtifact(supabase, hero.id, `artifact_${effect.tier}`);
      return { message: "Artefact obtenu." };
    }
    case "recruit": {
      await addUnitsToHero(supabase, hero, effect.unitType ?? UnitType.PIKEMAN, effect.min);
      return { message: "Des creatures rejoignent l'armee." };
    }
    case "transport": {
      const destination = await resolveTransport(supabase, gameId, adventure, effect.mode);
      if (destination) {
        await supabase.from("heroes").update({ x: destination.x, y: destination.y }).eq("id", hero.id);
        return { message: "Le heros est transporte.", destination };
      }
      return { message: "Le transport n'a pas de destination disponible." };
    }
    case "market":
      return { message: "Le service commercial est disponible." };
    case "quest":
      return { message: "La condition de quete est enregistree." };
    case "transform":
      return { message: "La transformation est disponible." };
    case "sanctuary":
      return { message: "Le heros est protege dans le sanctuaire." };
    case "message":
      return { message: effect.text };
  }
}

function canVisitAdventureObject(
  state: Record<string, unknown>,
  frequency: string,
  heroId: string,
  playerId: string,
  turnNumber: number,
): { ok: true } | { ok: false; message: string } {
  if (state.consumed) return { ok: false, message: "Cet objet a deja ete utilise." };
  if (frequency === "repeatable") return { ok: true };

  const week = Math.floor((turnNumber - 1) / 7) + 1;
  const heroVisits = (state.heroVisits ?? {}) as Record<string, number>;
  const playerVisits = (state.playerVisits ?? {}) as Record<string, number>;

  if (frequency === "once" && state.visited) return { ok: false, message: "Cet objet a deja ete visite." };
  if (frequency === "once_per_hero" && heroVisits[heroId]) return { ok: false, message: "Ce heros a deja visite cet objet." };
  if (frequency === "once_per_player" && playerVisits[playerId]) return { ok: false, message: "Vous avez deja visite cet objet." };
  if (frequency === "daily" && heroVisits[heroId] === turnNumber) return { ok: false, message: "Revenez demain." };
  if (frequency === "weekly" && playerVisits[playerId] === week) return { ok: false, message: "Revenez la semaine prochaine." };
  return { ok: true };
}

function markAdventureVisited(
  state: Record<string, unknown>,
  frequency: string,
  heroId: string,
  playerId: string,
  turnNumber: number,
  consumed: boolean,
) {
  const week = Math.floor((turnNumber - 1) / 7) + 1;
  const next = { ...state };
  const heroVisits = { ...((next.heroVisits ?? {}) as Record<string, number>) };
  const playerVisits = { ...((next.playerVisits ?? {}) as Record<string, number>) };
  if (frequency === "once") next.visited = true;
  if (frequency === "once_per_hero" || frequency === "daily") heroVisits[heroId] = turnNumber;
  if (frequency === "once_per_player") playerVisits[playerId] = turnNumber;
  if (frequency === "weekly") playerVisits[playerId] = week;
  next.heroVisits = heroVisits;
  next.playerVisits = playerVisits;
  if (consumed) next.consumed = true;
  return next;
}

const RESOURCE_KEYS = ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"] as const;

function resolveResourceReward(resources: Partial<Resources>, randomResource?: boolean): Partial<Resources> {
  if (!randomResource) return resources;
  const keys = RESOURCE_KEYS.filter((key) => key !== "gold" && key !== "wood" && resources[key] === undefined);
  const picked = keys[0] ?? "ore";
  return { ...resources, [picked]: 4 };
}

function pickRewardResources(reward: Partial<Resources>): Partial<Resources> {
  return Object.fromEntries(
    RESOURCE_KEYS.map((key) => [key, reward[key]])
      .filter(([, amount]) => typeof amount === "number" && amount > 0),
  ) as Partial<Resources>;
}

async function addPlayerResources(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
  resources: Partial<Resources>,
) {
  const player = await getGameRowForPlayer(supabase, playerId);
  if (!player) return;
  const patch = Object.fromEntries(
    Object.entries(resources).map(([key, amount]) => [key, Number(player[key] ?? 0) + Number(amount ?? 0)]),
  );
  if (Object.keys(patch).length > 0) await supabase.from("game_players").update(patch).eq("id", playerId);
}

function formatResourceReward(resources: Partial<Resources>) {
  const parts = Object.entries(resources)
    .filter(([, amount]) => Number(amount ?? 0) > 0)
    .map(([key, amount]) => `+${amount} ${key}`);
  return parts.length > 0 ? parts.join(", ") : "Ressources obtenues.";
}

function formatHeroStat(stat: string) {
  if (stat === "attack") return "attaque";
  if (stat === "defense") return "defense";
  if (stat === "spellPower") return "puissance";
  return "savoir";
}

async function grantArtifact(supabase: ReturnType<typeof createAdminClient>, heroId: string, artifactType: string) {
  await supabase.from("hero_artifacts").insert({
    hero_id: heroId,
    artifact_type: `${artifactType}_${randomUUID().slice(0, 8)}`,
    slot: null,
  });
}

async function addUnitsToHero(
  supabase: ReturnType<typeof createAdminClient>,
  hero: MinimalHero,
  unitType: UnitType,
  count: number,
) {
  const rule = UNIT_RULES[unitType];
  const existing = hero.armies.find((army) => army.unitType === unitType);
  if (existing) {
    const nextCount = existing.count + count;
    await supabase.from("armies").update({
      count: nextCount,
      health: existing.health + rule.health * count,
    }).eq("id", existing.id);
    return;
  }

  await supabase.from("armies").insert({
    hero_id: hero.id,
    unit_type: unitType,
    count,
    health: rule.health * count,
    max_health: rule.health,
    position: hero.armies.length,
  });
}

async function revealForPlayer(
  supabase: ReturnType<typeof createAdminClient>,
  player: MinimalPlayer,
  map: GameMap,
  hero: MinimalHero,
  effect: Extract<AdventureEffect, { type: "reveal" }>,
) {
  const explored = new Set(player.exploredTiles ?? []);
  if (effect.mode === "radius") {
    const visible = computeVisibleTiles(map, [{ x: hero.x, y: hero.y }], effect.radius ?? 8);
    for (const key of visible) explored.add(key);
  } else {
    for (const row of map.tiles) {
      for (const tile of row) {
        if (effect.mode === "water" && tile.terrain !== "water") continue;
        explored.add(`${tile.x},${tile.y}`);
      }
    }
  }
  await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", player.id);
}

async function resolveTransport(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  adventure: MinimalAdventureObject,
  mode: string,
): Promise<Position | null> {
  if (mode !== "teleport" && mode !== "subterranean" && mode !== "whirlpool") return null;
  const { data } = await supabase
    .from("adventure_objects")
    .select("id,x,y,object_type")
    .eq("game_id", gameId)
    .eq("object_type", adventure.objectType);
  const other = (data ?? []).find((item) => item.id !== adventure.id);
  return other ? { x: other.x, y: other.y } : null;
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
  for (const player of alivePlayers) {
    let goldIncome = 500, woodIncome = 2, oreIncome = 1;
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

    await supabase.from("game_players").update({
      gold: player.gold + goldIncome,
      wood: player.wood + woodIncome,
      ore: player.ore + oreIncome,
      mercury: player.mercury + mercuryIncome,
      crystals: player.crystals + crystalsIncome,
      gems: (player.gems ?? 0) + gemsIncome,
      sulfur: player.sulfur + sulfurIncome,
    }).eq("id", player.id);
    await supabase.from("heroes").update({ movement: 10 }).eq("game_player_id", player.id);

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

function findFirstMoveStop({
  path,
  map,
  movingHeroId,
  movingPlayerId,
  players,
  collected,
  killed,
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

function getPathMovementCost(map: GameMap, path: Position[]) {
  return path.slice(1).reduce((total, position) => {
    const tile = map.tiles[position.y]?.[position.x];
    return total + (tile?.movementCost ?? 1);
  }, 0);
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
    if (Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y) !== 1) {
      return { ok: false, error: "Chemin invalide" };
    }
    const tile = map.tiles[current.y]?.[current.x];
    if (!isTileTraversable(tile)) return { ok: false, error: "Terrain infranchissable" };
    usedMovement += tile.movementCost;
  }
  if (usedMovement > movement) return { ok: false, error: "Deplacement insuffisant" };
  return { ok: true, usedMovement };
}
