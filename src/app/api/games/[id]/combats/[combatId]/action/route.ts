import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { executeManualCombatAction, getHexDistance } from "@/lib/game/combat/persistent";
import { findMeleeApproach, getReachableCombatCells } from "@/lib/game/combat/movement";
import {
  executeCombatSpell,
  hasHeroCastCombatSpell,
  markHeroCombatSpellCast,
  type CombatSpellAction,
} from "@/lib/game/combat/spells";
import {
  createCreatureBankPendingReward,
  isCreatureBankType,
  PendingCreatureBankReward,
} from "@/lib/game/creature-banks";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { CombatBoardUnit, CombatSideStatsSnapshot, CombatSummary, CombatTerrainFeature, GameMap, UnitType } from "@/lib/game/types";
import { getHeroMana, getSpell, getSpellCost, heroKnowsSpell } from "@/lib/game/spells";
import { getEffectiveHeroStatsFromValues } from "@/lib/game/artifacts";
import { computeRaisedSkeletons } from "@/lib/game/combat/necromancy";
import { computeSurrenderGoldCost } from "@/lib/game/combat/surrender";
import { UNIT_RULES } from "@/lib/game/economy";
import type { HeroSkills } from "@/lib/game/skills";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
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
  const gamePlayerId = String(gamePlayer.id);
  if (!combatInvolvesPlayer(combat, gamePlayerId)) {
    return NextResponse.json({ error: "Vous ne participez pas a ce combat" }, { status: 403 });
  }
  if (combat.status !== "ACTIVE") {
    const mapped = toCombat(combat);
    return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
  }
  const { data: attackerHero, error: attackerError } = await fetchCombatHero(supabase, combat.attacker_hero_id);
  if (attackerError) return NextResponse.json({ error: attackerError.message }, { status: 500 });
  if (!attackerHero) return NextResponse.json({ error: "Heros attaquant introuvable" }, { status: 404 });

  const { data: defenderHero, error: defenderError } = combat.defender_hero_id
    ? await fetchCombatHero(supabase, combat.defender_hero_id)
    : { data: null, error: null };
  if (defenderError) return NextResponse.json({ error: defenderError.message }, { status: 500 });

  const boardState = combat.board_state as {
    units: CombatBoardUnit[];
    initialUnits?: CombatBoardUnit[];
    terrain?: CombatTerrainFeature[];
    spellCastsByRound?: Record<string, string[]>;
    environment?: { terrain?: import("@/lib/game/types").TerrainType };
    moraleContext?: { attackerHeroMorale?: number; defenderHeroMorale?: number };
    sideStats?: { attacker?: CombatSideStatsSnapshot; defender?: CombatSideStatsSnapshot };
  };
  const currentActor = (boardState.units ?? []).find((unit) => unit.id === combat.current_unit_id);
  const currentActorIsAi = currentActor?.ownerPlayerId && currentActor.ownerPlayerId !== gamePlayerId
    ? await isAiGamePlayer(supabase, id, currentActor.ownerPlayerId)
    : false;
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
      stale: true,
    });
  }

  if (currentActor?.ownerPlayerId && currentActor.ownerPlayerId !== gamePlayerId && !currentActorIsAi) {
    return NextResponse.json({ error: "Ce n'est pas votre tour de combat" }, { status: 403 });
  }
  if (!currentActor && combat.current_player_id && combat.current_player_id !== gamePlayerId) {
    return NextResponse.json({ error: "Ce n'est pas votre tour de combat" }, { status: 403 });
  }

  const isAutomatedTurn = Boolean(currentActor && (currentActor.ownerPlayerId === null || currentActorIsAi));
  if (!gamePlayer.isAlive && !isAutomatedTurn) {
    return NextResponse.json({ error: "Vous avez perdu cette partie" }, { status: 403 });
  }
  const devGodModeHeroId = typeof action.devGodModeHeroId === "string" &&
    ((gamePlayer as { heroes?: Array<{ id: string }> }).heroes ?? []).some((hero) => hero.id === action.devGodModeHeroId)
      ? action.devGodModeHeroId
      : null;

  if (action.type === "CAST_COMBAT_SPELL") {
    const caster = findCombatSpellCaster({
      action,
      gamePlayerId,
      combat,
      attackerHero,
      defenderHero,
      units: boardState.units ?? [],
    });
    if (!caster) return NextResponse.json({ error: "Heros lanceur invalide" }, { status: 400 });
    if (caster.playerId !== gamePlayerId) return NextResponse.json({ error: "Ce n'est pas votre heros" }, { status: 403 });
    if (hasHeroCastCombatSpell(boardState.spellCastsByRound, combat.round ?? 1, caster.heroId)) {
      return NextResponse.json({ error: "Ce heros a deja lance un sort ce round" }, { status: 400 });
    }

    const spell = getSpell(String(action.spellId ?? ""));
    if (!spell || spell.context !== "combat") return NextResponse.json({ error: "Sort de combat invalide" }, { status: 400 });
    if (caster.hero.has_spell_book === false) return NextResponse.json({ error: "Ce heros n'a pas de livre de sorts" }, { status: 400 });
    if (!heroKnowsSpell({ knownSpellIds: caster.hero.known_spells ?? null }, spell.id)) {
      return NextResponse.json({ error: "Sort inconnu" }, { status: 400 });
    }

    const casterStats = getEffectiveHeroStatsFromValues(caster.hero);
    const mana = getHeroMana({ mana: caster.hero.mana, knowledge: casterStats.knowledge });
    const cost = getSpellCost(spell);
    const hasDevInfiniteMana = action.devInfiniteManaHeroId === caster.heroId;
    if (!spell.implemented) return NextResponse.json({ error: "Sort non implemente" }, { status: 400 });
    if (!hasDevInfiniteMana && mana < cost) return NextResponse.json({ error: "Mana insuffisant" }, { status: 400 });

    const spellExecution = executeCombatSpell({
      units: boardState.units ?? [],
      caster: {
        heroId: caster.heroId,
        playerId: caster.playerId,
        side: caster.side,
        spellPower: casterStats.spellPower,
        skills: (caster.hero.skills ?? {}) as Partial<Record<string, "basic" | "advanced" | "expert">>,
      },
      action: action as CombatSpellAction,
      enemySkills: caster.side === "attacker"
        ? ((defenderHero?.skills ?? {}) as Partial<Record<string, "basic" | "advanced" | "expert">>)
        : ((attackerHero?.skills ?? {}) as Partial<Record<string, "basic" | "advanced" | "expert">>),
    });
    if (!spellExecution.ok) return NextResponse.json({ error: spellExecution.error }, { status: 400 });

    const initialUnits = boardState.initialUnits ?? boardState.units ?? [];
    const result = spellExecution.result
      ? buildManualCombatResult(spellExecution.result, initialUnits, spellExecution.units, combat)
      : null;
    const nextBoardState = {
      ...boardState,
      units: spellExecution.units,
      spellCastsByRound: markHeroCombatSpellCast(boardState.spellCastsByRound, combat.round ?? 1, caster.heroId),
    };
    const actionLog = [...(combat.action_log ?? []), ...spellExecution.log];
    const { data, error } = await supabase
      .from("combats")
      .update({
        board_state: nextBoardState,
        action_log: actionLog,
        result,
        status: result ? "RESOLVED" : combat.status,
      })
      .eq("id", combatId)
      .select("*, combat_participants(*)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!hasDevInfiniteMana) await supabase.from("heroes").update({ mana: mana - cost }).eq("id", caster.heroId);
    // Eagle Eye : héros opposé apprend le sort observé selon son niveau de skill.
    await applyEagleEye(supabase, combat, caster.heroId, spell);
    if (result) {
      await persistResolvedCombat(supabase, combat, initialUnits, spellExecution.units, spellExecution.result);
      await evaluateGameLifecycle(supabase, id);
    }
    const mapped = toCombat(data);
    return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
  }

  if (action.type === "TACTICS_MOVE" || action.type === "TACTICS_END") {
    const tacticsPhase = (boardState as { tacticsPhase?: { side: "attacker" | "defender"; maxColumn?: number; minColumn?: number } }).tacticsPhase;
    if (!tacticsPhase) return NextResponse.json({ error: "Pas de phase de tactique en cours" }, { status: 400 });
    const expectedPlayerId = tacticsPhase.side === "attacker" ? combat.attacker_player_id : combat.defender_player_id;
    if (gamePlayerId !== expectedPlayerId) return NextResponse.json({ error: "Pas votre phase de tactique" }, { status: 403 });

    if (action.type === "TACTICS_END") {
      const { tacticsPhase: _drop, ...restBoard } = boardState as Record<string, unknown>;
      void _drop;
      const { data, error } = await supabase
        .from("combats")
        .update({ board_state: restBoard, action_log: [...(combat.action_log ?? []), "Phase de tactique terminée."] })
        .eq("id", combatId)
        .select("*, combat_participants(*)")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ combat: toCombat(data), result: null });
    }

    const targetQ = Number(action.q);
    const targetR = Number(action.r);
    const unit = (boardState.units ?? []).find((u: CombatBoardUnit) => u.id === action.unitId && u.side === tacticsPhase.side);
    if (!unit) return NextResponse.json({ error: "Unité invalide" }, { status: 400 });
    if (!Number.isFinite(targetQ) || !Number.isFinite(targetR)) return NextResponse.json({ error: "Destination invalide" }, { status: 400 });
    if (tacticsPhase.side === "attacker" && targetQ >= (tacticsPhase.maxColumn ?? 0)) {
      return NextResponse.json({ error: "Hors zone de tactique" }, { status: 400 });
    }
    if (tacticsPhase.side === "defender" && targetQ <= (tacticsPhase.minColumn ?? 0)) {
      return NextResponse.json({ error: "Hors zone de tactique" }, { status: 400 });
    }
    if ((boardState.units ?? []).some((u: CombatBoardUnit) => u.q === targetQ && u.r === targetR)) {
      return NextResponse.json({ error: "Case occupée" }, { status: 400 });
    }
    const nextUnits = (boardState.units ?? []).map((u: CombatBoardUnit) => u.id === unit.id ? { ...u, q: targetQ, r: targetR } : u);
    const { data, error } = await supabase
      .from("combats")
      .update({ board_state: { ...boardState, units: nextUnits } })
      .eq("id", combatId)
      .select("*, combat_participants(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ combat: toCombat(data), result: null });
  }

  if (action.type === "FLEE_COMBAT") {
    const siegeEffects = (boardState as { siegeEffects?: { escapeTunnel?: boolean } }).siegeEffects;
    if (!siegeEffects?.escapeTunnel) return NextResponse.json({ error: "Aucun Tunnel d'évasion" }, { status: 400 });
    if (gamePlayerId !== combat.defender_player_id) return NextResponse.json({ error: "Seul le défenseur peut fuir" }, { status: 403 });
    const result = {
      winnerId: "defender" as const,
      winnerPlayerId: combat.defender_player_id,
      attackerLosses: [],
      defenderLosses: [],
      experienceGained: 0,
      log: ["Le défenseur emprunte le Tunnel d'évasion."],
    };
    const { data, error } = await supabase
      .from("combats")
      .update({ board_state: boardState, action_log: [...(combat.action_log ?? []), "Tunnel d'évasion utilisé."], result, status: "RESOLVED" })
      .eq("id", combatId)
      .select("*, combat_participants(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await evaluateGameLifecycle(supabase, id);
    const mapped = toCombat(data);
    return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
  }

  if (action.type === "RETREAT_COMBAT" || action.type === "SURRENDER_COMBAT") {
    const concedingSide = getPlayerCombatSide(combat, gamePlayerId);
    if (!concedingSide) return NextResponse.json({ error: "Camp de combat invalide" }, { status: 400 });
    const winnerSide = concedingSide === "attacker" ? "defender" : "attacker";
    const concedingHeroId = concedingSide === "attacker" ? combat.attacker_hero_id : combat.defender_hero_id;
    const winnerPlayerId = winnerSide === "attacker" ? combat.attacker_player_id : combat.defender_player_id;
    const winnerHeroId = winnerSide === "attacker" ? combat.attacker_hero_id : combat.defender_hero_id;
    if (!concedingHeroId) return NextResponse.json({ error: "Heros introuvable" }, { status: 400 });

    const isSurrender = action.type === "SURRENDER_COMBAT";
    if (isSurrender && (!combat.defender_hero_id || !combat.defender_player_id)) {
      return NextResponse.json({ error: "La reddition est possible uniquement contre un heros." }, { status: 400 });
    }
    if (!isSurrender && hasHeroCastCombatSpell(boardState.spellCastsByRound, combat.round ?? 1, concedingHeroId) && (combat.round ?? 1) <= 1) {
      return NextResponse.json({ error: "Impossible de fuir au premier round apres avoir lance un sort." }, { status: 400 });
    }

    const surrenderHero = concedingSide === "attacker" ? attackerHero : defenderHero;
    const surrenderCost = isSurrender
      ? computeSurrenderGoldCost(boardState.units ?? [], concedingSide, surrenderHero?.skills ?? {})
      : 0;
    if (isSurrender) {
      const resources = playerResources(gamePlayer);
      if (resources.gold < surrenderCost) return NextResponse.json({ error: "Or insuffisant pour se rendre." }, { status: 400 });
      await supabase.from("game_players").update({ gold: resources.gold - surrenderCost }).eq("id", gamePlayerId);
      if (winnerPlayerId) {
        const { data: winnerRow } = await supabase.from("game_players").select("gold").eq("id", winnerPlayerId).maybeSingle();
        await supabase.from("game_players").update({ gold: Number(winnerRow?.gold ?? 0) + surrenderCost }).eq("id", winnerPlayerId);
      }
    }

    const initialUnits = boardState.initialUnits ?? boardState.units ?? [];
    const afterUnits = isSurrender
      ? boardState.units ?? []
      : (boardState.units ?? []).map((unit) => unit.side === concedingSide ? { ...unit, count: 0, health: 0 } : unit);
    const result: CombatSummary = {
      winnerId: winnerSide,
      winnerPlayerId,
      attackerLosses: getSideLosses("attacker", initialUnits, afterUnits),
      defenderLosses: getSideLosses("defender", initialUnits, afterUnits),
      experienceGained: 0,
      log: [
        isSurrender
          ? `${concedingSide === "attacker" ? "L'attaquant" : "Le defenseur"} se rend pour ${surrenderCost} or.`
          : `${concedingSide === "attacker" ? "L'attaquant" : "Le defenseur"} fuit le combat.`,
      ],
    };
    const actionLog = [...(combat.action_log ?? []), ...result.log];
    const { data, error } = await supabase
      .from("combats")
      .update({
        board_state: { ...boardState, units: afterUnits },
        current_unit_id: null,
        current_player_id: null,
        action_log: actionLog,
        result,
        status: "RESOLVED",
      })
      .eq("id", combatId)
      .select("*, combat_participants(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await persistConcededCombat(supabase, combat, initialUnits, afterUnits, {
      concedingSide,
      concedingHeroId,
      winnerSide,
      winnerHeroId: winnerHeroId ?? null,
      preserveArmy: isSurrender,
    });
    await evaluateGameLifecycle(supabase, id);
    const mapped = toCombat(data);
    return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
  }

  const moraleContext = {
    attackerHeroMorale: Number(
      boardState.moraleContext?.attackerHeroMorale ?? attackerHero.morale ?? 0
    ),
    defenderHeroMorale: Number(
      boardState.moraleContext?.defenderHeroMorale ?? defenderHero?.morale ?? 0
    ),
    terrain: boardState.environment?.terrain,
  };
  const attackerStats = boardState.sideStats?.attacker ?? {
    ...getEffectiveHeroStatsFromValues(attackerHero),
    skills: (attackerHero?.skills ?? {}) as Partial<Record<string, "basic" | "advanced" | "expert">>,
  };
  const defenderStats = boardState.sideStats?.defender ?? {
    ...getEffectiveHeroStatsFromValues(defenderHero ?? { attack: 1, defense: 1 }),
    skills: ((defenderHero?.skills ?? {}) as Partial<Record<string, "basic" | "advanced" | "expert">>),
  };
  const execution = executeActionThenNeutralTurns({
    units: boardState.units ?? [],
    terrain: boardState.terrain ?? [],
    turnQueue: combat.turn_queue ?? [],
    round: combat.round ?? 1,
    currentUnitId: combat.current_unit_id,
    playerAction: currentActor?.ownerPlayerId === gamePlayerId ? action : null,
    allowAutomatedAction: Boolean(currentActor && (currentActor.ownerPlayerId === null || currentActorIsAi)),
    attackerStats,
    defenderStats,
    immortalHeroId: devGodModeHeroId,
    moraleContext,
  });

  // Tirs des tours au début de chaque round (siège)
  const fortifications = (boardState as { fortifications?: { towerCount: number; towerDamage: number } }).fortifications;
  let unitsAfterTowers = execution.units;
  const towerLog: string[] = [];
  let lastTowerShots: Array<{ towerIndex: number; targetQ: number; targetR: number }> = [];
  if (fortifications && fortifications.towerCount > 0 && execution.round > (combat.round ?? 1)) {
    const result = applyTowerVolleyInRound(unitsAfterTowers, fortifications.towerCount, fortifications.towerDamage);
    unitsAfterTowers = result.units;
    lastTowerShots = result.shots;
    if (result.killed > 0) towerLog.push(`Volée des tours : ${result.killed} unité(s) attaquante(s) éliminée(s).`);
    else towerLog.push(`Tours de défense tirent (${fortifications.towerCount} salves).`);
  }
  // Catapulte : si elle a agi ce tour, cible la porte d'abord, puis les murs
  let nextTerrain = boardState.terrain ?? [];
  let nextFortifications = (boardState as { fortifications?: { gateCurrentHp?: number; gateOpen?: boolean; towerCount: number; towerDamage: number; gateHp: number; wallHp: number } }).fortifications;
  if (execution.log.some((line) => line.includes("Catapulte"))) {
    const CATAPULT_HIT = 80;
    if (nextFortifications && !nextFortifications.gateOpen && (nextFortifications.gateCurrentHp ?? 0) > 0) {
      const remainingHp = Math.max(0, (nextFortifications.gateCurrentHp ?? 0) - CATAPULT_HIT);
      if (remainingHp <= 0) {
        nextTerrain = nextTerrain.filter((t: CombatTerrainFeature) => !(t.q === 9 && t.r === 4));
        nextFortifications = { ...nextFortifications, gateCurrentHp: 0, gateOpen: true };
        towerLog.push(`Porte fracassée par la catapulte !`);
      } else {
        nextFortifications = { ...nextFortifications, gateCurrentHp: remainingHp };
        towerLog.push(`Porte endommagée par la catapulte (${remainingHp} PV restants).`);
      }
    } else {
      const walls = nextTerrain.filter((t: CombatTerrainFeature) => t.type === "rock" && t.q === 9);
      if (walls.length > 0) {
        const removed = walls[Math.floor(Math.random() * walls.length)];
        nextTerrain = nextTerrain.filter((t: CombatTerrainFeature) => !(t.q === removed.q && t.r === removed.r));
        towerLog.push(`Mur détruit en (${removed.q},${removed.r}).`);
      }
    }
  }
  const initialUnits = boardState.initialUnits ?? boardState.units ?? [];
  let result = execution.result
    ? buildManualCombatResult(execution.result, initialUnits, unitsAfterTowers, combat)
    : null;
  if (result && execution.result === "attacker") {
    const pendingReward = await findCreatureBankRewardForCombat(supabase, combat);
    if (pendingReward) result = { ...result, creatureBankReward: pendingReward };
  }
  const actionLog = [...(combat.action_log ?? []), ...execution.log, ...towerLog];

  const { data, error } = await supabase
    .from("combats")
    .update({
      board_state: { ...boardState, units: unitsAfterTowers, terrain: nextTerrain, fortifications: nextFortifications, lastTowerShots: lastTowerShots.length > 0 ? lastTowerShots : undefined },
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
    await evaluateGameLifecycle(supabase, id);
  }
  const mapped = toCombat(data);
  return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
}

