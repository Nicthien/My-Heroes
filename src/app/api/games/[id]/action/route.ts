import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCurrentUser } from "@/lib/auth";
import {
  UNIT_RULES,
  getFactionBuildingRules,
  subtractCost,
  tierForUnit,
} from "@/lib/game/economy";
import { createCampfireReward, addVisit, hasPlayerVisited, getAdventureBuildingLabel, isSingleMapRewardBuilding } from "@/lib/game/adventure-buildings";
import { isCreatureBankType, PendingCreatureBankReward } from "@/lib/game/creature-banks";
import {
  createExternalDwellingState,
  getExternalDwellingLabel,
  isExternalDwellingType,
  normalizeExternalDwellingState,
  type ExternalDwellingStateMap,
} from "@/lib/game/external-dwellings";
import { calculateArmyPower } from "@/lib/game/combat/autoResolve";
import {
  HERO_ARMY_STACK_LIMIT,
  UNIT_STACK_COUNT_CAP,
  addUnitsToStacks,
  sortedStacks,
} from "@/lib/game/army-stacks";
import { getCreature } from "@/lib/game/creature-catalog";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { makeRng } from "@/lib/game/engine/rng";
import {
  ARTIFACT_SLOTS,
  getArtifact,
  getEffectiveHeroStatsFromValues,
  normalizeArtifactBag,
  pickArtifactId,
  type ArtifactSlot,
} from "@/lib/game/artifacts";
import { AdventureBuildingType, BuildingType, Faction, GameMap, MapObject, Position, Resources, UnitType } from "@/lib/game/types";
import { normalizeMapLevel, SURFACE_LEVEL, withActiveMapLayer } from "@/lib/game/map-levels";
import {
  canMoveAdventureStep,
  computeExtraHeroScoutingTiles,
  computeExtraTownVisionTiles,
  computeVisibleTiles,
  getAdventurePathCost,
  getAdventureStepCost,
  getPlayerVisionCenters,
  getRequiredAdventureMovement,
  getUsableAdventureMovement,
  isTileTraversable,
  normalizeMapMovement,
} from "@/lib/game/engine";
import { isTownCoastalForBoats } from "@/lib/game/engine/town-coast";
import { createNeutralArmyStacksForTile } from "@/lib/game/neutral-armies";
import { createNeutralTownGarrison } from "@/lib/game/neutral-towns";
import { getUnitRule } from "@/lib/game/units";
import { SPELLS, getHeroMana, type SpellId } from "@/lib/game/spells";
import { isFaction, pickTownFactionForTerrain, pickTownName } from "@/lib/game/town-generation";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { buildActionLogInput, recordGameAction } from "@/lib/game/server/action-log";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";
import { handleAdventureAction } from "./adventureActions";
import { handleArmyAction } from "./armyActions";
import { handleArtifactAction } from "./artifactActions";
import { handleBoatAction } from "./boatActions";
import { handleCaptureAction } from "./captureActions";
import { handleDevAction } from "./devActions";
import { handleEconomyAction } from "./economyActions";
import { handleGarrisonAction } from "./garrisonActions";
import { handleRewardAction } from "./rewardActions";
import { handleSkillAction } from "./skillActions";
import { handleTownAction } from "./townActions";
import { handleTurnAction } from "./turnActions";
import type {
  CaptureTownRow,
  HeroStatKey,
  MinimalArmy,
  MinimalBoat,
  MinimalBuilding,
  MinimalGate,
  MinimalHero,
  MinimalPlayer,
  MinimalTown,
  MinimalTurn,
  MoveInteraction,
  SupabaseAdminClient,
} from "./types";

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

