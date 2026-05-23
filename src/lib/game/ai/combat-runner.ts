import {
  executeManualCombatAction,
  getHexDistance,
} from "@/lib/game/combat/persistent";
import { findMeleeApproach, getReachableCombatCells } from "@/lib/game/combat/movement";
import { calculateCombatDamageRange, hasAdjacentEnemy, type CombatSideStats } from "@/lib/game/combat/rules";
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

    const boardState = combat.board_state as {
      units: CombatBoardUnit[];
      initialUnits?: CombatBoardUnit[];
      terrain?: CombatTerrainFeature[];
      environment?: { terrain?: import("@/lib/game/types").TerrainType };
      moraleContext?: { attackerHeroMorale?: number; defenderHeroMorale?: number };
    };
    const actor = (boardState.units ?? []).find((unit) => unit.id === combat.current_unit_id);
    if (!actor) return toCombat(combat);
    if (actor.ownerPlayerId === null) return toCombat(combat);
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

    const sideStats = {
      attacker: { attack: attackerHero?.attack ?? 1, defense: attackerHero?.defense ?? 1 },
      defender: { attack: defenderHero?.attack ?? 1, defense: defenderHero?.defense ?? 1 },
    };
    const action = chooseAiCombatAction(actor, boardState.units ?? [], boardState.terrain ?? [], sideStats);
    const execution = executeManualCombatAction({
      units: boardState.units ?? [],
      terrain: boardState.terrain ?? [],
      turnQueue: combat.turn_queue ?? [],
      round: combat.round ?? 1,
      currentUnitId: combat.current_unit_id,
      action,
      attackerStats: sideStats.attacker,
      defenderStats: sideStats.defender,
      moraleContext: {
        attackerHeroMorale: Number(boardState.moraleContext?.attackerHeroMorale ?? 0),
        defenderHeroMorale: Number(boardState.moraleContext?.defenderHeroMorale ?? 0),
        terrain: boardState.environment?.terrain,
      },
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

function chooseAiCombatAction(
  actor: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", CombatSideStats>
): CombatAction {
  const enemies = units.filter((unit) => unit.count > 0 && unit.side !== actor.side);
  if (enemies.length === 0) return { type: "DEFEND" };

  const adjacent = enemies
    .filter((unit) => getHexDistance(actor, unit) <= 1)
    .sort((a, b) => targetPriority(actor, b, units, terrain, sideStats) - targetPriority(actor, a, units, terrain, sideStats))[0];
  if (adjacent) return { type: "ATTACK", targetUnitId: adjacent.id };

  if (actor.ranged && actor.shots > 0 && !hasAdjacentEnemy(actor, units)) {
    const target = [...enemies].sort((a, b) => targetPriority(actor, b, units, terrain, sideStats) - targetPriority(actor, a, units, terrain, sideStats))[0];
    return { type: "SHOOT", targetUnitId: target.id };
  }

  const target = [...enemies].sort((a, b) => targetPriority(actor, b, units, terrain, sideStats) - targetPriority(actor, a, units, terrain, sideStats))[0];
  const approach = findMeleeApproach(actor, target, units, terrain);
  if (approach) return { type: "ATTACK", targetUnitId: target.id };

  const destination = getReachableCombatCells(actor, units, terrain)
    .sort((a, b) => getHexDistance(a, target) - getHexDistance(b, target))[0];
  return destination ? { type: "MOVE", q: destination.q, r: destination.r } : { type: "DEFEND" };
}

function targetPriority(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", CombatSideStats>
) {
  const rule = getUnitRule(target.unitType);
  const distance = getHexDistance(actor, target);
  const range = calculateCombatDamageRange({
    attacker: actor,
    defender: target,
    attackerStats: sideStats[actor.side],
    defenderStats: sideStats[target.side],
    actionType: distance <= 1 ? "ATTACK" : "SHOOT",
    terrain,
    actorAdjacentToEnemy: hasAdjacentEnemy(actor, units),
  });
  const averageDamage = Math.floor((range.minDamage + range.maxDamage) / 2);
  const canKill = target.health <= averageDamage;
  return (
    (canKill ? 1200 : 0) +
    (target.ranged ? 600 : 0) +
    ((rule.abilities?.length ?? 0) > 0 ? 250 : 0) +
    rule.power * target.count * 0.08 +
    Math.max(0, 400 - target.health * 0.05)
  );
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
