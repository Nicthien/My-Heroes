import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCurrentUser } from "@/lib/auth";
import {
  UNIT_RULES,
  canAfford,
  getFactionBuildingRule,
  subtractCost,
  tierForUnit,
} from "@/lib/game/economy";
import { createCampfireReward, addVisit, hasPlayerVisited, getAdventureBuildingLabel } from "@/lib/game/adventure-buildings";
import { isCreatureBankType, PendingCreatureBankReward } from "@/lib/game/creature-banks";
import {
  createExternalDwellingState,
  getExternalDwellingLabel,
  isExternalDwellingType,
  normalizeExternalDwellingState,
  type ExternalDwellingStateMap,
} from "@/lib/game/external-dwellings";
import { runAiTurnsUntilHuman } from "@/lib/game/ai/simple-ai";
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
import { AdventureBuildingType, BuildingType, Faction, GameMap, HeroClass, MapObject, Position, Resources, UnitType } from "@/lib/game/types";
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
  canMoveAdventureStep,
  computeVisibleTiles,
  getAdventurePathCost,
  getAdventureStepCost,
  getDailyAdventureMovement,
  getPlayerVisionCenters,
  getRequiredAdventureMovement,
  getUsableAdventureMovement,
  isTileTraversable,
  normalizeMapMovement,
} from "@/lib/game/engine";
import { createNeutralArmyStacksForTile } from "@/lib/game/neutral-armies";
import { createNeutralTownGarrison } from "@/lib/game/neutral-towns";
import { getUnitRule } from "@/lib/game/units";
import { SPELLS, getHeroMana, getSpell, getSpellCost, heroKnowsSpell, type SpellId } from "@/lib/game/spells";
import { isFaction, pickTownFactionForTerrain, pickTownName } from "@/lib/game/town-generation";
import { getTownCenterLevel, hasTownBuilding } from "@/lib/game/town-buildings";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { completePlayerTurn } from "@/lib/game/server/turns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

interface MinimalBuilding {
  id: string;
  x: number;
  y: number;
  buildingType?: string;
  guardianPower?: number;
}

interface MinimalTown {
  id: string;
  gamePlayerId?: string | null;
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

interface MinimalGate {
  id: string;
  gamePlayerId?: string | null;
  x: number;
  y: number;
  guardianPower?: number;
  garrison?: MinimalArmy[];
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
  name?: string | null;
  class?: string | null;
  specialty?: string | null;
  x: number;
  y: number;
  level?: number;
  movement: number;
  mana?: number | null;
  hasSpellBook?: boolean;
  knownSpellIds?: string[] | null;
  attack?: number;
  defense?: number;
  morale?: number;
  luck?: number;
  artifacts?: unknown;
  spellPower?: number;
  knowledge?: number;
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
  | { type: "COLLECT"; resource: string; amount: number; gold?: number; destination: Position }
  | { type: "ADVENTURE_BUILDING"; buildingType: string; reward?: { gold?: number; resources?: Record<string, number> }; recruited?: { unitType: UnitType; count: number }; message?: string; destination: Position; choices?: AdventureBuildingChoice[]; buildingId?: string }
  | { type: "TELEPORT"; buildingType: "stargate"; from: Position; to: Position; message?: string; destination: Position }
  | { type: "COMBAT"; targetId: string; targetType: "hero" | "monster" | "building" | "town" | "gate" | "creature_bank" | "artifact"; destination: Position; targetPosition?: Position }
  | { type: "ARTIFACT"; artifactId: string; label: string; destination: Position }
  | { type: "CAPTURE_BUILDING"; buildingType?: string; destination: Position }
  | { type: "CAPTURE_TOWN"; destination: Position }
  | { type: "CAPTURE_GATE"; gateId: string; destination: Position }
  | { type: "STOP"; message: string; destination: Position };

type HeroStatKey = "attack" | "defense" | "spellPower" | "knowledge";

type AdventureBuildingChoice = {
  value: HeroStatKey;
  label: string;
};

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

const HERO_IN_COMBAT_ERROR = "Ce heros est deja engage dans un combat.";
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
    if (!gamePlayer.isAlive) return NextResponse.json({ error: "Vous avez perdu cette partie" }, { status: 403 });

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
      return NextResponse.json({ success: true, resources });
    }