const HERO_IN_COMBAT_ERROR = "Ce héros est déjà engagé dans un combat.";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireCurrentUser(request);
    if (!user) return response;
    if (user.role === "admin") {
      return NextResponse.json({ error: "Un administrateur peut seulement consulter la partie." }, { status: 403 });
    }

    const { id } = await params;
    const action = await request.json();
    const supabase = createAdminClient();
    const gamePlayer = await getGamePlayer(supabase, id, user.id) as unknown as MinimalPlayer | null;
    const game = await getGameWithRelations(supabase, id);

    if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
    if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
    if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });
    if (!gamePlayer.isAlive) return NextResponse.json({ error: "Vous avez perdu cette partie" }, { status: 403 });

    const devResponse = await handleDevAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      getActionPosition,
      getLatestMapState,
      logPlayerAction,
      updatePlayerResources,
    });
    if (devResponse) return devResponse;

    const players = game.players as unknown as Array<{
      id: string;
      isAlive: boolean;
      turnOrder: number;
      resourceBuildings: MinimalBuilding[];
      towns: MinimalTown[];
      heroes?: MinimalHero[];
    }>;
    const gates = (game.gates ?? []) as unknown as MinimalGate[];
    const boats = (game.boats ?? []) as unknown as MinimalBoat[];
    const turns = game.turns as MinimalTurn[];
    const completedTurn = turns.find((turn) =>
      turn.gamePlayerId === gamePlayer.id && turn.turnNumber === game.turnNumber && turn.isCompleted
    );
    if (completedTurn && action.type !== "END_TURN" && action.type !== "CANCEL_END_TURN") {
      return NextResponse.json({ error: "Vous avez déjà terminé votre tour" }, { status: 403 });
    }

    const artifactResponse = await handleArtifactAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      addArtifactToBag,
      canTransferArtifactsBetweenHeroes,
      equipHeroArtifact,
      getActionPosition,
      logPlayerAction,
      transferHeroArtifact,
      unequipHeroArtifact,
      validateAndApplyArtifactApproach,
    });
    if (artifactResponse) return artifactResponse;

    if (action.type === "MOVE_HERO") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });

      const fullMapData = normalizeMapMovement(game.mapData as GameMap);
      const heroMapLevel = normalizeMapLevel(hero.mapLevel);
      const mapData = withActiveMapLayer(fullMapData, heroMapLevel);
      const effectiveGates = getEffectiveGates(gates, mapData);
      if (isHeroInActiveCombat(game.combats, hero.id)) {
        return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      }
      const validation = validateMovePath(mapData, { x: hero.x, y: hero.y }, action.path, hero.movement);
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

      const mapState = (game.mapState as Record<string, unknown>) ?? {};
      const collected = new Set<string>((mapState.collected as string[]) ?? []);
      const killed = new Set<string>((mapState.killed as string[]) ?? []);
      const visitedAdventureBuildings = new Set<string>((mapState.visitedAdventureBuildings as string[]) ?? []);
      const defeatedCreatureBanks = getDefeatedCreatureBanks(mapState);
      for (const army of ((game.neutralArmies ?? []) as Array<{ id: string; status: string }>)) {
        if (army.status !== "ACTIVE") killed.add(army.id);
      }
      const firstStop = findFirstMoveStop({
        path: action.path,
        map: mapData,
        movingHeroId: hero.id,
        movingPlayerId: gamePlayer.id,
        players,
        gates: effectiveGates,
        collected,
        killed,
        visitedAdventureBuildings,
        defeatedCreatureBanks,
      });
      if (firstStop?.hero && isHeroInActiveCombat(game.combats, firstStop.hero.id)) {
        return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      }
      const stopPathIndex = firstStop?.stopBefore ? Math.max(0, firstStop.pathIndex - 1) : firstStop?.pathIndex;
      const movePath = typeof stopPathIndex === "number" ? action.path.slice(0, stopPathIndex + 1) : action.path;
      const usedMovement = getPathMovementCost(mapData, movePath, (hero as unknown as { skills?: Record<string, string> }).skills);
      const lastPos = movePath[movePath.length - 1];
      const { error: heroUpdateError } = await supabase.from("heroes").update({
        x: lastPos.x,
        y: lastPos.y,
        movement: getUsableAdventureMovement(mapData, lastPos, hero.movement - usedMovement),
      }).eq("id", hero.id);
      if (heroUpdateError) {
        console.error("heroes.update failed:", heroUpdateError, { heroId: hero.id, x: lastPos.x, y: lastPos.y, movement: hero.movement, used: usedMovement });
        return NextResponse.json({ error: `Erreur mise à jour héros: ${heroUpdateError.message}` }, { status: 500 });
      }

      const movedHeroes: MinimalHero[] = gamePlayer.heroes.map((item) =>
        item.id === hero.id ? { ...hero, x: lastPos.x, y: lastPos.y, mapLevel: heroMapLevel } : item
      );
      const newlyVisible = computeVisibleTiles(
        mapData,
        getPlayerVisionCenters({
          heroes: movedHeroes.filter((h) => normalizeMapLevel(h.mapLevel) === heroMapLevel).map((h) => ({ position: { x: h.x, y: h.y } })),
          towns: gamePlayer.towns.filter((town) => normalizeMapLevel((town as MinimalTown & { mapLevel?: string | null }).mapLevel) === heroMapLevel).map((town) => ({ position: { x: town.x, y: town.y } })),
        }),
        5
      );
      const currentlyVisible = computeVisibleTiles(
        mapData,
        getPlayerVisionCenters({
          heroes: gamePlayer.heroes.filter((h) => normalizeMapLevel(h.mapLevel) === heroMapLevel).map((h) => ({ position: { x: h.x, y: h.y } })),
          towns: gamePlayer.towns.filter((town) => normalizeMapLevel((town as MinimalTown & { mapLevel?: string | null }).mapLevel) === heroMapLevel).map((town) => ({ position: { x: town.x, y: town.y } })),
        }),
        5
      );
      const watchTowerVision = computeExtraTownVisionTiles(
        mapData,
        gamePlayer.towns.filter((t) => normalizeMapLevel((t as MinimalTown & { mapLevel?: string | null }).mapLevel) === heroMapLevel).map((t) => ({ position: { x: t.x, y: t.y }, townType: t.townType, buildings: t.buildings })),
        9
      );
      const heroScouting = computeExtraHeroScoutingTiles(
        mapData,
        movedHeroes.filter((h) => normalizeMapLevel(h.mapLevel) === heroMapLevel).map((h) => ({ position: { x: h.x, y: h.y }, skills: ((h as unknown as { skills?: Partial<Record<string, "basic" | "advanced" | "expert">> }).skills) })),
        5
      );
      const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
      for (const key of currentlyVisible) explored.add(key.includes(":") ? key : `${heroMapLevel}:${key}`);
      for (const key of newlyVisible) explored.add(key.includes(":") ? key : `${heroMapLevel}:${key}`);
      for (const key of watchTowerVision) explored.add(key.includes(":") ? key : `${heroMapLevel}:${key}`);
      for (const key of heroScouting) explored.add(key.includes(":") ? key : `${heroMapLevel}:${key}`);
      await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);

      const tile = mapData.tiles?.[lastPos.y]?.[lastPos.x];
      const stopObject = firstStop?.object;
      const stopTargetPosition = firstStop?.targetPosition;
      let interaction: MoveInteraction | null = null;

      if (tile?.object?.type === "adventure_building" && tile.object.subtype === AdventureBuildingType.SUBTERRANEAN_GATE) {
        const targetLevel = normalizeMapLevel(tile.object.targetLevel);
        const target = tile.object.targetPosition;
        const targetMap = withActiveMapLayer(fullMapData, targetLevel);
        const targetTile = target ? targetMap.tiles[target.y]?.[target.x] : undefined;
        if (!target || !targetTile?.isPassable) {
          interaction = { type: "STOP", message: "Juste à l'entrée, un amas de gravats bloque le tunnel. Vous repartez découragé.", destination: lastPos };
        } else {
          const nextMovement = getUsableAdventureMovement(targetMap, target, hero.movement - usedMovement);
          const { error: levelMoveError } = await supabase.from("heroes").update({
            x: target.x,
            y: target.y,
            map_level: targetLevel,
            movement: nextMovement,
          }).eq("id", hero.id);
          if (levelMoveError) return NextResponse.json({ error: `Erreur mise à jour héros: ${levelMoveError.message}` }, { status: 500 });
          for (const key of computeVisibleTiles(targetMap, [{ x: target.x, y: target.y }], 5)) {
            explored.add(key.includes(":") ? key : `${targetLevel}:${key}`);
          }
          await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
          interaction = {
            type: "TELEPORT",
            buildingType: "subterranean_gate",
            from: { x: lastPos.x, y: lastPos.y, level: heroMapLevel },
            to: { x: target.x, y: target.y, level: targetLevel },
            destination: { x: target.x, y: target.y, level: targetLevel },
            message: targetLevel === "underground" ? "Vous descendez dans le souterrain." : "Vous remontez à la surface.",
          };
        }
        await logPlayerAction(supabase, game, id, gamePlayer, action);
        return NextResponse.json({ success: true, interaction, path: movePath, stoppedAt: lastPos });
      }

      if (tile?.object?.type === "resource" && !collected.has(tile.object.id)) {
        collected.add(tile.object.id);
        const resourceType = tile.object.subtype ?? "gold";
        const amount = getResourcePileAmount(tile.object);
        await incrementPlayerResource(supabase, gamePlayer.id, resourceType, amount);
        await supabase.from("games").update({ map_state: { ...mapState, collected: Array.from(collected) } }).eq("id", id);
        interaction = { type: "COLLECT", resource: resourceType, amount, gold: resourceType === "gold" ? amount : undefined, destination: lastPos };
        await logPlayerAction(supabase, game, id, gamePlayer, {
          type: "COLLECT_RESOURCE",
          heroId: hero.id,
          resource: resourceType,
          amount,
          position: lastPos,
        });
      }

      if (firstStop?.hero) {
        if (firstStop.hero.playerId === gamePlayer.id) {
          interaction = { type: "STOP", message: "Un de vos héros bloque le chemin.", destination: lastPos };
        } else {
          interaction = { type: "COMBAT", targetId: firstStop.hero.id, targetType: "hero", destination: lastPos, targetPosition: stopTargetPosition };
        }
      } else if (stopObject?.type === "monster" && stopTargetPosition && !killed.has(stopObject.id)) {
        const diplomacy = await resolveDiplomacyOnMonster({
          supabase,
          gameId: id,
          gamePlayerId: gamePlayer.id,
          playerFaction: gamePlayer.faction,
          playerGold: gamePlayer.gold,
          heroId: hero.id,
          monsterId: stopObject.id,
          neutralArmies: (game.neutralArmies ?? []) as Array<{ id: string; status: string; stacks?: Array<{ unitType: UnitType; count: number }> }>,
          killedSet: killed,
          mapState,
        });
        if (diplomacy?.outcome === "flee") {
          await supabase.from("games").update({ map_state: { ...mapState, killed: Array.from(killed) } }).eq("id", id);
          interaction = { type: "STOP", message: `Diplomatie : l'armée neutre s'enfuit.`, destination: lastPos };
        } else if (diplomacy?.outcome === "join") {
          await supabase.from("games").update({ map_state: { ...mapState, killed: Array.from(killed) } }).eq("id", id);
          const costText = diplomacy.goldCost ? ` pour ${diplomacy.goldCost} or` : "";
          const spaceText = diplomacy.remainder ? ` ${diplomacy.remainder} unités n'ont pas pu rejoindre faute de place.` : "";
          interaction = { type: "STOP", message: `Diplomatie : l'armée se joint à vous (${diplomacy.joinedCount} unités${costText}).${spaceText}`, destination: lastPos };
        } else {
          interaction = { type: "COMBAT", targetId: stopObject.id, targetType: "monster", destination: lastPos, targetPosition: stopTargetPosition };
        }
      } else if (stopObject?.type === "gate" && stopTargetPosition) {
        const gate = findGate(effectiveGates, stopObject.id, stopTargetPosition);
        if (gate && gate.gamePlayerId !== gamePlayer.id && (gate.garrison?.length ?? 0) > 0) {
          interaction = { type: "COMBAT", targetId: gate.id, targetType: "gate", destination: lastPos, targetPosition: stopTargetPosition };
        }
      } else if (tile?.object?.type === "monster" && !killed.has(tile.object.id)) {
        interaction = { type: "COMBAT", targetId: tile.object.id, targetType: "monster", destination: lastPos };
      } else if (stopObject?.type === "artifact" && stopTargetPosition) {
        const defeatedArtifacts = new Set<string>((mapState.defeatedArtifacts as string[]) ?? []);
        if (Number(stopObject.guardianPower ?? 0) > 0 && !defeatedArtifacts.has(stopObject.id)) {
          interaction = { type: "COMBAT", targetId: stopObject.id, targetType: "artifact", destination: lastPos, targetPosition: stopTargetPosition };
        } else {
          interaction = { type: "STOP", message: "Artefact à portée.", destination: lastPos };
        }
      } else if (tile?.object?.type === "artifact") {
        interaction = { type: "STOP", message: "Artefact atteint.", destination: lastPos };
      } else if (tile?.object?.type === "building" || (stopObject?.type === "building" && stopTargetPosition)) {
        const buildingObject = (stopObject?.type === "building" ? stopObject : tile?.object)!;
        const buildingPosition = stopTargetPosition ?? lastPos;
        const building = players.flatMap((player) => player.resourceBuildings)
          .find((item) => item.id === buildingObject.id || (item.x === buildingPosition.x && item.y === buildingPosition.y))
          ?? await getResourceBuilding(supabase, id, buildingObject.id);
        const owner = findResourceBuildingOwner(players, buildingObject, buildingPosition);
        const guardianPower = Number(building?.guardianPower ?? buildingObject.guardianPower ?? 0);
        if (owner?.id === gamePlayer.id) {
          interaction = null;
        } else if (guardianPower > 0) {
          interaction = { type: "COMBAT", targetId: buildingObject.id, targetType: "building", destination: lastPos, targetPosition: buildingPosition };
        } else if (building) {
          await supabase.from("resource_buildings").update({ game_player_id: gamePlayer.id, guardian_power: 0 }).eq("id", building.id);
          interaction = { type: "CAPTURE_BUILDING", buildingType: building.buildingType, destination: lastPos };
        }
      } else if (stopObject?.type === "adventure_building" && isCreatureBankType(stopObject.subtype) && stopTargetPosition && !defeatedCreatureBanks.has(stopObject.id)) {
        interaction = { type: "COMBAT", targetId: stopObject.id, targetType: "creature_bank", destination: lastPos, targetPosition: stopTargetPosition };
      } else if (tile?.object?.type === "adventure_building" && isCreatureBankType(tile.object.subtype) && !defeatedCreatureBanks.has(tile.object.id)) {
        interaction = { type: "COMBAT", targetId: tile.object.id, targetType: "creature_bank", destination: lastPos, targetPosition: lastPos };
      } else if (tile?.object?.type === "adventure_building" && !visitedAdventureBuildings.has(tile.object.id)) {
        interaction = await handleAdventureBuildingVisit({
          supabase,
          gameId: id,
          gamePlayer,
          hero,
          turnNumber: Number(game.turnNumber ?? 1),
          mapData,
          mapState,
          object: tile.object,
          position: lastPos,
          explored,
        });
      }

      if (tile?.object?.type === "gate") {
        const gate = findGate(effectiveGates, tile.object.id, lastPos);
        if (gate && gate.gamePlayerId !== gamePlayer.id) {
          const hasGarrison = (gate.garrison ?? []).some((unit) => unit.count > 0);
          if (hasGarrison) {
            interaction = { type: "COMBAT", targetId: gate.id, targetType: "gate", destination: lastPos, targetPosition: lastPos };
          } else {
            await captureGate(supabase, id, gate, gamePlayer.id);
            interaction = { type: "CAPTURE_GATE", gateId: gate.id, destination: lastPos };
          }
        } else if (gate && gate.gamePlayerId === gamePlayer.id) {
          interaction = { type: "CAPTURE_GATE", gateId: gate.id, destination: lastPos };
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
            await applyHeroExperienceGain(supabase, id, hero.id, hero.experience + 250);
            await evaluateGameLifecycle(supabase, id);
            interaction = { type: "CAPTURE_TOWN", destination: lastPos };
          }
        }
      }

      const ownTown = gamePlayer.towns.find((t) => t.x === lastPos.x && t.y === lastPos.y);
      if (ownTown) {
        await applyOwnTownVisitBonuses({
          supabase,
          gameId: id,
          mapState: (game.mapState as Record<string, unknown>) ?? {},
          hero: { ...hero, x: lastPos.x, y: lastPos.y, movement: hero.movement - usedMovement },
          town: ownTown,
          playerFaction: (gamePlayer.faction ?? Faction.CASTLE) as Faction,
          turnNumber: Number(game.turnNumber ?? 1),
        });
      }

      return NextResponse.json({ success: true, interaction, path: movePath, stoppedAt: firstStop ? lastPos : null });
    }

    const boatResponse = await handleBoatAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      boats,
      players,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        areAdjacentOrSame,
        getActionPosition,
        isOccupiedByAnyHero,
        logPlayerAction,
        playerResources,
      },
    });
    if (boatResponse) return boatResponse;

    const adventureResponse = await handleAdventureAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      players,
      boats,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        applyAdventureSpell,
        areAdjacentOrSame,
        findAdventureBuildingById,
        handleAdventureBuildingVisit,
        logPlayerAction,
        normalizeHeroStatChoice,
      },
    });
    if (adventureResponse) return adventureResponse;

    const captureResponse = await handleCaptureAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      players,
      gates,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        areAdjacentOrSame,
        captureGate,
        createNeutralTownForMapTile,
        ensureNeutralTownGarrison,
        findTownForCapture,
        getActionPathDestination,
        getActionPosition,
        getEffectiveGates,
        getResourceBuilding,
        logPlayerAction,
        validateAndApplyActionPath,
      },
    });
    if (captureResponse) return captureResponse;

    const townResponse = await handleTownAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      helpers: {
        addRecruitGrowth,
        applyOwnTownVisitBonuses,
        getArtifactMerchantBuilding,
        isMissingSpellSchemaError,
        isTownCoastalForBoats,
        logPlayerAction,
        playerResources,
        rollMageGuildSpells,
        rollMageGuildSpellsForLevel,
        rollTownArtifactOffer,
      },
    });
    if (townResponse) return townResponse;

    const armyResponse = await handleArmyAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      heroInCombatError: HERO_IN_COMBAT_ERROR,
      helpers: {
        addUnitsToHeroArmy,
        addUnitsToStackList,
        logPlayerAction,
        persistHeroArmyDiff,
        playerResources,
        removeUnitsFromHeroArmy,
        removeUnitsFromStackList,
        updatePlayerResources,
      },
    });
    if (armyResponse) return armyResponse;

    const rewardResponse = await handleRewardAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      helpers: {
        addUnitsToHeroArmy,
        getCreatureBankStateMap,
        getLatestMapState,
        logPlayerAction,
        normalizeCreatureRewardSelection,
        playerResources,
        updatePlayerResources,
      },
    });
    if (rewardResponse) return rewardResponse;

    const garrisonResponse = await handleGarrisonAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      gates,
      action,
      helpers: {
        addUnitsToGateGarrison,
        addUnitsToHeroArmy,
        addUnitsToStackList,
        areAdjacentOrSame,
        compactGateStackPositions,
        logPlayerAction,
        removeUnitsFromHeroArmy,
        removeUnitsFromStackList,
      },
    });
    if (garrisonResponse) return garrisonResponse;

    const economyResponse = await handleEconomyAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      helpers: {
        addArtifactToBag,
        getArtifactMerchantBuilding,
        logPlayerAction,
        playerResources,
        removeUnitsFromStackList,
        updatePlayerResources,
      },
    });
    if (economyResponse) return economyResponse;

    const skillResponse = await handleSkillAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      helpers: {
        logPlayerAction,
        updatePlayerResources,
      },
    });
    if (skillResponse) return skillResponse;

    const turnResponse = await handleTurnAction({
      supabase,
      game,
      gameId: id,
      gamePlayer,
      action,
      logPlayerAction,
    });
    if (turnResponse) return turnResponse;

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

