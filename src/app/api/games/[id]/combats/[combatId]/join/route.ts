import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, toCombat } from "@/lib/supabase/game-db";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { addReinforcementUnits, buildTurnQueue, cloneCombatUnits, getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import {
  areAdventurePositionsAdjacent,
  computeVisibleTiles,
  getAdventurePathCostAvoiding,
  getPlayerVisionCenters,
  getRequiredAdventureMovementAvoiding,
  getUsableAdventureMovement,
  normalizeMapMovement,
} from "@/lib/game/engine";
import { normalizeMapLevel, withActiveMapLayer } from "@/lib/game/map-levels";
import { getArmyNativeTerrain } from "@/lib/game/native-terrain";
import type { CombatBoardUnit, CombatSide, CombatTerrainFeature, GameMap, TerrainType, UnitStack } from "@/lib/game/types";

type JoinHero = {
  id: string;
  x: number;
  y: number;
  movement: number;
  mapLevel: string | null;
  armies: UnitStack[];
};

type JoinPlayer = {
  id: string;
  faction?: string;
  isAlive?: boolean;
  exploredTiles: string[];
  towns: Array<{ x: number; y: number }>;
  heroes: JoinHero[];
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id, combatId } = await params;
  const body = await request.json();
  const supabase = createAdminClient();
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("status, map_data")
    .eq("id", id)
    .single();
  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

  const gamePlayer = await getGamePlayer(supabase, id, user.id) as unknown as JoinPlayer | null;
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  if (!gamePlayer.isAlive) return NextResponse.json({ error: "Vous avez perdu cette partie" }, { status: 403 });

  if (typeof body.requestId === "string" && (body.decision === "accept" || body.decision === "reject")) {
    return handleReinforcementDecision({
      supabase,
      gameId: id,
      combatId,
      gamePlayerId: gamePlayer.id,
      requestId: body.requestId,
      decision: body.decision,
    });
  }

  const hero = gamePlayer.heroes.find((item) => item.id === String(body.heroId));
  if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });

  const { data: activeCombats, error: activeCombatsError } = await supabase
    .from("combats")
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .eq("game_id", id)
    .eq("status", "ACTIVE");
  if (activeCombatsError) return NextResponse.json({ error: activeCombatsError.message }, { status: 500 });
  if (isHeroInActiveCombat((activeCombats ?? []).map(toCombat), hero.id)) {
    return NextResponse.json({ error: "Ce héros est déjà engagé dans un combat." }, { status: 400 });
  }

  const side: CombatSide = body.side === "defender" ? "defender" : "attacker";
  const { data: combat, error: combatError } = await supabase
    .from("combats")
    .select("status, attacker_player_id, defender_player_id, x, y, map_level")
    .eq("id", combatId)
    .eq("game_id", id)
    .single();
  if (combatError) return NextResponse.json({ error: combatError.message }, { status: 500 });
  if (combat.status !== "ACTIVE") return NextResponse.json({ error: "Ce combat est terminé" }, { status: 400 });

  const adjacency = await ensureHeroAdjacentToCombat({
    supabase,
    gamePlayer,
    hero,
    combat: { x: Number(combat.x), y: Number(combat.y), mapLevel: combat.map_level as string | null },
    body,
    mapData: game.map_data as GameMap,
  });
  if (!adjacency.ok) return NextResponse.json({ error: adjacency.error }, { status: adjacency.status });

  const targetPlayerId = side === "attacker" ? combat.attacker_player_id : combat.defender_player_id;
  if (targetPlayerId && targetPlayerId !== gamePlayer.id) {
    const { error } = await supabase
      .from("combat_reinforcement_requests")
      .upsert({
        combat_id: combatId,
        requester_player_id: gamePlayer.id,
        requester_hero_id: hero.id,
        target_player_id: targetPlayerId,
        side,
        status: "PENDING",
        decided_at: null,
      }, { onConflict: "combat_id,requester_hero_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pending: true, message: "Demande de renfort envoyee." });
  }

  return addHeroToCombat({ supabase, combatId, playerId: gamePlayer.id, faction: gamePlayer.faction, hero, side });
}

async function handleReinforcementDecision({
  supabase,
  gameId,
  combatId,
  gamePlayerId,
  requestId,
  decision,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  gameId: string;
  combatId: string;
  gamePlayerId: string;
  requestId: string;
  decision: "accept" | "reject";
}) {
  const { data: reinforcementRequest, error: requestError } = await supabase
    .from("combat_reinforcement_requests")
    .select("*")
    .eq("id", requestId)
    .eq("combat_id", combatId)
    .eq("target_player_id", gamePlayerId)
    .eq("status", "PENDING")
    .single();
  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 404 });

  if (decision === "reject") {
    const { error } = await supabase
      .from("combat_reinforcement_requests")
      .update({ status: "REJECTED", decided_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return respondWithCombat(supabase, combatId);
  }

  const { data: requesterPlayer, error: playerError } = await supabase
    .from("game_players")
    .select("id,is_alive,faction,heroes(*,armies(*))")
    .eq("id", reinforcementRequest.requester_player_id)
    .eq("game_id", gameId)
    .single();
  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 });
  if (!requesterPlayer?.is_alive) return NextResponse.json({ error: "Le joueur demandeur a perdu cette partie" }, { status: 400 });

  const heroRow = ((requesterPlayer.heroes ?? []) as Array<Record<string, unknown>>)
    .find((hero) => hero.id === reinforcementRequest.requester_hero_id);
  if (!heroRow) return NextResponse.json({ error: "Héros de renfort introuvable" }, { status: 400 });

  const hero = { id: String(heroRow.id), armies: mapUnitStacks(heroRow.armies) };
  const { data: activeCombats, error: activeCombatsError } = await supabase
    .from("combats")
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .eq("game_id", gameId)
    .eq("status", "ACTIVE");
  if (activeCombatsError) return NextResponse.json({ error: activeCombatsError.message }, { status: 500 });
  if (isHeroInActiveCombat((activeCombats ?? []).map(toCombat), hero.id)) {
    return NextResponse.json({ error: "Ce héros est déjà engagé dans un combat." }, { status: 400 });
  }

  // Le héros demandeur s'est déjà déplacé contre la case de la bataille lors de la
  // création de la demande, mais il a pu repartir depuis : on revalide l'adjacence
  // avant d'accepter pour éviter une rejointe à distance.
  const { data: combatRow, error: combatError } = await supabase
    .from("combats")
    .select("x, y, map_level")
    .eq("id", combatId)
    .eq("game_id", gameId)
    .single();
  if (combatError) return NextResponse.json({ error: combatError.message }, { status: 500 });
  const heroX = Number(heroRow.x);
  const heroY = Number(heroRow.y);
  const heroMapLevel = normalizeMapLevel(heroRow.map_level as string | null | undefined);
  const combatMapLevel = normalizeMapLevel(combatRow.map_level as string | null);
  if (heroMapLevel !== combatMapLevel) {
    return NextResponse.json({ error: "Le héros n'est plus sur le même niveau que la bataille" }, { status: 400 });
  }
  if (!areAdventurePositionsAdjacent({ x: heroX, y: heroY }, { x: Number(combatRow.x), y: Number(combatRow.y) })) {
    return NextResponse.json({ error: "Le héros de renfort n'est plus à côté de la bataille" }, { status: 400 });
  }

  const joinResponse = await addHeroToCombat({
    supabase,
    combatId,
    playerId: String(reinforcementRequest.requester_player_id),
    faction: (requesterPlayer as { faction?: string }).faction,
    hero,
    side: reinforcementRequest.side === "defender" ? "defender" : "attacker",
  });
  if (!joinResponse.ok) return joinResponse;

  const { error: updateError } = await supabase
    .from("combat_reinforcement_requests")
    .update({ status: "APPROVED", decided_at: new Date().toISOString() })
    .eq("id", requestId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return respondWithCombat(supabase, combatId);
}