    if (action.type === "DEV_TELEPORT_HERO") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, hero.id)) {
        return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      }

      const mapData = normalizeMapMovement(game.mapData as GameMap);
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
        return NextResponse.json({ error: `Erreur mise a jour heros: ${heroUpdateError.message}` }, { status: 500 });
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

      return NextResponse.json({ success: true, destination });
    }

    const players = game.players as unknown as Array<{
      id: string;
      isAlive: boolean;
      turnOrder: number;
      resourceBuildings: MinimalBuilding[];
      towns: MinimalTown[];
      heroes?: MinimalHero[];
    }>;
    const gates = (game.gates ?? []) as unknown as MinimalGate[];
    const turns = game.turns as MinimalTurn[];
    const completedTurn = turns.find((turn) =>
      turn.gamePlayerId === gamePlayer.id && turn.turnNumber === game.turnNumber && turn.isCompleted
    );
    if (completedTurn && action.type !== "END_TURN") {
      return NextResponse.json({ error: "Vous avez deja termine votre tour" }, { status: 403 });
    }

    if (action.type === "EQUIP_ARTIFACT") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      const result = equipHeroArtifact(hero, String(action.artifactId ?? ""), action.slot);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      const { error } = await supabase.from("heroes").update({ artifacts: result.artifacts }).eq("id", hero.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, artifacts: result.artifacts });
    }

    if (action.type === "UNEQUIP_ARTIFACT") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      const result = unequipHeroArtifact(hero, action.slot);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      const { error } = await supabase.from("heroes").update({ artifacts: result.artifacts }).eq("id", hero.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, artifacts: result.artifacts });
    }

    if (action.type === "TRANSFER_ARTIFACT") {
      const fromHero = gamePlayer.heroes.find((item) => item.id === action.fromHeroId);
      const toHero = gamePlayer.heroes.find((item) => item.id === action.toHeroId);
      if (!fromHero || !toHero || fromHero.id === toHero.id) return NextResponse.json({ error: "Transfert invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, fromHero.id) || isHeroInActiveCombat(game.combats, toHero.id)) {
        return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      }
      if (!canTransferArtifactsBetweenHeroes(fromHero, toHero, gamePlayer.towns)) {
        return NextResponse.json({ error: "Les heros doivent etre adjacents ou dans le meme chateau" }, { status: 400 });
      }
      const result = transferHeroArtifact(fromHero, toHero, String(action.artifactId ?? ""));
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      const { error: fromError } = await supabase.from("heroes").update({ artifacts: result.fromArtifacts }).eq("id", fromHero.id);
      if (fromError) return NextResponse.json({ error: fromError.message }, { status: 500 });
      const { error: toError } = await supabase.from("heroes").update({ artifacts: result.toArtifacts }).eq("id", toHero.id);
      if (toError) return NextResponse.json({ error: toError.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action.type === "COLLECT_ARTIFACT") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      const mapData = normalizeMapMovement(game.mapData as GameMap);
      const targetPosition = getActionPosition(action.targetPosition);
      if (!targetPosition) return NextResponse.json({ error: "Artefact invalide" }, { status: 400 });
      const object = mapData.tiles[targetPosition.y]?.[targetPosition.x]?.object;
      if (object?.type !== "artifact") return NextResponse.json({ error: "Artefact introuvable" }, { status: 404 });
      const mapState = (game.mapState as Record<string, unknown>) ?? {};
      const collected = new Set<string>((mapState.collected as string[]) ?? []);
      const defeatedArtifacts = new Set<string>((mapState.defeatedArtifacts as string[]) ?? []);
      if (collected.has(object.id)) return NextResponse.json({ error: "Artefact deja collecte" }, { status: 400 });
      if (Number(object.guardianPower ?? 0) > 0 && !defeatedArtifacts.has(object.id)) {
        return NextResponse.json({ error: "L'artefact est garde" }, { status: 400 });
      }
      const movement = await validateAndApplyArtifactApproach({ supabase, mapData, gamePlayer, hero, path: action.path, target: targetPosition });
      if (!movement.ok) return NextResponse.json({ error: movement.error }, { status: 400 });
      const artifactId = pickArtifactId(object.subtype, `${id}:${object.id}`);
      const artifact = getArtifact(artifactId);
      if (!artifact) return NextResponse.json({ error: "Artefact inconnu" }, { status: 400 });
      const artifacts = addArtifactToBag(hero.artifacts, artifactId);
      const { error } = await supabase.from("heroes").update({ artifacts }).eq("id", hero.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      collected.add(object.id);
      await supabase.from("games").update({ map_state: { ...mapState, collected: Array.from(collected), defeatedArtifacts: Array.from(defeatedArtifacts) } }).eq("id", id);
      return NextResponse.json({ success: true, interaction: { type: "ARTIFACT", artifactId, label: artifact.name, destination: { x: hero.x, y: hero.y } } });
    }

    if (action.type === "MOVE_HERO") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });

      const mapData = normalizeMapMovement(game.mapData as GameMap);
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
      const usedMovement = getPathMovementCost(mapData, movePath);
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
      const stopObject = firstStop?.object;
      const stopTargetPosition = firstStop?.targetPosition;
      let interaction: MoveInteraction | null = null;

      if (tile?.object?.type === "resource" && !collected.has(tile.object.id)) {
        collected.add(tile.object.id);
        const resourceType = tile.object.subtype ?? "gold";
        const amount = getResourcePileAmount(tile.object);
        await incrementPlayerResource(supabase, gamePlayer.id, resourceType, amount);
        await supabase.from("games").update({ map_state: { ...mapState, collected: Array.from(collected) } }).eq("id", id);
        interaction = { type: "COLLECT", resource: resourceType, amount, gold: resourceType === "gold" ? amount : undefined, destination: lastPos };
      }

      if (firstStop?.hero) {
        if (firstStop.hero.playerId === gamePlayer.id) {
          interaction = { type: "STOP", message: "Un de vos heros bloque le chemin.", destination: lastPos };
        } else {
          interaction = { type: "COMBAT", targetId: firstStop.hero.id, targetType: "hero", destination: lastPos, targetPosition: stopTargetPosition };
        }
      } else if (stopObject?.type === "monster" && stopTargetPosition && !killed.has(stopObject.id)) {
        interaction = { type: "COMBAT", targetId: stopObject.id, targetType: "monster", destination: lastPos, targetPosition: stopTargetPosition };
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
          interaction = { type: "STOP", message: "Artefact a portee.", destination: lastPos };
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
            await supabase
              .from("heroes")
              .update({ experience: hero.experience + 250 })
              .eq("id", hero.id);
            await evaluateGameLifecycle(supabase, id);
            interaction = { type: "CAPTURE_TOWN", destination: lastPos };
          }
        }
      }

      return NextResponse.json({ success: true, interaction, path: movePath, stoppedAt: firstStop ? lastPos : null });
    }

    if (action.type === "VISIT_ADVENTURE_BUILDING") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, hero.id)) {
        return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      }

      const mapData = normalizeMapMovement(game.mapData as GameMap);
      const found = findAdventureBuildingById(mapData, String(action.buildingId ?? ""));
      if (!found) return NextResponse.json({ error: "Batiment d'aventure introuvable" }, { status: 404 });
      if (!areAdjacentOrSame({ x: hero.x, y: hero.y }, found.position)) {
        return NextResponse.json({ error: "Le heros doit etre sur place pour visiter ce batiment" }, { status: 400 });
      }

      const mapState = (game.mapState as Record<string, unknown>) ?? {};
      const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
      const interaction = await handleAdventureBuildingVisit({
        supabase,
        gameId: id,
        gamePlayer,
        hero,
        turnNumber: Number(game.turnNumber ?? 1),
        mapData,
        mapState,
        object: found.object,
        position: found.position,
        explored,
        choice: normalizeHeroStatChoice(action.choice),
      });

      return NextResponse.json({ success: true, interaction });
    }

    if (action.type === "CAST_ADVENTURE_SPELL") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, hero.id)) {
        return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      }

      const spell = getSpell(String(action.spellId ?? ""));
      if (!spell || spell.context !== "adventure") return NextResponse.json({ error: "Sort d'aventure invalide" }, { status: 400 });
      if (hero.hasSpellBook === false) return NextResponse.json({ error: "Ce heros n'a pas de livre de sorts" }, { status: 400 });
      if (!heroKnowsSpell(hero, spell.id)) return NextResponse.json({ error: "Sort inconnu" }, { status: 400 });

      const effectiveStats = getEffectiveHeroStatsFromValues(hero);
      const mana = getHeroMana({ mana: hero.mana, knowledge: effectiveStats.knowledge });
      const cost = getSpellCost(spell);
      const hasDevInfiniteMana = action.devInfiniteManaHeroId === hero.id;
      if (!spell.implemented) return NextResponse.json({ error: "Sort non implemente" }, { status: 400 });
      if (!hasDevInfiniteMana && mana < cost) return NextResponse.json({ error: "Mana insuffisant" }, { status: 400 });

      const mapData = normalizeMapMovement(game.mapData as GameMap);
      const mapState = (game.mapState as Record<string, unknown>) ?? {};
      const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
      const result = await applyAdventureSpell({
        supabase,
        gamePlayer,
        players,
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
      return NextResponse.json({ success: true, mana: nextMana, interaction: result.interaction });
    }

    if (action.type === "CAPTURE_BUILDING") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      const building = players.flatMap((player) => player.resourceBuildings)
        .find((item) => item.id === action.buildingId)
        ?? await getResourceBuilding(supabase, id, String(action.buildingId ?? ""));
      if (!hero || !building) return NextResponse.json({ error: "Capture invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, hero.id)) {
        return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      }
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
        const pathDestination = getActionPosition(action.destination) ?? getActionPathDestination(action.path);
        const heroPosition = hero ? { x: hero.x, y: hero.y } : null;
        const mapTownTile = mapData.tiles
          .flatMap((row) => row)
          .find((tile) =>
            tile.object?.type === "town" &&
            (
              tile.object.id === action.townId ||
              tile.object.targetId === action.townId ||
              (pathDestination && tile.x === pathDestination.x && tile.y === pathDestination.y) ||
              (heroPosition && tile.x === heroPosition.x && tile.y === heroPosition.y)
            )
          );

        let townRow = await findTownForCapture(supabase, id, String(action.townId ?? ""), [
          mapTownTile ? { x: mapTownTile.x, y: mapTownTile.y } : null,
          pathDestination,
          heroPosition,
        ]);
        if (!townRow && mapTownTile) {
          townRow = await createNeutralTownForMapTile(supabase, id, mapData, mapTownTile);
        }
        if (townRow?.is_neutral && (townRow.neutral_garrison?.length ?? 0) === 0) {
          townRow = await ensureNeutralTownGarrison(supabase, townRow);
        }

        if (townRow) {
          town = {
            id: townRow.id,
            gamePlayerId: townRow.game_player_id,
            x: townRow.x,
            y: townRow.y,
            level: townRow.level,
            townType: townRow.town_type,
            buildings: townRow.buildings ?? [],
            isNeutral: townRow.is_neutral,
            neutralGarrison: townRow.neutral_garrison ?? [],
          };
        }
      }
      if (!hero || !town) return NextResponse.json({ error: "Chateau invalide" }, { status: 400 });
      if (isHeroInActiveCombat(game.combats, hero.id)) {
        return NextResponse.json({ error: HERO_IN_COMBAT_ERROR }, { status: 400 });
      }
      if (!town.isNeutral && town.gamePlayerId === gamePlayer.id) {
        return NextResponse.json({ error: "Ce château vous appartient déjà" }, { status: 400 });
      }
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
      await evaluateGameLifecycle(supabase, id);
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
        townUpdate.tavern_offer = pickTavernOffer(townFaction, getRecruitedHeroTemplateIds(gamePlayer.heroes ?? []));
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
      if (heroError && isMissingSpellSchemaError(heroError)) {
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
          hero_id: heroRow.id,
          unit_type: army.unitType,
          count: army.count,
          health: unitRule.health * army.count,
          max_health: unitRule.health,
          position: 0,
        });
      }

      const remaining = offer.filter((entry) => entry.templateId !== action.templateId);
      await supabase.from("towns").update({ tavern_offer: remaining }).eq("id", town.id);

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

    if (action.type === "CLAIM_CREATURE_BANK_REWARD") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });

      const mapState = (game.mapState as Record<string, unknown>) ?? {};
      const creatureBanks = getCreatureBankStateMap(mapState);
      const bankState = creatureBanks[String(action.bankId ?? "")];
      const pendingReward = bankState?.pendingReward as PendingCreatureBankReward | undefined;
      if (!pendingReward || bankState.claimed) {
        return NextResponse.json({ error: "Aucune recompense de banque disponible" }, { status: 400 });
      }
      if (pendingReward.playerId !== gamePlayer.id || pendingReward.heroId !== hero.id) {
        return NextResponse.json({ error: "Cette recompense appartient a un autre heros" }, { status: 403 });
      }

      const acceptedCreatures = normalizeCreatureRewardSelection(action.creatures, pendingReward.reward.creatures ?? []);
      const newStackTypes = Object.entries(acceptedCreatures)
        .filter(([, count]) => count > 0)
        .map(([unitType]) => unitType as UnitType)
        .filter((unitType) => !hero.armies.some((army) => army.unitType === unitType));
      const maxHeroStacks = 7;
      if (hero.armies.length + newStackTypes.length > maxHeroStacks) {
        return NextResponse.json({ error: "Pas assez de place dans l'armee du heros" }, { status: 400 });
      }

      const resources = playerResources(gamePlayer);
      const nextResources: Partial<Resources> = {};
      if (pendingReward.reward.gold) nextResources.gold = resources.gold + pendingReward.reward.gold;
      for (const [resource, amount] of Object.entries(pendingReward.reward.resources ?? {})) {
        const key = resource as keyof Resources;
        nextResources[key] = (resources[key] ?? 0) + Number(amount ?? 0);
      }
      if (Object.keys(nextResources).length > 0) {
        await updatePlayerResources(supabase, gamePlayer.id, nextResources);
      }
      if (pendingReward.reward.experience) {
        await supabase.from("heroes").update({ experience: hero.experience + pendingReward.reward.experience }).eq("id", hero.id);
      }

      let nextPosition = hero.armies.length;
      for (const [unitTypeValue, count] of Object.entries(acceptedCreatures)) {
        const unitType = unitTypeValue as UnitType;
        if (count <= 0) continue;
        const rule = getUnitRule(unitType);
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
            position: nextPosition++,
          });
        }
      }

      let nextHeroArtifacts = normalizeArtifactBag(hero.artifacts);
      if (pendingReward.reward.artifactTokens?.length) {
        const pickedArtifacts = pendingReward.reward.artifactTokens.map((token, index) =>
          pickArtifactId(token, `${id}:${pendingReward.bankId}:${hero.id}:${index}`)
        );
        nextHeroArtifacts = {
          ...nextHeroArtifacts,
          inventory: [...nextHeroArtifacts.inventory, ...pickedArtifacts],
        };
        await supabase.from("heroes").update({ artifacts: nextHeroArtifacts }).eq("id", hero.id);
      }
      await supabase.from("games").update({
        map_state: {
          ...mapState,
          creatureBanks: {
            ...creatureBanks,
            [pendingReward.bankId]: {
              ...bankState,
              defeated: true,
              claimed: true,
              pendingReward: null,
            },
          },
        },
      }).eq("id", id);

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

    if (action.type === "TRANSFER_HERO_TO_GARRISON") {
      const unitType = action.unitType as UnitType;
      const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
      const rule = UNIT_RULES[unitType];
      const town = gamePlayer.towns.find((item: { id: string }) => item.id === action.townId);
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!rule || !town || !hero) return NextResponse.json({ error: "Transfert invalide" }, { status: 400 });
      if (hero.x !== town.x || hero.y !== town.y) {
        return NextResponse.json({ error: "Le heros doit etre au chateau pour deposer des unites" }, { status: 400 });
      }

      const source = hero.armies.find((army) => army.unitType === unitType);
      if (!source || source.count < count) {
        return NextResponse.json({ error: "Armee insuffisante" }, { status: 400 });
      }

      const nextGarrison = addUnitsToStackList(town.garrison ?? [], unitType, count, rule.health);
      await supabase.from("towns").update({ garrison: nextGarrison }).eq("id", town.id);

      if (source.count === count) {
        await supabase.from("armies").delete().eq("id", source.id);
      } else {
        await supabase.from("armies").update({
          count: source.count - count,
          health: Math.max(0, source.health - rule.health * count),
        }).eq("id", source.id);
      }

      return NextResponse.json({ success: true });
    }

    if (action.type === "TRANSFER_GATE_GARRISON_TO_HERO" || action.type === "TRANSFER_HERO_TO_GATE_GARRISON") {
      const unitType = action.unitType as UnitType;
      const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
      const rule = UNIT_RULES[unitType];
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      const gate = gates.find((item) => item.id === action.gateId);
      if (!rule || !hero || !gate || gate.gamePlayerId !== gamePlayer.id) {
        return NextResponse.json({ error: "Transfert de porte invalide" }, { status: 400 });
      }
      if (!areAdjacentOrSame({ x: hero.x, y: hero.y }, { x: gate.x, y: gate.y })) {
        return NextResponse.json({ error: "Le heros doit etre adjacent a la porte" }, { status: 400 });
      }

      if (action.type === "TRANSFER_GATE_GARRISON_TO_HERO") {
        const source = (gate.garrison ?? []).find((unit) => unit.unitType === unitType);
        if (!source || source.count < count) return NextResponse.json({ error: "Garnison insuffisante" }, { status: 400 });

        if (source.count === count) {
          await supabase.from("gate_stacks").delete().eq("id", source.id);
        } else {
          await supabase.from("gate_stacks").update({
            count: source.count - count,
            health: Math.max(0, source.health - rule.health * count),
          }).eq("id", source.id);
        }
        await addUnitsToHeroArmy(supabase, hero, unitType, count, rule.health);
      } else {
        const source = hero.armies.find((army) => army.unitType === unitType);
        if (!source || source.count < count) return NextResponse.json({ error: "Armee insuffisante" }, { status: 400 });

        await addUnitsToGateGarrison(supabase, gate, unitType, count, rule.health);
        await removeUnitsFromHeroArmy(supabase, source, count, rule.health);
      }

      await compactGateStackPositions(supabase, gate.id);
      return NextResponse.json({ success: true });
    }

    if (action.type === "CAPTURE_GATE") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      const mapData = normalizeMapMovement(game.mapData as GameMap);
      const gate = getEffectiveGates(gates, mapData).find((item) => item.id === action.gateId);
      if (!hero || !gate) {
        return NextResponse.json({ error: "Porte invalide" }, { status: 400 });
      }
      if (!areAdjacentOrSame({ x: hero.x, y: hero.y }, { x: gate.x, y: gate.y })) {
        return NextResponse.json({ error: "Le heros doit etre adjacent a la porte" }, { status: 400 });
      }
      if ((gate.garrison ?? []).some((unit) => unit.count > 0)) {
        return NextResponse.json({ error: "La porte est gardee" }, { status: 400 });
      }

      await captureGate(supabase, id, gate, gamePlayer.id);
      return NextResponse.json({ success: true, interaction: { type: "CAPTURE_GATE", gateId: gate.id } });
    }

    if (action.type === "END_TURN") {
      await completePlayerTurn(supabase, id, Number(game.turnNumber), gamePlayer.id);
      await runAiTurnsUntilHuman(supabase, id);
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
  const existing = hero.armies.find((army) => army.unitType === unitType);
  if (existing) {
    await supabase.from("armies").update({
      count: existing.count + count,
      health: existing.health + maxHealth * count,
    }).eq("id", existing.id);
    return;
  }

  await supabase.from("armies").insert({
    hero_id: hero.id,
    unit_type: unitType,
    count,
    health: maxHealth * count,
    max_health: maxHealth,
    position: hero.armies.length,
  });
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

  if (isHeroVisitBuilding(buildingType) && hasHeroVisited(heroAdventureVisits, hero.id, object.id)) {
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: `${getAdventureBuildingLabel(buildingType)} deja visite par ce heros.`,
    };
  }

  if (isSingleMapRewardBuilding(buildingType) && visitedAdventureBuildings.has(object.id)) {
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: `${getAdventureBuildingLabel(buildingType)} deja fouille.`,
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
    const stackAlreadyPresent = hero.armies.some((army) => army.unitType === current.unitType);
    const hasFreeStack = hero.armies.length < 7;
    const maxByResources = getAffordableCount(resources, recruitCost, current.available);
    const recruitCount = stackAlreadyPresent || hasFreeStack ? maxByResources : 0;
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
      ? `${label} capturee : ${recruitCount} ${unitRule.label} recrute(e)s.`
      : !stackAlreadyPresent && !hasFreeStack
      ? `${label} capturee, mais l'armee du heros est pleine.`
      : `${label} capturee. Recrues disponibles : ${nextState.available}.`;

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

  if (buildingType === AdventureBuildingType.ARENA) {
    if (!choice || !["attack", "defense"].includes(choice)) {
      return {
        type: "ADVENTURE_BUILDING",
        buildingType,
        destination: position,
        buildingId: object.id,
        message: "Arène : choisissez l'entrainement du heros.",
        choices: [
          { value: "attack", label: "+2 Attaque" },
          { value: "defense", label: "+2 Defense" },
        ],
      };
    }
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, choice, 2);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: choice === "attack" ? "Arène visitee : +2 Attaque." : "Arène visitee : +2 Defense.",
    };
  }

  if (buildingType === AdventureBuildingType.SCHOOL_OF_WAR) {
    if (!choice || !["attack", "defense"].includes(choice)) {
      return {
        type: "ADVENTURE_BUILDING",
        buildingType,
        destination: position,
        buildingId: object.id,
        message: "École de guerre : choisissez l'entrainement pour 1000 Or.",
        choices: [
          { value: "attack", label: "+1 Attaque" },
          { value: "defense", label: "+1 Defense" },
        ],
      };
    }
    if (gamePlayer.gold < ADVENTURE_SCHOOL_COST_GOLD) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Il faut 1000 Or pour suivre cet entrainement." };
    }
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - ADVENTURE_SCHOOL_COST_GOLD });
    await applyHeroStatVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, choice, 1);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      message: choice === "attack" ? "École de guerre : +1 Attaque." : "École de guerre : +1 Defense.",
    };
  }

  if (buildingType === AdventureBuildingType.SCHOOL_OF_MAGIC) {
    if (!choice || !["spellPower", "knowledge"].includes(choice)) {
      return {
        type: "ADVENTURE_BUILDING",
        buildingType,
        destination: position,
        buildingId: object.id,
        message: "École de magie : choisissez l'etude pour 1000 Or.",
        choices: [
          { value: "spellPower", label: "+1 Pouvoir" },
          { value: "knowledge", label: "+1 Savoir" },
        ],
      };
    }
    if (gamePlayer.gold < ADVENTURE_SCHOOL_COST_GOLD) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Il faut 1000 Or pour suivre cette etude." };
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
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Tour de Marletto visitee : +1 Defense." };
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
    await supabase.from("heroes").update({ experience: hero.experience + LEARNING_STONE_EXPERIENCE }).eq("id", hero.id);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Pierre de savoir visitee : +1000 XP." };
  }

  if (buildingType === AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT) {
    if ((hero.level ?? 1) < 10) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "La bibliotheque exige un heros de niveau 10." };
    }
    await supabase.from("heroes").update({
      attack: (hero.attack ?? 0) + 2,
      defense: (hero.defense ?? 0) + 2,
      spell_power: (hero.spellPower ?? 0) + 2,
      knowledge: (hero.knowledge ?? 0) + 2,
    }).eq("id", hero.id);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Bibliothèque d'illumination : +2 a toutes les caracteristiques." };
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
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Le jardin mystique a deja fleuri cette semaine." };
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
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Les ecuries ont deja equipe ce heros cette semaine." };
    }
    await supabase.from("heroes").update({ movement: hero.movement + STABLES_MOVEMENT_BONUS }).eq("id", hero.id);
    await updateWeeklyAdventureVisit(supabase, gameId, mapState, weeklyAdventureVisits, weekKey, currentWeek);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Ecuries visitees : +400 deplacement cette semaine." };
  }

  if (buildingType === AdventureBuildingType.TEMPLE) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, { morale: Number(hero.morale ?? 0) + 1 });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Temple visite : +1 Moral." };
  }

  if (buildingType === AdventureBuildingType.FOUNTAIN_OF_FORTUNE) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, { luck: Number(hero.luck ?? 0) + 1 });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Fontaine de fortune visitee : +1 Chance." };
  }

  if (buildingType === AdventureBuildingType.IDOL_OF_FORTUNE) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, {
      morale: Number(hero.morale ?? 0) + 1,
      luck: Number(hero.luck ?? 0) + 1,
    });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Idole de fortune visitee : +1 Moral, +1 Chance." };
  }

  if (buildingType === AdventureBuildingType.MAGIC_WELL) {
    const weekKey = `${object.id}:${hero.id}`;
    const currentWeek = getAdventureWeekKey(turnNumber);
    if (weeklyAdventureVisits[weekKey] === currentWeek) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Le puits magique est deja epuise cette semaine." };
    }
    const effectiveStats = getEffectiveHeroStatsFromValues(hero);
    const maxMana = getHeroMana({ mana: null, knowledge: effectiveStats.knowledge });
    await supabase.from("heroes").update({ mana: maxMana }).eq("id", hero.id);
    await updateWeeklyAdventureVisit(supabase, gameId, mapState, weeklyAdventureVisits, weekKey, currentWeek);
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
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Cette roue a eau a deja produit cette semaine." };
    }
    const reward = buildingType === AdventureBuildingType.WATER_MILL ? WATER_MILL_GOLD_REWARD : WATER_WHEEL_GOLD_REWARD;
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold + reward });
    await updateWeeklyAdventureVisit(supabase, gameId, mapState, weeklyAdventureVisits, weekKey, currentWeek);
    return {
      type: "ADVENTURE_BUILDING",
      buildingType,
      destination: position,
      reward: { gold: reward },
      message: buildingType === AdventureBuildingType.WATER_MILL ? "Moulin a eau : +1000 Or." : "Roue a eau : +500 Or.",
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
      message: rewardGold ? "Chariot abandonne fouille : +500 Or." : "Chariot abandonne fouille : +5 Bois, +5 Minerai.",
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
      message: rewardGems ? "Squelette fouille : +2 Gemmes." : "Squelette fouille : +300 Or.",
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
    await supabase.from("heroes").update({
      experience: hero.experience + WARRIOR_TOMB_EXPERIENCE_REWARD,
      morale: Number(hero.morale ?? 0) - 1,
    }).eq("id", hero.id);
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
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: `${getAdventureBuildingLabel(buildingType)} visite : ${spell.label} appris.` };
  }

  if (buildingType === AdventureBuildingType.TREE_OF_KNOWLEDGE) {
    if (gamePlayer.gold < TREE_OF_KNOWLEDGE_COST_GOLD) {
      return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Il faut 2000 Or pour recevoir l'enseignement de l'arbre." };
    }
    await updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - TREE_OF_KNOWLEDGE_COST_GOLD });
    await supabase.from("heroes").update({ experience: hero.experience + TREE_OF_KNOWLEDGE_EXPERIENCE }).eq("id", hero.id);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Arbre de connaissance : +2000 XP contre 2000 Or." };
  }

  if (buildingType === AdventureBuildingType.SEER_HUT) {
    const effectiveStats = getEffectiveHeroStatsFromValues(hero);
    const maxMana = getHeroMana({ mana: null, knowledge: effectiveStats.knowledge });
    const currentMana = getHeroMana({ mana: hero.mana, knowledge: effectiveStats.knowledge });
    await supabase.from("heroes").update({
      experience: hero.experience + SEER_HUT_EXPERIENCE,
      mana: Math.min(maxMana, currentMana + 10),
    }).eq("id", hero.id);
    await updateHeroAdventureVisits(supabase, gameId, mapState, heroAdventureVisits, hero.id, object.id);
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Hutte d'erudit visitee : +1000 XP, +10 mana." };
  }

  if (buildingType === AdventureBuildingType.MERMAID) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, { luck: Number(hero.luck ?? 0) + 1 });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Sirene rencontree : +1 Chance." };
  }

  if (buildingType === AdventureBuildingType.BUOY) {
    await applyHeroAttributeVisit(supabase, gameId, mapState, hero, heroAdventureVisits, object.id, { morale: Number(hero.morale ?? 0) + 1 });
    return { type: "ADVENTURE_BUILDING", buildingType, destination: position, message: "Bouee visitee : +1 Moral." };
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
    message: `${getAdventureBuildingLabel(buildingType)} visite.`,
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

function isSingleMapRewardBuilding(type: AdventureBuildingType) {
  return [
    AdventureBuildingType.ABANDONED_WAGON,
    AdventureBuildingType.CRATE,
    AdventureBuildingType.SKELETON,
    AdventureBuildingType.WARRIOR_TOMB,
    AdventureBuildingType.FLOTSAM,
    AdventureBuildingType.SEA_CHEST,
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
  await supabase.from("games").update({
    map_state: {
      ...mapState,
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

interface CaptureTownRow {
  id: string;
  game_player_id: string | null;
  x: number;
  y: number;
  level?: number;
  town_type?: string;
  buildings?: string[];
  neutral_garrison?: unknown[];
  is_neutral?: boolean;
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
  hero,
  spellId,
  target,
  mapData,
  explored,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  gamePlayer: MinimalPlayer;
  players: Array<{ id: string; isAlive?: boolean; heroes?: MinimalHero[] }>;
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
    const destination = getActionPosition(target);
    if (!destination) return { ok: false, error: "Destination invalide" };
    if (!explored.has(`${destination.x},${destination.y}`)) return { ok: false, error: "La destination doit etre visible" };
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
    const townId = typeof target === "object" && target !== null ? String((target as { townId?: unknown }).townId ?? "") : "";
    const town = (townId ? gamePlayer.towns.find((item) => item.id === townId) : gamePlayer.towns[0]) ?? null;
    if (!town) return { ok: false, error: "Aucune ville alliee disponible" };
    const destination = findTownPortalLanding(mapData, { x: town.x, y: town.y }, gamePlayer.heroes, hero.id);
    if (!destination) return { ok: false, error: "La ville cible est bloquee" };

    await supabase.from("heroes").update({ x: destination.x, y: destination.y }).eq("id", hero.id);
    for (const key of computeVisibleTiles(mapData, [destination], 5)) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
    return {
      ok: true,
      interaction: { type: "ADVENTURE_SPELL", spellId, message: `Portail de ville : arrivee a ${town.id}.`, destination },
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
  if (!artifactId) return { ok: false, error: "Aucun artefact equipe" };
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
    if (!slot) return { ok: false, error: "Artefact absent du heros source" };
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
  if (!Array.isArray(path) || path.length < 1) return { ok: false, error: "Le heros doit s'arreter devant l'artefact" };
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
  const requiredMovement = getRequiredAdventureMovement(map, path as Position[]);
  if (requiredMovement > movement) return { ok: false, error: "Deplacement insuffisant" };
  return { ok: true, usedMovement };
}