async function logPlayerAction(
  supabase: SupabaseAdminClient,
  game: { turnNumber?: unknown },
  gameId: string,
  gamePlayer: MinimalPlayer,
  action: Record<string, unknown>,
) {
  const actorName = gamePlayer.isAi ? gamePlayer.aiName || "IA" : gamePlayer.user?.name || "Joueur";
  await recordGameAction(supabase, buildActionLogInput({
    gameId,
    gamePlayerId: gamePlayer.id,
    actorKind: gamePlayer.isAi ? "ai" : "player",
    turnNumber: Number(game.turnNumber ?? 0),
    actorName,
    action: action as never,
  }));
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

function addRecruitGrowth(
  availableRecruits: Record<string, number>,
  growth: Partial<Record<UnitType, number>>,
) {
  const next = { ...availableRecruits };
  for (const [unitType, amount] of Object.entries(growth)) {
    const count = Math.floor(Number(amount ?? 0));
    if (count <= 0) continue;
    next[unitType] = Math.max(0, Math.floor(Number(next[unitType] ?? 0))) + count;
  }
  return next;
}

function addUnitsToStackList(stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) {
  return addUnitsToStacks(
    stacks,
    unitType,
    count,
    maxHealth,
    () => randomUUID(),
    Math.max(HERO_ARMY_STACK_LIMIT, stacks.length + Math.ceil(count / UNIT_STACK_COUNT_CAP)),
  ).stacks;
}

function removeUnitsFromStackList(stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) {
  let remaining = Math.max(0, Math.floor(count));
  return stacks
    .map((unit) => {
      if (unit.unitType !== unitType || remaining <= 0) return unit;
      const removed = Math.min(unit.count, remaining);
      remaining -= removed;
      return { ...unit, count: unit.count - removed, health: Math.max(0, unit.health - maxHealth * removed) };
    })
    .filter((unit) => unit.count > 0)
    .map((unit, position) => ({ ...unit, position }));
}

function findGate(gates: MinimalGate[], gateId: string, position: Position) {
  return gates.find((gate) =>
    gate.id === gateId || (gate.x === position.x && gate.y === position.y)
  );
}

function getEffectiveGates(gates: MinimalGate[], mapData: GameMap) {
  const byId = new Map(gates.map((gate) => [gate.id, gate]));
  const byPosition = new Map(gates.map((gate) => [`${gate.x},${gate.y}`, gate]));

  for (const row of mapData.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (object?.type !== "gate") continue;
      const key = `${tile.x},${tile.y}`;
      if (byId.has(object.id) || byPosition.has(key)) continue;

      const garrison = createNeutralArmyStacksForTile(tile, object.guardianPower ?? 100, object.id)
        .map((stack): MinimalArmy => ({
          id: `${object.id}-stack-${stack.position}`,
          unitType: stack.unitType,
          count: stack.count,
          health: stack.health,
          maxHealth: stack.maxHealth,
          position: stack.position,
        }));
      const gate: MinimalGate = {
        id: object.id,
        gamePlayerId: object.ownerId ?? null,
        x: tile.x,
        y: tile.y,
        guardianPower: object.guardianPower ?? 0,
        garrison,
      };
      byId.set(gate.id, gate);
      byPosition.set(key, gate);
    }
  }

  return [...byId.values()];
}

function areAdjacentOrSame(a: Position, b: Position) {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

function adjacentPositions(position: Position): Position[] {
  const positions: Position[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      positions.push({ x: position.x + dx, y: position.y + dy });
    }
  }
  return positions;
}

