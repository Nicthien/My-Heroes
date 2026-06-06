import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { buildCombatEnvironment } from "@/lib/game/combat/environment";
import { createCombatBoard, executeManualCombatAction, resolveAutomaticCombat } from "@/lib/game/combat/persistent";
import { createCastleSiegeState, filterSiegeTerrain, type SiegeState } from "@/lib/game/combat/siege";
import { COMBAT_COLS } from "@/lib/game/combat/movement";
import { chooseAiCombatAction, planAiTacticsPlacements } from "@/lib/game/ai/combat-tactics";
import {
  createCreatureBankGuardStacks,
  createCreatureBankPendingReward,
  getCreatureBankDefinition,
  isCreatureBankType,
  PendingCreatureBankReward,
} from "@/lib/game/creature-banks";
import { ARTIFACT_GUARDIAN_POWER, getArtifact, getEffectiveHeroStatsFromValues, isArtifactClass } from "@/lib/game/artifacts";
import { getAllyGrailAura, getEnemyGrailMoraleMalus } from "@/lib/game/grail";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { applyCombatScoreOutcome } from "@/lib/game/server/score-stats";
import { BuildingType, Faction, GameMap, UnitStack, UnitType } from "@/lib/game/types";
import {
  areAdventurePositionsAdjacent,
  computeVisibleTiles,
  getAdventurePathCostAvoiding,
  getPlayerVisionCenters,
  getRequiredAdventureMovementAvoiding,
  getUsableAdventureMovement,
  normalizeMapMovement,
} from "@/lib/game/engine";
import { createNeutralArmyStacksForTile } from "@/lib/game/neutral-armies";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { recordGameAction, sanitizeActionForLog } from "@/lib/game/server/action-log";
import { getUnitRule } from "@/lib/game/units";
import { getTownFortLevel } from "@/lib/game/town-buildings";
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
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .eq("game_id", id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const mapped = (data ?? []).map(toCombat);
  const canSpectate = !gamePlayer.isAlive;
  return NextResponse.json(mapped.filter((combat) => canSpectate || combatInvolvesPlayer(combat, String(gamePlayer.id))));
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
    isAlive?: boolean;
    exploredTiles: string[];
    towns: Array<{ x: number; y: number; faction?: string; townType?: string; buildings?: string[] }>;
    resourceBuildings: Array<{ id: string; x: number; y: number; guardianPower: number }>;
    heroes: Array<{
      id: string;
      attack: number;
      defense: number;
      morale?: number;
      spellPower?: number;
      knowledge?: number;
      luck?: number;
      artifacts?: unknown;
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
  const dbGates = (game?.gates ?? []) as unknown as Array<{
    id: string;
    gamePlayerId?: string | null;
    x: number;
    y: number;
    guardianPower?: number;
    garrison?: UnitStack[];
  }>;
  const gamePlayer = players.find((player) => player.userId === user.id);

  if (!game || !gamePlayer) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });
  if (!gamePlayer.isAlive) return NextResponse.json({ error: "Vous avez perdu cette partie" }, { status: 403 });

  const completedTurn = ((game.turns ?? []) as Array<{ gamePlayerId: string; turnNumber: number; isCompleted: boolean }>).find(
    (turn) => turn.gamePlayerId === gamePlayer.id && turn.turnNumber === game.turnNumber && turn.isCompleted
  );
  if (completedTurn) {
    return NextResponse.json({ error: "Vous avez déjà terminé votre tour" }, { status: 403 });
  }

  const attacker = gamePlayer.heroes.find((hero) => hero.id === body.attackerHeroId);
  if (!attacker) return NextResponse.json({ error: "Héros attaquant invalide" }, { status: 400 });
  if (isHeroInActiveCombat(game.combats, attacker.id)) {
    return NextResponse.json({ error: "Ce héros est déjà engagé dans un combat." }, { status: 400 });
  }

  const mapData = normalizeMapMovement(game.mapData as GameMap);
  const mapState = (game.mapState as Record<string, unknown> | undefined) ?? {};
  const gates = getEffectiveGates(dbGates, mapData);
  const defender = getDefender({
    targetId: String(body.targetId ?? ""),
    targetType: String(body.targetType ?? ""),
    attackerPlayerId: gamePlayer.id,
    players,
    neutralArmies,
    mapData,
  });
  const buildingDefender = !defender && body.targetType === "building"
    ? await getBuildingDefender(supabase, id, String(body.targetId ?? ""), mapData)
    : null;
  const targetPosition = getTargetPosition(body);
  const townDefender = !defender && !buildingDefender && body.targetType === "town"
    ? await getTownDefender(supabase, id, String(body.targetId ?? ""), targetPosition)
    : null;
  const gateDefender = !defender && !buildingDefender && !townDefender && body.targetType === "gate"
    ? getGateDefender(gates, String(body.targetId ?? ""), targetPosition)
    : null;
  const creatureBankDefender = !defender && !buildingDefender && !townDefender && !gateDefender && body.targetType === "creature_bank"
    ? getCreatureBankDefender(mapData, mapState, String(body.targetId ?? ""), targetPosition)
    : null;
  const artifactDefender = !defender && !buildingDefender && !townDefender && !gateDefender && !creatureBankDefender && body.targetType === "artifact"
    ? getArtifactDefender(mapData, mapState, String(body.targetId ?? ""), targetPosition)
    : null;
  const targetDefender = defender ?? buildingDefender ?? townDefender ?? gateDefender ?? creatureBankDefender ?? artifactDefender;
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
  if (body.mode === "AUTO" && (body.targetType === "hero" || body.targetType === "gate") && targetDefender.playerId && !defenderOwner?.isAi) {
    return NextResponse.json({ error: "Les combats entre joueurs doivent être manuels" }, { status: 400 });
  }
  if (targetDefender.heroId && isHeroInActiveCombat(game.combats, targetDefender.heroId)) {
    return NextResponse.json({ error: "Ce héros est déjà engagé dans un combat." }, { status: 400 });
  }
  const devGodModeHeroId = user.godModeEnabled && typeof body.devGodModeHeroId === "string" && body.devGodModeHeroId === attacker.id
    ? attacker.id
    : null;

  const defenderPosition = { x: targetDefender.x, y: targetDefender.y };
  const path = Array.isArray(body.path) ? body.path : null;
  if (path) {
    const validation = validateCombatPath(mapData, { x: attacker.x, y: attacker.y }, path, attacker.movement ?? 0, defenderPosition);
    if (!validation.ok) return NextResponse.json({ error: "Chemin de combat invalide" }, { status: 400 });

    const lastPos = validation.destination;
    if (lastPos.x !== attacker.x || lastPos.y !== attacker.y) {
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
  } else if (!areAdventurePositionsAdjacent({ x: attacker.x, y: attacker.y }, defenderPosition)) {
    return NextResponse.json({ error: "Le héros doit s'arrêter devant la cible avant le combat" }, { status: 400 });
  }

  if (body.targetType === "gate") {
    await ensureGateRow(supabase, id, targetDefender);
  }

  const environment = buildCombatEnvironment(mapData, { x: targetDefender.x, y: targetDefender.y });
  const defenderTownMoraleBonus = getTownMoraleBonus(players, {
    x: targetDefender.x,
    y: targetDefender.y,
    ownerPlayerId: targetDefender.playerId,
  });
  const attackerTownMoraleBonus = getTownMoraleBonus(players, {
    x: attacker.x,
    y: attacker.y,
    ownerPlayerId: gamePlayer.id,
  });
  const attackerStats = getEffectiveHeroStatsFromValues(attacker);
  const defenderStats = getEffectiveHeroStatsFromValues(targetDefender);
  const attackerArmiesWithMachines = injectWarMachines(
    attacker.armies,
    (attacker as unknown as { warMachines?: { ballista?: boolean; firstAid?: boolean; ammoCart?: boolean } }).warMachines,
    body.targetType === "town",
  );
  const siegeEffects = body.targetType === "town"
    ? getSiegeDefenseEffects(players, { x: targetDefender.x, y: targetDefender.y, ownerPlayerId: targetDefender.playerId })
    : { fearMoraleMalus: 0, sulfurDamagePerUnit: 0, escapeTunnel: false };
  const siegeFortifications = body.targetType === "town"
    ? getSiegeFortifications(players, {
        x: targetDefender.x,
        y: targetDefender.y,
        ownerPlayerId: targetDefender.playerId,
        townDefender: (targetDefender as unknown as { townLevel?: number | null; townBuildings?: string[] | null }),
      })
    : { towerCount: 0, towerDamage: 0, wallHp: 0, gateHp: 0 };
  const attackerSkills = (attacker as unknown as { skills?: Record<string, string> }).skills;
  const defenderSkills = (targetDefender as unknown as { skills?: Record<string, string> }).skills;
  const attackerLeadership = skillLevelValue(attackerSkills, "leadership");
  const defenderLeadership = skillLevelValue(defenderSkills, "leadership");
  // Monumental Grail auras: a player's erected Grail buffs every one of their
  // heroes (attack/defense/morale/luck/spellPower) and may project a morale
  // malus onto enemy heroes (Inferno). Applied here so both AUTO resolution and
  // the persisted manual board share the same effective stats.
  const defenderPlayer = players.find((player) => player.id === targetDefender.playerId);
  const attackerGrail = getAllyGrailAura(gamePlayer);
  const defenderGrail = defenderPlayer ? getAllyGrailAura(defenderPlayer) : { attack: 0, defense: 0, spellPower: 0, morale: 0, luck: 0 };
  const enemyMoraleMalusOnAttacker = defenderPlayer ? getEnemyGrailMoraleMalus(defenderPlayer) : 0;
  const enemyMoraleMalusOnDefender = getEnemyGrailMoraleMalus(gamePlayer);
  attackerStats.attack += attackerGrail.attack;
  attackerStats.defense += attackerGrail.defense;
  attackerStats.spellPower += attackerGrail.spellPower;
  defenderStats.attack += defenderGrail.attack;
  defenderStats.defense += defenderGrail.defense;
  defenderStats.spellPower += defenderGrail.spellPower;

  const effectiveAttackerLuck = (attackerStats.luck ?? 0) + skillLevelValue(attackerSkills, "luck") + attackerGrail.luck;
  const effectiveDefenderLuck = (defenderStats.luck ?? 0) + skillLevelValue(defenderSkills, "luck") + defenderGrail.luck;
  const effectiveAttackerMorale = attackerStats.morale + attackerTownMoraleBonus + attackerLeadership - siegeEffects.fearMoraleMalus + attackerGrail.morale + enemyMoraleMalusOnAttacker;
  const effectiveDefenderMorale = defenderStats.morale + defenderTownMoraleBonus + defenderLeadership + defenderGrail.morale + enemyMoraleMalusOnDefender;
  const combatStart = createCombatBoard(
    {
      id: attacker.id,
      playerId: gamePlayer.id,
      heroId: attacker.id,
      attack: attackerStats.attack,
      defense: attackerStats.defense,
      skills: (attacker as unknown as { skills?: Partial<Record<string, "basic" | "advanced" | "expert">> }).skills ?? {},
      morale: effectiveAttackerMorale,
      luck: effectiveAttackerLuck,
      armies: attackerArmiesWithMachines,
    },
    {
      id: targetDefender.id,
      playerId: targetDefender.playerId,
      heroId: targetDefender.heroId,
      attack: defenderStats.attack,
      defense: defenderStats.defense,
      skills: (targetDefender as unknown as { skills?: Partial<Record<string, "basic" | "advanced" | "expert">> }).skills ?? {},
      morale: effectiveDefenderMorale,
      luck: effectiveDefenderLuck,
      armies: targetDefender.armies,
    },
    {
      environment,
      tacticsAdvance: {
        attacker: tacticsAdvanceFor((attacker as unknown as { skills?: Record<string, string> }).skills),
        defender: tacticsAdvanceFor((targetDefender as unknown as { skills?: Record<string, string> }).skills),
      },
    }
  );
  const siegeState = body.targetType === "town" ? createCastleSiegeState(siegeFortifications) : undefined;
  const combatTerrain = filterSiegeTerrain(combatStart.boardState.terrain, siegeState);
  const autoResult = body.mode === "AUTO"
    ? resolveAutomaticCombat(
      {
        id: attacker.id,
        playerId: gamePlayer.id,
        heroId: attacker.id,
        attack: attackerStats.attack,
        defense: attackerStats.defense,
        morale: effectiveAttackerMorale,
        luck: effectiveAttackerLuck,
        armies: attacker.armies,
      },
      {
        id: targetDefender.id,
        playerId: targetDefender.playerId,
        heroId: targetDefender.heroId,
        attack: defenderStats.attack,
        defense: defenderStats.defense,
        morale: effectiveDefenderMorale,
        luck: effectiveDefenderLuck,
        armies: targetDefender.armies,
      },
      { immortalHeroId: devGodModeHeroId }
    )
    : null;
  let result = autoResult
    ? {
      ...autoResult,
      winnerPlayerId: autoResult.winnerId === attacker.id ? gamePlayer.id : targetDefender.playerId,
    }
    : null;
  if (result && autoResult?.winnerId === attacker.id && creatureBankDefender) {
    result = {
      ...result,
      creatureBankReward: createCreatureBankPendingReward(
        creatureBankDefender.bankType,
        creatureBankDefender.id,
        attacker.id,
        gamePlayer.id,
      ),
    };
  }
  const attackerTacticsAdvance = tacticsAdvanceFor((attacker as unknown as { skills?: Record<string, string> }).skills);
  const defenderTacticsAdvance = tacticsAdvanceFor((targetDefender as unknown as { skills?: Record<string, string> }).skills);
  const tacticsAdvantage = attackerTacticsAdvance - defenderTacticsAdvance;
  const tacticsPhase = body.mode === "AUTO" || result
    ? null
    : tacticsAdvantage > 0
      ? { side: "attacker" as const, maxColumn: 1 + attackerTacticsAdvance }
      : tacticsAdvantage < 0
        ? { side: "defender" as const, minColumn: COMBAT_COLS - 2 - defenderTacticsAdvance }
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
      gate_id: body.targetType === "gate" ? targetDefender.id : null,
      x: targetDefender.x,
      y: targetDefender.y,
      board_state: (() => {
        return {
          ...combatStart.boardState,
          environment,
          moraleContext: {
            attackerHeroMorale: effectiveAttackerMorale,
            defenderHeroMorale: effectiveDefenderMorale,
            attackerHeroLuck: effectiveAttackerLuck,
            defenderHeroLuck: effectiveDefenderLuck,
          },
          siegeEffects: siegeEffects.escapeTunnel || siegeEffects.sulfurDamagePerUnit > 0 ? siegeEffects : undefined,
          ...(siegeState ? { siege: siegeState } : {}),
          tacticsPhase: tacticsPhase ?? undefined,
          terrain: combatTerrain,
          units: applyTowerVolley(applySulfurDamage(combatStart.boardState.units, siegeEffects.sulfurDamagePerUnit), siegeFortifications),
        };
      })(),
      current_player_id: result || tacticsPhase ? null : combatStart.currentPlayerId,
      current_unit_id: result || tacticsPhase ? null : combatStart.currentUnitId,
      turn_queue: combatStart.turnQueue,
      action_log: result ? ["Combat automatique.", ...result.log] : tacticsPhase ? ["Phase de tactique."] : ["Combat lance."],
      result,
    })
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordGameAction(supabase, {
    gameId: id,
    gamePlayerId: gamePlayer.id,
    actorKind: gamePlayer.isAi ? "ai" : "player",
    turnNumber: Number(game.turnNumber ?? 0),
    actionType: "START_COMBAT",
    category: "combat",
    summary: `Joueur lance un combat ${combatTargetLabel(body.targetType)}.`,
    details: {
      combatId: data.id,
      targetType: body.targetType,
      targetId: body.targetId,
      position: { x: targetDefender.x, y: targetDefender.y },
      mode: body.mode ?? "MANUAL",
      result: result ? "resolved" : "active",
      action: sanitizeActionForLog({
        type: "START_COMBAT",
        attackerHeroId: body.attackerHeroId,
        targetType: body.targetType,
        targetId: body.targetId,
        mode: body.mode ?? "MANUAL",
      } as Record<string, unknown>),
    },
  });

  if (autoResult && result) {
    const attackerWon = autoResult.winnerId === attacker.id;
    const winnerArmies = attackerWon
      ? applyAutoLosses(attacker.armies, result.attackerLosses)
      : applyAutoLosses(targetDefender.armies, result.defenderLosses);
    await persistAutoWinnerArmies(supabase, attackerWon ? "armies" : getDefenderArmyTable(body.targetType, targetDefender), winnerArmies);
    await grantAutoCombatExperience(supabase, id, attackerWon ? attacker.id : targetDefender.heroId, result.experienceGained);

    if (attackerWon) {
      if (targetDefender.neutralArmyId) {
        await supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", targetDefender.neutralArmyId);
        // The defeated neutral army is fully wiped on an auto-win; clear its stacks so no
        // orphaned units linger (mirrors the manual path in persistCombatOutcome).
        await supabase.from("neutral_army_stacks").delete().eq("neutral_army_id", targetDefender.neutralArmyId);
        await supabase
          .from("gates")
          .update({ game_player_id: gamePlayer.id, guardian_power: 0 })
          .eq("game_id", id)
          .eq("x", targetDefender.x)
          .eq("y", targetDefender.y);
      } else if (body.targetType === "town") {
        await captureNeutralTown(supabase, id, targetDefender.id, gamePlayer.id);
      } else if (body.targetType === "gate") {
        await captureGate(supabase, id, targetDefender, gamePlayer.id);
      } else if (body.targetType === "creature_bank" && creatureBankDefender && result?.creatureBankReward) {
        await markCreatureBankDefeated(supabase, id, game.mapState as Record<string, unknown>, result.creatureBankReward);
      } else if (body.targetType === "artifact" && artifactDefender) {
        await markArtifactDefeated(supabase, id, game.mapState as Record<string, unknown>, artifactDefender.id);
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
      await persistGeneratedDefenderSurvivors(supabase, id, body.targetType, targetDefender, mapState, winnerArmies);
      await supabase.from("armies").delete().eq("hero_id", attacker.id);
      await supabase.from("heroes").delete().eq("id", attacker.id);
    }
    await applyCombatScoreOutcome(
      supabase,
      {
        game_id: id,
        attacker_player_id: gamePlayer.id,
        defender_player_id: targetDefender.playerId ?? null,
        defender_hero_id: targetDefender.heroId ?? null,
      },
      attackerWon ? "attacker" : "defender"
    );
    await evaluateGameLifecycle(supabase, id);
  }

  // Si le combat est manuel et que l'IA doit jouer en premier (tactique ou tour initial),
  // on résout les actions automatiques avant de répondre pour éviter au joueur d'attendre.
  let combatRow = data;
  if (!result && combatRow) {
    combatRow = await advanceInitialAiTurns({
      supabase,
      gameId: id,
      combatId: combatRow.id,
      combatRow,
      attackerStats,
      defenderStats,
      attackerMorale: effectiveAttackerMorale,
      defenderMorale: effectiveDefenderMorale,
      attackerLuck: effectiveAttackerLuck,
      defenderLuck: effectiveDefenderLuck,
      environment,
    });
  }
  return NextResponse.json({ combat: toCombat(combatRow), result }, { status: 201 });
}

