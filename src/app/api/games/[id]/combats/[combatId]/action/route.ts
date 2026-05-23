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
import { CombatBoardUnit, CombatSummary, CombatTerrainFeature, GameMap } from "@/lib/game/types";
import { getHeroMana, getSpell, getSpellCost, heroKnowsSpell } from "@/lib/game/spells";
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

    const mana = getHeroMana({ mana: caster.hero.mana, knowledge: caster.hero.knowledge });
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
        spellPower: Number(caster.hero.spell_power ?? 1),
      },
      action: action as CombatSpellAction,
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
    if (result) {
      await persistResolvedCombat(supabase, combat, initialUnits, spellExecution.units, spellExecution.result);
      await evaluateGameLifecycle(supabase, id);
    }
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
  const execution = executeActionThenNeutralTurns({
    units: boardState.units ?? [],
    terrain: boardState.terrain ?? [],
    turnQueue: combat.turn_queue ?? [],
    round: combat.round ?? 1,
    currentUnitId: combat.current_unit_id,
    playerAction: currentActor?.ownerPlayerId === gamePlayerId ? action : null,
    allowAutomatedAction: Boolean(currentActor && (currentActor.ownerPlayerId === null || currentActorIsAi)),
    attackerStats: { attack: attackerHero.attack, defense: attackerHero.defense },
    defenderStats: { attack: defenderHero?.attack ?? 1, defense: defenderHero?.defense ?? 1 },
    immortalHeroId: devGodModeHeroId,
    moraleContext,
  });

  const initialUnits = boardState.initialUnits ?? boardState.units ?? [];
  let result = execution.result
    ? buildManualCombatResult(execution.result, initialUnits, execution.units, combat)
    : null;
  if (result && execution.result === "attacker") {
    const pendingReward = await findCreatureBankRewardForCombat(supabase, combat);
    if (pendingReward) result = { ...result, creatureBankReward: pendingReward };
  }
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
    .select("id,game_player_id,attack,defense,spell_power,knowledge,morale,mana,has_spell_book,known_spells")
    .eq("id", heroId)
    .single();
  if (!full.error || !isMissingSpellSchemaError(full.error)) return full as { data: SpellHeroRow | null; error: { message: string; details?: string | null; code?: string } | null };

  const fallback = await supabase
    .from("heroes")
    .select("id,game_player_id,attack,defense,spell_power,knowledge")
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
      },
      error: null,
    };
}

function isMissingSpellSchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("mana") || text.includes("has_spell_book") || text.includes("known_spells") || text.includes("schema cache");
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
  mana?: number | null;
  has_spell_book?: boolean | null;
  known_spells?: string[] | null;
};

function executeActionThenNeutralTurns(params: {
  units: CombatBoardUnit[];
  terrain: CombatTerrainFeature[];
  turnQueue: string[];
  round: number;
  currentUnitId: string | null;
  playerAction: { type: "MOVE" | "ATTACK" | "SHOOT" | "WAIT" | "DEFEND"; q?: number; r?: number; targetUnitId?: string } | null;
  allowAutomatedAction: boolean;
  attackerStats: { attack: number; defense: number };
  defenderStats: { attack: number; defense: number };
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

    await supabase.from("armies").update({ count, health }).eq("id", unit.id);
    await supabase.from("neutral_army_stacks").update({ count, health }).eq("id", unit.id);
    await supabase.from("gate_stacks").update({ count, health }).eq("id", unit.id);
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