function combatInvolvesPlayer(
  combat: { attacker_player_id: string; defender_player_id?: string | null; combat_participants?: Array<{ player_id: string }> },
  playerId: string
) {
  return (
    combat.attacker_player_id === playerId ||
    combat.defender_player_id === playerId ||
    Boolean(combat.combat_participants?.some((participant) => participant.player_id === playerId))
  );
}

function getPlayerCombatSide(
  combat: { attacker_player_id: string; defender_player_id?: string | null; combat_participants?: Array<{ player_id: string; side?: "attacker" | "defender" }> },
  playerId: string
): "attacker" | "defender" | null {
  if (combat.attacker_player_id === playerId) return "attacker";
  if (combat.defender_player_id === playerId) return "defender";
  return combat.combat_participants?.find((participant) => participant.player_id === playerId)?.side ?? null;
}

function playerResources(player: { resources?: { gold?: unknown }; gold?: unknown }) {
  return { gold: Number(player.resources?.gold ?? player.gold ?? 0) };
}

async function isAiGamePlayer(supabase: ReturnType<typeof createAdminClient>, gameId: string, playerId: string) {
  const { data, error } = await supabase
    .from("game_players")
    .select("is_ai")
    .eq("game_id", gameId)
    .eq("id", playerId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.is_ai);
}