function combatTargetLabel(targetType: unknown) {
  const labels: Record<string, string> = {
    artifact: "pour un artefact",
    building: "pour une mine",
    creature_bank: "contre une banque de créatures",
    gate: "contre une porte",
    monster: "contre des créatures",
    town: "contre un château",
  };
  return labels[String(targetType ?? "")] ?? "";
}

async function advanceInitialAiTurns(params: {
  supabase: ReturnType<typeof createAdminClient>;
  gameId: string;
  combatId: string;
  combatRow: Record<string, unknown> & { board_state?: unknown; turn_queue?: unknown; current_unit_id?: unknown; round?: unknown; action_log?: unknown; attacker_player_id?: string; defender_player_id?: string | null };
  attackerStats: { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> };
  defenderStats: { attack: number; defense: number; skills?: Partial<Record<string, "basic" | "advanced" | "expert">> };
  attackerMorale: number;
  defenderMorale: number;
  attackerLuck: number;
  defenderLuck: number;
  environment: { terrain?: import("@/lib/game/types").TerrainType };
}) {
  const { data: aiRows } = await params.supabase
    .from("game_players")
    .select("id")
    .eq("game_id", params.gameId)
    .eq("is_ai", true);
  const aiPlayerIds = new Set((aiRows ?? []).map((row) => row.id as string));
  let combatRow = params.combatRow;
  let boardState = (combatRow.board_state as {
    units?: import("@/lib/game/types").CombatBoardUnit[];
    terrain?: import("@/lib/game/types").CombatTerrainFeature[];
    siege?: SiegeState;
    tacticsPhase?: { side: "attacker" | "defender"; maxColumn?: number; minColumn?: number };
  } | undefined) ?? {};
  // 1) Phase de tactique IA
  if (boardState.tacticsPhase) {
    const tacticsPhase = boardState.tacticsPhase;
    const tacticsPlayerId = tacticsPhase.side === "attacker" ? combatRow.attacker_player_id : combatRow.defender_player_id;
    if (!tacticsPlayerId || aiPlayerIds.has(tacticsPlayerId)) {
      const units = (boardState.units ?? []).map((u) => ({ ...u }));
      const placements = planAiTacticsPlacements(units, tacticsPhase.side, tacticsPhase);
      const logLines: string[] = ["IA : phase de tactique en cours…"];
      for (const placement of placements) {
        const unit = units.find((u) => u.id === placement.unitId);
        if (!unit) continue;
        unit.q = placement.q;
        unit.r = placement.r;
        logLines.push(`IA déplace ${unit.unitType} en (${placement.q},${placement.r}).`);
      }
      logLines.push("IA : phase de tactique terminée.", "Combat lance.");
      const turnQueueArr = Array.isArray(combatRow.turn_queue) ? (combatRow.turn_queue as string[]) : [];
      const nextCurrentUnitId = turnQueueArr.find((unitId) =>
        units.some((unit) => unit.id === unitId && unit.count > 0)
      ) ?? null;
      const nextCurrentPlayerId = units.find((unit) => unit.id === nextCurrentUnitId)?.ownerPlayerId ?? null;
      const { tacticsPhase: _drop, ...restBoard } = boardState as Record<string, unknown>;
      void _drop;
      const updateResult = await params.supabase
        .from("combats")
        .update({
          board_state: { ...restBoard, units },
          current_unit_id: nextCurrentUnitId,
          current_player_id: nextCurrentPlayerId,
          action_log: [...((combatRow.action_log as string[] | null) ?? []), ...logLines],
        })
        .eq("id", params.combatId)
        .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
        .single();
      if (updateResult.data) {
        combatRow = updateResult.data as typeof combatRow;
        boardState = (combatRow.board_state as typeof boardState) ?? {};
      }
    } else {
      return combatRow;
    }
  }

  // 2) Boucle des tours automatiques jusqu'à tomber sur un joueur humain
  const sideStats = { attacker: params.attackerStats, defender: params.defenderStats };
  let units = (boardState.units ?? []).map((u) => ({ ...u }));
  const terrain = boardState.terrain ?? [];
  let siege = boardState.siege;
  let turnQueue = Array.isArray(combatRow.turn_queue) ? (combatRow.turn_queue as string[]) : [];
  let round = Number(combatRow.round ?? 1);
  let currentUnitId = (combatRow.current_unit_id as string | null) ?? null;
  const actionLog = ((combatRow.action_log as string[] | null) ?? []).slice();
  let resultSide: "attacker" | "defender" | null = null;
  let safety = 30;
  while (!resultSide && currentUnitId && safety-- > 0) {
    const actor = units.find((u) => u.id === currentUnitId);
    if (!actor) break;
    const isAutomated = actor.ownerPlayerId === null || aiPlayerIds.has(actor.ownerPlayerId ?? "");
    if (!isAutomated) break;
    const action = actor.ownerPlayerId && aiPlayerIds.has(actor.ownerPlayerId)
      ? chooseAiCombatAction(actor, units, terrain, sideStats, siege)
      : { type: "DEFEND" as const };
    const exec = executeManualCombatAction({
      units,
      terrain,
      turnQueue,
      round,
      currentUnitId,
      action,
      attackerStats: params.attackerStats,
      defenderStats: params.defenderStats,
      moraleContext: {
        attackerHeroMorale: params.attackerMorale,
        defenderHeroMorale: params.defenderMorale,
        attackerHeroLuck: params.attackerLuck,
        defenderHeroLuck: params.defenderLuck,
        terrain: params.environment?.terrain,
      },
      siege,
    });
    units = exec.units;
    siege = exec.siege;
    turnQueue = exec.turnQueue;
    round = exec.round;
    currentUnitId = exec.currentUnitId;
    actionLog.push(...exec.log);
    resultSide = exec.result;
  }

  const finalResult = resultSide
    ? {
      winnerId: resultSide,
      winnerPlayerId: resultSide === "attacker" ? combatRow.attacker_player_id ?? null : combatRow.defender_player_id ?? null,
      attackerLosses: [],
      defenderLosses: [],
      experienceGained: resultSide === "attacker" ? 500 : 0,
      log: [`Victoire du camp ${resultSide === "attacker" ? "attaquant" : "défenseur"}.`],
    }
    : null;
  const { data: updated } = await params.supabase
    .from("combats")
    .update({
      board_state: { ...boardState, units, siege },
      turn_queue: turnQueue,
      current_unit_id: finalResult ? null : currentUnitId,
      current_player_id: finalResult ? null : (units.find((u) => u.id === currentUnitId)?.ownerPlayerId ?? null),
      round,
      action_log: actionLog,
      result: finalResult,
      status: finalResult ? "RESOLVED" : "ACTIVE",
    })
    .eq("id", params.combatId)
    .select("*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*)")
    .single();
  return updated ?? combatRow;
}

