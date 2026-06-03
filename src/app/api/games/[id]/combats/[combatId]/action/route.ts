import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { buildTurnQueue, executeManualCombatAction, getHexDistance } from "@/lib/game/combat/persistent";
import { applyTowerVolleyInRound, type SiegeState } from "@/lib/game/combat/siege";
import { chooseAiCombatAction, planAiTacticsPlacements, type AiCombatAction } from "@/lib/game/ai/combat-tactics";
import { chooseAiCombatSpell, executeAiSpellCast, type AiSpellHero } from "@/lib/game/ai/combat-spells";
import {
  buildHalfLossConcessionPersistenceUnits,
  buildConcessionBoardState,
  findNextPrimaryParticipant,
  getHeroCombatUnits,
  sideHasActivePlayerUnits,
  type CombatConcessionParticipant,
} from "@/lib/game/combat/concession";
import { findMeleeApproach, getReachableCombatCells, isInsideCombatCell, isTerrainBlocked } from "@/lib/game/combat/movement";
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
import { CombatBoardUnit, CombatSideStatsSnapshot, CombatSummary, CombatTerrainFeature, GameMap, Resources, UnitType } from "@/lib/game/types";
import { getHeroMana, getSpell, getSpellCost, heroKnowsSpell } from "@/lib/game/spells";
import { getEffectiveHeroStatsFromValues } from "@/lib/game/artifacts";
import { computeRaisedSkeletons } from "@/lib/game/combat/necromancy";
import { computeSurrenderGoldCost } from "@/lib/game/combat/surrender";
import { UNIT_RULES } from "@/lib/game/economy";
import { HERO_ARMY_STACK_LIMIT } from "@/lib/game/army-stacks";
import type { HeroSkills } from "@/lib/game/skills";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { recordGameAction, recordTownCaptureFromCombat, sanitizeActionForLog } from "@/lib/game/server/action-log";
import { applyCombatScoreOutcome } from "@/lib/game/server/score-stats";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, toCombat } from "@/lib/supabase/game-db";
import {
  RESOURCE_KEYS,
  combatActionLabel,
  combatHasPlayerHeroesOnBothSides,
  combatInvolvesPlayer,
  findActiveCombatParticipant,
  getActiveCombatTruce,
  getPlayerCombatSide,
  getSideLosses,
  hasPendingSurrenderNegotiation,
  hasResources,
  isMissingSkillsSchemaError,
  isMissingSpellSchemaError,
  isPrimaryCombatHero,
  normalizeAcknowledgedPlayerIds,
  normalizeSurrenderOffer,
  playerResources,
  type CombatTruceRow,
  type SurrenderNegotiationRow,
} from "./combatRouteHelpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;
  if (user.role === "admin") {
    return NextResponse.json({ error: "Un administrateur peut seulement consulter les combats." }, { status: 403 });
  }

  const { id, combatId } = await params;
  const action = await request.json();
  const supabase = createAdminClient();
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("status,turn_number")
    .eq("id", id)
    .single();
  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

  const gamePlayer = await getGamePlayer(supabase, id, user.id);
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });

  const { data: combat, error: fetchError } = await supabase
    .from("combats")
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .eq("id", combatId)
    .eq("game_id", id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  const gamePlayerId = String(gamePlayer.id);
  if (!combatInvolvesPlayer(combat, gamePlayerId)) {
    return NextResponse.json({ error: "Vous ne participez pas à ce combat" }, { status: 403 });
  }
  if (combat.status !== "ACTIVE") {
    const mapped = toCombat(combat);
    return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
  }
  const { data: attackerHero, error: attackerError } = await fetchCombatHero(supabase, combat.attacker_hero_id);
  if (attackerError) return NextResponse.json({ error: attackerError.message }, { status: 500 });
  if (!attackerHero) return NextResponse.json({ error: "Héros attaquant introuvable" }, { status: 404 });

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
    moraleContext?: { attackerHeroMorale?: number; defenderHeroMorale?: number; attackerHeroLuck?: number; defenderHeroLuck?: number };
    siege?: SiegeState;
    sideStats?: { attacker?: CombatSideStatsSnapshot; defender?: CombatSideStatsSnapshot };
  };
  const aiPlayerIds = await loadAiPlayerIds(supabase, id);
  const currentActor = (boardState.units ?? []).find((unit) => unit.id === combat.current_unit_id);
  const currentActorIsAi = Boolean(currentActor?.ownerPlayerId && currentActor.ownerPlayerId !== gamePlayerId && aiPlayerIds.has(currentActor.ownerPlayerId));
  const expectedCurrentUnitId = typeof action.expectedCurrentUnitId === "string" ? action.expectedCurrentUnitId : null;
  const expectedRound = Number(action.expectedRound);
  const expectedActionLogLength = Number(action.expectedActionLogLength);
  const hasStaleClientState =
    (expectedCurrentUnitId !== null && expectedCurrentUnitId !== combat.current_unit_id) ||
    (Number.isInteger(expectedRound) && expectedRound !== (combat.round ?? 1)) ||
    (Number.isInteger(expectedActionLogLength) && expectedActionLogLength !== (combat.action_log ?? []).length);

  if (hasStaleClientState) {
    return NextResponse.json({
      error: "État de combat périmé",
      combat: toCombat(combat),
      result: combat.result ?? null,
      stale: true,
    });
  }

  const isTacticsAction = action.type === "TACTICS_MOVE" || action.type === "TACTICS_END";
  const bypassTurnAction = action.type === "ACCEPT_SURRENDER" || action.type === "REJECT_SURRENDER" || action.type === "ACK_TRUCE" || isTacticsAction;
  if (!bypassTurnAction && currentActor?.ownerPlayerId && currentActor.ownerPlayerId !== gamePlayerId && !currentActorIsAi) {
    return NextResponse.json({ error: "Ce n'est pas votre tour de combat" }, { status: 403 });
  }
  if (!bypassTurnAction && !currentActor && combat.current_player_id && combat.current_player_id !== gamePlayerId) {
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

  if (action.type === "ACK_TRUCE") {
    const response = await acknowledgeCombatTruce({
      supabase,
      combat,
      combatId,
      gamePlayerId,
      truceId: typeof action.truceId === "string" ? action.truceId : null,
    });
    if (response) return response;
  }

  const activeTruce = getActiveCombatTruce(combat, Number(game.turn_number ?? 0));
  if (activeTruce) {
    return NextResponse.json({ error: "Une treve suspend le combat jusqu'au prochain tour d'aventure." }, { status: 400 });
  }

  if (
    hasPendingSurrenderNegotiation(combat) &&
    action.type !== "ACCEPT_SURRENDER" &&
    action.type !== "REJECT_SURRENDER" &&
    action.type !== "PROPOSE_SURRENDER" &&
    action.type !== "SURRENDER_COMBAT"
  ) {
    return NextResponse.json({ error: "Une negociation de reddition est en cours." }, { status: 400 });
  }

  let tacticsPhase = (boardState as { tacticsPhase?: { side: "attacker" | "defender"; maxColumn?: number; minColumn?: number } }).tacticsPhase;
  // Tactique IA auto : si le camp en phase tactique appartient à une IA, on la résout et on poursuit.
  if (tacticsPhase) {
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
      aiTacticsLog.push("IA : phase de tactique terminée.");
      const { tacticsPhase: _drop, ...restBoard } = boardState as Record<string, unknown>;
      void _drop;
      const nextCurrentUnitId = (combat.turn_queue ?? []).find((unitId: string) =>
        units.some((unit) => unit.id === unitId && unit.count > 0)
      ) ?? null;
      const nextCurrentPlayerId = units.find((unit) => unit.id === nextCurrentUnitId)?.ownerPlayerId ?? null;
      await supabase.from("combats").update({
        board_state: { ...restBoard, units },
        current_unit_id: nextCurrentUnitId,
        current_player_id: nextCurrentPlayerId,
        action_log: [...(combat.action_log ?? []), ...aiTacticsLog, "Combat lance."],
      }).eq("id", combatId);
      tacticsPhase = undefined;
      // Recharge le combat pour la suite (board mis à jour).
      const { data: refreshed } = await supabase
        .from("combats")
        .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
        .eq("id", combatId)
        .single();
      if (refreshed) {
        Object.assign(combat, refreshed);
        Object.assign(boardState, refreshed.board_state ?? {});
      }
    }
  }
  if (tacticsPhase && !isTacticsAction) {
    return NextResponse.json({ error: "Terminez la phase de tactique avant les actions de combat." }, { status: 400 });
  }

  if (action.type === "REQUEST_TRUCE") {
    const response = await requestCombatTruce({
      supabase,
      combat,
      combatId,
      gameTurnNumber: Number(game.turn_number ?? 0),
      gamePlayerId,
    });
    if (response) return response;
  }

  if (action.type === "CAST_COMBAT_SPELL") {
    const caster = findCombatSpellCaster({
      action,
      gamePlayerId,
      combat,
      attackerHero,
      defenderHero,
      units: boardState.units ?? [],
    });
    if (!caster) return NextResponse.json({ error: "Héros lanceur invalide" }, { status: 400 });
    if (caster.playerId !== gamePlayerId) return NextResponse.json({ error: "Ce n'est pas votre héros" }, { status: 403 });
    if (hasHeroCastCombatSpell(boardState.spellCastsByRound, combat.round ?? 1, caster.heroId)) {
      return NextResponse.json({ error: "Ce héros a déjà lancé un sort ce round" }, { status: 400 });
    }

    const spell = getSpell(String(action.spellId ?? ""));
    if (!spell || spell.context !== "combat") return NextResponse.json({ error: "Sort de combat invalide" }, { status: 400 });
    if (caster.hero.has_spell_book === false) return NextResponse.json({ error: "Ce héros n'a pas de livre de sorts" }, { status: 400 });
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
      terrain: boardState.terrain ?? [],
      siege: boardState.siege ?? null,
      enemySkills: caster.side === "attacker"
        ? ((defenderHero?.skills ?? {}) as Partial<Record<string, "basic" | "advanced" | "expert">>)
        : ((attackerHero?.skills ?? {}) as Partial<Record<string, "basic" | "advanced" | "expert">>),
    });
    if (!spellExecution.ok) return NextResponse.json({ error: spellExecution.error }, { status: 400 });

    const initialUnits = boardState.initialUnits ?? boardState.units ?? [];
    const result = spellExecution.result
      ? buildManualCombatResult(spellExecution.result, initialUnits, spellExecution.units, combat)
      : null;
    const nextTurnQueue = result
      ? []
      : spellExecution.requiresQueueRebuild
        ? buildTurnQueue(spellExecution.units, combat.round ?? 1)
        : (combat.turn_queue ?? []).filter((unitId: string) => spellExecution.units.some((unit) => unit.id === unitId && unit.count > 0));
    const nextCurrentUnitId = result
      ? null
      : spellExecution.units.some((unit) => unit.id === combat.current_unit_id && unit.count > 0)
        ? combat.current_unit_id
        : nextTurnQueue[0] ?? null;
    const nextCurrentPlayerId = result
      ? null
      : spellExecution.units.find((unit) => unit.id === nextCurrentUnitId)?.ownerPlayerId ?? null;
    const nextBoardState = {
      ...boardState,
      units: spellExecution.units,
      terrain: spellExecution.terrain ?? boardState.terrain,
      siege: spellExecution.siege ?? boardState.siege,
      spellCastsByRound: markHeroCombatSpellCast(boardState.spellCastsByRound, combat.round ?? 1, caster.heroId),
    };
    const actionLog = [...(combat.action_log ?? []), ...spellExecution.log];
    const { data, error } = await supabase
      .from("combats")
      .update({
        board_state: nextBoardState,
        turn_queue: nextTurnQueue,
        current_unit_id: nextCurrentUnitId,
        current_player_id: nextCurrentPlayerId,
        action_log: actionLog,
        result,
        status: result ? "RESOLVED" : combat.status,
      })
      .eq("id", combatId)
      .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
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
    await logCombatAction({ supabase, gameId: id, gamePlayerId, turnNumber: Number(game.turn_number ?? 0), action, combatId });
    return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
  }

  if (action.type === "TACTICS_MOVE" || action.type === "TACTICS_END") {
    if (!tacticsPhase) return NextResponse.json({ error: "Pas de phase de tactique en cours" }, { status: 400 });
    const expectedPlayerId = tacticsPhase.side === "attacker" ? combat.attacker_player_id : combat.defender_player_id;
    if (gamePlayerId !== expectedPlayerId) return NextResponse.json({ error: "Pas votre phase de tactique" }, { status: 403 });

    if (action.type === "TACTICS_END") {
      const { tacticsPhase: _drop, ...restBoard } = boardState as Record<string, unknown>;
      void _drop;
      const nextCurrentUnitId = (combat.turn_queue ?? []).find((unitId: string) =>
        (boardState.units ?? []).some((unit) => unit.id === unitId && unit.count > 0)
      ) ?? null;
      const nextCurrentPlayerId = (boardState.units ?? []).find((unit) => unit.id === nextCurrentUnitId)?.ownerPlayerId ?? null;
      const { data, error } = await supabase
        .from("combats")
        .update({
          board_state: restBoard,
          current_unit_id: nextCurrentUnitId,
          current_player_id: nextCurrentPlayerId,
          action_log: [...(combat.action_log ?? []), "Phase de tactique terminée.", "Combat lance."],
        })
        .eq("id", combatId)
        .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logCombatAction({ supabase, gameId: id, gamePlayerId, turnNumber: Number(game.turn_number ?? 0), action, combatId });
      return NextResponse.json({ combat: toCombat(data), result: null });
    }

    const targetQ = Number(action.q);
    const targetR = Number(action.r);
    const unit = (boardState.units ?? []).find((u: CombatBoardUnit) => u.id === action.unitId && u.side === tacticsPhase.side);
    if (!unit) return NextResponse.json({ error: "Unité invalide" }, { status: 400 });
    if (!Number.isInteger(targetQ) || !Number.isInteger(targetR) || !isInsideCombatCell(targetQ, targetR)) {
      return NextResponse.json({ error: "Destination invalide" }, { status: 400 });
    }
    if (tacticsPhase.side === "attacker" && targetQ >= (tacticsPhase.maxColumn ?? 0)) {
      return NextResponse.json({ error: "Hors zone de tactique" }, { status: 400 });
    }
    if (tacticsPhase.side === "defender" && targetQ <= (tacticsPhase.minColumn ?? 0)) {
      return NextResponse.json({ error: "Hors zone de tactique" }, { status: 400 });
    }
    if ((boardState.units ?? []).some((u: CombatBoardUnit) => u.q === targetQ && u.r === targetR)) {
      return NextResponse.json({ error: "Case occupée" }, { status: 400 });
    }
    if (isTerrainBlocked(targetQ, targetR, boardState.terrain ?? [])) {
      return NextResponse.json({ error: "Case bloquee" }, { status: 400 });
    }
    const nextUnits = (boardState.units ?? []).map((u: CombatBoardUnit) => u.id === unit.id ? { ...u, q: targetQ, r: targetR } : u);
    const { data, error } = await supabase
      .from("combats")
      .update({ board_state: { ...boardState, units: nextUnits } })
      .eq("id", combatId)
      .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logCombatAction({ supabase, gameId: id, gamePlayerId, turnNumber: Number(game.turn_number ?? 0), action, combatId });
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
      .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await evaluateGameLifecycle(supabase, id);
    const mapped = toCombat(data);
    await logCombatAction({ supabase, gameId: id, gamePlayerId, turnNumber: Number(game.turn_number ?? 0), action, combatId });
    return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
  }

  if (action.type === "PROPOSE_SURRENDER" || action.type === "SURRENDER_COMBAT") {
    const response = await createSurrenderNegotiation({
      supabase,
      combat,
      boardState,
      gamePlayer,
      gamePlayerId,
      combatId,
      action,
    });
    if (response) return response;
  }

  if (action.type === "ACCEPT_SURRENDER" || action.type === "REJECT_SURRENDER") {
    const response = await resolveSurrenderNegotiation({
      supabase,
      id,
      combatId,
      combat,
      boardState,
      gamePlayerId,
      decision: action.type === "ACCEPT_SURRENDER" ? "accept" : "reject",
      negotiationId: typeof action.negotiationId === "string" ? action.negotiationId : null,
    });
    if (response) return response;
  }

  if (action.type === "RETREAT_COMBAT") {
    const concedingParticipant = findActiveCombatParticipant(combat, boardState.units ?? [], gamePlayerId, combat.current_unit_id);
    const concedingSide = concedingParticipant?.side ?? getPlayerCombatSide(combat, gamePlayerId);
    if (!concedingSide) return NextResponse.json({ error: "Camp de combat invalide" }, { status: 400 });
    if (!concedingParticipant?.heroId) return NextResponse.json({ error: "Héros introuvable" }, { status: 400 });
    const concedingHeroId = concedingParticipant.heroId;

    if (hasHeroCastCombatSpell(boardState.spellCastsByRound, combat.round ?? 1, concedingHeroId) && (combat.round ?? 1) <= 1) {
      return NextResponse.json({ error: "Impossible de fuir au premier round apres avoir lance un sort." }, { status: 400 });
    }

    return applyCombatConcession({
      supabase,
      gameId: id,
      combatId,
      combat,
      boardState,
      concedingPlayerId: gamePlayerId,
      concedingHeroId,
      concedingSide,
      preserveArmy: false,
      halveArmyLosses: true,
      logLine: `${concedingParticipant.label} fuit le combat.`,
    });
  }

  const moraleContext = {
    attackerHeroMorale: Number(
      boardState.moraleContext?.attackerHeroMorale ?? attackerHero.morale ?? 0
    ),
    defenderHeroMorale: Number(
      boardState.moraleContext?.defenderHeroMorale ?? defenderHero?.morale ?? 0
    ),
    attackerHeroLuck: Number(boardState.moraleContext?.attackerHeroLuck ?? attackerHero.luck ?? 0),
    defenderHeroLuck: Number(boardState.moraleContext?.defenderHeroLuck ?? defenderHero?.luck ?? 0),
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
  // Construit les contextes "lanceur de sort IA" pour chaque camp si le joueur principal est une IA.
  const aiSpellHeroes: { attacker: AiSpellHero | null; defender: AiSpellHero | null } = {
    attacker: combat.attacker_player_id && aiPlayerIds.has(combat.attacker_player_id) && attackerHero
      ? {
          heroId: combat.attacker_hero_id,
          side: "attacker",
          playerId: combat.attacker_player_id,
          spellPower: Number(attackerHero.spell_power ?? 0),
          knowledge: Number(attackerHero.knowledge ?? 1),
          mana: attackerHero.mana ?? null,
          knownSpellIds: (attackerHero.known_spells as string[] | null) ?? null,
          hasSpellBook: attackerHero.has_spell_book !== false,
          skills: (attackerHero.skills as Partial<Record<string, "basic" | "advanced" | "expert">>) ?? undefined,
        }
      : null,
    defender: combat.defender_player_id && combat.defender_hero_id && aiPlayerIds.has(combat.defender_player_id) && defenderHero
      ? {
          heroId: combat.defender_hero_id,
          side: "defender",
          playerId: combat.defender_player_id,
          spellPower: Number(defenderHero.spell_power ?? 0),
          knowledge: Number(defenderHero.knowledge ?? 1),
          mana: defenderHero.mana ?? null,
          knownSpellIds: (defenderHero.known_spells as string[] | null) ?? null,
          hasSpellBook: defenderHero.has_spell_book !== false,
          skills: (defenderHero.skills as Partial<Record<string, "basic" | "advanced" | "expert">>) ?? undefined,
        }
      : null,
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
    siege: boardState.siege,
    aiPlayerIds,
    gamePlayerId,
    aiSpellHeroes,
    spellCastsByRound: boardState.spellCastsByRound,
  });

  // Tirs des tours au début de chaque round (siège)
  const nextSiege = execution.siege ?? boardState.siege;
  let unitsAfterTowers = execution.units;
  const towerLog: string[] = [];
  let lastTowerShots: Array<{ towerId: string; towerIndex: number; targetQ: number; targetR: number }> = [];
  if (nextSiege && execution.round > (combat.round ?? 1)) {
    const result = applyTowerVolleyInRound(unitsAfterTowers, nextSiege);
    unitsAfterTowers = result.units;
    lastTowerShots = result.shots;
    if (result.killed > 0) towerLog.push(`Volée des tours : ${result.killed} unité(s) attaquante(s) éliminée(s).`);
    else towerLog.push(`Tours de défense tirent (${result.shots.length} salves).`);
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
      board_state: { ...boardState, units: unitsAfterTowers, siege: nextSiege, lastTowerShots: lastTowerShots.length > 0 ? lastTowerShots : undefined, spellCastsByRound: execution.spellCastsByRound ?? boardState.spellCastsByRound },
      turn_queue: execution.turnQueue,
      current_unit_id: execution.currentUnitId,
      current_player_id: result ? null : execution.currentPlayerId,
      round: execution.round,
      action_log: actionLog,
      result,
      status: result ? "RESOLVED" : combat.status,
    })
    .eq("id", combatId)
    .eq("updated_at", combat.updated_at)
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    const { data: refreshedCombat, error: refreshedError } = await supabase
      .from("combats")
      .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
      .eq("id", combatId)
      .eq("game_id", id)
      .single();
    if (refreshedError) return NextResponse.json({ error: refreshedError.message }, { status: 500 });
    return NextResponse.json({
      error: "État de combat périmé",
      combat: toCombat(refreshedCombat),
      result: refreshedCombat.result ?? null,
      stale: true,
    });
  }
  if (result) {
    await persistResolvedCombat(supabase, combat, initialUnits, execution.units, execution.result);
    await evaluateGameLifecycle(supabase, id);
  }
  // Persiste les coûts en mana des sorts IA lancés pendant ce tour.
  if (execution.aiManaDelta) {
    for (const [heroId, delta] of execution.aiManaDelta) {
      if (delta <= 0) continue;
      const { data: heroRow } = await supabase.from("heroes").select("mana").eq("id", heroId).maybeSingle();
      const currentMana = Number(heroRow?.mana ?? 0);
      await supabase.from("heroes").update({ mana: Math.max(0, currentMana - delta) }).eq("id", heroId);
    }
  }
  const mapped = toCombat(data);
  await logCombatAction({ supabase, gameId: id, gamePlayerId, turnNumber: Number(game.turn_number ?? 0), action, combatId });
  return NextResponse.json({ combat: mapped, result: mapped.result ?? null });
}