async function fetchCombatHero(
  supabase: ReturnType<typeof createAdminClient>,
  heroId: string
): Promise<{ data: SpellHeroRow | null; error: { message: string; details?: string | null; code?: string } | null }> {
  const full = await supabase
    .from("heroes")
    .select("id,game_player_id,attack,defense,spell_power,knowledge,morale,luck,mana,has_spell_book,known_spells,artifacts,skills")
    .eq("id", heroId)
    .single();
  if (!full.error) return full as { data: SpellHeroRow | null; error: { message: string; details?: string | null; code?: string } | null };
  if (isMissingSkillsSchemaError(full.error)) {
    const withoutSkills = await supabase
      .from("heroes")
      .select("id,game_player_id,attack,defense,spell_power,knowledge,morale,luck,mana,has_spell_book,known_spells,artifacts")
      .eq("id", heroId)
      .single();
    if (!withoutSkills.error) return { data: { ...withoutSkills.data, skills: {} } as SpellHeroRow, error: null };
    if (!isMissingSpellSchemaError(withoutSkills.error)) return withoutSkills as { data: SpellHeroRow | null; error: { message: string; details?: string | null; code?: string } | null };
  }
  if (!isMissingSpellSchemaError(full.error)) return full as { data: SpellHeroRow | null; error: { message: string; details?: string | null; code?: string } | null };

  const fallback = await supabase
    .from("heroes")
    .select("id,game_player_id,attack,defense,spell_power,knowledge,luck,artifacts")
    .eq("id", heroId)
    .single();
  return fallback.error
    ? { data: null, error: fallback.error }
    : {
      data: {
        ...fallback.data,
        mana: Number(fallback.data.knowledge ?? 1) * 10,
        has_spell_book: true,
        known_spells: null,
        skills: {},
      },
      error: null,
    };
}

function isMissingSpellSchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("mana") || text.includes("has_spell_book") || text.includes("known_spells") || text.includes("morale") || text.includes("schema cache");
}

function isMissingSkillsSchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("skills") || text.includes("war_machines");
}

function findCombatSpellCaster(params: {
  action: Record<string, unknown>;
  gamePlayerId: string;
  combat: {
    attacker_player_id: string;
    defender_player_id?: string | null;
    attacker_hero_id: string;
    defender_hero_id?: string | null;
  };
  attackerHero: SpellHeroRow;
  defenderHero: SpellHeroRow | null;
  units: CombatBoardUnit[];
}) {
  const requestedHeroId = typeof params.action.heroId === "string" ? params.action.heroId : null;
  const playerUnit = params.units.find((unit) => unit.ownerPlayerId === params.gamePlayerId);
  const fallbackHeroId = playerUnit?.side === "defender" ? params.combat.defender_hero_id : params.combat.attacker_hero_id;
  const heroId = requestedHeroId ?? fallbackHeroId ?? null;
  if (!heroId) return null;

  if (heroId === params.combat.attacker_hero_id) {
    return {
      heroId,
      playerId: params.combat.attacker_player_id,
      side: "attacker" as const,
      hero: params.attackerHero,
    };
  }
  if (heroId === params.combat.defender_hero_id && params.defenderHero) {
    return {
      heroId,
      playerId: params.combat.defender_player_id ?? "",
      side: "defender" as const,
      hero: params.defenderHero,
    };
  }
  return null;
}

