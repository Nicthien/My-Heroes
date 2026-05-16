import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { executeManualCombatAction, getHexDistance, getHexNeighbors, isTerrainBlocked } from "@/lib/game/combat/persistent";
import { CombatBoardUnit, CombatSummary, CombatTerrainFeature } from "@/lib/game/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, toCombat } from "@/lib/supabase/game-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id, combatId } = await params;
  const action = await request.json();
  const supabase = createAdminClient();
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("status")
    .eq("id", id)
    .single();
  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

  const gamePlayer = await getGamePlayer(supabase, id, user.id);
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });

  const { data: combat, error: fetchError } = await supabase
    .from("combats")
    .select("*, combat_participants(*)")
    .eq("id", combatId)
    .eq("game_id", id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (combat.status !== "ACTIVE") {
    const mapped = toCombat(combat);
    return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
  }
  const { data: attackerHero, error: attackerError } = await supabase
    .from("heroes")
    .select("attack,defense")
    .eq("id", combat.attacker_hero_id)
    .single();
  if (attackerError) return NextResponse.json({ error: attackerError.message }, { status: 500 });

  const { data: defenderHero, error: defenderError } = combat.defender_hero_id
    ? await supabase
      .from("heroes")
      .select("attack,defense")
      .eq("id", combat.defender_hero_id)
      .single()
    : { data: null, error: null };
  if (defenderError) return NextResponse.json({ error: defenderError.message }, { status: 500 });

  const boardState = combat.board_state as { units: CombatBoardUnit[]; initialUnits?: CombatBoardUnit[]; terrain?: CombatTerrainFeature[] };
  const currentActor = (boardState.units ?? []).find((unit) => unit.id === combat.current_unit_id);
  const expectedCurrentUnitId = typeof action.expectedCurrentUnitId === "string" ? action.expectedCurrentUnitId : null;
  const expectedRound = Number(action.expectedRound);
  const expectedActionLogLength = Number(action.expectedActionLogLength);
  const hasStaleClientState =
    (expectedCurrentUnitId !== null && expectedCurrentUnitId !== combat.current_unit_id) ||
    (Number.isInteger(expectedRound) && expectedRound !== (combat.round ?? 1)) ||
    (Number.isInteger(expectedActionLogLength) && expectedActionLogLength !== (combat.action_log ?? []).length);

  if (hasStaleClientState) {
    return NextResponse.json({
      error: "Etat de combat perime",
      combat: toCombat(combat),
      result: combat.result ?? null,
    }, { status: 409 });
  }

  if (currentActor?.ownerPlayerId && currentActor.ownerPlayerId !== gamePlayer.id) {
    return NextResponse.json({ error: "Ce n'est pas votre tour de combat" }, { status: 403 });
  }
  if (!currentActor && combat.current_player_id && combat.current_player_id !== gamePlayer.id) {
    return NextResponse.json({ error: "Ce n'est pas votre tour de combat" }, { status: 403 });
  }

  const execution = executeActionThenNeutralTurns({
    units: boardState.units ?? [],
    terrain: boardState.terrain ?? [],
    turnQueue: combat.turn_queue ?? [],
    round: combat.round ?? 1,
    currentUnitId: combat.current_unit_id,
    playerAction: currentActor?.ownerPlayerId === gamePlayer.id ? action : null,
    attackerStats: { attack: attackerHero.attack, defense: attackerHero.defense },
    defenderStats: { attack: defenderHero?.attack ?? 1, defense: defenderHero?.defense ?? 1 },
  });

  const initialUnits = boardState.initialUnits ?? boardState.units ?? [];
  const result = execution.result
    ? buildManualCombatResult(execution.result, initialUnits, execution.units, combat)
    : null;
  const actionLog = [...(combat.action_log ?? []), ...execution.log];

  const { data, error } = await supabase
    .from("combats")
    .update({
      board_state: { ...boardState, units: execution.units },
      turn_queue: execution.turnQueue,
      current_unit_id: execution.currentUnitId,
      current_player_id: result ? null : execution.currentPlayerId,
      round: execution.round,
      action_log: actionLog,
      result,
      status: result ? "RESOLVED" : combat.status,
    })
    .eq("id", combatId)
    .select("*, combat_participants(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (result) {
    await persistResolvedCombat(supabase, combat, initialUnits, execution.units, execution.result);
  }
  const mapped = toCombat(data);
  return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
}