async function ensureHeroAdjacentToCombat(params: {
  supabase: ReturnType<typeof createAdminClient>;
  gamePlayer: JoinPlayer;
  hero: JoinHero;
  combat: { x: number; y: number; mapLevel: string | null };
  body: { path?: unknown };
  mapData: GameMap;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const combatPosition = { x: params.combat.x, y: params.combat.y };
  if (normalizeMapLevel(params.hero.mapLevel) !== normalizeMapLevel(params.combat.mapLevel)) {
    return { ok: false, status: 400, error: "Le héros n'est pas sur le même niveau que la bataille" };
  }

  const heroStart = { x: params.hero.x, y: params.hero.y };
  const path = sanitizeAdventurePath(params.body.path);
  const mapForLevel = withActiveMapLayer(normalizeMapMovement(params.mapData), normalizeMapLevel(params.hero.mapLevel));
  const nativeTerrain = getArmyNativeTerrain(params.hero.armies);

  if (path) {
    const validation = validateJoinPath(mapForLevel, heroStart, path, params.hero.movement, combatPosition, nativeTerrain);
    if (!validation.ok) {
      return { ok: false, status: 400, error: "Chemin de combat invalide" };
    }
    const lastPos = validation.destination;
    if (lastPos.x !== params.hero.x || lastPos.y !== params.hero.y) {
      const remainingMovement = getUsableAdventureMovement(mapForLevel, lastPos, params.hero.movement - validation.usedMovement);
      const { error: heroUpdateError } = await params.supabase.from("heroes").update({
        x: lastPos.x,
        y: lastPos.y,
        movement: remainingMovement,
      }).eq("id", params.hero.id);
      if (heroUpdateError) return { ok: false, status: 500, error: heroUpdateError.message };
      params.hero.x = lastPos.x;
      params.hero.y = lastPos.y;
      params.hero.movement = remainingMovement;

      const newlyVisible = computeVisibleTiles(
        mapForLevel,
        getPlayerVisionCenters({
          heroes: [{ position: { x: lastPos.x, y: lastPos.y } }],
          towns: (params.gamePlayer.towns ?? []).map((t) => ({ position: { x: t.x, y: t.y } })),
        }),
        5,
      );
      const explored = new Set<string>(params.gamePlayer.exploredTiles ?? []);
      for (const key of newlyVisible) explored.add(key);
      await params.supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", params.gamePlayer.id);
    }
    return { ok: true };
  }

  if (!areAdventurePositionsAdjacent(heroStart, combatPosition)) {
    return { ok: false, status: 400, error: "Le héros doit s'arrêter à côté de la bataille avant de la rejoindre" };
  }
  return { ok: true };
}

function sanitizeAdventurePath(value: unknown): Array<{ x: number; y: number }> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const path: Array<{ x: number; y: number }> = [];
  for (const step of value) {
    if (!step || typeof step !== "object") return null;
    const x = Number((step as { x?: unknown }).x);
    const y = Number((step as { y?: unknown }).y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    path.push({ x, y });
  }
  return path;
}

function validateJoinPath(
  map: GameMap,
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
  movement: number,
  target: { x: number; y: number },
  nativeTerrain?: TerrainType | null,
): { ok: true; usedMovement: number; destination: { x: number; y: number } } | { ok: false } {
  if (path.length < 1) return { ok: false };
  if (path[0].x !== start.x || path[0].y !== start.y) return { ok: false };
  const destination = path[path.length - 1];
  if (!destination || !areAdventurePositionsAdjacent(destination, target)) return { ok: false };
  const usedMovement = getAdventurePathCostAvoiding(map, path, [target], nativeTerrain);
  if (!Number.isFinite(usedMovement)) return { ok: false };
  const requiredMovement = getRequiredAdventureMovementAvoiding(map, path, [target], nativeTerrain);
  if (requiredMovement > movement) return { ok: false };
  return { ok: true, usedMovement, destination };
}

async function addHeroToCombat({
  supabase,
  combatId,
  playerId,
  faction,
  hero,
  side,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  combatId: string;
  playerId: string;
  faction?: string | null;
  hero: { id: string; armies: UnitStack[] };
  side: CombatSide;
}) {
  const { data: participantRow, error: insertError } = await supabase
    .from("combat_participants")
    .upsert({
      combat_id: combatId,
      player_id: playerId,
      hero_id: hero.id,
      side,
    }, { onConflict: "combat_id,hero_id" })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data: combatRow, error: combatError } = await supabase
    .from("combats")
    .select("board_state, turn_queue, round, current_unit_id, status")
    .eq("id", combatId)
    .single();
  if (combatError) return NextResponse.json({ error: combatError.message }, { status: 500 });
  if (combatRow.status !== "ACTIVE") return NextResponse.json({ error: "Ce combat est terminé" }, { status: 400 });

  const boardState = (combatRow.board_state ?? { units: [], terrain: [] }) as {
    units: CombatBoardUnit[];
    initialUnits?: CombatBoardUnit[];
    terrain?: CombatTerrainFeature[];
    environment?: { terrain?: import("@/lib/game/types").TerrainType };
    moraleContext?: { attackerHeroMorale?: number; defenderHeroMorale?: number; attackerHeroLuck?: number; defenderHeroLuck?: number };
  };
  const units = [...(boardState.units ?? [])];
  const initialUnits = [...(boardState.initialUnits ?? boardState.units ?? [])];
  const terrain = boardState.terrain ?? [];
  const round = combatRow.round ?? 1;
  const alreadyOnBoard = units.some((unit) => unit.heroId === hero.id);

  if (!alreadyOnBoard) {
    const beforeReinforcements = units.length;
    addReinforcementUnits({
      units,
      terrain,
      armies: hero.armies ?? [],
      side,
      ownerPlayerId: playerId,
      heroId: hero.id,
      participantId: participantRow.id,
      joinsRound: round + 1,
      faction,
      moraleContext: {
        attackerHeroMorale: Number(boardState.moraleContext?.attackerHeroMorale ?? 0),
        defenderHeroMorale: Number(boardState.moraleContext?.defenderHeroMorale ?? 0),
        attackerHeroLuck: Number(boardState.moraleContext?.attackerHeroLuck ?? 0),
        defenderHeroLuck: Number(boardState.moraleContext?.defenderHeroLuck ?? 0),
        terrain: boardState.environment?.terrain,
      },
    });
    initialUnits.push(...cloneCombatUnits(units.slice(beforeReinforcements)));

    const turnQueue = buildTurnQueue(units, round);
    const currentUnitId = combatRow.current_unit_id && turnQueue.includes(combatRow.current_unit_id)
      ? combatRow.current_unit_id
      : turnQueue[0] ?? null;

    const { error: updateError } = await supabase
      .from("combats")
      .update({
        board_state: { ...boardState, units, initialUnits, terrain },
        turn_queue: turnQueue,
        current_unit_id: currentUnitId,
        current_player_id: getCurrentCombatPlayerId({ units }, currentUnitId),
      })
      .eq("id", combatId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return respondWithCombat(supabase, combatId);
}

async function respondWithCombat(supabase: ReturnType<typeof createAdminClient>, combatId: string) {
  const { data, error } = await supabase
    .from("combats")
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .eq("id", combatId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ combat: toCombat(data), result: null });
}

function mapUnitStacks(value: unknown): UnitStack[] {
  return Array.isArray(value)
    ? value.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: item.id as string,
        heroId: item.hero_id as string,
        unitType: item.unit_type as UnitStack["unitType"],
        count: Number(item.count ?? 0),
        health: Number(item.health ?? 0),
        maxHealth: Number(item.max_health ?? 0),
        position: Number(item.position ?? 0),
      };
    })
    : [];
}