function applyAutoLosses(armies: UnitStack[], losses: Array<{ unitType: UnitType; lost: number }>) {
  const remainingLosses = losses.map((loss) => ({ ...loss }));
  return armies.map((army) => {
    const loss = remainingLosses.find((item) => item.unitType === army.unitType && item.lost > 0);
    if (!loss) return army;

    const lost = Math.min(army.count, loss.lost);
    loss.lost -= lost;
    const nextCount = Math.max(0, army.count - lost);
    const maxHealth = getUnitRule(army.unitType).health;
    return {
      ...army,
      count: nextCount,
      health: nextCount * maxHealth,
      maxHealth,
    };
  });
}

function getDefenderArmyTable(
  targetType: string,
  defender: { heroId?: string | null; neutralArmyId?: string | null },
): "armies" | "neutral_army_stacks" | "gate_stacks" | null {
  if (defender.heroId) return "armies";
  if (defender.neutralArmyId) return "neutral_army_stacks";
  if (targetType === "gate") return "gate_stacks";
  return null;
}

async function persistAutoWinnerArmies(
  supabase: ReturnType<typeof createAdminClient>,
  table: "armies" | "neutral_army_stacks" | "gate_stacks" | null,
  armies: UnitStack[],
) {
  if (!table) return;
  for (const army of armies) {
    if (army.count <= 0) {
      await supabase.from(table).delete().eq("id", army.id);
    } else {
      await supabase.from(table).update({ count: army.count, health: army.health }).eq("id", army.id);
    }
  }
}