function executeActionThenNeutralTurns(params: {
  units: CombatBoardUnit[];
  terrain: CombatTerrainFeature[];
  turnQueue: string[];
  round: number;
  currentUnitId: string | null;
  playerAction: { type: "MOVE" | "ATTACK" | "SHOOT" | "WAIT" | "DEFEND"; q?: number; r?: number; targetUnitId?: string } | null;
  attackerStats: { attack: number; defense: number };
  defenderStats: { attack: number; defense: number };
}) {
  let units = params.units;
  let turnQueue = params.turnQueue;
  let round = params.round;
  let currentUnitId = params.currentUnitId;
  let currentPlayerId = units.find((unit) => unit.id === currentUnitId)?.ownerPlayerId ?? null;
  let result: "attacker" | "defender" | null = null;
  const log: string[] = [];
  const maxSteps = 30;

  for (let step = 0; step < maxSteps; step++) {
    const actor = units.find((unit) => unit.id === currentUnitId);
    const action = step === 0 && params.playerAction
      ? params.playerAction
      : actor?.ownerPlayerId === null
        ? chooseNeutralAction(actor, units, params.terrain)
        : null;

    if (!actor || !action) {
      currentPlayerId = actor?.ownerPlayerId ?? null;
      break;
    }

    const execution = executeManualCombatAction({
      units,
      terrain: params.terrain,
      turnQueue,
      round,
      currentUnitId,
      action,
      attackerStats: params.attackerStats,
      defenderStats: params.defenderStats,
    });

    units = execution.units;
    turnQueue = execution.turnQueue;
    round = execution.round;
    currentUnitId = execution.currentUnitId;
    currentPlayerId = execution.currentPlayerId;
    result = execution.result;
    log.push(...execution.log);

    if (result) break;

    const nextActor = units.find((unit) => unit.id === currentUnitId);
    if (!nextActor || nextActor.ownerPlayerId !== null) {
      currentPlayerId = nextActor?.ownerPlayerId ?? null;
      break;
    }
  }

  return { units, turnQueue, round, currentUnitId, currentPlayerId, result, log };
}

function chooseNeutralAction(
  actor: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[]
): { type: "MOVE" | "ATTACK" | "SHOOT" | "WAIT" | "DEFEND"; q?: number; r?: number; targetUnitId?: string } {
  const enemies = units.filter((unit) => unit.count > 0 && unit.side !== actor.side);
  const adjacent = enemies.find((unit) => getHexDistance(actor, unit) <= 1);
  if (adjacent) return { type: "ATTACK", targetUnitId: adjacent.id };

  if (actor.ranged && actor.shots > 0 && enemies.length > 0) {
    const target = [...enemies].sort((a, b) => getHexDistance(actor, a) - getHexDistance(actor, b))[0];
    return { type: "SHOOT", targetUnitId: target.id };
  }

  const closest = [...enemies].sort((a, b) => getHexDistance(actor, a) - getHexDistance(actor, b))[0];
  if (!closest) return { type: "DEFEND" };

  const destination = reachableCells(actor, units, terrain)
    .sort((a, b) => getHexDistance(a, closest) - getHexDistance(b, closest))[0];

  return destination ? { type: "MOVE", q: destination.q, r: destination.r } : { type: "DEFEND" };
}

function reachableCells(
  actor: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[]
): { q: number; r: number }[] {
  const occupied = new Set(units.filter((u) => u.id !== actor.id).map((u) => `${u.q},${u.r}`));
  const visited = new Set<string>([`${actor.q},${actor.r}`]);
  const queue: { q: number; r: number; dist: number }[] = [{ q: actor.q, r: actor.r, dist: 0 }];
  const cells: { q: number; r: number }[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.dist >= actor.speed) continue;
    for (const nb of getHexNeighbors(current.q, current.r)) {
      const key = `${nb.q},${nb.r}`;
      if (visited.has(key) || isTerrainBlocked(nb.q, nb.r, terrain) || occupied.has(key)) continue;
      visited.add(key);
      cells.push(nb);
      queue.push({ ...nb, dist: current.dist + 1 });
    }
  }

  return cells;
}