function findFreeAdjacentWaterTile(map: GameMap, position: Position, boats: MinimalBoat[]) {
  const occupied = new Set(boats.filter((boat) => !boat.heroId && normalizeMapLevel(boat.mapLevel) === SURFACE_LEVEL).map((boat) => `${boat.x},${boat.y}`));
  return adjacentPositions(position).find((candidate) => {
    const tile = map.tiles[candidate.y]?.[candidate.x];
    return tile?.terrain === "water" && isTileTraversable(tile) && !occupied.has(`${candidate.x},${candidate.y}`);
  }) ?? null;
}

function findNearestEmptyBoat(boats: MinimalBoat[], position: Position) {
  return boats
    .filter((boat) => !boat.heroId && normalizeMapLevel(boat.mapLevel) === SURFACE_LEVEL)
    .sort((a, b) =>
      Math.max(Math.abs(a.x - position.x), Math.abs(a.y - position.y)) -
      Math.max(Math.abs(b.x - position.x), Math.abs(b.y - position.y))
    )[0] ?? null;
}

function isOccupiedByAnyHero(players: Array<{ heroes?: MinimalHero[] }>, movingHeroId: string, destination: Position) {
  return players.some((player) => (player.heroes ?? []).some((hero) =>
    hero.id !== movingHeroId && hero.x === destination.x && hero.y === destination.y
  ));
}

async function captureGate(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  gate: MinimalGate,
  playerId: string,
) {
  await supabase
    .from("gates")
    .upsert({
      id: gate.id,
      game_id: gameId,
      game_player_id: playerId,
      x: gate.x,
      y: gate.y,
      guardian_power: 0,
    }, { onConflict: "id" });
  await supabase.from("gate_stacks").delete().eq("gate_id", gate.id);
}

async function addUnitsToHeroArmy(
  supabase: ReturnType<typeof createAdminClient>,
  hero: MinimalHero,
  unitType: UnitType,
  count: number,
  maxHealth: number,
) {
  const { data } = await supabase
    .from("armies")
    .select("id,unit_type,count,health,max_health,position")
    .eq("hero_id", hero.id)
    .order("position", { ascending: true });
  const current = sortedStacks(
    ((data ?? []) as Array<{ id: string; unit_type: UnitType; count: number; health: number; max_health: number; position: number }>)
      .map((stack) => ({
        id: stack.id,
        unitType: stack.unit_type,
        count: Number(stack.count ?? 0),
        health: Number(stack.health ?? 0),
        maxHealth: Number(stack.max_health ?? maxHealth),
        position: Number(stack.position ?? 0),
      }))
  );
  const next = addUnitsToStacks(current, unitType, count, maxHealth, () => randomUUID()).stacks;
  await persistHeroArmyDiff(supabase, hero.id, current, next);
}

async function removeUnitsFromHeroArmy(
  supabase: ReturnType<typeof createAdminClient>,
  source: MinimalArmy,
  count: number,
  maxHealth: number,
) {
  if (source.count === count) {
    await supabase.from("armies").delete().eq("id", source.id);
    return;
  }

  await supabase.from("armies").update({
    count: source.count - count,
    health: Math.max(0, source.health - maxHealth * count),
  }).eq("id", source.id);
}

async function persistHeroArmyDiff(
  supabase: ReturnType<typeof createAdminClient>,
  heroId: string,
  before: MinimalArmy[],
  after: MinimalArmy[],
) {
  const afterById = new Map(after.map((stack) => [stack.id, stack]));
  for (const stack of before) {
    if (!afterById.has(stack.id)) {
      await supabase.from("armies").delete().eq("id", stack.id).eq("hero_id", heroId);
    }
  }

  const beforeIds = new Set(before.map((stack) => stack.id));
  for (const stack of after) {
    if (beforeIds.has(stack.id)) {
      await supabase.from("armies").update({
        unit_type: stack.unitType,
        count: stack.count,
        health: stack.health,
        max_health: stack.maxHealth,
        position: stack.position,
      }).eq("id", stack.id).eq("hero_id", heroId);
    } else {
      await supabase.from("armies").insert({
        id: stack.id,
        hero_id: heroId,
        unit_type: stack.unitType,
        count: stack.count,
        health: stack.health,
        max_health: stack.maxHealth,
        position: stack.position,
      });
    }
  }
}

async function addUnitsToGateGarrison(
  supabase: ReturnType<typeof createAdminClient>,
  gate: MinimalGate,
  unitType: UnitType,
  count: number,
  maxHealth: number,
) {
  const existing = (gate.garrison ?? []).find((unit) => unit.unitType === unitType);
  if (existing) {
    await supabase.from("gate_stacks").update({
      count: existing.count + count,
      health: existing.health + maxHealth * count,
    }).eq("id", existing.id);
    return;
  }

  await supabase.from("gate_stacks").insert({
    gate_id: gate.id,
    unit_type: unitType,
    count,
    health: maxHealth * count,
    max_health: maxHealth,
    position: gate.garrison?.length ?? 0,
  });
}

async function compactGateStackPositions(supabase: ReturnType<typeof createAdminClient>, gateId: string) {
  const { data } = await supabase
    .from("gate_stacks")
    .select("id,position")
    .eq("gate_id", gateId)
    .order("position", { ascending: true });
  for (let position = 0; position < (data ?? []).length; position++) {
    const stack = data?.[position];
    if (stack && stack.position !== position) {
      await supabase.from("gate_stacks").update({ position }).eq("id", stack.id);
    }
  }
}

async function incrementPlayerResource(supabase: ReturnType<typeof createAdminClient>, playerId: string, resource: string, amount: number) {
  const game = await getGameRowForPlayer(supabase, playerId);
  if (!game) return;
  const current = Number(game[resource] ?? 0);
  await supabase.from("game_players").update({ [resource]: current + amount }).eq("id", playerId);
}

function getResourcePileAmount(object: MapObject) {
  const amount = Number(object.amount);
  if (Number.isFinite(amount) && amount > 0) return amount;

  switch (object.subtype) {
    case "gold":
      return 500;
    case "wood":
    case "ore":
      return 5;
    case "mercury":
    case "crystals":
    case "gems":
    case "sulfur":
      return 3;
    default:
      return 1;
  }
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
  turnNumber,
  mapData,
  mapState,
  object,
  position,
  explored,
  choice,
}: {
  supabase: ReturnType<typeof createAdminClient>;
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
}): Promise<MoveInteraction> {
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
    const currentWeek = getMysticalGardenWeekKey(turnNumber);
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
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        playerAdventureVisits: addVisit(playerAdventureVisits, gamePlayer.id, object.id),
      },
    }).eq("id", gameId);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Obelisque visite : region revelee." };
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

async function getLatestMapState(
  supabase: SupabaseAdminClient,
  gameId: string,
  fallback: Record<string, unknown>,
) {
  const { data } = await supabase.from("games").select("map_state").eq("id", gameId).maybeSingle();
  return (data?.map_state as Record<string, unknown> | undefined) ?? fallback;
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

function normalizeHeroStatChoice(value: unknown): HeroStatKey | undefined {
  return value === "attack" || value === "defense" || value === "spellPower" || value === "knowledge"
    ? value
    : undefined;
}

function pickShrineSpell(level: number, seed: string) {
  const candidates = SPELLS.filter((spell) => spell.level === level && spell.context === "combat");
  const pool = candidates.length > 0 ? candidates : SPELLS.filter((spell) => spell.level === level);
  return pool[Math.floor(makeRng(seed)() * pool.length)] ?? SPELLS[0];
}

function addKnownSpell(current: string[] | null | undefined, spellId: SpellId) {
  return Array.from(new Set([...(current ?? []), spellId]));
}

function findAdventureBuildingById(map: GameMap, buildingId: string): { object: MapObject; position: Position } | null {
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "adventure_building" && tile.object.id === buildingId) {
        return { object: tile.object, position: { x: tile.x, y: tile.y } };
      }
    }
  }
  return null;
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

function getMysticalGardenWeekKey(turnNumber: number) {
  return getAdventureWeekKey(turnNumber);
}

function getAdventureWeekKey(turnNumber: number) {
  return `week-${Math.max(1, Math.floor((turnNumber - 1) / 7) + 1)}`;
}

