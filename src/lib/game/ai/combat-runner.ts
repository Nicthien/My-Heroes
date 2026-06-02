import { buildTurnQueue, executeManualCombatAction } from "@/lib/game/combat/persistent";
import { markHeroCombatSpellCast } from "@/lib/game/combat/spells";
import type { SiegeState } from "@/lib/game/combat/siege";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { recordGameAction, recordTownCaptureFromCombat } from "@/lib/game/server/action-log";
import { applyCombatScoreOutcome } from "@/lib/game/server/score-stats";
import type { CombatBoardUnit, CombatSideStatsSnapshot, CombatSummary, CombatTerrainFeature } from "@/lib/game/types";
import { toCombat, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { chooseAiCombatAction, planAiTacticsPlacements } from "./combat-tactics";
import { chooseAiCombatSpell, executeAiSpellCast, type AiSpellHero } from "./combat-spells";

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
      siege?: SiegeState;
      sideStats?: { attacker?: CombatSideStatsSnapshot; defender?: CombatSideStatsSnapshot };
      tacticsPhase?: { side: "attacker" | "defender" };
      spellCastsByRound?: Record<string, string[]>;
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

    const heroSpellFields = "attack,defense,spell_power,knowledge,mana,has_spell_book,known_spells,skills";
    const { data: attackerHero, error: attackerError } = await supabase
      .from("heroes")
      .select(heroSpellFields)
      .eq("id", combat.attacker_hero_id)
      .maybeSingle();
    if (attackerError) throw attackerError;

    const { data: defenderHero, error: defenderError } = combat.defender_hero_id
      ? await supabase
        .from("heroes")
        .select(heroSpellFields)
        .eq("id", combat.defender_hero_id)
        .maybeSingle()
      : { data: null, error: null };
    if (defenderError) throw defenderError;

    const aHero = attackerHero as Record<string, unknown> | null;
    const dHero = defenderHero as Record<string, unknown> | null;
    const sideStats = {
      attacker: boardState.sideStats?.attacker ?? { attack: Number(aHero?.attack ?? 1), defense: Number(aHero?.defense ?? 1) },
      defender: boardState.sideStats?.defender ?? { attack: Number(dHero?.attack ?? 1), defense: Number(dHero?.defense ?? 1) },
    };

    const initialUnits = boardState.initialUnits ?? boardState.units ?? [];
    const terrain = boardState.terrain ?? [];

    // Sorts IA (parité avec le chemin HTTP) : le héros du camp de l'unité active
    // tente un sort avant que l'unité n'agisse.
    const aiSpellHeroes: Record<"attacker" | "defender", AiSpellHero | null> = {
      attacker: combat.attacker_player_id && aiPlayerIds.has(combat.attacker_player_id) && aHero
        ? buildSpellHero(combat.attacker_hero_id, "attacker", combat.attacker_player_id, aHero)
        : null,
      defender: combat.defender_player_id && combat.defender_hero_id && aiPlayerIds.has(combat.defender_player_id) && dHero
        ? buildSpellHero(combat.defender_hero_id, "defender", combat.defender_player_id, dHero)
        : null,
    };

    let workingUnits = (boardState.units ?? []).map((u) => ({ ...u }));
    let turnQueue = combat.turn_queue ?? [];
    let spellCastsByRound = boardState.spellCastsByRound;
    const round = combat.round ?? 1;
    const spellLog: string[] = [];
    let spellResult: "attacker" | "defender" | null = null;

    const spellHero = aiSpellHeroes[actor.side];
    if (spellHero) {
      const enemyHero = aiSpellHeroes[actor.side === "attacker" ? "defender" : "attacker"];
      const choice = chooseAiCombatSpell({ hero: spellHero, units: workingUnits, terrain, round, spellCastsByRound, enemySkills: enemyHero?.skills });
      if (choice) {
        const cast = executeAiSpellCast({ units: workingUnits, caster: choice.caster, action: choice.action, terrain, enemySkills: enemyHero?.skills });
        if (cast.ok) {
          workingUnits = cast.units;
          if (cast.requiresQueueRebuild) turnQueue = buildTurnQueue(workingUnits, round);
          spellLog.push(...cast.log);
          spellResult = cast.result ?? null;
          spellCastsByRound = markHeroCombatSpellCast(spellCastsByRound, round, spellHero.heroId);
          const cost = Math.max(0, choice.spell.cost.standard);
          const nextMana = Math.max(0, (spellHero.mana ?? spellHero.knowledge * 10) - cost);
          await supabase.from("heroes").update({ mana: nextMana }).eq("id", spellHero.heroId);
          await recordGameAction(supabase, {
            gameId, gamePlayerId: spellHero.playerId, actorKind: "ai", turnNumber,
            actionType: "AI_COMBAT_CAST_SPELL", category: "combat",
            summary: `IA lance ${choice.spell.id} en combat.`,
            details: { combatId, spellId: choice.spell.id, targetUnitId: choice.action.targetUnitId },
          });
        }
      }
    }

    // Si le sort a terminé le combat, on finalise immédiatement.
    if (spellResult) {
      const result = buildManualCombatResult(spellResult, initialUnits, workingUnits, combat);
      const { data: updated, error: updateError } = await supabase
        .from("combats")
        .update({
          board_state: { ...boardState, units: workingUnits, siege: boardState.siege, spellCastsByRound },
          turn_queue: turnQueue,
          current_unit_id: null,
          current_player_id: null,
          round,
          action_log: [...(combat.action_log ?? []), ...spellLog],
          result,
          status: "RESOLVED",
        })
        .eq("id", combatId)
        .select("*, combat_participants(*)")
        .single();
      if (updateError) throw updateError;
      await persistResolvedCombat(supabase, combat, initialUnits, workingUnits, spellResult);
      await evaluateGameLifecycle(supabase, gameId);
      return toCombat(updated);
    }

    // L'unité active a pu changer (sort de soin/résurrection) — on la relit.
    const liveActor = workingUnits.find((u) => u.id === combat.current_unit_id && u.count > 0);
    if (!liveActor) {
      // L'acteur n'agit pas (rare) : on persiste l'effet du sort et on continue.
      await supabase.from("combats").update({
        board_state: { ...boardState, units: workingUnits, siege: boardState.siege, spellCastsByRound },
        turn_queue: turnQueue,
        action_log: [...(combat.action_log ?? []), ...spellLog],
      }).eq("id", combatId);
      continue;
    }

    const action = chooseAiCombatAction(liveActor, workingUnits, terrain, sideStats, boardState.siege);
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
      units: workingUnits,
      terrain,
      turnQueue,
      round,
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
      siege: boardState.siege,
    });

    const result = execution.result
      ? buildManualCombatResult(execution.result, initialUnits, execution.units, combat)
      : null;
    const actionLog = [...(combat.action_log ?? []), ...spellLog, ...execution.log];

    const { data: updated, error: updateError } = await supabase
      .from("combats")
      .update({
        board_state: { ...boardState, units: execution.units, siege: execution.siege ?? boardState.siege, spellCastsByRound },
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

function buildSpellHero(
  heroId: string,
  side: "attacker" | "defender",
  playerId: string,
  hero: Record<string, unknown>,
): AiSpellHero {
  return {
    heroId,
    side,
    playerId,
    spellPower: Number(hero.spell_power ?? 0),
    knowledge: Number(hero.knowledge ?? 1),
    mana: hero.mana == null ? null : Number(hero.mana),
    knownSpellIds: (hero.known_spells as string[] | null) ?? null,
    hasSpellBook: hero.has_spell_book !== false,
    skills: (hero.skills as Partial<Record<string, "basic" | "advanced" | "expert">>) ?? undefined,
  };
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
      if (capturedTown) {
        await recordTownCaptureFromCombat(supabase, combat.game_id, combat.attacker_player_id);
      } else {
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

  await applyCombatScoreOutcome(supabase, combat, winnerSide);
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
