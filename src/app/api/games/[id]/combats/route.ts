import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { buildCombatEnvironment } from "@/lib/game/combat/environment";
import { createCombatBoard, resolveAutomaticCombat } from "@/lib/game/combat/persistent";
import { COMBAT_COLS } from "@/lib/game/combat/movement";
import {
  createCreatureBankGuardStacks,
  createCreatureBankPendingReward,
  getCreatureBankDefinition,
  isCreatureBankType,
  PendingCreatureBankReward,
} from "@/lib/game/creature-banks";
import { ARTIFACT_GUARDIAN_POWER, getArtifact, getEffectiveHeroStatsFromValues, isArtifactClass } from "@/lib/game/artifacts";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
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
    .select("*, combat_participants(*)")
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
    return NextResponse.json({ error: "Vous avez deja termine votre tour" }, { status: 403 });
  }

  const attacker = gamePlayer.heroes.find((hero) => hero.id === body.attackerHeroId);
  if (!attacker) return NextResponse.json({ error: "Héros attaquant invalide" }, { status: 400 });
  if (isHeroInActiveCombat(game.combats, attacker.id)) {
    return NextResponse.json({ error: "Ce heros est deja engage dans un combat." }, { status: 400 });
  }

  const mapData = normalizeMapMovement(game.mapData as GameMap);
  const gates = getEffectiveGates(dbGates, mapData);
  const defender = getDefender({
    targetId: String(body.targetId ?? ""),
    targetType: String(body.targetType ?? ""),
    attackerPlayerId: gamePlayer.id,
    players,
    neutralArmies,
  });
  const buildingDefender = !defender && body.targetType === "building"
    ? await getBuildingDefender(supabase, id, String(body.targetId ?? ""))
    : null;
  const targetPosition = getTargetPosition(body);
  const townDefender = !defender && !buildingDefender && body.targetType === "town"
    ? await getTownDefender(supabase, id, String(body.targetId ?? ""), targetPosition)
    : null;
  const gateDefender = !defender && !buildingDefender && !townDefender && body.targetType === "gate"
    ? getGateDefender(gates, String(body.targetId ?? ""), targetPosition)
    : null;
  const creatureBankDefender = !defender && !buildingDefender && !townDefender && !gateDefender && body.targetType === "creature_bank"
    ? getCreatureBankDefender(mapData, String(body.targetId ?? ""), targetPosition)
    : null;
  const artifactDefender = !defender && !buildingDefender && !townDefender && !gateDefender && !creatureBankDefender && body.targetType === "artifact"
    ? getArtifactDefender(mapData, String(body.targetId ?? ""), targetPosition)
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
    return NextResponse.json({ error: "Les combats entre joueurs doivent etre manuels" }, { status: 400 });
  }
  if (targetDefender.heroId && isHeroInActiveCombat(game.combats, targetDefender.heroId)) {
    return NextResponse.json({ error: "Ce heros est deja engage dans un combat." }, { status: 400 });
  }
  const devGodModeHeroId = typeof body.devGodModeHeroId === "string" && body.devGodModeHeroId === attacker.id
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
    return NextResponse.json({ error: "Le heros doit s'arreter devant la cible avant le combat" }, { status: 400 });
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
  const attackerLeadership = skillLevelValue((attacker as unknown as { skills?: Record<string, string> }).skills, "leadership");
  const defenderLeadership = skillLevelValue((targetDefender as unknown as { skills?: Record<string, string> }).skills, "leadership");
  const effectiveAttackerMorale = attackerStats.morale + attackerTownMoraleBonus + attackerLeadership - siegeEffects.fearMoraleMalus;
  const effectiveDefenderMorale = defenderStats.morale + defenderTownMoraleBonus + defenderLeadership;
  const combatStart = createCombatBoard(
    {
      id: attacker.id,
      playerId: gamePlayer.id,
      heroId: attacker.id,
      attack: attackerStats.attack,
      defense: attackerStats.defense,
      morale: effectiveAttackerMorale,
      luck: attackerStats.luck,
      armies: attackerArmiesWithMachines,
    },
    {
      id: targetDefender.id,
      playerId: targetDefender.playerId,
      heroId: targetDefender.heroId,
      attack: defenderStats.attack,
      defense: defenderStats.defense,
      morale: effectiveDefenderMorale,
      luck: defenderStats.luck,
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
  const autoResult = body.mode === "AUTO"
    ? resolveAutomaticCombat(
      {
        id: attacker.id,
        playerId: gamePlayer.id,
        heroId: attacker.id,
        attack: attackerStats.attack,
        defense: attackerStats.defense,
        morale: effectiveAttackerMorale,
        luck: attackerStats.luck,
        armies: attacker.armies,
      },
      {
        id: targetDefender.id,
        playerId: targetDefender.playerId,
        heroId: targetDefender.heroId,
        attack: defenderStats.attack,
        defense: defenderStats.defense,
        morale: effectiveDefenderMorale,
        luck: defenderStats.luck,
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
        const atk = tacticsAdvanceFor((attacker as unknown as { skills?: Record<string, string> }).skills);
        const def = tacticsAdvanceFor((targetDefender as unknown as { skills?: Record<string, string> }).skills);
        const tacticsAdv = atk - def;
        const tacticsPhase = tacticsAdv > 0
          ? { side: "attacker" as const, maxColumn: 1 + atk }
          : tacticsAdv < 0
          ? { side: "defender" as const, minColumn: COMBAT_COLS - 2 - def }
          : null;
        return {
          ...combatStart.boardState,
          environment,
          moraleContext: {
            attackerHeroMorale: effectiveAttackerMorale,
            defenderHeroMorale: effectiveDefenderMorale,
            attackerHeroLuck: (attackerStats.luck ?? 0) + skillLevelValue((attacker as unknown as { skills?: Record<string, string> }).skills, "luck"),
            defenderHeroLuck: (defenderStats.luck ?? 0) + skillLevelValue((targetDefender as unknown as { skills?: Record<string, string> }).skills, "luck"),
          },
          siegeEffects: siegeEffects.escapeTunnel || siegeEffects.sulfurDamagePerUnit > 0 ? siegeEffects : undefined,
          fortifications: siegeFortifications.towerCount > 0
            ? { ...siegeFortifications, gateOpen: false, gateCurrentHp: siegeFortifications.gateHp }
            : undefined,
          tacticsPhase: tacticsPhase ?? undefined,
          terrain: siegeFortifications.towerCount > 0
            ? [...(combatStart.boardState.terrain ?? []), ...buildWallTerrain(), { type: "rock", q: 9, r: 4 }]
            : combatStart.boardState.terrain,
          units: applyTowerVolley(applySulfurDamage(combatStart.boardState.units, siegeEffects.sulfurDamagePerUnit), siegeFortifications),
        };
      })(),
      current_player_id: result ? null : combatStart.currentPlayerId,
      current_unit_id: result ? null : combatStart.currentUnitId,
      turn_queue: combatStart.turnQueue,
      action_log: result ? ["Combat automatique.", ...result.log] : ["Combat lance."],
      result,
    })
    .select("*, combat_participants(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (autoResult && result) {
    const attackerWon = autoResult.winnerId === attacker.id;
    if (attackerWon) {
      if (targetDefender.neutralArmyId) {
        await supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", targetDefender.neutralArmyId);
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
      await supabase.from("armies").delete().eq("hero_id", attacker.id);
      await supabase.from("heroes").delete().eq("id", attacker.id);
    }
    await evaluateGameLifecycle(supabase, id);
  }

  return NextResponse.json({ combat: toCombat(data), result }, { status: 201 });
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
  let level = 1;
  if (params.ownerPlayerId) {
    const owner = players.find((p) => p.id === params.ownerPlayerId);
    const town = owner?.towns?.find((t) => t.x === params.x && t.y === params.y);
    if (town) level = town.level ?? 1;
  } else if (params.townDefender?.townLevel) {
    level = params.townDefender.townLevel ?? 1;
  } else {
    // Ville neutre/inconnue : forfait niveau 2 pour que les sièges aient toujours des fortifications minimales.
    level = 2;
  }
  if (level < 2) return defaults;
  return {
    towerCount: level >= 4 ? 3 : 2,
    towerDamage: level * 10,
    wallHp: 100 * level,
    gateHp: 80 * level,
  };
}