type SpellHeroRow = {
  id: string;
  game_player_id?: string | null;
  attack: number;
  defense: number;
  spell_power: number;
  knowledge: number;
  morale?: number | null;
  luck?: number | null;
  mana?: number | null;
  has_spell_book?: boolean | null;
  known_spells?: string[] | null;
  artifacts?: unknown;
  skills?: Partial<Record<string, "basic" | "advanced" | "expert">> | null;
};

function executeActionThenNeutralTurns(params: {
  units: CombatBoardUnit[];
  terrain: CombatTerrainFeature[];
  turnQueue: string[];
  round: number;
  currentUnitId: string | null;
  playerAction: { type: "MOVE" | "ATTACK" | "SHOOT" | "WAIT" | "DEFEND" | "HEAL"; q?: number; r?: number; targetUnitId?: string } | null;
  allowAutomatedAction: boolean;
  attackerStats: { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> };
  defenderStats: { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> };
  immortalHeroId?: string | null;
  moraleContext?: Parameters<typeof executeManualCombatAction>[0]["moraleContext"];
}) {
  let units = params.units;
  let turnQueue = params.turnQueue;
  let round = params.round;
  let currentUnitId = params.currentUnitId;
  let currentPlayerId = units.find((unit) => unit.id === currentUnitId)?.ownerPlayerId ?? null;
  let result: "attacker" | "defender" | null = null;
  const log: string[] = [];

  const actor = units.find((unit) => unit.id === currentUnitId);
  const action = params.playerAction
    ? params.playerAction
    : params.allowAutomatedAction && actor
      ? chooseNeutralAction(actor, units, params.terrain)
      : null;

  if (!actor || !action) {
    currentPlayerId = actor?.ownerPlayerId ?? null;
    return { units, turnQueue, round, currentUnitId, currentPlayerId, result, log };
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
    immortalHeroId: params.immortalHeroId,
    moraleContext: params.moraleContext,
  });

  units = execution.units;
  turnQueue = execution.turnQueue;
  round = execution.round;
  currentUnitId = execution.currentUnitId;
  currentPlayerId = execution.currentPlayerId;
  result = execution.result;
  log.push(...execution.log);

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

  const approach = findMeleeApproach(actor, closest, units, terrain);
  if (approach) return { type: "ATTACK", targetUnitId: closest.id };

  const destination = getReachableCombatCells(actor, units, terrain)
    .sort((a, b) => getHexDistance(a, closest) - getHexDistance(b, closest))[0];

  return destination ? { type: "MOVE", q: destination.q, r: destination.r } : { type: "DEFEND" };
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
    gate_id?: string | null;
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
      await supabase.from("gate_stacks").delete().eq("id", unit.id);
    } else {
      await supabase.from("armies").update({ count, health }).eq("id", unit.id);
      await supabase.from("neutral_army_stacks").update({ count, health }).eq("id", unit.id);
      await supabase.from("gate_stacks").update({ count, health }).eq("id", unit.id);
    }
  }

  if (winnerSide === "attacker") {
    if (combat.neutral_army_id) {
      await supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", combat.neutral_army_id);
      await supabase
        .from("gates")
        .update({ game_player_id: combat.attacker_player_id, guardian_power: 0 })
        .eq("game_id", combat.game_id)
        .eq("x", combat.x)
        .eq("y", combat.y);
    } else if (combat.gate_id) {
      await supabase
        .from("gates")
        .update({ game_player_id: combat.attacker_player_id, guardian_power: 0 })
        .eq("game_id", combat.game_id)
        .eq("id", combat.gate_id);
      await supabase.from("gate_stacks").delete().eq("gate_id", combat.gate_id);
    } else if (!combat.defender_player_id) {
      const capturedTown = await captureNeutralTownAt(supabase, combat);
      const creatureBankReward = capturedTown ? null : await findCreatureBankRewardForCombat(supabase, combat);
      if (creatureBankReward) {
        await markCreatureBankDefeated(supabase, combat.game_id, creatureBankReward);
      } else if (!capturedTown) {
        const artifactDefeated = await markArtifactDefeatedAt(supabase, combat.game_id, combat.x, combat.y);
        if (!artifactDefeated) {
          await supabase
            .from("resource_buildings")
            .update({ game_player_id: combat.attacker_player_id, guardian_power: 0 })
            .eq("game_id", combat.game_id)
            .eq("x", combat.x)
            .eq("y", combat.y);
        }
      }
    }
    if (combat.defender_hero_id && combat.defender_player_id) {
      await supabase.from("armies").delete().eq("hero_id", combat.defender_hero_id);
      await supabase.from("heroes").delete().eq("id", combat.defender_hero_id);
    }
    await applyNecromancyPostCombat(supabase, combat.attacker_hero_id, combat.attacker_player_id, "attacker", before, after);
    await applyCombatXp(supabase, combat.game_id, combat.attacker_hero_id, before, after);
  } else if (winnerSide === "defender") {
    await supabase.from("armies").delete().eq("hero_id", combat.attacker_hero_id);
    await supabase.from("heroes").delete().eq("id", combat.attacker_hero_id);
    if (combat.defender_hero_id && combat.defender_player_id) {
      await applyNecromancyPostCombat(supabase, combat.defender_hero_id, combat.defender_player_id, "defender", before, after);
      await applyCombatXp(supabase, combat.game_id, combat.defender_hero_id, before, after);
    }
  }
}

