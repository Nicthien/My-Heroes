import { NextResponse } from "next/server";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { isCreatureBankType } from "@/lib/game/creature-banks";
import { normalizeMapLevel, withActiveMapLayer } from "@/lib/game/map-levels";
import {
  computeExtraHeroScoutingTiles,
  computeExtraTownVisionTiles,
  computeVisibleTiles,
  getPlayerVisionCenters,
  getUsableAdventureMovement,
  normalizeMapMovement,
  resolveAdventureMovementMode,
  type AdventureMovementMode,
  type HeroAdventureSpellEffect,
} from "@/lib/game/engine";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { AdventureBuildingType, Faction, GameMap, MapObject, Position, UnitType } from "@/lib/game/types";
import type {
  HeroStatKey,
  MinimalBuilding,
  MinimalGate,
  MinimalHero,
  MinimalPlayer,
  MinimalTown,
  MoveInteraction,
  SupabaseAdminClient,
} from "./types";

type MoveHeroPlayer = {
  id: string;
  isAlive: boolean;
  turnOrder: number;
  resourceBuildings: MinimalBuilding[];
  towns: MinimalTown[];
  heroes?: MinimalHero[];
};

/** Route-owned helpers injected into the hero movement handler. */
export type MoveHeroHelpers = {
  getEffectiveGates: (gates: MinimalGate[], mapData: GameMap) => MinimalGate[];
  validateMovePath: (
    map: GameMap,
    start: { x: number; y: number },
    path: Array<{ x: number; y: number }>,
    movement: number,
    mode?: AdventureMovementMode,
  ) => { ok: true; usedMovement: number } | { ok: false; error: string };
  getDefeatedCreatureBanks: (mapState: Record<string, unknown>) => Set<string>;
  findFirstMoveStop: (params: {
    path: Position[];
    map: GameMap;
    movingHeroId: string;
    movingPlayerId: string;
    players: Array<{ id: string; resourceBuildings: MinimalBuilding[]; towns?: MinimalTown[]; heroes?: MinimalHero[] }>;
    gates: MinimalGate[];
    collected: Set<string>;
    killed: Set<string>;
    visitedAdventureBuildings: Set<string>;
    defeatedCreatureBanks: Set<string>;
  }) => { pathIndex: number; stopBefore?: boolean; object?: MapObject; hero?: MinimalHero & { playerId: string }; targetPosition?: Position } | null;
  getPathMovementCost: (map: GameMap, path: Position[], skills?: Record<string, string>, mode?: AdventureMovementMode) => number;
  getResourcePileAmount: (object: MapObject) => number;
  incrementPlayerResource: (supabase: SupabaseAdminClient, playerId: string, resource: string, amount: number) => Promise<void>;
  resolveDiplomacyOnMonster: (params: {
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
  }) => Promise<{ outcome: "flee" | "join"; joinedCount?: number; goldCost?: number; remainder?: number } | null>;
  findGate: (gates: MinimalGate[], gateId: string, position: Position) => MinimalGate | undefined;
  getResourceBuilding: (supabase: SupabaseAdminClient, gameId: string, buildingId: string) => Promise<MinimalBuilding | null>;
  findResourceBuildingOwner: (
    players: Array<{ id: string; resourceBuildings: MinimalBuilding[] }>,
    object: MapObject,
    position: Position,
  ) => { id: string } | undefined;
  captureGate: (supabase: SupabaseAdminClient, gameId: string, gate: MinimalGate, playerId: string) => Promise<void>;
  applyOwnTownVisitBonuses: (params: {
    supabase: SupabaseAdminClient;
    gameId: string;
    mapState: Record<string, unknown>;
    hero: MinimalHero;
    town: MinimalTown;
    playerFaction: Faction;
    turnNumber: number;
  }) => Promise<void>;
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: Record<string, unknown>,
  ) => Promise<void>;
  handleAdventureBuildingVisit: (params: {
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
  }) => Promise<MoveInteraction>;
};

type MoveHeroGame = {
  mapData: unknown;
  combats?: Parameters<typeof isHeroInActiveCombat>[0];
  neutralArmies?: unknown;
  mapState?: unknown;
  turnNumber?: unknown;
};

export async function handleMoveHeroAction({
  supabase,
  game,
  gameId: id,
  gamePlayer,
  players,
  gates,
  action,
  heroInCombatError,
  helpers,
}: {
  supabase: SupabaseAdminClient;
  game: MoveHeroGame;
  gameId: string;
  gamePlayer: MinimalPlayer;
  players: MoveHeroPlayer[];
  gates: MinimalGate[];
  action: { type: string; heroId: string; path: Position[] };
  heroInCombatError: string;
  helpers: MoveHeroHelpers;
}): Promise<NextResponse | null> {
  if (action.type !== "MOVE_HERO") return null;

  const {
    getEffectiveGates,
    validateMovePath,
    getDefeatedCreatureBanks,
    findFirstMoveStop,
    getPathMovementCost,
    getResourcePileAmount,
    incrementPlayerResource,
    resolveDiplomacyOnMonster,
    findGate,
    getResourceBuilding,
    findResourceBuildingOwner,
    captureGate,
    applyOwnTownVisitBonuses,
    logPlayerAction,
    handleAdventureBuildingVisit,
  } = helpers;

  const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
  if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });

  const fullMapData = normalizeMapMovement(game.mapData as GameMap);
  const heroMapLevel = normalizeMapLevel(hero.mapLevel);
  const mapData = withActiveMapLayer(fullMapData, heroMapLevel);
  const effectiveGates = getEffectiveGates(gates, mapData);
  if (isHeroInActiveCombat(game.combats, hero.id)) {
    return NextResponse.json({ error: heroInCombatError }, { status: 400 });
  }
  const heroSpellEffects = ((hero as unknown as { activeSpellEffects?: HeroAdventureSpellEffect[] | null }).activeSpellEffects) ?? null;
  const movementMode: AdventureMovementMode | undefined =
    heroSpellEffects?.some((effect) => effect.spellId === "fly" || effect.spellId === "water_walk")
      ? resolveAdventureMovementMode(mapData, { x: hero.x, y: hero.y }, heroSpellEffects)
      : undefined;
  const validation = validateMovePath(mapData, { x: hero.x, y: hero.y }, action.path, hero.movement, movementMode);
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
    return NextResponse.json({ error: heroInCombatError }, { status: 400 });
  }
  const stopPathIndex = firstStop?.stopBefore ? Math.max(0, firstStop.pathIndex - 1) : firstStop?.pathIndex;
  const movePath = typeof stopPathIndex === "number" ? action.path.slice(0, stopPathIndex + 1) : action.path;
  const usedMovement = getPathMovementCost(mapData, movePath, (hero as unknown as { skills?: Record<string, string> }).skills, movementMode);
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