function rollMageGuildSpells(seed: string, count: number): string[] {
  const rng = makeRng(seed);
  const pool = SPELLS.filter((s) => s.context === "combat" && s.implemented).map((s) => s.id);
  const picked: string[] = [];
  const remaining = [...pool];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = Math.floor(rng() * remaining.length);
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

function rollMageGuildSpellsForLevel(seed: string, count: number, spellLevel: number): string[] {
  const rng = makeRng(seed);
  const pool = SPELLS.filter((s) => s.implemented && (s.level ?? 1) === spellLevel).map((s) => s.id);
  // Si pas assez de sorts de ce niveau, fallback vers niveaux adjacents
  const fallback = SPELLS.filter((s) => s.implemented).map((s) => s.id);
  const source = pool.length >= count ? pool : [...pool, ...fallback.filter((s) => !pool.includes(s))];
  const picked: string[] = [];
  const remaining = [...source];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = Math.floor(rng() * remaining.length);
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

function rollTownArtifactOffer(seed: string, count: number): string[] {
  const rng = makeRng(seed);
  const tokens = ["random_treasure", "random_minor", "random_minor", "random_major"];
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const token = tokens[i % tokens.length];
    picked.push(pickArtifactId(token, `${seed}:${i}:${rng()}`));
  }
  return picked;
}

function getArtifactMerchantBuilding(faction: Faction): BuildingType | null {
  if (faction === Faction.TOWER) return BuildingType.UNIQUE_4;
  if (faction === Faction.DUNGEON) return BuildingType.UNIQUE_3;
  if (faction === Faction.CONFLUX) return BuildingType.UNIQUE_3;
  return null;
}

async function resolveDiplomacyOnMonster(params: {
  supabase: SupabaseAdminClient;
  gameId: string;
  gamePlayerId: string;
  playerFaction?: string;
  playerGold: number;
  heroId: string;
  monsterId: string;
  neutralArmies: Array<{ id: string; status: string; stacks?: Array<{ unitType: UnitType; count: number }> }>;
  killedSet: Set<string>;
  mapState: Record<string, unknown>;
}): Promise<{ outcome: "flee" | "join"; joinedCount?: number; goldCost?: number; remainder?: number } | null> {
  void params.gameId;
  void params.mapState;
  const army = params.neutralArmies.find((a) => a.id === params.monsterId);
  if (!army || army.status !== "ACTIVE" || !army.stacks?.length) return null;

  const { data: heroRow } = await params.supabase
    .from("heroes")
    .select("attack,defense,morale,luck,skills,armies(*)")
    .eq("id", params.heroId)
    .maybeSingle();
  if (!heroRow) return null;

  const heroArmies = (((heroRow as { armies?: unknown[] }).armies ?? []) as Array<{
    id: string;
    unit_type: UnitType;
    count: number;
    health: number;
    max_health: number;
    position: number;
  }>).map((stack) => ({
    id: stack.id,
    unitType: stack.unit_type,
    count: Number(stack.count ?? 0),
    health: Number(stack.health ?? 0),
    maxHealth: Number(stack.max_health ?? getUnitRule(stack.unit_type).health),
    position: Number(stack.position ?? 0),
  }));
  const diplomacyLevel = getDiplomacyLevel((heroRow?.skills as Record<string, string> | null)?.diplomacy);
  const neutralStacks = army.stacks.map((stack, position) => {
    const rule = getUnitRule(stack.unitType);
    const count = Math.max(0, Number(stack.count ?? 0));
    return {
      id: `${army.id}:${position}`,
      unitType: stack.unitType,
      count,
      health: rule.health * count,
      maxHealth: rule.health,
      position,
    };
  });

  const heroPower = calculateArmyPower({
    id: params.heroId,
    attack: Number((heroRow as { attack?: number }).attack ?? 1),
    defense: Number((heroRow as { defense?: number }).defense ?? 1),
    morale: Number((heroRow as { morale?: number }).morale ?? 0),
    luck: Number((heroRow as { luck?: number }).luck ?? 0),
    armies: heroArmies,
  });
  const neutralPower = calculateArmyPower({ id: army.id, attack: 1, defense: 1, morale: 0, armies: neutralStacks });
  const mood = getNeutralArmyMood(params.monsterId);
  const alignment = getNeutralAlignmentModifier(params.playerFaction, neutralStacks);
  const strengthRatio = heroPower / Math.max(1, neutralPower);
  const moodBonus = NEUTRAL_MOOD_PROFILES[mood].joinModifier;
  const joinThreshold = Math.max(1.12, 2.2 - diplomacyLevel * 0.28 - moodBonus - alignment);
  const fleeThreshold = Math.max(1.35, 2.65 - moodBonus * 0.55 - alignment * 0.35);

  if (diplomacyLevel > 0 && strengthRatio >= joinThreshold) {
    const goldCost = getDiplomacyGoldCost(neutralStacks, diplomacyLevel, mood, alignment);
    if (params.playerGold < goldCost) {
      if (strengthRatio >= fleeThreshold) return markNeutralArmyAsFled(params);
      return null;
    }

    let nextArmies = sortedStacks(heroArmies);
    let joinedCount = 0;
    let remainder = 0;
    for (const stack of neutralStacks) {
      const rule = getUnitRule(stack.unitType);
      const result = addUnitsToStacks(nextArmies, stack.unitType, stack.count, rule.health, () => randomUUID());
      nextArmies = result.stacks;
      joinedCount += result.added;
      remainder += result.remainder;
    }
    if (joinedCount <= 0) return null;
    await persistHeroArmyDiff(params.supabase, params.heroId, sortedStacks(heroArmies), nextArmies);
    if (goldCost > 0) {
      await params.supabase.from("game_players").update({ gold: params.playerGold - goldCost }).eq("id", params.gamePlayerId);
    }
    await params.supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", army.id);
    params.killedSet.add(params.monsterId);
    return { outcome: "join", joinedCount, goldCost, remainder };
  }

  if (strengthRatio >= fleeThreshold) return markNeutralArmyAsFled(params);
  return null;
}

async function markNeutralArmyAsFled(params: {
  supabase: SupabaseAdminClient;
  monsterId: string;
  killedSet: Set<string>;
  neutralArmies: Array<{ id: string; status: string }>;
}): Promise<{ outcome: "flee" }> {
  const army = params.neutralArmies.find((a) => a.id === params.monsterId);
  if (army) await params.supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", army.id);
  params.killedSet.add(params.monsterId);
  return { outcome: "flee" };
}

const NEUTRAL_MOOD_ORDER = ["savage", "hostile", "neutral", "friendly", "compliant"] as const;
type NeutralArmyMood = (typeof NEUTRAL_MOOD_ORDER)[number];

const NEUTRAL_MOOD_PROFILES: Record<NeutralArmyMood, { joinModifier: number; costModifier: number }> = {
  savage: { joinModifier: -0.45, costModifier: 1.35 },
  hostile: { joinModifier: -0.2, costModifier: 1.15 },
  neutral: { joinModifier: 0, costModifier: 1 },
  friendly: { joinModifier: 0.35, costModifier: 0.85 },
  compliant: { joinModifier: 0.65, costModifier: 0.65 },
};

function getDiplomacyLevel(level: string | undefined) {
  if (level === "expert") return 3;
  if (level === "advanced") return 2;
  if (level === "basic") return 1;
  return 0;
}

function getNeutralArmyMood(monsterId: string): NeutralArmyMood {
  return NEUTRAL_MOOD_ORDER[Math.abs(hashString(monsterId)) % NEUTRAL_MOOD_ORDER.length];
}

function getNeutralAlignmentModifier(playerFaction: string | undefined, stacks: MinimalArmy[]) {
  if (!playerFaction) return 0;
  const dominant = [...stacks].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return 0;
  const group = getCreature(dominant.unitType).group;
  if (group === "neutral") return 0.08;
  if (group === playerFaction) return 0.35;
  if ((playerFaction === Faction.NECROPOLIS && group !== "necropolis") || (group === "necropolis" && playerFaction !== Faction.NECROPOLIS)) return -0.3;
  return 0;
}

function getDiplomacyGoldCost(stacks: MinimalArmy[], diplomacyLevel: number, mood: NeutralArmyMood, alignment: number) {
  const value = stacks.reduce((total, stack) => total + getUnitRule(stack.unitType).power * stack.count, 0);
  const diplomacyModifier = diplomacyLevel === 3 ? 0.35 : diplomacyLevel === 2 ? 0.55 : 0.75;
  const alignmentModifier = alignment > 0 ? 0.9 : alignment < 0 ? 1.15 : 1;
  return Math.max(0, Math.ceil(value * diplomacyModifier * NEUTRAL_MOOD_PROFILES[mood].costModifier * alignmentModifier));
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

async function applyOwnTownVisitBonuses({
  supabase,
  gameId,
  mapState,
  hero,
  town,
  playerFaction,
  turnNumber,
}: {
  supabase: SupabaseAdminClient;
  gameId: string;
  mapState: Record<string, unknown>;
  hero: MinimalHero;
  town: MinimalTown;
  playerFaction: Faction;
  turnNumber: number;
}) {
  const buildings = (town.buildings ?? []) as string[];
  if (buildings.length === 0) return;
  const townFaction = ((town.townType ?? playerFaction) as Faction);
  const rules = getFactionBuildingRules(townFaction);

  const heroTownVisits = (mapState.heroTownVisits as Record<string, string[]> | undefined) ?? {};
  const weeklyHeroTownVisits = (mapState.weeklyHeroTownVisits as Record<string, string> | undefined) ?? {};
  const visitedKey = (b: string) => `${town.id}:${b}`;
  const heroVisited = new Set<string>(heroTownVisits[hero.id] ?? []);
  const weekKey = getAdventureWeekKey(turnNumber);

  const heroPatch: Record<string, unknown> = {};
  let attack = Number(hero.attack ?? 0);
  let defense = Number(hero.defense ?? 0);
  let spellPower = Number(hero.spellPower ?? 0);
  let knowledge = Number(hero.knowledge ?? 0);
  let luck = Number(hero.luck ?? 0);
  let movement = Number(hero.movement ?? 0);
  let mana = hero.mana ?? null;
  let manaTouched = false;
  let mutated = false;
  const nextHeroVisited = new Set(heroVisited);
  const nextWeeklyVisits = { ...weeklyHeroTownVisits };

  for (const building of buildings) {
    const rule = rules.find((r) => r.type === building);
    if (!rule) continue;

    if (rule.permanentVisitBonus && !heroVisited.has(visitedKey(building))) {
      const bonus = rule.permanentVisitBonus;
      if (bonus.attack) attack += bonus.attack;
      if (bonus.defense) defense += bonus.defense;
      if (bonus.spellPower) spellPower += bonus.spellPower;
      if (bonus.knowledge) knowledge += bonus.knowledge;
      nextHeroVisited.add(visitedKey(building));
      mutated = true;
    }

    if (rule.weeklyVisitBonus) {
      const visitKey = `${hero.id}:${town.id}:${building}`;
      if (nextWeeklyVisits[visitKey] !== weekKey) {
        const bonus = rule.weeklyVisitBonus;
        if (bonus.movement) movement += bonus.movement;
        if (bonus.luck) luck += bonus.luck;
        if (bonus.fullMana || bonus.doubleMana) {
          const effective = getEffectiveHeroStatsFromValues(hero);
          const maxMana = getHeroMana({ mana: null, knowledge: effective.knowledge });
          const currentMana = getHeroMana({ mana: hero.mana ?? null, knowledge: effective.knowledge });
          mana = bonus.doubleMana ? Math.min(maxMana * 2, currentMana * 2) : maxMana;
          manaTouched = true;
        }
        nextWeeklyVisits[visitKey] = weekKey;
        mutated = true;
      }
    }
  }

  // Apprentissage de sorts depuis la guilde des mages (limité par Wisdom)
  if (buildings.includes(BuildingType.MAGE_GUILD) && hero.hasSpellBook !== false) {
    const townSpellLibraries = (mapState.townSpellLibraries as Record<string, string[]> | undefined) ?? {};
    const library = townSpellLibraries[town.id] ?? [];
    if (library.length > 0) {
      const wisdomLvl = (() => {
        const skills = (hero as unknown as { skills?: Record<string, string> }).skills;
        const v = skills?.wisdom;
        return v === "expert" ? 3 : v === "advanced" ? 2 : v === "basic" ? 1 : 0;
      })();
      const maxSpellLevel = 2 + wisdomLvl; // 2 / 3 / 4 / 5
      const known = new Set(hero.knownSpellIds ?? []);
      const newlyLearned = library
        .filter((s) => !known.has(s))
        .filter((spellId) => {
          const spell = SPELLS.find((sp) => sp.id === spellId);
          return spell ? (spell.level ?? 1) <= maxSpellLevel : false;
        });
      if (newlyLearned.length > 0) {
        heroPatch.has_spell_book = true;
        heroPatch.known_spells = [...(hero.knownSpellIds ?? []), ...newlyLearned];
        mutated = true;
      }
    }
  }

  if (!mutated) return;

  if (attack !== Number(hero.attack ?? 0)) heroPatch.attack = attack;
  if (defense !== Number(hero.defense ?? 0)) heroPatch.defense = defense;
  if (spellPower !== Number(hero.spellPower ?? 0)) heroPatch.spell_power = spellPower;
  if (knowledge !== Number(hero.knowledge ?? 0)) heroPatch.knowledge = knowledge;
  if (luck !== Number(hero.luck ?? 0)) heroPatch.luck = luck;
  if (movement !== Number(hero.movement ?? 0)) heroPatch.movement = movement;
  if (manaTouched) heroPatch.mana = mana;

  if (Object.keys(heroPatch).length > 0) {
    await supabase.from("heroes").update(heroPatch).eq("id", hero.id);
  }
  await supabase.from("games").update({
    map_state: {
      ...mapState,
      heroTownVisits: { ...heroTownVisits, [hero.id]: Array.from(nextHeroVisited) },
      weeklyHeroTownVisits: nextWeeklyVisits,
    },
  }).eq("id", gameId);
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

async function findTownForCapture(
  supabase: SupabaseAdminClient,
  gameId: string,
  townId: string,
  positions: Array<Position | null>
): Promise<CaptureTownRow | null> {
  const selectFields = "id,game_player_id,x,y,level,town_type,buildings,neutral_garrison,is_neutral";

  if (isUuid(townId)) {
    const { data } = await supabase
      .from("towns")
      .select(selectFields)
      .eq("game_id", gameId)
      .eq("id", townId)
      .maybeSingle();
    if (data) return data as CaptureTownRow;
  }

  const seen = new Set<string>();
  for (const position of positions) {
    if (!position) continue;
    const key = `${position.x},${position.y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { data } = await supabase
      .from("towns")
      .select(selectFields)
      .eq("game_id", gameId)
      .eq("x", position.x)
      .eq("y", position.y)
      .maybeSingle();
    if (data) return data as CaptureTownRow;
  }

  return null;
}

async function createNeutralTownForMapTile(
  supabase: SupabaseAdminClient,
  gameId: string,
  mapData: GameMap,
  tile: GameMap["tiles"][number][number]
): Promise<CaptureTownRow | null> {
  if (tile.object?.type !== "town") return null;

  const seed = `${mapData.seed ?? gameId}:${tile.object.id}:${tile.x}:${tile.y}`;
  const terrain = tile.zoneId !== undefined
    ? mapData.zones?.[tile.zoneId]?.baseTerrain ?? tile.terrain
    : tile.terrain;
  const townType = isFaction(tile.object.subtype)
    ? tile.object.subtype
    : pickTownFactionForTerrain(terrain, seed);
  const name = tile.object.name ?? pickTownName(townType, seed);

  const { data, error } = await supabase
    .from("towns")
    .insert({
      game_id: gameId,
      game_player_id: null,
      name,
      town_type: townType,
      x: tile.x,
      y: tile.y,
      buildings: [BuildingType.VILLAGE_HALL],
      garrison: [],
      is_neutral: true,
      neutral_garrison: createNeutralTownGarrison(townType),
    })
    .select("id,game_player_id,x,y,level,town_type,buildings,neutral_garrison,is_neutral")
    .maybeSingle();

  if (!error && data) return data as CaptureTownRow;

  const { data: existing } = await supabase
    .from("towns")
    .select("id,game_player_id,x,y,level,town_type,buildings,neutral_garrison,is_neutral")
    .eq("game_id", gameId)
    .eq("x", tile.x)
    .eq("y", tile.y)
    .maybeSingle();

  return (existing as CaptureTownRow | null) ?? null;
}

async function ensureNeutralTownGarrison(
  supabase: SupabaseAdminClient,
  town: CaptureTownRow
): Promise<CaptureTownRow> {
  const townType = isFaction(town.town_type) ? town.town_type : Faction.CASTLE;
  const neutralGarrison = createNeutralTownGarrison(townType);

  const { data } = await supabase
    .from("towns")
    .update({ neutral_garrison: neutralGarrison })
    .eq("id", town.id)
    .eq("is_neutral", true)
    .select("id,game_player_id,x,y,level,town_type,buildings,neutral_garrison,is_neutral")
    .maybeSingle();

  return (data as CaptureTownRow | null) ?? { ...town, neutral_garrison: neutralGarrison };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getActionPosition(value: unknown): Position | null {
  if (!value || typeof value !== "object") return null;
  const position = value as { x?: unknown; y?: unknown };
  const x = Number(position.x);
  const y = Number(position.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function getActionPathDestination(path: unknown): Position | null {
  if (!Array.isArray(path) || path.length === 0) return null;
  const destination = path[path.length - 1] as { x?: unknown; y?: unknown };
  const x = Number(destination?.x);
  const y = Number(destination?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

async function updatePlayerResources(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
  resources: Partial<Resources>,
) {
  const { error } = await supabase.from("game_players").update(resources).eq("id", playerId);
  if (!error) return;
  throw error;
}

async function applyAdventureSpell({
  supabase,
  gamePlayer,
  players,
  boats,
  hero,
  spellId,
  target,
  mapData,
  explored,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  gamePlayer: MinimalPlayer;
  players: Array<{ id: string; isAlive?: boolean; heroes?: MinimalHero[] }>;
  boats: MinimalBoat[];
  hero: MinimalHero;
  spellId: string;
  target: unknown;
  mapData: GameMap;
  mapState: Record<string, unknown>;
  explored: Set<string>;
}): Promise<{ ok: true; interaction: { type: "ADVENTURE_SPELL"; spellId: string; message: string; destination?: Position; revealedTiles?: Position[]; revealHints?: Array<Position & { kind: string; subtype?: string }> } } | { ok: false; error: string }> {
  const heroPosition = { x: hero.x, y: hero.y };

  if (spellId === "view_air" || spellId === "view_earth") {
    const radius = spellId === "view_air" ? 14 : 12;
    const visibleArea = computeVisibleTiles(mapData, [heroPosition], radius);
    const revealHints = getAdventureSpellRevealTargets(mapData, visibleArea, spellId, players, hero.id);
    const revealedTiles = revealHints.map(({ x, y }) => ({ x, y }));
    return {
      ok: true,
      interaction: {
        type: "ADVENTURE_SPELL",
        spellId,
        message: spellId === "view_air"
          ? `Vue de l'air : ${revealedTiles.length} position(s) notable(s) detectee(s).`
          : `Vue de la terre : ${revealedTiles.length} ressource(s) ou mine(s) detectee(s).`,
        revealedTiles,
        revealHints,
      },
    };
  }

  if (spellId === "visions") {
    const nearbyObjects = mapData.tiles
      .flatMap((row) => row)
      .filter((tile) => {
        const dx = tile.x - hero.x;
        const dy = tile.y - hero.y;
        return Math.max(Math.abs(dx), Math.abs(dy)) <= 6 && (
          tile.object?.type === "monster" ||
          tile.object?.type === "hero" ||
          tile.object?.type === "gate" ||
          tile.object?.type === "town"
        );
      });
    return {
      ok: true,
      interaction: {
        type: "ADVENTURE_SPELL",
        spellId,
        message: `Visions : ${nearbyObjects.length} presence(s) notable(s) detectee(s).`,
      },
    };
  }

  if (spellId === "dimension_door") {
    if (boats.some((boat) => boat.heroId === hero.id)) return { ok: false, error: "Debarquez avant de lancer ce sort" };
    const destination = getActionPosition(target);
    if (!destination) return { ok: false, error: "Destination invalide" };
    if (!explored.has(`${destination.x},${destination.y}`)) return { ok: false, error: "La destination doit être visible" };
    const tile = mapData.tiles[destination.y]?.[destination.x];
    if (!tile || !isTileTraversable(tile)) return { ok: false, error: "Destination infranchissable" };
    if (isOccupiedByHero(gamePlayer.heroes, hero.id, destination)) return { ok: false, error: "Destination occupee" };

    await supabase.from("heroes").update({ x: destination.x, y: destination.y }).eq("id", hero.id);
    for (const key of computeVisibleTiles(mapData, [destination], 5)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: "Porte dimensionnelle : teleportation effectuee.", destination },
    };
  }

  if (spellId === "town_portal") {
    if (boats.some((boat) => boat.heroId === hero.id)) return { ok: false, error: "Debarquez avant de lancer ce sort" };
    const townId = typeof target === "object" && target !== null ? String((target as { townId?: unknown }).townId ?? "") : "";
    const town = (townId ? gamePlayer.towns.find((item) => item.id === townId) : gamePlayer.towns[0]) ?? null;
    if (!town) return { ok: false, error: "Aucune ville alliee disponible" };
    const destination = findTownPortalLanding(mapData, { x: town.x, y: town.y }, gamePlayer.heroes, hero.id);
    if (!destination) return { ok: false, error: "La ville cible est bloquée" };

    await supabase.from("heroes").update({ x: destination.x, y: destination.y }).eq("id", hero.id);
    for (const key of computeVisibleTiles(mapData, [destination], 5)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: `Portail de ville : arrivee a ${town.id}.`, destination },
    };
  }

  if (spellId === "summon_boat") {
    if (normalizeMapLevel(hero.mapLevel) !== SURFACE_LEVEL) return { ok: false, error: "Impossible d'invoquer un bateau dans le souterrain" };
    if (boats.some((boat) => boat.heroId === hero.id)) return { ok: false, error: "Ce héros est déjà embarqué" };
    const landing = findFreeAdjacentWaterTile(mapData, heroPosition, boats);
    if (!landing) return { ok: false, error: "Aucune eau adjacente libre" };
    const boat = findNearestEmptyBoat(boats, heroPosition);
    if (!boat) return { ok: false, error: "Aucun bateau disponible" };
    await supabase.from("boats").update({
      x: landing.x,
      y: landing.y,
      owner_player_id: gamePlayer.id,
      map_level: SURFACE_LEVEL,
    }).eq("id", boat.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: "Invocation de bateau : un bateau approche de la rive.", destination: landing },
    };
  }

  if (spellId === "scuttle_boat") {
    if (normalizeMapLevel(hero.mapLevel) !== SURFACE_LEVEL) return { ok: false, error: "Impossible de saborder un bateau dans le souterrain" };
    const targetPosition = getActionPosition(target);
    const boat = targetPosition
      ? boats.find((item) => !item.heroId && normalizeMapLevel(item.mapLevel) === SURFACE_LEVEL && item.x === targetPosition.x && item.y === targetPosition.y)
      : boats.find((item) => !item.heroId && normalizeMapLevel(item.mapLevel) === SURFACE_LEVEL && areAdjacentOrSame(heroPosition, { x: item.x, y: item.y }));
    if (!boat) return { ok: false, error: "Aucun bateau vide à saborder" };
    if (!areAdjacentOrSame(heroPosition, { x: boat.x, y: boat.y })) return { ok: false, error: "Le bateau est trop eloigne" };
    await supabase.from("boats").delete().eq("id", boat.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: "Sabordage : le bateau sombre.", destination: { x: boat.x, y: boat.y } },
    };
  }

  return { ok: false, error: "Sort indisponible" };
}

