import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { buildCombatEnvironment } from "@/lib/game/combat/environment";
import { createCombatBoard, resolveAutomaticCombat } from "@/lib/game/combat/persistent";
import { GameMap, UnitStack, UnitType } from "@/lib/game/types";
import {
  canMoveAdventureStep,
  computeVisibleTiles,
  getAdventureStepCost,
  getPlayerVisionCenters,
  getUsableAdventureMovement,
  normalizeMapMovement,
} from "@/lib/game/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations, toCombat } from "@/lib/supabase/game-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const supabase = createAdminClient();
  const gamePlayer = await getGamePlayer(supabase, id, user.id);
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });

  const { data, error } = await supabase
    .from("combats")
    .select("*, combat_participants(*)")
    .eq("game_id", id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(toCombat));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const body = await request.json();
  const supabase = createAdminClient();
  const game = await getGameWithRelations(supabase, id);
  const players = (game?.players ?? []) as unknown as Array<{
    id: string;
    userId: string | null;
    isAi?: boolean;
    exploredTiles: string[];
    towns: Array<{ x: number; y: number }>;
    resourceBuildings: Array<{ id: string; x: number; y: number; guardianPower: number }>;
    heroes: Array<{
      id: string;
      attack: number;
      defense: number;
      movement: number;
      armies: Parameters<typeof createCombatBoard>[0]["armies"];
      x: number;
      y: number;
    }>;
  }>;
  const neutralArmies = (game?.neutralArmies ?? []) as unknown as Array<{
    id: string;
    x: number;
    y: number;
    status: string;
    stacks: UnitStack[];
  }>;
  const gamePlayer = players.find((player) => player.userId === user.id);

  if (!game || !gamePlayer) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

  const completedTurn = ((game.turns ?? []) as Array<{ gamePlayerId: string; turnNumber: number; isCompleted: boolean }>).find(
    (turn) => turn.gamePlayerId === gamePlayer.id && turn.turnNumber === game.turnNumber && turn.isCompleted
  );
  if (completedTurn) {
    return NextResponse.json({ error: "Vous avez deja termine votre tour" }, { status: 403 });
  }

  const attacker = gamePlayer.heroes.find((hero) => hero.id === body.attackerHeroId);
  if (!attacker) return NextResponse.json({ error: "Héros attaquant invalide" }, { status: 400 });
  if (isHeroInActiveCombat(game.combats, attacker.id)) {
    return NextResponse.json({ error: "Ce heros est deja engage dans un combat." }, { status: 400 });
  }

  // Move hero to combat location if a valid path is provided
  if (Array.isArray(body.path) && body.path.length >= 2) {
    const mapData = normalizeMapMovement(game.mapData as GameMap);
    const validation = validateCombatPath(mapData, { x: attacker.x, y: attacker.y }, body.path, attacker.movement ?? 0);
    if (!validation.ok) return NextResponse.json({ error: "Chemin de combat invalide" }, { status: 400 });

    const lastPos = body.path[body.path.length - 1] as { x: number; y: number };
    await supabase.from("heroes").update({
      x: lastPos.x,
      y: lastPos.y,
      movement: getUsableAdventureMovement(mapData, lastPos, (attacker.movement ?? 0) - validation.usedMovement),
    }).eq("id", attacker.id);
    attacker.x = lastPos.x;
    attacker.y = lastPos.y;

    const newlyVisible = computeVisibleTiles(
      mapData,
      getPlayerVisionCenters({
        heroes: [{ position: { x: lastPos.x, y: lastPos.y } }],
        towns: (gamePlayer.towns ?? []).map((t) => ({ position: { x: t.x, y: t.y } })),
      }),
      5
    );
    const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
    for (const key of newlyVisible) explored.add(key);
    await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);
  }

  const defender = getDefender({
    targetId: String(body.targetId ?? ""),
    targetType: String(body.targetType ?? ""),
    attackerPlayerId: gamePlayer.id,
    players,
    neutralArmies,
  });
  const buildingDefender = !defender && body.targetType === "building"
    ? await getBuildingDefender(supabase, id, String(body.targetId ?? ""))
    : null;
  const targetPosition = getTargetPosition(body);
  const townDefender = !defender && !buildingDefender && body.targetType === "town"
    ? await getTownDefender(supabase, id, String(body.targetId ?? ""), targetPosition)
    : null;
  const targetDefender = defender ?? buildingDefender ?? townDefender;
  if (!targetDefender) {
    const debug = {
      gameId: id,
      targetType: body.targetType,
      targetId: body.targetId,
      attackerHeroId: body.attackerHeroId,
      neutralArmies: neutralArmies.length,
      activeNeutralArmies: neutralArmies.filter((army) => army.status === "ACTIVE").length,
      playerCount: players.length,
    };
    console.warn("Invalid combat target", debug);
    return NextResponse.json({
      error: "Cible de combat invalide",
      details: debug,
    }, { status: 400 });
  }
  const defenderOwner = targetDefender.playerId ? players.find((player) => player.id === targetDefender.playerId) : null;
  if (body.mode === "AUTO" && body.targetType === "hero" && !defenderOwner?.isAi) {
    return NextResponse.json({ error: "Les combats entre joueurs doivent etre manuels" }, { status: 400 });
  }
  if (targetDefender.heroId && isHeroInActiveCombat(game.combats, targetDefender.heroId)) {
    return NextResponse.json({ error: "Ce heros est deja engage dans un combat." }, { status: 400 });
  }

  const mapData = normalizeMapMovement(game.mapData as GameMap);
  const environment = buildCombatEnvironment(mapData, { x: targetDefender.x, y: targetDefender.y });
  const combatStart = createCombatBoard(
    {
      id: attacker.id,
      playerId: gamePlayer.id,
      heroId: attacker.id,
      attack: attacker.attack,
      defense: attacker.defense,
      armies: attacker.armies,
    },
    {
      id: targetDefender.id,
      playerId: targetDefender.playerId,
      heroId: targetDefender.heroId,
      attack: targetDefender.attack,
      defense: targetDefender.defense,
      armies: targetDefender.armies,
    }
  );
  const autoResult = body.mode === "AUTO"
    ? resolveAutomaticCombat(
      {
        id: attacker.id,
        playerId: gamePlayer.id,
        heroId: attacker.id,
        attack: attacker.attack,
        defense: attacker.defense,
        armies: attacker.armies,
      },
      {
        id: targetDefender.id,
        playerId: targetDefender.playerId,
        heroId: targetDefender.heroId,
        attack: targetDefender.attack,
        defense: targetDefender.defense,
        armies: targetDefender.armies,
      }
    )
    : null;
  const result = autoResult
    ? {
      ...autoResult,
      winnerPlayerId: autoResult.winnerId === attacker.id ? gamePlayer.id : targetDefender.playerId,
    }
    : null;

  const { data, error } = await supabase
    .from("combats")
    .insert({
      game_id: id,
      mode: body.mode ?? "MANUAL",
      status: result ? "RESOLVED" : "ACTIVE",
      attacker_player_id: gamePlayer.id,
      defender_player_id: targetDefender.playerId,
      attacker_hero_id: attacker.id,
      defender_hero_id: targetDefender.heroId,
      neutral_army_id: targetDefender.neutralArmyId,
      x: targetDefender.x,
      y: targetDefender.y,
      board_state: { ...combatStart.boardState, environment },
      current_player_id: result ? null : combatStart.currentPlayerId,
      current_unit_id: result ? null : combatStart.currentUnitId,
      turn_queue: combatStart.turnQueue,
      action_log: result ? ["Combat automatique.", ...result.log] : ["Combat lance."],
      result,
    })
    .select("*, combat_participants(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (autoResult && result) {
    const attackerWon = autoResult.winnerId === attacker.id;
    if (attackerWon) {
      if (targetDefender.neutralArmyId) {
        await supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", targetDefender.neutralArmyId);
      } else if (body.targetType === "town") {
        await captureNeutralTown(supabase, id, targetDefender.id, gamePlayer.id);
      } else if (targetDefender.heroId && targetDefender.playerId) {
        await supabase.from("armies").delete().eq("hero_id", targetDefender.heroId);
        await supabase.from("heroes").delete().eq("id", targetDefender.heroId);
      } else if (!targetDefender.playerId) {
        await supabase
          .from("resource_buildings")
          .update({ game_player_id: gamePlayer.id, guardian_power: 0 })
          .eq("game_id", id)
          .eq("id", targetDefender.id);
      }
    } else {
      await supabase.from("armies").delete().eq("hero_id", attacker.id);
      await supabase.from("heroes").delete().eq("id", attacker.id);
    }
  }

  return NextResponse.json({ combat: toCombat(data), result }, { status: 201 });
}

