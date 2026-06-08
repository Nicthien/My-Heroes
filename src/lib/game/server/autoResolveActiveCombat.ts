import {
  applyLossesToArmies,
  applyLossesToWinnerArmies,
  autoResolveCombat,
  type CombatHeroSnapshot,
} from "@/lib/game/combat/autoResolve";
import { buildManualCombatResult, persistResolvedCombat } from "@/lib/game/ai/combat-runner";
import { evaluateGameLifecycle } from "./lifecycle";
import type { CombatBoardUnit, UnitStack } from "@/lib/game/types";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";

function toSnapshotArmies(units: CombatBoardUnit[]): UnitStack[] {
  return units
    .filter((unit) => unit.count > 0)
    .map((unit) => ({
      id: unit.id,
      unitType: unit.unitType,
      count: unit.count,
      health: unit.health,
      maxHealth: unit.maxHealth,
      position: unit.position,
    }));
}

interface AutoResolveBoardState {
  units?: CombatBoardUnit[];
  sideStats?: {
    attacker?: { attack?: number; defense?: number };
    defender?: { attack?: number; defense?: number };
  };
  moraleContext?: {
    attackerHeroMorale?: number;
    defenderHeroMorale?: number;
    attackerHeroLuck?: number;
    defenderHeroLuck?: number;
  };
}

/**
 * Power-based auto-resolution of a single in-progress MANUAL combat. Used when a
 * player's adventure turn timer runs out while they still have a battle going:
 * rather than letting combat freeze the clock forever, the engine resolves it from
 * the CURRENT board army counts via the pure {@link autoResolveCombat} simulation,
 * writes casualties / captures / hero-death back through the shared finalizer, and
 * marks the combat RESOLVED.
 *
 * Note: this mirrors the AI-combat finalizer (counts, neutral defeat, town/mine
 * capture, loser-hero removal, score). It does NOT replay exact hex positions and,
 * like the AI path, does not award post-combat XP or transfer artifacts/Grail — a
 * deliberate trade-off for a player who let their own clock expire.
 *
 * Idempotent: a combat that is no longer ACTIVE is skipped, so concurrent callers
 * can't double-resolve.
 */
export async function autoResolveActiveCombat(
  supabase: SupabaseAdmin,
  gameId: string,
  combatId: string
): Promise<void> {
  const { data: combat, error } = await supabase
    .from("combats")
    .select("*")
    .eq("id", combatId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (error) throw error;
  if (!combat || combat.status !== "ACTIVE") return;

  const boardState = (combat.board_state ?? {}) as AutoResolveBoardState;
  const units = (boardState.units ?? []).map((unit) => ({ ...unit }));
  const before = units.map((unit) => ({ ...unit }));

  const attackerId = combat.attacker_hero_id as string;
  const defenderId = (combat.defender_hero_id as string | null) ?? `defender:${combat.id}`;
  const attackerArmies = toSnapshotArmies(units.filter((unit) => unit.side === "attacker"));
  const defenderArmies = toSnapshotArmies(units.filter((unit) => unit.side === "defender"));

  const attacker: CombatHeroSnapshot = {
    id: attackerId,
    attack: Number(boardState.sideStats?.attacker?.attack ?? 1),
    defense: Number(boardState.sideStats?.attacker?.defense ?? 1),
    morale: Number(boardState.moraleContext?.attackerHeroMorale ?? 0),
    luck: Number(boardState.moraleContext?.attackerHeroLuck ?? 0),
    armies: attackerArmies,
  };
  const defender: CombatHeroSnapshot = {
    id: defenderId,
    attack: Number(boardState.sideStats?.defender?.attack ?? 1),
    defense: Number(boardState.sideStats?.defender?.defense ?? 1),
    morale: Number(boardState.moraleContext?.defenderHeroMorale ?? 0),
    luck: Number(boardState.moraleContext?.defenderHeroLuck ?? 0),
    armies: defenderArmies,
  };

  const outcome = autoResolveCombat(attacker, defender);
  const winnerSide: "attacker" | "defender" = outcome.winnerHeroId === attackerId ? "attacker" : "defender";

  // Winner takes ratio-based casualties; the loser is wiped; non-regen units (the
  // King) are then applied verbatim by id from the simulation.
  const survivedWinner = applyLossesToWinnerArmies(
    winnerSide === "attacker" ? attackerArmies : defenderArmies,
    outcome.winnerLossRatio
  );
  const wipedLoser = applyLossesToArmies(
    winnerSide === "attacker" ? defenderArmies : attackerArmies,
    1,
    true
  );
  const nextById = new Map<string, { count: number; health: number }>();
  for (const army of [...survivedWinner, ...wipedLoser]) nextById.set(army.id, { count: army.count, health: army.health });
  for (const override of outcome.survivorOverrides ?? []) nextById.set(override.id, { count: override.count, health: override.health });

  const after = units.map((unit) => {
    const next = nextById.get(unit.id);
    return next ? { ...unit, count: next.count, health: next.health } : { ...unit, count: 0, health: 0 };
  });

  const result = buildManualCombatResult(winnerSide, before, after, combat);

  const { error: updateError } = await supabase
    .from("combats")
    .update({
      board_state: { ...boardState, units: after },
      current_unit_id: null,
      current_player_id: null,
      action_log: [...((combat.action_log as string[] | null) ?? []), "Temps écoulé : combat résolu automatiquement."],
      result,
      status: "RESOLVED",
    })
    .eq("id", combatId)
    .eq("status", "ACTIVE");
  if (updateError) throw updateError;

  await persistResolvedCombat(supabase, combat, before, after, winnerSide);
  await evaluateGameLifecycle(supabase, gameId);
}