function getAdventureSpellRevealTargets(
  mapData: GameMap,
  visibleArea: Set<string>,
  spellId: string,
  players: Array<{ id: string; isAlive?: boolean; heroes?: MinimalHero[] }> = [],
  casterHeroId?: string
) {
  const targets: Array<Position & { kind: string; subtype?: string }> = [];
  const targetKeys = new Set<string>();
  const addTarget = (target: Position & { kind: string; subtype?: string }) => {
    const key = `${target.x},${target.y}:${target.kind}:${target.subtype ?? ""}`;
    if (targetKeys.has(key)) return;
    targetKeys.add(key);
    targets.push(target);
  };

  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (!visibleArea.has(`${tile.x},${tile.y}`)) continue;
      const object = tile.object;
      if (!object) continue;
      if (spellId === "view_earth" && (object.type === "resource" || object.type === "building")) {
        addTarget({ x: tile.x, y: tile.y, kind: object.type, subtype: object.subtype });
      }
      if (spellId === "view_air" && (object.type === "artifact" || object.type === "hero" || object.type === "town")) {
        addTarget({ x: tile.x, y: tile.y, kind: object.type, subtype: object.subtype });
      }
    }
  }

  if (spellId === "view_air") {
    for (const player of players) {
      if (player.isAlive === false) continue;
      for (const targetHero of player.heroes ?? []) {
        if (targetHero.id === casterHeroId) continue;
        if (!visibleArea.has(`${targetHero.x},${targetHero.y}`)) continue;
        addTarget({ x: targetHero.x, y: targetHero.y, kind: "hero" });
      }
    }
  }

  return targets;
}

