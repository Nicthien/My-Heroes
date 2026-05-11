import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CombatBoardUnit, CombatSummary, CombatTerrainFeature, UnitType } from "@/lib/game/types";
import { executeManualCombatAction, getHexDistance, getHexNeighbors, getLosses, isTerrainBlocked } from "@/lib/game/combat/persistent";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id, combatId } = await params;
  const action = await request.json();

  const gamePlayer = await prisma.gamePlayer.findFirst({ where: { gameId: id, userId: session.user.id } });
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'êtes pas dans cette partie" }, { status: 403 });

  const combat = await loadCombatForAction(combatId, id);
  if (!combat) return NextResponse.json({ error: "Combat introuvable" }, { status: 404 });
  if (combat.currentPlayerId && combat.currentPlayerId !== gamePlayer.id) {
    return NextResponse.json({ error: "Ce n'est pas à vous de jouer" }, { status: 403 });
  }

  const boardState = combat.boardState as unknown as { units: CombatBoardUnit[]; terrain?: CombatTerrainFeature[] };
  let next = executeManualCombatAction({
    units: boardState.units,
    terrain: boardState.terrain ?? [],
    turnQueue: combat.turnQueue as unknown as string[],
    round: combat.round,
    currentUnitId: combat.currentUnitId,
    action,
    attackerStats: { attack: combat.attackerHero.attack, defense: combat.attackerHero.defense },
    defenderStats: { attack: combat.defenderHero?.attack ?? 0, defense: combat.defenderHero?.defense ?? 0 },
  });

  while (!next.result && !next.currentPlayerId && combat.neutralArmyId && next.currentUnitId) {
    const actor = next.units.find((unit) => unit.id === next.currentUnitId);
    const target = next.units.find((unit) => unit.side !== actor?.side);
    if (!actor || !target) break;
    const neutralAction = getNeutralAction(actor, target, next.units, boardState.terrain ?? []);
    next = executeManualCombatAction({
      units: next.units,
      terrain: boardState.terrain ?? [],
      turnQueue: next.turnQueue,
      round: next.round,
      currentUnitId: next.currentUnitId,
      action: neutralAction,
      attackerStats: { attack: combat.attackerHero.attack, defense: combat.attackerHero.defense },
      defenderStats: { attack: 0, defense: 0 },
    });
  }

  const actionLog = [...((combat.actionLog as unknown as string[]) ?? []), ...next.log];

  if (next.result) {
    const summary = await finishCombat(combat, next.units, actionLog, next.result);
    const resolved = await prisma.combat.update({
      where: { id: combat.id },
      data: {
        status: "RESOLVED",
        currentPlayerId: null,
        currentUnitId: null,
        round: next.round,
        boardState: JSON.parse(JSON.stringify({ units: next.units, terrain: boardState.terrain ?? [] })),
        turnQueue: [],
        actionLog,
        result: JSON.parse(JSON.stringify(summary)),
      },
    });
    return NextResponse.json({ combat: resolved, result: summary });
  }

  const updated = await prisma.combat.update({
    where: { id: combat.id },
    data: {
      currentPlayerId: next.currentPlayerId,
      currentUnitId: next.currentUnitId,
      round: next.round,
      boardState: JSON.parse(JSON.stringify({ units: next.units, terrain: boardState.terrain ?? [] })),
      turnQueue: JSON.parse(JSON.stringify(next.turnQueue)),
      actionLog,
    },
  });

  return NextResponse.json({ combat: updated });
}

function getNeutralAction(actor: CombatBoardUnit, target: CombatBoardUnit, units: CombatBoardUnit[], terrain: CombatTerrainFeature[]) {
  const distance = getHexDistance(actor, target);
  if (actor.ranged && actor.shots > 0) return { type: "SHOOT" as const, targetUnitId: target.id };
  if (distance <= 1) return { type: "ATTACK" as const, targetUnitId: target.id };

  const destination = findBestMoveToward(actor, target, units, terrain);
  if (destination) return { type: "MOVE" as const, q: destination.q, r: destination.r };
  return { type: "DEFEND" as const };
}