function buildManualCombatResult(
  winnerSide: "attacker" | "defender",
  before: CombatBoardUnit[],
  after: CombatBoardUnit[],
  combat: { attacker_player_id: string; defender_player_id: string | null }
): CombatSummary {
  return {
    winnerId: winnerSide,
    winnerPlayerId: winnerSide === "attacker" ? combat.attacker_player_id : combat.defender_player_id,
    attackerLosses: getSideLosses("attacker", before, after),
    defenderLosses: getSideLosses("defender", before, after),
    experienceGained: winnerSide === "attacker" ? 500 : 0,
    log: [`Victoire du camp ${winnerSide === "attacker" ? "attaquant" : "défenseur"}.`],
  };
}

function getSideLosses(side: "attacker" | "defender", before: CombatBoardUnit[], after: CombatBoardUnit[]) {
  return before
    .filter((unit) => unit.side === side)
    .map((unit) => {
      const next = after.find((item) => item.id === unit.id);
      return { unitType: unit.unitType, lost: Math.max(0, unit.count - (next?.count ?? 0)) };
    })
    .filter((loss) => loss.lost > 0);
}

async function persistResolvedCombat(
  supabase: ReturnType<typeof createAdminClient>,
  combat: {
    game_id: string;
    neutral_army_id: string | null;
    defender_player_id: string | null;
    attacker_player_id: string;
    attacker_hero_id: string;
    defender_hero_id: string | null;
    x: number;
    y: number;
  },
  before: CombatBoardUnit[],
  after: CombatBoardUnit[],
  winnerSide: "attacker" | "defender" | null
) {
  const afterById = new Map(after.map((unit) => [unit.id, unit]));

  for (const unit of before) {
    const next = afterById.get(unit.id);
    const count = next?.count ?? 0;
    const health = next?.health ?? 0;

    await supabase.from("armies").update({ count, health }).eq("id", unit.id);
    await supabase.from("neutral_army_stacks").update({ count, health }).eq("id", unit.id);
  }

  if (winnerSide === "attacker") {
    if (combat.neutral_army_id) {
      await supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", combat.neutral_army_id);
    } else if (!combat.defender_player_id) {
      const capturedTown = await captureNeutralTownAt(supabase, combat);
      if (!capturedTown) {
        await supabase
          .from("resource_buildings")
          .update({ game_player_id: combat.attacker_player_id, guardian_power: 0 })
          .eq("game_id", combat.game_id)
          .eq("x", combat.x)
          .eq("y", combat.y);
      }
    }
    if (combat.defender_hero_id && combat.defender_player_id) {
      await supabase.from("armies").delete().eq("hero_id", combat.defender_hero_id);
      await supabase.from("heroes").delete().eq("id", combat.defender_hero_id);
    }
  } else if (winnerSide === "defender") {
    await supabase.from("armies").delete().eq("hero_id", combat.attacker_hero_id);
    await supabase.from("heroes").delete().eq("id", combat.attacker_hero_id);
  }
}

async function captureNeutralTownAt(
  supabase: ReturnType<typeof createAdminClient>,
  combat: {
    game_id: string;
    attacker_player_id: string;
    x: number;
    y: number;
  }
) {
  const { data: town } = await supabase
    .from("towns")
    .select("id")
    .eq("game_id", combat.game_id)
    .eq("x", combat.x)
    .eq("y", combat.y)
    .eq("is_neutral", true)
    .maybeSingle();

  if (!town) return false;

  await supabase
    .from("towns")
    .update({
      game_player_id: combat.attacker_player_id,
      is_neutral: false,
      neutral_garrison: [],
    })
    .eq("id", town.id);

  return true;
}