async function persistGeneratedDefenderSurvivors(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  targetType: string,
  defender: { id: string; x: number; y: number; neutralArmyId?: string | null; heroId?: string | null; playerId?: string | null },
  mapStateValue: Record<string, unknown>,
  armies: UnitStack[],
) {
  const survivors = armies
    .filter((army) => army.count > 0)
    .map((army, position) => ({
      id: army.id,
      unitType: army.unitType,
      count: army.count,
      health: army.health,
      maxHealth: army.maxHealth,
      position,
    }));

  if (targetType === "building" && !defender.neutralArmyId && !defender.heroId && !defender.playerId) {
    const guardianPower = survivors.reduce((total, army) => total + army.count * army.maxHealth, 0);
    await supabase
      .from("resource_buildings")
      .update({ guardian_power: guardianPower })
      .eq("game_id", gameId)
      .eq("id", defender.id);
    return;
  }

  if (targetType === "town" && !defender.playerId) {
    await supabase
      .from("towns")
      .update({ neutral_garrison: survivors })
      .eq("game_id", gameId)
      .eq("id", defender.id)
      .eq("is_neutral", true);
    return;
  }

  if (targetType === "creature_bank") {
    const creatureBanks = (mapStateValue.creatureBanks as Record<string, object> | undefined) ?? {};
    await supabase.from("games").update({
      map_state: {
        ...mapStateValue,
        creatureBanks: {
          ...creatureBanks,
          [defender.id]: {
            ...(creatureBanks[defender.id] ?? {}),
            guardStacks: survivors,
          },
        },
      },
    }).eq("id", gameId);
    return;
  }

  if (targetType === "artifact") {
    const artifactGuards = (mapStateValue.artifactGuards as Record<string, UnitStack[]> | undefined) ?? {};
    await supabase.from("games").update({
      map_state: {
        ...mapStateValue,
        artifactGuards: {
          ...artifactGuards,
          [defender.id]: survivors,
        },
      },
    }).eq("id", gameId);
  }
}