function findBestMoveToward(actor: CombatBoardUnit, target: CombatBoardUnit, units: CombatBoardUnit[], terrain: CombatTerrainFeature[]) {
  const occupied = new Set(units.map((unit) => `${unit.q},${unit.r}`));
  const startKey = `${actor.q},${actor.r}`;
  const queue = [{ q: actor.q, r: actor.r, steps: 0 }];
  const seen = new Set([startKey]);
  let best: { q: number; r: number; distance: number } | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.q},${current.r}`;
    const distance = getHexDistance(current, target);
    if (currentKey !== startKey && (!best || distance < best.distance)) {
      best = { q: current.q, r: current.r, distance };
    }
    if (current.steps >= actor.speed) continue;

    for (const neighbor of getHexNeighbors(current.q, current.r)) {
      const key = `${neighbor.q},${neighbor.r}`;
      if (seen.has(key) || occupied.has(key) || isTerrainBlocked(neighbor.q, neighbor.r, terrain)) continue;
      seen.add(key);
      queue.push({ ...neighbor, steps: current.steps + 1 });
    }
  }

  return best;
}

async function finishCombat(
  combat: Awaited<ReturnType<typeof loadCombatForAction>>,
  units: CombatBoardUnit[],
  log: string[],
  winnerSide: "attacker" | "defender"
): Promise<CombatSummary> {
  if (!combat) throw new Error("Combat introuvable");
  const attackerRemaining = units.filter((unit) => unit.side === "attacker");
  const defenderRemaining = units.filter((unit) => unit.side === "defender");
  const attackerBefore = combat.attackerHero.armies.map((army) => ({ ...army, unitType: army.unitType as UnitType }));
  const defenderBefore = combat.defenderHero
    ? combat.defenderHero.armies.map((army) => ({ ...army, unitType: army.unitType as UnitType }))
    : combat.neutralArmy?.stacks.map((stack) => ({ ...stack, unitType: stack.unitType as UnitType })) ?? [];
  const summary: CombatSummary = {
    winnerId: winnerSide,
    winnerPlayerId: winnerSide === "attacker" ? combat.attackerPlayerId : combat.defenderPlayerId,
    loserId: winnerSide === "attacker" ? "defender" : "attacker",
    attackerLosses: getLosses(attackerBefore, attackerRemaining),
    defenderLosses: getLosses(defenderBefore, defenderRemaining),
    experienceGained: winnerSide === "attacker" ? 500 : 0,
    log,
  };

  await prisma.$transaction(async (tx) => {
    const winnerUnits = winnerSide === "attacker" ? attackerRemaining : defenderRemaining;
    const loserSide = winnerSide === "attacker" ? "defender" : "attacker";
    const armyIds = new Set([
      ...combat.attackerHero.armies.map((army) => army.id),
      ...(combat.defenderHero?.armies.map((army) => army.id) ?? []),
    ]);
    const neutralStackIds = new Set(combat.neutralArmy?.stacks.map((stack) => stack.id) ?? []);
    const survivingArmyIds = new Set(winnerUnits.filter((unit) => armyIds.has(unit.id)).map((unit) => unit.id));
    const survivingNeutralStackIds = new Set(winnerUnits.filter((unit) => neutralStackIds.has(unit.id)).map((unit) => unit.id));

    for (const unit of winnerUnits) {
      if (unit.heroId || armyIds.has(unit.id)) {
        await tx.army.update({ where: { id: unit.id }, data: { count: unit.count, health: unit.health } });
      } else if (neutralStackIds.has(unit.id)) {
        await tx.neutralArmyStack.update({ where: { id: unit.id }, data: { count: unit.count, health: unit.health } });
      }
    }

    if (winnerSide === "attacker") {
      await tx.hero.update({ where: { id: combat.attackerHeroId }, data: { x: combat.x, y: combat.y, movement: 0, experience: { increment: summary.experienceGained } } });
      if (combat.neutralArmyId) await tx.neutralArmy.update({ where: { id: combat.neutralArmyId }, data: { status: "DEFEATED" } });
    }

    const participantHeroIds = getParticipantHeroIds(combat);
    const loserHeroIds = participantHeroIds
      .filter((participant) => participant.side === loserSide)
      .map((participant) => participant.heroId);
    for (const heroId of loserHeroIds) {
      await tx.army.deleteMany({ where: { heroId } });
      await tx.hero.delete({ where: { id: heroId } });
    }

    const winnerHeroIds = participantHeroIds
      .filter((participant) => participant.side === winnerSide)
      .map((participant) => participant.heroId);
    for (const heroId of winnerHeroIds) {
      await tx.army.deleteMany({
        where: {
          heroId,
          id: { notIn: Array.from(survivingArmyIds) },
        },
      });

      const remainingArmies = await tx.army.count({ where: { heroId } });
      if (remainingArmies === 0) {
        await tx.hero.delete({ where: { id: heroId } });
      }
    }

    if (combat.neutralArmyId) {
      await tx.neutralArmyStack.deleteMany({
        where: {
          neutralArmyId: combat.neutralArmyId,
          id: { notIn: Array.from(survivingNeutralStackIds) },
        },
      });
    }
  });

  return summary;
}

function getParticipantHeroIds(combat: NonNullable<Awaited<ReturnType<typeof loadCombatForAction>>>) {
  const participants = combat.participants.map((participant) => ({
    heroId: participant.heroId,
    side: participant.side as "attacker" | "defender",
  }));

  if (!participants.some((participant) => participant.heroId === combat.attackerHeroId)) {
    participants.push({ heroId: combat.attackerHeroId, side: "attacker" });
  }

  if (combat.defenderHeroId && !participants.some((participant) => participant.heroId === combat.defenderHeroId)) {
    participants.push({ heroId: combat.defenderHeroId, side: "defender" });
  }

  return participants;
}

async function loadCombatForAction(id: string, gameId: string) {
  return prisma.combat.findFirst({
    where: { id, gameId, status: "ACTIVE" },
    include: {
      attackerHero: { include: { armies: true } },
      defenderHero: { include: { armies: true } },
      neutralArmy: { include: { stacks: true } },
      participants: true,
    },
  });
}