async function deleteConsumedCombatParticipants(
  supabase: ReturnType<typeof createAdminClient>,
  combatId: string,
  participantIds: Array<string | null | undefined>
) {
  const ids = Array.from(new Set(participantIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return;
  await supabase.from("combat_participants").delete().eq("combat_id", combatId).in("id", ids);
}

async function requestCombatTruce(params: {
  supabase: ReturnType<typeof createAdminClient>;
  combat: {
    attacker_player_id: string;
    defender_player_id?: string | null;
    attacker_hero_id: string;
    defender_hero_id?: string | null;
    combat_truces?: CombatTruceRow[];
  };
  combatId: string;
  gameTurnNumber: number;
  gamePlayerId: string;
}) {
  const side = params.combat.attacker_player_id === params.gamePlayerId
    ? "attacker"
    : params.combat.defender_player_id === params.gamePlayerId
      ? "defender"
      : null;
  if (!side) return NextResponse.json({ error: "Seul un joueur principal peut demander une treve." }, { status: 403 });
  const heroId = side === "attacker" ? params.combat.attacker_hero_id : params.combat.defender_hero_id;
  if (!heroId) return NextResponse.json({ error: "Héros principal introuvable." }, { status: 400 });
  if (getActiveCombatTruce(params.combat, params.gameTurnNumber)) {
    return NextResponse.json({ error: "Une treve est déjà en cours." }, { status: 400 });
  }
  const alreadyUsed = params.combat.combat_truces?.some((truce) => truce.requested_by_player_id === params.gamePlayerId);
  if (alreadyUsed) {
    return NextResponse.json({ error: "Vous avez déjà utilise votre treve dans ce combat." }, { status: 400 });
  }

  const { error } = await params.supabase.from("combat_truces").insert({
    combat_id: params.combatId,
    requested_by_player_id: params.gamePlayerId,
    requested_by_hero_id: heroId,
    side,
    pause_until_turn: params.gameTurnNumber + 1,
    acknowledged_player_ids: [],
    status: "ACTIVE",
  });
  if (error) {
    const message = String(error.message ?? "");
    if (message.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "Vous avez déjà utilise votre treve dans ce combat." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const combat = await fetchMappedCombat(params.supabase, params.combatId);
  if (combat instanceof NextResponse) return combat;
  return NextResponse.json({ combat, result: null });
}

async function acknowledgeCombatTruce(params: {
  supabase: ReturnType<typeof createAdminClient>;
  combat: {
    combat_participants?: Array<{ player_id: string }>;
    combat_truces?: CombatTruceRow[];
    attacker_player_id: string;
    defender_player_id?: string | null;
  };
  combatId: string;
  gamePlayerId: string;
  truceId: string | null;
}) {
  const truce = params.truceId
    ? params.combat.combat_truces?.find((item) => item.id === params.truceId)
    : params.combat.combat_truces?.find((item) => item.status === "ACTIVE");
  if (!truce) return NextResponse.json({ error: "Trêve introuvable." }, { status: 404 });
  if (!combatInvolvesPlayer(params.combat, params.gamePlayerId)) {
    return NextResponse.json({ error: "Vous ne participez pas à ce combat" }, { status: 403 });
  }
  const acknowledged = normalizeAcknowledgedPlayerIds(truce.acknowledged_player_ids);
  if (!acknowledged.includes(params.gamePlayerId)) acknowledged.push(params.gamePlayerId);
  const { error } = await params.supabase
    .from("combat_truces")
    .update({ acknowledged_player_ids: acknowledged, updated_at: new Date().toISOString() })
    .eq("id", truce.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const combat = await fetchMappedCombat(params.supabase, params.combatId);
  if (combat instanceof NextResponse) return combat;
  return NextResponse.json({ combat, result: null });
}

async function createSurrenderNegotiation(params: {
  supabase: ReturnType<typeof createAdminClient>;
  combat: {
    attacker_player_id: string;
    defender_player_id?: string | null;
    attacker_hero_id: string;
    defender_hero_id?: string | null;
    current_unit_id?: string | null;
    combat_participants?: CombatConcessionParticipant[];
  };
  boardState: { units?: CombatBoardUnit[]; spellCastsByRound?: Record<string, string[]> };
  gamePlayer: { resources?: Partial<Record<keyof Resources, unknown>>; gold?: unknown; wood?: unknown; ore?: unknown; mercury?: unknown; crystals?: unknown; gems?: unknown; sulfur?: unknown };
  gamePlayerId: string;
  combatId: string;
  action: Record<string, unknown>;
}) {
  const concedingParticipant = findActiveCombatParticipant(params.combat, params.boardState.units ?? [], params.gamePlayerId, params.combat.current_unit_id);
  const concedingSide = concedingParticipant?.side ?? getPlayerCombatSide(params.combat, params.gamePlayerId);
  if (!concedingSide) return NextResponse.json({ error: "Camp de combat invalide" }, { status: 400 });
  if (!concedingParticipant?.heroId) return NextResponse.json({ error: "Héros introuvable" }, { status: 400 });
  if (!combatHasPlayerHeroesOnBothSides(params.combat, params.boardState.units ?? [])) {
    return NextResponse.json({ error: "La reddition est possible uniquement contre un héros." }, { status: 400 });
  }
  const targetPlayerId = concedingSide === "attacker" ? params.combat.defender_player_id : params.combat.attacker_player_id;
  if (!targetPlayerId) return NextResponse.json({ error: "Joueur adverse introuvable" }, { status: 400 });

  const { data: surrenderHero, error: surrenderHeroError } = await fetchCombatHero(params.supabase, concedingParticipant.heroId);
  if (surrenderHeroError) return NextResponse.json({ error: surrenderHeroError.message }, { status: 500 });
  const baseGold = computeSurrenderGoldCost(
    getHeroCombatUnits(params.boardState.units ?? [], concedingParticipant.heroId, params.gamePlayerId),
    concedingSide,
    surrenderHero?.skills ?? {}
  );
  const offer = normalizeSurrenderOffer(params.action.offer, { gold: baseGold });
  const resources = playerResources(params.gamePlayer);
  if (!hasResources(resources, offer)) return NextResponse.json({ error: "Ressources insuffisantes pour cette proposition." }, { status: 400 });

  const { data: existing, error: existingError } = await params.supabase
    .from("combat_surrender_negotiations")
    .select("*")
    .eq("combat_id", params.combatId)
    .eq("surrendering_hero_id", concedingParticipant.heroId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const payload = {
    combat_id: params.combatId,
    surrendering_player_id: params.gamePlayerId,
    surrendering_hero_id: concedingParticipant.heroId,
    target_player_id: targetPlayerId,
    side: concedingSide,
    base_gold: baseGold,
    offer,
    status: "PENDING",
    updated_at: new Date().toISOString(),
    resolved_at: null,
  };
  const write = existing
    ? await params.supabase.from("combat_surrender_negotiations").update(payload).eq("id", existing.id)
    : await params.supabase.from("combat_surrender_negotiations").insert({ ...payload, refusal_count: 0 });
  if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });

  const combat = await fetchMappedCombat(params.supabase, params.combatId);
  if (combat instanceof NextResponse) return combat;
  return NextResponse.json({ combat, result: null });
}

async function resolveSurrenderNegotiation(params: {
  supabase: ReturnType<typeof createAdminClient>;
  id: string;
  combatId: string;
  combat: {
    attacker_player_id: string;
    defender_player_id: string | null;
    attacker_hero_id: string;
    defender_hero_id: string | null;
    game_id: string;
    round?: number | null;
    current_unit_id?: string | null;
    action_log?: string[] | null;
    combat_participants?: CombatConcessionParticipant[];
  };
  boardState: { units?: CombatBoardUnit[]; initialUnits?: CombatBoardUnit[] };
  gamePlayerId: string;
  decision: "accept" | "reject";
  negotiationId: string | null;
}) {
  const negotiation = await fetchPendingSurrenderNegotiation(params.supabase, params.combatId, params.negotiationId);
  if (negotiation instanceof NextResponse) return negotiation;
  if (negotiation.target_player_id !== params.gamePlayerId) {
    return NextResponse.json({ error: "Seul le joueur adverse principal peut repondre." }, { status: 403 });
  }

  if (params.decision === "reject") {
    const nextRefusalCount = Number(negotiation.refusal_count ?? 0) + 1;
    if (nextRefusalCount < 3) {
      const { error } = await params.supabase
        .from("combat_surrender_negotiations")
        .update({ refusal_count: nextRefusalCount, status: "REJECTED", updated_at: new Date().toISOString() })
        .eq("id", negotiation.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const combat = await fetchMappedCombat(params.supabase, params.combatId);
      if (combat instanceof NextResponse) return combat;
      return NextResponse.json({ combat, result: null });
    }

    const forcedOffer = normalizeSurrenderOffer({ gold: negotiation.base_gold });
    const forcedTransfer = await transferResources(params.supabase, negotiation.surrendering_player_id, negotiation.target_player_id, forcedOffer);
    if (forcedTransfer) return forcedTransfer;
    await params.supabase
      .from("combat_surrender_negotiations")
      .update({ refusal_count: nextRefusalCount, status: "FORCED", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", negotiation.id);
    return applyCombatConcession({
      supabase: params.supabase,
      gameId: params.id,
      combatId: params.combatId,
      combat: params.combat,
      boardState: params.boardState,
      concedingPlayerId: negotiation.surrendering_player_id,
      concedingHeroId: negotiation.surrendering_hero_id,
      concedingSide: negotiation.side,
      preserveArmy: true,
      logLine: `${negotiation.side === "attacker" ? "L'attaquant" : "Le defenseur"} se rend pour ${negotiation.base_gold} or.`,
    });
  }

  const offer = normalizeSurrenderOffer(negotiation.offer);
  const transferError = await transferResources(params.supabase, negotiation.surrendering_player_id, negotiation.target_player_id, offer);
  if (transferError) return transferError;
  const { error } = await params.supabase
    .from("combat_surrender_negotiations")
    .update({ status: "ACCEPTED", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", negotiation.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return applyCombatConcession({
    supabase: params.supabase,
    gameId: params.id,
    combatId: params.combatId,
    combat: params.combat,
    boardState: params.boardState,
    concedingPlayerId: negotiation.surrendering_player_id,
    concedingHeroId: negotiation.surrendering_hero_id,
    concedingSide: negotiation.side,
    preserveArmy: true,
    logLine: `${negotiation.side === "attacker" ? "L'attaquant" : "Le defenseur"} se rend apres negociation.`,
  });
}

async function applyCombatConcession(params: {
  supabase: ReturnType<typeof createAdminClient>;
  gameId: string;
  combatId: string;
  combat: {
    attacker_player_id: string;
    defender_player_id?: string | null;
    attacker_hero_id: string;
    defender_hero_id?: string | null;
    game_id: string;
    round?: number | null;
    current_unit_id?: string | null;
    action_log?: string[] | null;
    combat_participants?: CombatConcessionParticipant[];
  };
  boardState: { units?: CombatBoardUnit[]; initialUnits?: CombatBoardUnit[] };
  concedingPlayerId: string;
  concedingHeroId: string;
  concedingSide: "attacker" | "defender";
  preserveArmy: boolean;
  halveArmyLosses?: boolean;
  logLine: string;
}) {
  const winnerSide = params.concedingSide === "attacker" ? "defender" : "attacker";
  const initialUnits = params.boardState.initialUnits ?? params.boardState.units ?? [];
  const beforeUnits = params.boardState.units ?? [];
  const concessionBoard = buildConcessionBoardState({
    units: beforeUnits,
    heroId: params.concedingHeroId,
    playerId: params.concedingPlayerId,
    round: params.combat.round ?? 1,
    currentUnitId: params.combat.current_unit_id,
  });
  const boardAfterUnits = concessionBoard.units;
  const persistenceAfterUnits = params.preserveArmy
    ? beforeUnits
    : params.halveArmyLosses
      ? buildHalfLossConcessionPersistenceUnits({
          units: beforeUnits,
          heroId: params.concedingHeroId,
          playerId: params.concedingPlayerId,
        })
      : boardAfterUnits;
  const activeConcedingSide = sideHasActivePlayerUnits(boardAfterUnits, params.concedingSide);
  const promoted = isPrimaryCombatHero(params.combat, params.concedingSide, params.concedingHeroId) && activeConcedingSide
    ? findNextPrimaryParticipant(params.combat.combat_participants ?? [], boardAfterUnits, params.concedingSide)
    : null;
  const nextAttackerPlayerId = promoted && params.concedingSide === "attacker" ? promoted.player_id : params.combat.attacker_player_id;
  const nextAttackerHeroId = promoted && params.concedingSide === "attacker" ? promoted.hero_id : params.combat.attacker_hero_id;
  const nextDefenderPlayerId = promoted && params.concedingSide === "defender" ? promoted.player_id : params.combat.defender_player_id ?? null;
  const nextDefenderHeroId = promoted && params.concedingSide === "defender" ? promoted.hero_id : params.combat.defender_hero_id ?? null;
  const winnerPlayerId = winnerSide === "attacker" ? nextAttackerPlayerId : nextDefenderPlayerId;
  const winnerHeroId = winnerSide === "attacker" ? nextAttackerHeroId : nextDefenderHeroId;
  const combatResolved = !activeConcedingSide;
  const result: CombatSummary | null = combatResolved ? {
    winnerId: winnerSide,
    winnerPlayerId,
    attackerLosses: getSideLosses("attacker", initialUnits, persistenceAfterUnits),
    defenderLosses: getSideLosses("defender", initialUnits, persistenceAfterUnits),
    experienceGained: 0,
    log: [params.logLine],
  } : null;
  const { error } = await params.supabase
    .from("combats")
    .update({
      attacker_player_id: nextAttackerPlayerId,
      attacker_hero_id: nextAttackerHeroId,
      defender_player_id: nextDefenderPlayerId,
      defender_hero_id: nextDefenderHeroId,
      board_state: { ...params.boardState, units: boardAfterUnits },
      turn_queue: combatResolved ? [] : concessionBoard.turnQueue,
      current_unit_id: combatResolved ? null : concessionBoard.currentUnitId,
      current_player_id: combatResolved ? null : concessionBoard.currentPlayerId,
      action_log: [...(params.combat.action_log ?? []), params.logLine],
      result,
      status: combatResolved ? "RESOLVED" : "ACTIVE",
    })
    .eq("id", params.combatId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await persistConcededCombat(params.supabase, {
    game_id: params.combat.game_id,
    attacker_player_id: params.combat.attacker_player_id,
    defender_player_id: params.combat.defender_player_id ?? null,
    attacker_hero_id: params.combat.attacker_hero_id,
    defender_hero_id: params.combat.defender_hero_id ?? null,
  }, initialUnits, persistenceAfterUnits, {
    concedingSide: params.concedingSide,
    concedingHeroId: params.concedingHeroId,
    winnerSide,
    winnerHeroId: combatResolved ? winnerHeroId ?? null : null,
    preserveArmy: params.preserveArmy || Boolean(params.halveArmyLosses),
  });
  await deleteConsumedCombatParticipants(params.supabase, params.combatId, [
    params.combat.combat_participants?.find((participant) => participant.hero_id === params.concedingHeroId)?.id,
    promoted?.id,
  ]);
  await evaluateGameLifecycle(params.supabase, params.gameId);
  const combat = await fetchMappedCombat(params.supabase, params.combatId);
  if (combat instanceof NextResponse) return combat;
  return NextResponse.json({ combat, result: combat.result ?? null });
}

async function fetchPendingSurrenderNegotiation(
  supabase: ReturnType<typeof createAdminClient>,
  combatId: string,
  negotiationId: string | null
): Promise<SurrenderNegotiationRow | NextResponse> {
  const query = supabase
    .from("combat_surrender_negotiations")
    .select("*")
    .eq("combat_id", combatId)
    .eq("status", "PENDING");
  const { data, error } = negotiationId
    ? await query.eq("id", negotiationId).single()
    : await query.limit(1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return data as SurrenderNegotiationRow;
}

async function fetchMappedCombat(supabase: ReturnType<typeof createAdminClient>, combatId: string) {
  const { data, error } = await supabase
    .from("combats")
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .eq("id", combatId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return toCombat(data);
}

async function transferResources(
  supabase: ReturnType<typeof createAdminClient>,
  fromPlayerId: string,
  toPlayerId: string,
  offer: Resources
): Promise<NextResponse | null> {
  const { data: fromRow, error: fromError } = await supabase
    .from("game_players")
    .select("gold,wood,ore,mercury,crystals,gems,sulfur")
    .eq("id", fromPlayerId)
    .single();
  if (fromError) return NextResponse.json({ error: fromError.message }, { status: 500 });
  const fromResources = playerResources(fromRow);
  if (!hasResources(fromResources, offer)) return NextResponse.json({ error: "Ressources insuffisantes pour honorer cette reddition." }, { status: 400 });

  const { data: toRow, error: toError } = await supabase
    .from("game_players")
    .select("gold,wood,ore,mercury,crystals,gems,sulfur")
    .eq("id", toPlayerId)
    .single();
  if (toError) return NextResponse.json({ error: toError.message }, { status: 500 });
  const toResources = playerResources(toRow);
  const fromUpdate = RESOURCE_KEYS.reduce((update, key) => {
    update[key] = fromResources[key] - offer[key];
    return update;
  }, {} as Resources);
  const toUpdate = RESOURCE_KEYS.reduce((update, key) => {
    update[key] = toResources[key] + offer[key];
    return update;
  }, {} as Resources);

  const { error: updateFromError } = await supabase.from("game_players").update(fromUpdate).eq("id", fromPlayerId);
  if (updateFromError) return NextResponse.json({ error: updateFromError.message }, { status: 500 });
  const { error: updateToError } = await supabase.from("game_players").update(toUpdate).eq("id", toPlayerId);
  if (updateToError) return NextResponse.json({ error: updateToError.message }, { status: 500 });
  return null;
}

async function loadAiPlayerIds(supabase: ReturnType<typeof createAdminClient>, gameId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("game_players")
    .select("id")
    .eq("game_id", gameId)
    .eq("is_ai", true);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.id as string));
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
  siege?: SiegeState | null;
  aiPlayerIds: Set<string>;
  gamePlayerId: string;
  aiSpellHeroes?: { attacker: AiSpellHero | null; defender: AiSpellHero | null };
  spellCastsByRound?: Record<string, string[]>;
}) {
  let units = params.units;
  let turnQueue = params.turnQueue;
  let round = params.round;
  let currentUnitId = params.currentUnitId;
  let currentPlayerId = units.find((unit) => unit.id === currentUnitId)?.ownerPlayerId ?? null;
  let result: "attacker" | "defender" | null = null;
  let siege = params.siege;
  const log: string[] = [];
  const sideStats = { attacker: params.attackerStats, defender: params.defenderStats };
  let spellCastsByRound = params.spellCastsByRound;
  const aiSpellHeroes = params.aiSpellHeroes;
  const aiManaDelta = new Map<string, number>();

  function tryCastSpell(actorSide: "attacker" | "defender") {
    const hero = aiSpellHeroes?.[actorSide] ?? null;
    if (!hero) return;
    const enemy = aiSpellHeroes?.[actorSide === "attacker" ? "defender" : "attacker"];
    const choice = chooseAiCombatSpell({
      hero,
      units,
      terrain: params.terrain,
      round,
      spellCastsByRound,
      enemySkills: enemy?.skills,
    });
    if (!choice) return;
    const execution = executeAiSpellCast({
      units,
      caster: choice.caster,
      action: choice.action,
      terrain: params.terrain,
      enemySkills: enemy?.skills,
    });
    if (!execution.ok) return;
    units = execution.units;
    if (execution.requiresQueueRebuild) turnQueue = buildTurnQueue(units, round);
    log.push(...execution.log);
    const cost = Math.max(0, choice.spell.cost.standard);
    aiManaDelta.set(hero.heroId, (aiManaDelta.get(hero.heroId) ?? 0) + cost);
    hero.mana = Math.max(0, (hero.mana ?? hero.knowledge * 10) - cost);
    spellCastsByRound = markHeroCombatSpellCast(spellCastsByRound, round, hero.heroId);
    if (execution.result) result = execution.result;
  }

  const actor = units.find((unit) => unit.id === currentUnitId);
  // Si l'acteur est sur un camp IA, tente un sort avant son action.
  if (!params.playerAction && params.allowAutomatedAction && actor && (actor.ownerPlayerId === null || params.aiPlayerIds.has(actor.ownerPlayerId ?? ""))) {
    if (actor.ownerPlayerId && params.aiPlayerIds.has(actor.ownerPlayerId)) {
      tryCastSpell(actor.side);
    }
  }
  const actorAfterSpell = units.find((unit) => unit.id === currentUnitId);
  const action = params.playerAction
    ? params.playerAction
    : params.allowAutomatedAction && actorAfterSpell
      ? chooseAutomatedAction(actorAfterSpell, units, params.terrain, sideStats, params.aiPlayerIds, siege)
      : null;

  if (!actor || !action) {
    currentPlayerId = actor?.ownerPlayerId ?? null;
    return { units, turnQueue, round, currentUnitId, currentPlayerId, result, log, siege, spellCastsByRound };
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
    siege,
  });

  units = execution.units;
  siege = execution.siege;
  turnQueue = execution.turnQueue;
  round = execution.round;
  currentUnitId = execution.currentUnitId;
  currentPlayerId = execution.currentPlayerId;
  result = execution.result;
  log.push(...execution.log);

  // Only chain automated turns when this request itself started on an
  // automated actor. After a player action, the client advances the next AI
  // turn after the previous action animation has settled.
  let safetyCap = 30;
  while (!params.playerAction && !result && currentUnitId && safetyCap-- > 0) {
    const nextActor = units.find((unit) => unit.id === currentUnitId);
    if (!nextActor) break;
    const isAutomated = nextActor.ownerPlayerId === null || params.aiPlayerIds.has(nextActor.ownerPlayerId ?? "");
    if (!isAutomated) break;
    if (nextActor.ownerPlayerId === params.gamePlayerId) break;
    // Cast de sort IA avant l'action de l'unité.
    if (nextActor.ownerPlayerId && params.aiPlayerIds.has(nextActor.ownerPlayerId)) {
      tryCastSpell(nextActor.side);
      if (result) break;
    }
    const refreshedActor = units.find((unit) => unit.id === currentUnitId);
    if (!refreshedActor) break;
    const nextAction = chooseAutomatedAction(refreshedActor, units, params.terrain, sideStats, params.aiPlayerIds, siege);
    const nextExecution = executeManualCombatAction({
      units,
      terrain: params.terrain,
      turnQueue,
      round,
      currentUnitId,
      action: nextAction,
      attackerStats: params.attackerStats,
      defenderStats: params.defenderStats,
      immortalHeroId: params.immortalHeroId,
      moraleContext: params.moraleContext,
      siege,
    });
    units = nextExecution.units;
    siege = nextExecution.siege;
    turnQueue = nextExecution.turnQueue;
    round = nextExecution.round;
    currentUnitId = nextExecution.currentUnitId;
    currentPlayerId = nextExecution.currentPlayerId;
    result = nextExecution.result;
    log.push(...nextExecution.log);
  }

  return { units, turnQueue, round, currentUnitId, currentPlayerId, result, log, siege, aiManaDelta, spellCastsByRound };
}

function chooseAutomatedAction(
  actor: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  sideStats: Record<"attacker" | "defender", { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> }>,
  aiPlayerIds: Set<string>,
  siege?: SiegeState | null,
): AiCombatAction {
  // Pour les unités d'un joueur IA : déléguer au choix tactique intelligent.
  if (actor.ownerPlayerId && aiPlayerIds.has(actor.ownerPlayerId)) {
    return chooseAiCombatAction(actor, units, terrain, sideStats, siege);
  }
  // Pour les unités neutres (sans propriétaire) : ancienne logique simple.
  return chooseNeutralAction(actor, units, terrain, siege);
}

function chooseNeutralAction(
  actor: CombatBoardUnit,
  units: CombatBoardUnit[],
  terrain: CombatTerrainFeature[],
  siege?: SiegeState | null
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

  const approach = findMeleeApproach(actor, closest, units, terrain, siege);
  if (approach) return { type: "ATTACK", targetUnitId: closest.id };

  const destination = getReachableCombatCells(actor, units, terrain, siege)
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
      if (capturedTown) {
        await recordTownCaptureFromCombat(supabase, combat.game_id, combat.attacker_player_id);
      }
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
    if (!combat.defender_player_id && !combat.neutral_army_id && !combat.gate_id) {
      await persistGeneratedNeutralDefenderSurvivorsAt(supabase, combat.game_id, combat.x, combat.y, after);
    }
    await supabase.from("armies").delete().eq("hero_id", combat.attacker_hero_id);
    await supabase.from("heroes").delete().eq("id", combat.attacker_hero_id);
    if (combat.defender_hero_id && combat.defender_player_id) {
      await applyNecromancyPostCombat(supabase, combat.defender_hero_id, combat.defender_player_id, "defender", before, after);
      await applyCombatXp(supabase, combat.game_id, combat.defender_hero_id, before, after);
    }
  }

  await applyCombatScoreOutcome(supabase, combat, winnerSide);
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

async function persistGeneratedNeutralDefenderSurvivorsAt(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  x: number,
  y: number,
  units: CombatBoardUnit[],
) {
  const survivors = units
    .filter((unit) => unit.side === "defender" && unit.count > 0)
    .map((unit, position) => ({
      id: unit.id,
      unitType: unit.unitType,
      count: unit.count,
      health: unit.health,
      maxHealth: unit.maxHealth,
      position,
    }));

  const { data: town } = await supabase
    .from("towns")
    .select("id")
    .eq("game_id", gameId)
    .eq("x", x)
    .eq("y", y)
    .eq("is_neutral", true)
    .maybeSingle();
  if (town) {
    await supabase.from("towns").update({ neutral_garrison: survivors }).eq("id", town.id);
    return;
  }

  const { data: game } = await supabase
    .from("games")
    .select("map_data,map_state")
    .eq("id", gameId)
    .maybeSingle();
  const mapData = game?.map_data as GameMap | undefined;
  const object = mapData?.tiles?.[y]?.[x]?.object;
  const mapState = (game?.map_state as Record<string, unknown> | undefined) ?? {};

  if (object?.type === "adventure_building" && isCreatureBankType(object.subtype)) {
    const creatureBanks = (mapState.creatureBanks as Record<string, object> | undefined) ?? {};
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        creatureBanks: {
          ...creatureBanks,
          [object.id]: {
            ...(creatureBanks[object.id] ?? {}),
            guardStacks: survivors,
          },
        },
      },
    }).eq("id", gameId);
    return;
  }

  if (object?.type === "artifact") {
    const artifactGuards = (mapState.artifactGuards as Record<string, typeof survivors> | undefined) ?? {};
    await supabase.from("games").update({
      map_state: {
        ...mapState,
        artifactGuards: {
          ...artifactGuards,
          [object.id]: survivors,
        },
      },
    }).eq("id", gameId);
    return;
  }

  const guardianPower = survivors.reduce((total, unit) => total + unit.count * unit.maxHealth, 0);
  await supabase
    .from("resource_buildings")
    .update({ guardian_power: guardianPower })
    .eq("game_id", gameId)
    .eq("x", x)
    .eq("y", y);
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

async function applyCombatXp(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  winnerHeroId: string,
  before: CombatBoardUnit[],
  after: CombatBoardUnit[],
) {
  // XP basée sur les HP totaux d'ennemis détruits.
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
    if (position < HERO_ARMY_STACK_LIMIT) {
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

async function logCombatAction(params: {
  supabase: ReturnType<typeof createAdminClient>;
  gameId: string;
  gamePlayerId: string;
  turnNumber: number;
  action: Record<string, unknown>;
  combatId: string;
}) {
  const actionType = String(params.action.type ?? "COMBAT_ACTION");
  await recordGameAction(params.supabase, {
    gameId: params.gameId,
    gamePlayerId: params.gamePlayerId,
    actorKind: "player",
    turnNumber: params.turnNumber,
    actionType,
    category: "combat",
    summary: `Joueur ${combatActionLabel(actionType)}.`,
    details: { combatId: params.combatId, action: sanitizeActionForLog(params.action) },
  });
}