async function grantAutoCombatExperience(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  heroId: string | null | undefined,
  experienceGained: number,
) {
  if (!heroId || experienceGained <= 0) return;
  const { data: hero } = await supabase.from("heroes").select("experience").eq("id", heroId).maybeSingle();
  if (!hero) return;
  await applyHeroExperienceGain(supabase, gameId, heroId, Number(hero.experience ?? 0) + experienceGained);
}

function skillLevelValue(skills: Record<string, string> | undefined, id: string): number {
  const v = skills?.[id];
  return v === "expert" ? 3 : v === "advanced" ? 2 : v === "basic" ? 1 : 0;
}

function tacticsAdvanceFor(skills: Record<string, string> | undefined): number {
  const lvl = skills?.tactics;
  return lvl === "expert" ? 3 : lvl === "advanced" ? 2 : lvl === "basic" ? 1 : 0;
}

function getSiegeDefenseEffects(
  players: Array<{ id: string; towns?: Array<{ x: number; y: number; townType?: string; faction?: string; buildings?: string[] }> }>,
  params: { x: number; y: number; ownerPlayerId: string | null },
): { fearMoraleMalus: number; sulfurDamagePerUnit: number; escapeTunnel: boolean } {
  const defaults = { fearMoraleMalus: 0, sulfurDamagePerUnit: 0, escapeTunnel: false };
  if (!params.ownerPlayerId) return defaults;
  const owner = players.find((p) => p.id === params.ownerPlayerId);
  const town = owner?.towns?.find((t) => t.x === params.x && t.y === params.y);
  if (!town) return defaults;
  const faction = town.townType ?? town.faction;
  const buildings = town.buildings ?? [];
  return {
    fearMoraleMalus: faction === "fortress" && buildings.includes("unique_3") ? 1 : 0,
    sulfurDamagePerUnit: faction === "inferno" && buildings.includes("unique_3") ? 2 : 0,
    escapeTunnel: faction === "stronghold" && buildings.includes("unique_1"),
  };
}

