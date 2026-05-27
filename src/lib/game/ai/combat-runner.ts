import { executeManualCombatAction } from "@/lib/game/combat/persistent";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { recordGameAction } from "@/lib/game/server/action-log";
import type { CombatBoardUnit, CombatSideStatsSnapshot, CombatSummary, CombatTerrainFeature } from "@/lib/game/types";
import { toCombat, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { chooseAiCombatAction, planAiTacticsPlacements } from "./combat-tactics";

export async function runAiCombatTurns(supabase: SupabaseAdmin, gameId: string, combatId: string) {
  const { data: aiRows, error: aiError } = await supabase
    .from("game_players")
    .select("id")
    .eq("game_id", gameId)
    .eq("is_ai", true);
  if (aiError) throw aiError;
  const aiPlayerIds = new Set((aiRows ?? []).map((row) => row.id as string));
  const { data: gameRow, error: gameError } = await supabase
    .from("games")
    .select("turn_number")
    .eq("id", gameId)
    .maybeSingle();
  if (gameError) throw gameError;
  const turnNumber = Number(gameRow?.turn_number ?? 0);

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
      moraleContext?: { attackerHeroMorale?: number; defenderHeroMorale?: number; attackerHeroLuck?: number; defenderHeroLuck?: number };
      sideStats?: { attacker?: CombatSideStatsSnapshot; defender?: CombatSideStatsSnapshot };
      tacticsPhase?: { side: "attacker" | "defender" };
    };
    // Phase de tactique IA : avance les unités de mêlée puis termine
    if (boardState.tacticsPhase) {
      const tacticsPhase = boardState.tacticsPhase as { side: "attacker" | "defender"; maxColumn?: number; minColumn?: number };
      const tacticsPlayerId = tacticsPhase.side === "attacker" ? combat.attacker_player_id : combat.defender_player_id;
      if (!tacticsPlayerId || aiPlayerIds.has(tacticsPlayerId)) {
        const units = (boardState.units ?? []).map((u) => ({ ...u }));
        const placements = planAiTacticsPlacements(units, tacticsPhase.side, tacticsPhase);
        const aiTacticsLog: string[] = ["IA : phase de tactique en cours…"];
        for (const placement of placements) {
          const unit = units.find((u) => u.id === placement.unitId);
          if (!unit) continue;
          unit.q = placement.q;
          unit.r = placement.r;
          aiTacticsLog.push(`IA déplace ${unit.unitType} en (${placement.q},${placement.r}).`);
        }
        const { tacticsPhase: _drop, ...restBoard } = boardState as Record<string, unknown>;
        void _drop;
        await supabase.from("combats").update({
          board_state: { ...restBoard, units },
          action_log: [...(combat.action_log ?? []), ...aiTacticsLog, "IA : phase de tactique terminée."],
        }).eq("id", combatId);
        if (tacticsPlayerId) {
          await recordGameAction(supabase, {
            gameId,
            gamePlayerId: tacticsPlayerId,
            actorKind: "ai",
            turnNumber,
            actionType: "AI_COMBAT_TACTICS",
            category: "combat",
            summary: "IA termine sa phase de tactique.",
            details: { combatId, placements },
          });
        }
        continue;
      }
    }
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
      attacker: boardState.sideStats?.attacker ?? { attack: attackerHero?.attack ?? 1, defense: attackerHero?.defense ?? 1 },
      defender: boardState.sideStats?.defender ?? { attack: defenderHero?.attack ?? 1, defense: defenderHero?.defense ?? 1 },
    };
    const action = chooseAiCombatAction(actor, boardState.units ?? [], boardState.terrain ?? [], sideStats);
    await recordGameAction(supabase, {
      gameId,
      gamePlayerId: actor.ownerPlayerId,
      actorKind: "ai",
      turnNumber,
      actionType: `AI_COMBAT_${action.type}`,
      category: "combat",
      summary: `IA effectue ${action.type} en combat.`,
      details: { combatId, unitId: actor.id, unitType: actor.unitType, action },
    });
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
        attackerHeroLuck: Number(boardState.moraleContext?.attackerHeroLuck ?? 0),
        defenderHeroLuck: Number(boardState.moraleContext?.defenderHeroLuck ?? 0),
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

    if (count <= 0) {
      await supabase.from("armies").delete().eq("id", unit.id);
      await supabase.from("neutral_army_stacks").delete().eq("id", unit.id);
    } else {
      await supabase.from("armies").update({ count, health }).eq("id", unit.id);
      await supabase.from("neutral_army_stacks").update({ count, health }).eq("id", unit.id);
    }
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