function isOccupiedByHero(heroes: MinimalHero[], movingHeroId: string, destination: Position) {
  return heroes.some((item) => item.id !== movingHeroId && item.x === destination.x && item.y === destination.y);
}

function findTownPortalLanding(mapData: GameMap, townPosition: Position, heroes: MinimalHero[], movingHeroId: string) {
  const candidates = [
    townPosition,
    { x: townPosition.x + 1, y: townPosition.y },
    { x: townPosition.x - 1, y: townPosition.y },
    { x: townPosition.x, y: townPosition.y + 1 },
    { x: townPosition.x, y: townPosition.y - 1 },
    { x: townPosition.x + 1, y: townPosition.y + 1 },
    { x: townPosition.x - 1, y: townPosition.y - 1 },
  ];
  return candidates.find((position) => {
    const tile = mapData.tiles[position.y]?.[position.x];
    return tile && isTileTraversable(tile) && !isOccupiedByHero(heroes, movingHeroId, position);
  }) ?? null;
}

function getCreatureBankStateMap(mapState: Record<string, unknown>) {
  return ((mapState.creatureBanks as Record<string, unknown> | undefined) ?? {}) as Record<string, {
    defeated?: boolean;
    claimed?: boolean;
    pendingReward?: PendingCreatureBankReward | null;
  }>;
}

function getDefeatedCreatureBanks(mapState: Record<string, unknown>): Set<string> {
  return new Set(
    Object.entries(getCreatureBankStateMap(mapState))
      .filter(([, state]) => state.defeated || state.claimed)
      .map(([bankId]) => bankId)
  );
}

function isMissingSpellSchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("mana") || text.includes("has_spell_book") || text.includes("known_spells") || text.includes("morale") || text.includes("luck") || text.includes("artifacts") || text.includes("schema cache");
}

function normalizeCreatureRewardSelection(
  value: unknown,
  available: Array<{ unitType: UnitType; count: number }>,
): Partial<Record<UnitType, number>> {
  const requested = (value as Record<string, unknown> | undefined) ?? {};
  const out: Partial<Record<UnitType, number>> = {};
  for (const entry of available) {
    const raw = requested[entry.unitType];
    const count = raw === undefined
      ? entry.count
      : Math.min(entry.count, Math.max(0, Math.floor(Number(raw) || 0)));
    if (count > 0) out[entry.unitType] = count;
  }
  return out;
}