function getSiegeFortifications(
  players: Array<{ id: string; towns?: Array<{ x: number; y: number; level?: number; buildings?: string[] }> }>,
  params: {
    x: number;
    y: number;
    ownerPlayerId: string | null;
    townDefender?: { townLevel?: number | null; townBuildings?: string[] | null } | null;
  },
): { towerCount: number; towerDamage: number; wallHp: number; gateHp: number } {
  const defaults = { towerCount: 0, towerDamage: 0, wallHp: 0, gateHp: 0 };
  // Fortifications come from the Fort/Citadel/Castle Keep ladder, NOT the
  // town-center (Village/Town/City Hall/Capitol) level: a town with a Capitol
  // but no Fort fights with open walls, while a Fort on a level-1 town still
  // raises ramparts. Citadel adds 1 shooting tower, Castle Keep adds 2 more.
  let buildings: string[] | null = null;
  if (params.ownerPlayerId) {
    const owner = players.find((p) => p.id === params.ownerPlayerId);
    const town = owner?.towns?.find((t) => t.x === params.x && t.y === params.y);
    buildings = town?.buildings ?? null;
  } else if (params.townDefender?.townBuildings) {
    buildings = params.townDefender.townBuildings;
  } else {
    // Ville neutre/inconnue : forfait Citadelle pour que les sièges aient
    // toujours des fortifications minimales (remparts + une tour de tir).
    return { towerCount: 1, towerDamage: 20, wallHp: 200, gateHp: 160 };
  }

  const fortLevel = getTownFortLevel(buildings ?? []);
  if (fortLevel <= 0) return defaults;
  const towerCount = fortLevel >= 3 ? 3 : fortLevel >= 2 ? 1 : 0;
  return {
    towerCount,
    towerDamage: towerCount > 0 ? fortLevel * 10 : 0,
    wallHp: 100 * fortLevel,
    gateHp: 80 * fortLevel,
  };
}

function applyTowerVolley<T extends { side?: string; health?: number; count?: number; maxHealth?: number }>(units: T[], fort: { towerCount: number; towerDamage: number }): T[] {
  if (fort.towerCount <= 0 || fort.towerDamage <= 0) return units;
  const attackerIndexes = units.map((u, i) => (u.side === "attacker" && (u.count ?? 0) > 0 ? i : -1)).filter((i) => i >= 0);
  if (attackerIndexes.length === 0) return units;
  const next = units.map((u) => ({ ...u }));
  for (let shot = 0; shot < fort.towerCount; shot++) {
    const target = next[attackerIndexes[shot % attackerIndexes.length]];
    if (!target) continue;
    const dmg = fort.towerDamage;
    const nextHealth = Math.max(0, (target.health ?? 0) - dmg);
    const maxHealth = target.maxHealth ?? 1;
    const nextCount = nextHealth > 0 ? Math.ceil(nextHealth / maxHealth) : 0;
    target.health = nextHealth;
    target.count = nextCount;
  }
  return next;
}

function applySulfurDamage<T extends { side?: string; health?: number; count?: number; maxHealth?: number }>(units: T[], damagePerUnit: number): T[] {
  if (damagePerUnit <= 0) return units;
  return units.map((unit) => {
    if (unit.side !== "attacker") return unit;
    const totalDmg = damagePerUnit * (unit.count ?? 0);
    const nextHealth = Math.max(0, (unit.health ?? 0) - totalDmg);
    const maxHealth = unit.maxHealth ?? 1;
    const nextCount = nextHealth > 0 ? Math.ceil(nextHealth / maxHealth) : 0;
    return { ...unit, health: nextHealth, count: nextCount };
  });
}

function injectWarMachines(
  armies: UnitStack[],
  warMachines: { ballista?: boolean; firstAid?: boolean; ammoCart?: boolean } | undefined,
  isSiege: boolean,
): UnitStack[] {
  const extra: UnitStack[] = [];
  if (warMachines?.ballista) {
    extra.push({ id: `warmachine-ballista`, unitType: UnitType.BALLISTA, count: 1, health: 250, maxHealth: 250, position: armies.length });
  }
  if (warMachines?.firstAid) {
    extra.push({ id: `warmachine-first-aid`, unitType: UnitType.FIRST_AID_TENT, count: 1, health: 75, maxHealth: 75, position: armies.length + extra.length });
  }
  if (warMachines?.ammoCart) {
    extra.push({ id: `warmachine-ammo`, unitType: UnitType.AMMO_CART, count: 1, health: 100, maxHealth: 100, position: armies.length + extra.length });
  }
  if (isSiege) {
    extra.push({ id: `warmachine-catapult`, unitType: UnitType.CATAPULT, count: 1, health: 500, maxHealth: 500, position: armies.length + extra.length });
  }
  return extra.length > 0 ? [...armies, ...extra] : armies;
}