async function persistConcededCombat(
  supabase: ReturnType<typeof createAdminClient>,
  combat: {
    game_id: string;
    attacker_player_id: string;
    defender_player_id: string | null;
    attacker_hero_id: string;
    defender_hero_id: string | null;
  },
  before: CombatBoardUnit[],
  after: CombatBoardUnit[],
  options: {
    concedingSide: "attacker" | "defender";
    concedingHeroId: string;
    winnerSide: "attacker" | "defender";
    winnerHeroId: string | null;
    preserveArmy: boolean;
  }
) {
  await persistCombatUnitCounts(supabase, before, after);
  if (!options.preserveArmy) {
    await supabase.from("armies").delete().eq("hero_id", options.concedingHeroId);
  }
  await supabase
    .from("heroes")
    .update({ status: "TAVERN", x: -1, y: -1, movement: 0, max_movement: 0, is_moving: false })
    .eq("id", options.concedingHeroId);

  const winnerPlayerId = options.winnerSide === "attacker" ? combat.attacker_player_id : combat.defender_player_id;
  if (options.winnerHeroId && winnerPlayerId) {
    await applyNecromancyPostCombat(
      supabase,
      options.winnerHeroId,
      winnerPlayerId,
      options.winnerSide,
      before,
      after
    );
    await applyCombatXp(supabase, combat.game_id, options.winnerHeroId, before, after);
  }
  await applyCombatXp(supabase, combat.game_id, options.concedingHeroId, before, after);
}

