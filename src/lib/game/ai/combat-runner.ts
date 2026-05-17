import {
  executeManualCombatAction,
  getHexDistance,
  getHexNeighbors,
  isTerrainBlocked,
} from "@/lib/game/combat/persistent";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { getUnitRule } from "@/lib/game/units";
import type { CombatBoardUnit, CombatSummary, CombatTerrainFeature } from "@/lib/game/types";
import { toCombat, type SupabaseAdmin } from "@/lib/supabase/game-db";

type CombatAction = { type: "MOVE" | "ATTACK" | "SHOOT" | "WAIT" | "DEFEND"; q?: number; r?: number; targetUnitId?: string };

export async function runAiCombatTurns(supabase: SupabaseAdmin, gameId: string, combatId: string) {
  const { data: aiRows, error: aiError } = await supabase
    .from("game_players")
    .select("id")
    .eq("game_id", gameId)
    .eq("is_ai", true);
  if (aiError) throw aiError;
  const aiPlayerIds = new Set((aiRows ?? []).map((row) => row.id as string));

  for (let step = 0; step < 30; step++) {
    const { data: combat, error } = await supabase
      .from("combats")
      .select("*, combat_participants(*)")
      .eq("id", combatId)
      .eq("game_id", gameId)
      .single();
    if (error) throw error;
    if (!combat || combat.status !== "ACTIVE") return combat ? toCombat(combat) : null;

    const boardState = combat.board_state as { units: CombatBoardUnit[]; initialUnits?: CombatBoardUnit[]; terrain?: CombatTerrainFeature[] };
    const actor = (boardState.units ?? []).find((unit) => unit.id === combat.current_unit_id);
    if (!actor) return toCombat(combat);
    if (actor.ownerPlayerId !== null && !aiPlayerIds.has(actor.ownerPlayerId)) return toCombat(combat);

    const { data: attackerHero, error: attackerError } = await supabase
      .from("heroes")
      .select("attack,defense")
      .eq("id", combat.attacker_hero_id)
      .maybeSingle();
    if (attackerError) throw attackerError;

    const { data: defenderHero, error: defenderError } = combat.defender_hero_id
      ? await supabase
        .from("heroes")
        .select("attack,defense")
        .eq("id", combat.defender_hero_id)
        .maybeSingle()
      : { data: null, error: null };
    if (defenderError) throw defenderError;

    const action = chooseAiCombatAction(actor, boardState.units ?? [], boardState.terrain ?? []);
    const execution = executeManualCombatAction({
      units: boardState.units ?? [],
      terrain: boardState.terrain ?? [],
      turnQueue: combat.turn_queue ?? [],
      round: combat.round ?? 1,
      currentUnitId: combat.current_unit_id,
      action,
      attackerStats: { attack: attackerHero?.attack ?? 1, defense: attackerHero?.defense ?? 1 },
      defenderStats: { attack: defenderHero?.attack ?? 1, defense: defenderHero?.defense ?? 1 },
    });

    const initialUnits = boardState.initialUnits ?? boardState.units ?? [];
    const result = execution.result
      ? buildManualCombatResult(execution.result, initialUnits, execution.units, combat)
      : null;
    const actionLog = [...(combat.action_log ?? []), ...execution.log];

    const { data: updated, error: updateError } = await supabase
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
    if (updateError) throw updateError;

    if (result) {
      await persistResolvedCombat(supabase, combat, initialUnits, execution.units, execution.result);
      await evaluateGameLifecycle(supabase, gameId);
      return toCombat(updated);
    }
  }

  const { data } = await supabase
    .from("combats")
    .select("*, combat_participants(*)")
    .eq("id", combatId)
    .eq("game_id", gameId)
    .maybeSingle();
  return data ? toCombat(data) : null;
}

function chooseAiCombatAction(actor: CombatBoardUnit, units: CombatBoardUnit[], terrain: CombatTerrainFeature[]): CombatAction {
  const enemies = units.filter((unit) => unit.count > 0 && unit.side !== actor.side);
  if (enemies.length === 0) return { type: "DEFEND" };

  const adjacent = enemies
    .filter((unit) => getHexDistance(actor, unit) <= 1)
    .sort((a, b) => targetPriority(actor, b) - targetPriority(actor, a))[0];
  if (adjacent) return { type: "ATTACK", targetUnitId: adjacent.id };

  if (actor.ranged && actor.shots > 0) {
    const target = [...enemies].sort((a, b) => targetPriority(actor, b) - targetPriority(actor, a))[0];
    return { type: "SHOOT", targetUnitId: target.id };
  }

  const target = [...enemies].sort((a, b) => targetPriority(actor, b) - targetPriority(actor, a))[0];
  const destination = reachableCells(actor, units, terrain)
    .sort((a, b) => getHexDistance(a, target) - getHexDistance(b, target))[0];
  return destination ? { type: "MOVE", q: destination.q, r: destination.r } : { type: "DEFEND" };
}

function targetPriority(actor: CombatBoardUnit, target: CombatBoardUnit) {
  const rule = getUnitRule(target.unitType);
  const actorRule = getUnitRule(actor.unitType);
  const averageDamage = Math.max(1, Math.floor((actorRule.minDamage + actorRule.maxDamage) / 2) * actor.count);
  const canKill = target.health <= averageDamage;
  return (
    (canKill ? 1200 : 0) +
    (target.ranged ? 600 : 0) +
    ((rule.abilities?.length ?? 0) > 0 ? 250 : 0) +
    rule.power * target.count * 0.08 +
    Math.max(0, 400 - target.health * 0.05)
  );
}

function reachableCells(
  actor: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[]
): { q: number; r: number }[] {
  const occupied = new Set(units.filter((unit) => unit.id !== actor.id).map((unit) => `${unit.q},${unit.r}`));
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
    log: [`Victoire du camp ${winnerSide === "attacker" ? "attaquant" : "defenseur"}.`],
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
  supabase: SupabaseAdmin,
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
  supabase: SupabaseAdmin,
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