function getGateDefender(
  gates: Array<{ id: string; gamePlayerId?: string | null; x: number; y: number; guardianPower?: number; garrison?: UnitStack[] }>,
  targetId: string,
  targetPosition?: { x?: unknown; y?: unknown }
) {
  const x = Number(targetPosition?.x);
  const y = Number(targetPosition?.y);
  const gate = gates.find((item) =>
    item.id === targetId || (Number.isFinite(x) && Number.isFinite(y) && item.x === x && item.y === y)
  );
  const garrison = gate?.garrison ?? [];
  if (!gate || garrison.length === 0) return null;

  return {
    id: gate.id,
    playerId: gate.gamePlayerId ?? null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies: garrison,
    x: gate.x,
    y: gate.y,
  };
}

function getArtifactDefender(
  mapData: GameMap,
  mapState: Record<string, unknown>,
  targetId: string,
  targetPosition?: { x?: unknown; y?: unknown }
) {
  const position = findMapObjectPosition(mapData, "artifact", targetId, targetPosition);
  if (!position) return null;
  const tile = mapData.tiles[position.y]?.[position.x];
  const object = tile?.object;
  if (object?.type !== "artifact" || !tile) return null;
  const artifact = getArtifact(object.subtype);
  const artifactClass = artifact?.class ?? (isArtifactClass(object.subtype) ? object.subtype : "minor");
  const guardianPower = Number(object.guardianPower ?? ARTIFACT_GUARDIAN_POWER[artifactClass]);
  const artifactGuards = (mapState.artifactGuards as Record<string, UnitStack[]> | undefined) ?? {};
  const guardStacks = artifactGuards[object.id];
  if (guardianPower <= 0 && !guardStacks?.length) return null;
  return {
    id: object.id,
    playerId: null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies: (guardStacks?.length ? guardStacks : createNeutralArmyStacksForTile(tile, guardianPower, object.id)).map((stack) => {
      const stackWithMaybeId = stack as typeof stack & { id?: string };
      return {
        ...stack,
        id: stackWithMaybeId.id ?? `${object.id}-guard-${stack.position}`,
        heroId: null,
      };
    }),
    x: position.x,
    y: position.y,
  };
}

function findMapObjectPosition(
  mapData: GameMap,
  type: string,
  targetId: string,
  targetPosition?: { x?: unknown; y?: unknown },
) {
  const x = Number(targetPosition?.x);
  const y = Number(targetPosition?.y);
  if (Number.isInteger(x) && Number.isInteger(y) && mapData.tiles[y]?.[x]?.object?.type === type) return { x, y };
  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (tile.object?.type === type && tile.object.id === targetId) return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

function getEffectiveGates(
  gates: Array<{ id: string; gamePlayerId?: string | null; x: number; y: number; guardianPower?: number; garrison?: UnitStack[] }>,
  mapData: GameMap,
) {
  const byId = new Map(gates.map((gate) => [gate.id, gate]));
  const byPosition = new Map(gates.map((gate) => [`${gate.x},${gate.y}`, gate]));

  for (const row of mapData.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (object?.type !== "gate") continue;
      const key = `${tile.x},${tile.y}`;
      if (byId.has(object.id) || byPosition.has(key)) continue;
      const garrison = createNeutralArmyStacksForTile(tile, object.guardianPower ?? 100, object.id)
        .map((stack): UnitStack => ({
          id: `${object.id}-stack-${stack.position}`,
          unitType: stack.unitType,
          count: stack.count,
          health: stack.health,
          maxHealth: stack.maxHealth,
          position: stack.position,
        }));
      const gate = {
        id: object.id,
        gamePlayerId: object.ownerId ?? null,
        x: tile.x,
        y: tile.y,
        guardianPower: object.guardianPower ?? 0,
        garrison,
      };
      byId.set(gate.id, gate);
      byPosition.set(key, gate);
    }
  }

  return [...byId.values()];
}

function getCreatureBankDefender(
  mapData: GameMap,
  mapState: Record<string, unknown>,
  targetId: string,
  targetPosition?: { x?: unknown; y?: unknown }
) {
  const x = Number(targetPosition?.x);
  const y = Number(targetPosition?.y);
  const targetTile = Number.isFinite(x) && Number.isFinite(y)
    ? mapData.tiles[y]?.[x]
    : undefined;
  const tile = targetTile?.object?.id === targetId
    ? targetTile
    : mapData.tiles.flatMap((row) => row).find((item) => item.object?.id === targetId);
  const object = tile?.object;
  if (!tile || object?.type !== "adventure_building" || !isCreatureBankType(object.subtype)) return null;
  if (!getCreatureBankDefinition(object.subtype)) return null;
  const creatureBanks = (mapState.creatureBanks as Record<string, { guardStacks?: UnitStack[] }> | undefined) ?? {};
  const guardStacks = creatureBanks[object.id]?.guardStacks;

  return {
    id: object.id,
    playerId: null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies: guardStacks?.length ? guardStacks : createCreatureBankGuardStacks(object.subtype, object.id),
    x: tile.x,
    y: tile.y,
    bankType: object.subtype,
  };
}