async function persistCombatUnitCounts(
  supabase: ReturnType<typeof createAdminClient>,
  before: CombatBoardUnit[],
  after: CombatBoardUnit[],
) {
  const afterById = new Map(after.map((unit) => [unit.id, unit]));

  for (const unit of before) {
    const next = afterById.get(unit.id);
    const count = next?.count ?? 0;
    const health = next?.health ?? 0;

    if (count <= 0) {
      await supabase.from("armies").delete().eq("id", unit.id);
      await supabase.from("neutral_army_stacks").delete().eq("id", unit.id);
      await supabase.from("gate_stacks").delete().eq("id", unit.id);
    } else {
      await supabase.from("armies").update({ count, health }).eq("id", unit.id);
      await supabase.from("neutral_army_stacks").update({ count, health }).eq("id", unit.id);
      await supabase.from("gate_stacks").update({ count, health }).eq("id", unit.id);
    }
  }
}

async function applyEagleEye(
  supabase: ReturnType<typeof createAdminClient>,
  combat: { attacker_hero_id: string; defender_hero_id: string | null },
  casterHeroId: string,
  spell: { id: string; level?: number },
) {
  const observerHeroId = casterHeroId === combat.attacker_hero_id ? combat.defender_hero_id : combat.attacker_hero_id;
  if (!observerHeroId) return;
  const { data: hero } = await supabase
    .from("heroes")
    .select("skills,known_spells,has_spell_book")
    .eq("id", observerHeroId)
    .maybeSingle();
  if (!hero || hero.has_spell_book === false) return;
  const lvl = ((hero.skills ?? {}) as Record<string, string>).eagle_eye;
  if (!lvl) return;
  const maxSpellLevel = lvl === "expert" ? 4 : lvl === "advanced" ? 3 : 2;
  const spellLevel = spell.level ?? 1;
  if (spellLevel > maxSpellLevel) return;
  const chance = lvl === "expert" ? 0.7 : lvl === "advanced" ? 0.5 : 0.4;
  if (Math.random() > chance) return;
  const known = new Set((hero.known_spells ?? []) as string[]);
  if (known.has(spell.id)) return;
  known.add(spell.id);
  await supabase.from("heroes").update({ has_spell_book: true, known_spells: Array.from(known) }).eq("id", observerHeroId);
}

function applyTowerVolleyInRound(units: CombatBoardUnit[], towerCount: number, towerDamage: number): { units: CombatBoardUnit[]; killed: number; shots: Array<{ towerIndex: number; targetQ: number; targetR: number }> } {
  if (towerCount <= 0 || towerDamage <= 0) return { units, killed: 0, shots: [] };
  const attackers = units.map((u, i) => (u.side === "attacker" && u.count > 0 ? i : -1)).filter((i) => i >= 0);
  if (attackers.length === 0) return { units, killed: 0, shots: [] };
  const next = units.map((u) => ({ ...u }));
  let killed = 0;
  const shots: Array<{ towerIndex: number; targetQ: number; targetR: number }> = [];
  for (let shot = 0; shot < towerCount; shot++) {
    const target = next[attackers[shot % attackers.length]];
    if (!target || target.count <= 0) continue;
    const nextHealth = Math.max(0, (target.health ?? 0) - towerDamage);
    const maxHealth = target.maxHealth ?? 1;
    const nextCount = nextHealth > 0 ? Math.ceil(nextHealth / maxHealth) : 0;
    killed += Math.max(0, target.count - nextCount);
    target.health = nextHealth;
    target.count = nextCount;
    shots.push({ towerIndex: shot, targetQ: target.q, targetR: target.r });
  }
  return { units: next, killed, shots };
}

async function applyCombatXp(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  winnerHeroId: string,
  before: CombatBoardUnit[],
  after: CombatBoardUnit[],
) {
  // XP basée sur HP totaux d'ennemis détruits (approx H3 : ~XP = HP des unités tuées).
  const afterById = new Map(after.map((u) => [u.id, u]));
  let totalXp = 0;
  for (const unit of before) {
    if (unit.heroId === winnerHeroId) continue;
    const next = afterById.get(unit.id);
    const killed = Math.max(0, unit.count - (next?.count ?? 0));
    if (killed <= 0) continue;
    const hp = UNIT_RULES[unit.unitType]?.health ?? 5;
    totalXp += killed * hp;
  }
  if (totalXp <= 0) totalXp = 100;
  const { data: heroRow } = await supabase.from("heroes").select("experience").eq("id", winnerHeroId).maybeSingle();
  if (!heroRow) return;
  await applyHeroExperienceGain(supabase, gameId, winnerHeroId, Number(heroRow.experience ?? 0) + totalXp);
}