function buildWallTerrain(): Array<{ type: "rock"; q: number; r: number }> {
  const WALL_COLUMN = 9;
  const GATE_ROW = 4;
  return [0, 1, 2, 3, 5, 6, 7, 8].map((r) => ({ type: "rock" as const, q: WALL_COLUMN, r }));
  // GATE_ROW reste ouvert : porte praticable. La case du gate sera bloquée tant que la porte n'est pas détruite (TODO catapulte).
  // (variable destinée à future intégration de la mécanique de gate)
  void GATE_ROW;
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

function getArtifactDefender(mapData: GameMap, targetId: string, targetPosition?: { x?: unknown; y?: unknown }) {
  const position = findMapObjectPosition(mapData, "artifact", targetId, targetPosition);
  if (!position) return null;
  const tile = mapData.tiles[position.y]?.[position.x];
  const object = tile?.object;
  if (object?.type !== "artifact" || !tile) return null;
  const artifact = getArtifact(object.subtype);
  const artifactClass = artifact?.class ?? (isArtifactClass(object.subtype) ? object.subtype : "minor");
  const guardianPower = Number(object.guardianPower ?? ARTIFACT_GUARDIAN_POWER[artifactClass]);
  if (guardianPower <= 0) return null;
  return {
    id: object.id,
    playerId: null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies: createNeutralArmyStacksForTile(tile, guardianPower, object.id).map((stack) => ({
      ...stack,
      id: `${object.id}-guard-${stack.position}`,
      heroId: null,
    })),
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

  return {
    id: object.id,
    playerId: null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies: createCreatureBankGuardStacks(object.subtype, object.id),
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
  targetId: string
) {
  const { data: building, error } = await supabase
    .from("resource_buildings")
    .select("id,x,y,guardian_power")
    .eq("game_id", gameId)
    .eq("id", targetId)
    .maybeSingle();

  if (error || !building || building.guardian_power <= 0) return null;

  const count = Math.max(5, Math.ceil(Number(building.guardian_power) / 12));
  return {
    id: building.id,
    playerId: null,
    heroId: null,
    neutralArmyId: null,
    attack: 1,
    defense: 1,
    armies: [{
      id: `${building.id}-guards`,
      unitType: UnitType.PIKEMAN,
      count,
      health: count * 12,
      maxHealth: 12,
      position: 0,
    }],
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
}: {
  targetId: string;
  targetType: string;
  attackerPlayerId: string;
  players: Array<{
    id: string;
    resourceBuildings: Array<{ id: string; x: number; y: number; guardianPower: number }>;
    heroes: Array<{ id: string; attack: number; defense: number; morale?: number; armies: UnitStack[]; x: number; y: number }>;
  }>;
  neutralArmies: Array<{ id: string; x: number; y: number; status: string; stacks: UnitStack[] }>;
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
    const count = Math.max(5, Math.ceil(building.guardianPower / 12));
    return {
      id: building.id,
      playerId: null,
      heroId: null,
      neutralArmyId: null,
      attack: 1,
      defense: 1,
      armies: [{
        id: `${building.id}-guards`,
        unitType: UnitType.PIKEMAN,
        count,
        health: count * 12,
        maxHealth: 12,
        position: 0,
      }],
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