function getTargetPosition(body: { destination?: { x?: unknown; y?: unknown }; path?: Array<{ x?: unknown; y?: unknown }> }) {
  if (body.destination) return body.destination;
  return Array.isArray(body.path) ? body.path[body.path.length - 1] : undefined;
}

async function getTownDefender(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  targetId: string,
  targetPosition?: { x?: unknown; y?: unknown }
) {
  let { data: town, error } = await supabase
    .from("towns")
    .select("id,x,y,neutral_garrison")
    .eq("game_id", gameId)
    .eq("id", targetId)
    .eq("is_neutral", true)
    .maybeSingle();

  const x = Number(targetPosition?.x);
  const y = Number(targetPosition?.y);
  if (!town && Number.isFinite(x) && Number.isFinite(y)) {
    const fallback = await supabase
      .from("towns")
      .select("id,x,y,neutral_garrison")
      .eq("game_id", gameId)
      .eq("x", x)
      .eq("y", y)
      .eq("is_neutral", true)
      .maybeSingle();
    town = fallback.data;
    error = fallback.error;
  }

  const garrison = (town?.neutral_garrison ?? []) as UnitStack[];
  if (error || !town || garrison.length === 0) return null;

  return {
    id: town.id,
    playerId: null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies: garrison,
    x: town.x,
    y: town.y,
  };
}