async function applyNecromancyPostCombat(
  supabase: ReturnType<typeof createAdminClient>,
  winnerHeroId: string,
  winnerPlayerId: string,
  winnerSide: "attacker" | "defender",
  before: CombatBoardUnit[],
  after: CombatBoardUnit[],
) {
  const { data: hero } = await supabase.from("heroes").select("id,skills").eq("id", winnerHeroId).maybeSingle();
  if (!hero) return;
  const skills = (hero.skills ?? {}) as HeroSkills;
  if (!skills.necromancy) return;

  const { data: towns } = await supabase
    .from("towns")
    .select("town_type,buildings")
    .eq("game_player_id", winnerPlayerId);
  const playerTowns = (towns ?? []).map((t) => ({
    townType: (t as { town_type?: string | null }).town_type ?? null,
    buildings: (t as { buildings?: string[] | null }).buildings ?? [],
  }));

  const enemySide = winnerSide === "attacker" ? "defender" : "attacker";
  const afterById = new Map(after.map((u) => [u.id, u]));
  const killsByType: Partial<Record<UnitType, number>> = {};
  for (const unit of before) {
    if (unit.side !== enemySide) continue;
    const remaining = afterById.get(unit.id)?.count ?? 0;
    const killed = Math.max(0, unit.count - remaining);
    if (killed > 0) {
      killsByType[unit.unitType] = (killsByType[unit.unitType] ?? 0) + killed;
    }
  }

  const raised = computeRaisedSkeletons(killsByType, skills, playerTowns);
  if (!raised) return;

  const rule = UNIT_RULES[raised.unitType];
  if (!rule) return;
  const { data: existing } = await supabase
    .from("armies")
    .select("id,count,health")
    .eq("hero_id", winnerHeroId)
    .eq("unit_type", raised.unitType)
    .maybeSingle();
  if (existing) {
    await supabase.from("armies").update({
      count: Number(existing.count) + raised.count,
      health: Number(existing.health) + rule.health * raised.count,
    }).eq("id", existing.id);
  } else {
    const { data: armies } = await supabase.from("armies").select("position").eq("hero_id", winnerHeroId);
    const position = armies?.length ?? 0;
    if (position < 7) {
      await supabase.from("armies").insert({
        hero_id: winnerHeroId,
        unit_type: raised.unitType,
        count: raised.count,
        health: rule.health * raised.count,
        max_health: rule.health,
        position,
      });
    }
  }
}

async function markArtifactDefeatedAt(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  x: number,
  y: number,
) {
  const { data: game } = await supabase
    .from("games")
    .select("map_data,map_state")
    .eq("id", gameId)
    .maybeSingle();
  const mapData = game?.map_data as GameMap | undefined;
  const object = mapData?.tiles?.[y]?.[x]?.object;
  if (object?.type !== "artifact") return false;
  const mapState = (game?.map_state as Record<string, unknown> | undefined) ?? {};
  const defeatedArtifacts = new Set<string>((mapState.defeatedArtifacts as string[] | undefined) ?? []);
  defeatedArtifacts.add(object.id);
  await supabase.from("games").update({
    map_state: {
      ...mapState,
      defeatedArtifacts: Array.from(defeatedArtifacts),
    },
  }).eq("id", gameId);
  return true;
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

async function findCreatureBankRewardForCombat(
  supabase: ReturnType<typeof createAdminClient>,
  combat: {
    game_id: string;
    attacker_player_id: string;
    attacker_hero_id: string;
    x: number;
    y: number;
  },
): Promise<PendingCreatureBankReward | null> {
  const { data: game } = await supabase
    .from("games")
    .select("map_data,map_state")
    .eq("id", combat.game_id)
    .maybeSingle();
  const mapData = game?.map_data as GameMap | undefined;
  const object = mapData?.tiles?.[combat.y]?.[combat.x]?.object;
  if (object?.type !== "adventure_building" || !isCreatureBankType(object.subtype)) return null;

  const creatureBanks = (((game?.map_state as Record<string, unknown> | undefined)?.creatureBanks as Record<string, { pendingReward?: PendingCreatureBankReward | null }> | undefined) ?? {});
  const existing = creatureBanks[object.id]?.pendingReward;
  if (existing) return existing;
  return createCreatureBankPendingReward(object.subtype, object.id, combat.attacker_hero_id, combat.attacker_player_id);
}

async function markCreatureBankDefeated(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  pendingReward: PendingCreatureBankReward,
) {
  const { data: game } = await supabase
    .from("games")
    .select("map_state")
    .eq("id", gameId)
    .maybeSingle();
  const mapState = (game?.map_state as Record<string, unknown> | undefined) ?? {};
  const creatureBanks = ((mapState.creatureBanks as Record<string, object> | undefined) ?? {});
  await supabase.from("games").update({
    map_state: {
      ...mapState,
      creatureBanks: {
        ...creatureBanks,
        [pendingReward.bankId]: {
          ...(creatureBanks[pendingReward.bankId] ?? {}),
          defeated: true,
          claimed: false,
          pendingReward,
        },
      },
    },
  }).eq("id", gameId);
}