function findFirstMoveStop({
  path,
  map,
  movingHeroId,
  movingPlayerId,
  players,
  gates,
  collected,
  killed,
  visitedAdventureBuildings,
  defeatedCreatureBanks,
}: {
  path: Position[];
  map: GameMap;
  movingHeroId: string;
  movingPlayerId: string;
  players: Array<{
    id: string;
    resourceBuildings: MinimalBuilding[];
    towns?: MinimalTown[];
    heroes?: MinimalHero[];
  }>;
  gates: MinimalGate[];
  collected: Set<string>;
  killed: Set<string>;
  visitedAdventureBuildings: Set<string>;
  defeatedCreatureBanks: Set<string>;
}): { pathIndex: number; stopBefore?: boolean; object?: MapObject; hero?: MinimalHero & { playerId: string }; targetPosition?: Position } | null {
  for (let i = 1; i < path.length; i++) {
    const position = path[i];
    const hero = players
      .flatMap((player) => (player.heroes ?? []).map((item) => ({ ...item, playerId: player.id })))
      .find((item) => item.id !== movingHeroId && item.x === position.x && item.y === position.y);
    if (hero) return { pathIndex: i, stopBefore: true, hero, targetPosition: position };

    const object = map.tiles[position.y]?.[position.x]?.object;
    if (!object) continue;
    if (object.type === "resource" && collected.has(object.id)) continue;
    if (object.type === "artifact" && collected.has(object.id)) continue;
    if (object.type === "monster" && killed.has(object.id)) continue;
    if (object.type === "adventure_building" && object.subtype === AdventureBuildingType.CAMPFIRE && visitedAdventureBuildings.has(object.id)) continue;
    if (object.type === "adventure_building" && isCreatureBankType(object.subtype)) {
      if (defeatedCreatureBanks.has(object.id)) continue;
      return { pathIndex: i, stopBefore: true, object, targetPosition: position };
    }
    if (object.type === "wall") continue;
    if (object.type === "monster") return { pathIndex: i, stopBefore: true, object, targetPosition: position };
    if (object.type === "artifact") return { pathIndex: i, stopBefore: true, object, targetPosition: position };
    if (object.type === "town") {
      const owner = findTownOwner(players, object, position);
      if (owner?.id === movingPlayerId) continue;
      return { pathIndex: i, object };
    }
    if (object.type === "building") {
      const owner = findResourceBuildingOwner(players, object, position);
      if (owner?.id === movingPlayerId) continue;
      if (Number(object.guardianPower ?? 0) > 0) {
        return { pathIndex: i, stopBefore: true, object, targetPosition: position };
      }
      return { pathIndex: i, object };
    }
    if (object.type === "gate") {
      const gate = findGate(gates, object.id, position);
      if (gate?.gamePlayerId === movingPlayerId) continue;
      if ((gate?.garrison ?? []).some((unit) => unit.count > 0)) {
        return { pathIndex: i, stopBefore: true, object, targetPosition: position };
      }
      return { pathIndex: i, object, targetPosition: position };
    }
    return { pathIndex: i, object };
  }

  return null;
}

function findTownOwner(
  players: Array<{ id: string; towns?: MinimalTown[] }>,
  object: MapObject,
  position: Position
) {
  return players.find((player) =>
    (player.towns ?? []).some((town) =>
      town.id === object.id || (town.x === position.x && town.y === position.y)
    )
  );
}

function findResourceBuildingOwner(
  players: Array<{ id: string; resourceBuildings: MinimalBuilding[] }>,
  object: MapObject,
  position: Position
) {
  return players.find((player) =>
    player.resourceBuildings.some((building) =>
      building.id === object.id || (building.x === position.x && building.y === position.y)
    )
  );
}

function addArtifactToBag(value: unknown, artifactId: string) {
  const bag = normalizeArtifactBag(value);
  return { ...bag, inventory: [...bag.inventory, artifactId] };
}

function equipHeroArtifact(hero: MinimalHero, artifactId: string, requestedSlot: unknown):
  | { ok: true; artifacts: ReturnType<typeof normalizeArtifactBag> }
  | { ok: false; error: string } {
  const artifact = getArtifact(artifactId);
  if (!artifact) return { ok: false, error: "Artefact inconnu" };
  const bag = normalizeArtifactBag(hero.artifacts);
  if (!bag.inventory.includes(artifactId)) return { ok: false, error: "Artefact absent de l'inventaire" };
  const slot = normalizeArtifactSlot(requestedSlot) ?? artifact.slots.find((candidate) => !bag.equipment[candidate]) ?? artifact.slots[0];
  if (!slot || !artifact.slots.includes(slot)) return { ok: false, error: "Emplacement invalide" };

  const inventory = bag.inventory.filter((id, index) => id !== artifactId || index !== bag.inventory.indexOf(artifactId));
  const replaced = bag.equipment[slot];
  return {
    ok: true,
    artifacts: {
      inventory: replaced ? [...inventory, replaced] : inventory,
      equipment: { ...bag.equipment, [slot]: artifactId },
    },
  };
}

function unequipHeroArtifact(hero: MinimalHero, rawSlot: unknown):
  | { ok: true; artifacts: ReturnType<typeof normalizeArtifactBag> }
  | { ok: false; error: string } {
  const slot = normalizeArtifactSlot(rawSlot);
  if (!slot) return { ok: false, error: "Emplacement invalide" };
  const bag = normalizeArtifactBag(hero.artifacts);
  const artifactId = bag.equipment[slot];
  if (!artifactId) return { ok: false, error: "Aucun artefact équipé" };
  const equipment = { ...bag.equipment };
  delete equipment[slot];
  return { ok: true, artifacts: { inventory: [...bag.inventory, artifactId], equipment } };
}

function transferHeroArtifact(fromHero: MinimalHero, toHero: MinimalHero, artifactId: string):
  | { ok: true; fromArtifacts: ReturnType<typeof normalizeArtifactBag>; toArtifacts: ReturnType<typeof normalizeArtifactBag> }
  | { ok: false; error: string } {
  if (!getArtifact(artifactId)) return { ok: false, error: "Artefact inconnu" };
  const fromBag = normalizeArtifactBag(fromHero.artifacts);
  const toBag = normalizeArtifactBag(toHero.artifacts);
  const inventoryIndex = fromBag.inventory.indexOf(artifactId);
  let fromArtifacts = fromBag;
  if (inventoryIndex >= 0) {
    fromArtifacts = {
      ...fromBag,
      inventory: fromBag.inventory.filter((_, index) => index !== inventoryIndex),
    };
  } else {
    const slot = ARTIFACT_SLOTS.find((candidate) => fromBag.equipment[candidate] === artifactId);
    if (!slot) return { ok: false, error: "Artefact absent du héros source" };
    const equipment = { ...fromBag.equipment };
    delete equipment[slot];
    fromArtifacts = { ...fromBag, equipment };
  }
  return { ok: true, fromArtifacts, toArtifacts: { ...toBag, inventory: [...toBag.inventory, artifactId] } };
}

function normalizeArtifactSlot(value: unknown): ArtifactSlot | null {
  return typeof value === "string" && ARTIFACT_SLOTS.includes(value as ArtifactSlot) ? value as ArtifactSlot : null;
}

function canTransferArtifactsBetweenHeroes(fromHero: MinimalHero, toHero: MinimalHero, towns: MinimalTown[]) {
  const adjacent = Math.max(Math.abs(fromHero.x - toHero.x), Math.abs(fromHero.y - toHero.y)) <= 1;
  if (adjacent) return true;
  return towns.some((town) => town.x === fromHero.x && town.y === fromHero.y && town.x === toHero.x && town.y === toHero.y);
}

async function validateAndApplyArtifactApproach({
  supabase,
  mapData,
  gamePlayer,
  hero,
  path,
  target,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  mapData: GameMap;
  gamePlayer: MinimalPlayer;
  hero: MinimalHero;
  path: unknown;
  target: Position;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (Math.max(Math.abs(hero.x - target.x), Math.abs(hero.y - target.y)) <= 1) return { ok: true };
  if (!Array.isArray(path) || path.length < 1) return { ok: false, error: "Le héros doit s'arrêter devant l'artefact" };
  const typedPath = path as Position[];
  const destination = typedPath[typedPath.length - 1];
  if (Math.max(Math.abs(destination.x - target.x), Math.abs(destination.y - target.y)) > 1) {
    return { ok: false, error: "Le chemin doit finir devant l'artefact" };
  }
  return validateAndApplyActionPath({ supabase, mapData, gamePlayer, hero, path, destination });
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
    movement: getUsableAdventureMovement(mapData, destination, hero.movement - validation.usedMovement),
  }).eq("id", hero.id);
  if (heroUpdateError) return { ok: false, error: `Erreur mise à jour héros: ${heroUpdateError.message}` };

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

function getPathMovementCost(map: GameMap, path: Position[], skills?: Record<string, string>) {
  const base = getAdventurePathCost(map, path);
  if (!skills) return base;
  const lvl = skills.pathfinding === "expert" ? 3 : skills.pathfinding === "advanced" ? 2 : skills.pathfinding === "basic" ? 1 : 0;
  if (lvl <= 0) return base;
  // Pathfinding réduit le coût sur terrain rude (forêt, sable, neige, marais, montagne)
  // Approximation : −10% / −20% / −30% sur le total des cases hors herbe/route
  const reduction = lvl === 1 ? 0.10 : lvl === 2 ? 0.20 : 0.30;
  let roughPortion = 0;
  for (let i = 1; i < path.length; i++) {
    const t = map.tiles?.[path[i].y]?.[path[i].x];
    if (!t) continue;
    const terrain = t.terrain;
    if (terrain === "forest" || terrain === "sand" || terrain === "snow" || terrain === "swamp" || terrain === "mountain") {
      roughPortion += 1;
    }
  }
  if (path.length <= 1) return base;
  const roughRatio = roughPortion / (path.length - 1);
  return Math.max(0, Math.floor(base * (1 - reduction * roughRatio)));
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
  const requiredMovement = getRequiredAdventureMovement(map, path as Position[]);
  if (requiredMovement > movement) return { ok: false, error: "Deplacement insuffisant" };
  return { ok: true, usedMovement };
}