async function markCreatureBankDefeated(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapStateValue: Record<string, unknown> | undefined,
  pendingReward: PendingCreatureBankReward,
) {
  const mapState = mapStateValue ?? {};
  const creatureBanks = ((mapState.creatureBanks as Record<string, unknown> | undefined) ?? {}) as Record<string, object>;
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

async function markArtifactDefeated(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapStateValue: Record<string, unknown> | undefined,
  artifactObjectId: string,
) {
  const mapState = mapStateValue ?? {};
  const defeatedArtifacts = new Set<string>((mapState.defeatedArtifacts as string[] | undefined) ?? []);
  defeatedArtifacts.add(artifactObjectId);
  await supabase.from("games").update({
    map_state: {
      ...mapState,
      defeatedArtifacts: Array.from(defeatedArtifacts),
    },
  }).eq("id", gameId);
}

async function captureGate(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  gate: { id: string; x: number; y: number },
  playerId: string
) {
  await supabase
    .from("gates")
    .upsert({
      id: gate.id,
      game_id: gameId,
      game_player_id: playerId,
      x: gate.x,
      y: gate.y,
      guardian_power: 0,
    }, { onConflict: "id" });
  await supabase.from("gate_stacks").delete().eq("gate_id", gate.id);
}

async function ensureGateRow(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  gate: { id: string; playerId?: string | null; x: number; y: number; armies?: UnitStack[] },
) {
  await supabase
    .from("gates")
    .upsert({
      id: gate.id,
      game_id: gameId,
      game_player_id: gate.playerId ?? null,
      x: gate.x,
      y: gate.y,
      guardian_power: 0,
    }, { onConflict: "id" });

  if (!gate.armies?.length) return;

  const { data: existingStacks, error: stackReadError } = await supabase
    .from("gate_stacks")
    .select("id")
    .eq("gate_id", gate.id)
    .limit(1);
  if (stackReadError || (existingStacks?.length ?? 0) > 0) return;

  await supabase.from("gate_stacks").insert(gate.armies.map((stack, position) => ({
    gate_id: gate.id,
    unit_type: stack.unitType,
    count: stack.count,
    health: stack.health,
    max_health: stack.maxHealth,
    position,
  })));
}

function combatInvolvesPlayer(combat: ReturnType<typeof toCombat>, playerId: string) {
  return (
    combat.attackerPlayerId === playerId ||
    combat.defenderPlayerId === playerId ||
    Boolean(combat.participants?.some((participant) => participant.playerId === playerId))
  );
}

function getTargetPosition(body: { targetPosition?: { x?: unknown; y?: unknown }; destination?: { x?: unknown; y?: unknown }; path?: Array<{ x?: unknown; y?: unknown }> }) {
  if (body.targetPosition) return body.targetPosition;
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
    .select("id,x,y,neutral_garrison,level,buildings,town_type")
    .eq("game_id", gameId)
    .eq("id", targetId)
    .eq("is_neutral", true)
    .maybeSingle();

  const x = Number(targetPosition?.x);
  const y = Number(targetPosition?.y);
  if (!town && Number.isFinite(x) && Number.isFinite(y)) {
    const fallback = await supabase
      .from("towns")
      .select("id,x,y,neutral_garrison,level,buildings,town_type")
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
    townLevel: town.level,
    townBuildings: town.buildings ?? [],
    townType: town.town_type,
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
  targetId: string,
  mapData: GameMap
) {
  const { data: building, error } = await supabase
    .from("resource_buildings")
    .select("id,x,y,guardian_power")
    .eq("game_id", gameId)
    .eq("id", targetId)
    .maybeSingle();

  if (error || !building || building.guardian_power <= 0) return null;

  const tile = mapData.tiles[building.y]?.[building.x];
  const armies = createNeutralArmyStacksForTile(
    { x: building.x, y: building.y, terrain: tile?.terrain },
    Number(building.guardian_power),
    building.id,
  ).map((stack): UnitStack => ({
    id: `${building.id}-stack-${stack.position}`,
    unitType: stack.unitType,
    count: stack.count,
    health: stack.health,
    maxHealth: stack.maxHealth,
    position: stack.position,
  }));

  return {
    id: building.id,
    playerId: null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies,
    x: building.x,
    y: building.y,
  };
}

function validateCombatPath(
  map: GameMap,
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
  movement: number,
  target: { x: number; y: number }
): { ok: true; usedMovement: number; destination: { x: number; y: number } } | { ok: false } {
  if (!Array.isArray(path) || path.length < 1) return { ok: false };
  if (path[0]?.x !== start.x || path[0]?.y !== start.y) return { ok: false };

  const destination = path[path.length - 1];
  if (!destination || !areAdventurePositionsAdjacent(destination, target)) return { ok: false };
  const usedMovement = getAdventurePathCostAvoiding(map, path, [target]);
  if (!Number.isFinite(usedMovement)) return { ok: false };
  const requiredMovement = getRequiredAdventureMovementAvoiding(map, path, [target]);
  if (requiredMovement > movement) return { ok: false };
  return { ok: true, usedMovement, destination };
}

function getDefender({
  targetId,
  targetType,
  attackerPlayerId,
  players,
  neutralArmies,
  mapData,
}: {
  targetId: string;
  targetType: string;
  attackerPlayerId: string;
  players: Array<{
    id: string;
    resourceBuildings: Array<{ id: string; x: number; y: number; guardianPower: number }>;
    heroes: Array<{
      id: string;
      attack: number;
      defense: number;
      morale?: number;
      luck?: number;
      spellPower?: number;
      knowledge?: number;
      artifacts?: unknown;
      skills?: Partial<Record<string, "basic" | "advanced" | "expert">>;
      armies: UnitStack[];
      x: number;
      y: number;
    }>;
  }>;
  neutralArmies: Array<{ id: string; x: number; y: number; status: string; stacks: UnitStack[] }>;
  mapData: GameMap;
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
        morale: Number(hero.morale ?? 0),
        luck: Number(hero.luck ?? 0),
        spellPower: Number(hero.spellPower ?? 0),
        knowledge: Number(hero.knowledge ?? 0),
        artifacts: hero.artifacts,
        skills: hero.skills ?? {},
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
    const tile = mapData.tiles[building.y]?.[building.x];
    return {
      id: building.id,
      playerId: null,
      heroId: null,
      neutralArmyId: null,
      attack: 1,
      defense: 1,
      armies: createNeutralArmyStacksForTile(
        { x: building.x, y: building.y, terrain: tile?.terrain },
        building.guardianPower,
        building.id,
      ).map((stack): UnitStack => ({
        id: `${building.id}-stack-${stack.position}`,
        unitType: stack.unitType,
        count: stack.count,
        health: stack.health,
        maxHealth: stack.maxHealth,
        position: stack.position,
      })),
      x: building.x,
      y: building.y,
    };
  }

  return null;
}

function getTownMoraleBonus(
  players: Array<{ id: string; towns: Array<{ x: number; y: number; faction?: string; townType?: string; buildings?: string[] }> }>,
  params: { x: number; y: number; ownerPlayerId: string | null }
) {
  if (!params.ownerPlayerId) return 0;
  const owner = players.find((player) => player.id === params.ownerPlayerId);
  const town = owner?.towns.find((item) => item.x === params.x && item.y === params.y);
  if (!town) return 0;
  const faction = town.townType ?? town.faction;
  if (faction !== Faction.CASTLE) return 0;
  return (town.buildings ?? []).includes(BuildingType.UNIQUE_1) ? 2 : 0;
}