async function captureNeutralTown(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  townId: string,
  playerId: string
) {
  await supabase
    .from("towns")
    .update({ game_player_id: playerId, is_neutral: false, neutral_garrison: [] })
    .eq("game_id", gameId)
    .eq("id", townId)
    .eq("is_neutral", true);
}

async function getBuildingDefender(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  targetId: string
) {
  const { data: building, error } = await supabase
    .from("resource_buildings")
    .select("id,x,y,guardian_power")
    .eq("game_id", gameId)
    .eq("id", targetId)
    .maybeSingle();

  if (error || !building || building.guardian_power <= 0) return null;

  const count = Math.max(5, Math.ceil(Number(building.guardian_power) / 12));
  return {
    id: building.id,
    playerId: null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies: [{
      id: `${building.id}-guards`,
      unitType: UnitType.PIKEMAN,
      count,
      health: count * 12,
      maxHealth: 12,
      position: 0,
    }],
    x: building.x,
    y: building.y,
  };
}

function validateCombatPath(
  map: GameMap,
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
  movement: number
): { ok: true; usedMovement: number } | { ok: false } {
  if (!Array.isArray(path) || path.length < 2) return { ok: false };
  if (path[0]?.x !== start.x || path[0]?.y !== start.y) return { ok: false };

  let usedMovement = 0;
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    if (!canMoveAdventureStep(map, prev, curr)) return { ok: false };
    const stepCost = getAdventureStepCost(map, prev, curr);
    if (!Number.isFinite(stepCost)) return { ok: false };
    usedMovement += stepCost;
  }
  if (usedMovement > movement) return { ok: false };
  return { ok: true, usedMovement };
}

function getDefender({
  targetId,
  targetType,
  attackerPlayerId,
  players,
  neutralArmies,
}: {
  targetId: string;
  targetType: string;
  attackerPlayerId: string;
  players: Array<{
    id: string;
    resourceBuildings: Array<{ id: string; x: number; y: number; guardianPower: number }>;
    heroes: Array<{ id: string; attack: number; defense: number; armies: UnitStack[]; x: number; y: number }>;
  }>;
  neutralArmies: Array<{ id: string; x: number; y: number; status: string; stacks: UnitStack[] }>;
}) {
  if (targetType === "hero") {
    for (const player of players) {
      if (player.id === attackerPlayerId) continue;
      const hero = player.heroes.find((item) => item.id === targetId);
      if (!hero) continue;
      return {
        id: hero.id,
        playerId: player.id,
        heroId: hero.id,
        neutralArmyId: null,
        attack: hero.attack,
        defense: hero.defense,
        armies: hero.armies,
        x: hero.x,
        y: hero.y,
      };
    }
  }

  if (targetType === "monster") {
    const army = neutralArmies.find((item) => item.id === targetId && item.status === "ACTIVE");
    if (!army) return null;
    return {
      id: army.id,
      playerId: null,
      heroId: null,
      neutralArmyId: army.id,
      attack: 1,
      defense: 1,
      armies: army.stacks,
      x: army.x,
      y: army.y,
    };
  }

  if (targetType === "building") {
    const building = players.flatMap((player) => player.resourceBuildings).find((item) => item.id === targetId);
    if (!building || building.guardianPower <= 0) return null;
    const count = Math.max(5, Math.ceil(building.guardianPower / 12));
    return {
      id: building.id,
      playerId: null,
      heroId: null,
      neutralArmyId: null,
      attack: 1,
      defense: 1,
      armies: [{
        id: `${building.id}-guards`,
        unitType: UnitType.PIKEMAN,
        count,
        health: count * 12,
        maxHealth: 12,
        position: 0,
      }],
      x: building.x,
      y: building.y,
    };
  }

  return null;
}
