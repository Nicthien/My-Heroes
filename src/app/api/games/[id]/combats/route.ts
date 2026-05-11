import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CombatMode, UnitStack, UnitType } from "@/lib/game/types";
import { createCombatBoard, resolveAutomaticCombat } from "@/lib/game/combat/persistent";
import { applyLossesToArmies } from "@/lib/game/combat/autoResolve";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;

  const gamePlayer = await prisma.gamePlayer.findFirst({ where: { gameId: id, userId: session.user.id } });
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'êtes pas dans cette partie" }, { status: 403 });

  const combats = await prisma.combat.findMany({
    where: { gameId: id, status: "ACTIVE" },
    include: { participants: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(combats);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const mode = body.mode as CombatMode;
  if (mode !== "AUTO" && mode !== "MANUAL") {
    return NextResponse.json({ error: "Mode de combat invalide" }, { status: 400 });
  }

  const gamePlayer = await prisma.gamePlayer.findFirst({ where: { gameId: id, userId: session.user.id } });
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'êtes pas dans cette partie" }, { status: 403 });

  const game = await prisma.game.findUnique({ where: { id } });
  if (!game || game.status !== "ACTIVE") return NextResponse.json({ error: "Partie inactive" }, { status: 400 });
  const completedTurn = await prisma.turn.findUnique({
    where: {
      gameId_gamePlayerId_turnNumber: {
        gameId: id,
        gamePlayerId: gamePlayer.id,
        turnNumber: game.turnNumber,
      },
    },
  });
  if (completedTurn?.isCompleted) {
    return NextResponse.json({ error: "Vous avez déjà terminé votre tour" }, { status: 403 });
  }

  const attacker = await prisma.hero.findUnique({
    where: { id: body.attackerHeroId },
    include: { armies: true, gamePlayer: true },
  });
  if (!attacker || attacker.gamePlayerId !== gamePlayer.id) {
    return NextResponse.json({ error: "Héros attaquant invalide" }, { status: 400 });
  }

  const activeCombat = await prisma.combat.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { attackerHeroId: attacker.id },
        { defenderHeroId: attacker.id },
        { participants: { some: { heroId: attacker.id } } },
      ],
    },
  });
  if (activeCombat) return NextResponse.json({ error: "Ce héros est déjà en combat" }, { status: 400 });

  const targetType = body.targetType as "hero" | "monster";
  if (targetType === "hero") {
    return startHeroCombat(id, mode, attacker, String(body.targetId));
  }
  if (targetType === "monster") {
    return startNeutralCombat(id, mode, attacker, String(body.targetId));
  }

  return NextResponse.json({ error: "Cible invalide" }, { status: 400 });
}

async function startHeroCombat(gameId: string, mode: CombatMode, attacker: LoadedHero, targetId: string) {
  if (mode === "AUTO") {
    return NextResponse.json({ error: "Les combats entre joueurs sont toujours manuels" }, { status: 400 });
  }

  const defender = await prisma.hero.findUnique({
    where: { id: targetId },
    include: { armies: true, gamePlayer: true },
  });
  if (!defender || defender.gamePlayerId === attacker.gamePlayerId) {
    return NextResponse.json({ error: "Cible invalide" }, { status: 400 });
  }

  const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
  if (distance > Math.max(1, attacker.movement)) {
    return NextResponse.json({ error: "Cible trop éloignée" }, { status: 400 });
  }

  const combat = await prisma.$transaction(async (tx) => {
    const created = await tx.combat.create({
      data: {
        gameId,
        mode: "MANUAL",
        attackerPlayerId: attacker.gamePlayerId,
        defenderPlayerId: defender.gamePlayerId,
        attackerHeroId: attacker.id,
        defenderHeroId: defender.id,
        x: defender.x,
        y: defender.y,
        boardState: { units: [] },
        turnQueue: [],
        actionLog: ["Le combat commence."],
      },
    });
    const attackerParticipant = await tx.combatParticipant.create({ data: { combatId: created.id, playerId: attacker.gamePlayerId, heroId: attacker.id, side: "attacker" } });
    const defenderParticipant = await tx.combatParticipant.create({ data: { combatId: created.id, playerId: defender.gamePlayerId, heroId: defender.id, side: "defender" } });
    const board = createCombatBoard(
      heroSnapshot(attacker, attackerParticipant.id),
      heroSnapshot(defender, defenderParticipant.id)
    );
    return tx.combat.update({
      where: { id: created.id },
      data: {
        currentPlayerId: board.currentPlayerId,
        currentUnitId: board.currentUnitId,
        boardState: JSON.parse(JSON.stringify(board.boardState)),
        turnQueue: JSON.parse(JSON.stringify(board.turnQueue)),
      },
      include: { participants: true },
    });
  });
  return NextResponse.json({ combat });
}

async function startNeutralCombat(gameId: string, mode: CombatMode, attacker: LoadedHero, targetId: string) {
  let neutral = await prisma.neutralArmy.findFirst({
    where: { id: targetId, gameId },
    include: { stacks: true },
  });
  if (!neutral) neutral = await createNeutralArmyFromMap(gameId, targetId);
  if (!neutral || neutral.status !== "ACTIVE") return NextResponse.json({ error: "Monstres introuvables" }, { status: 400 });

  const distance = Math.abs(attacker.x - neutral.x) + Math.abs(attacker.y - neutral.y);
  if (distance > Math.max(1, attacker.movement)) return NextResponse.json({ error: "Cible trop éloignée" }, { status: 400 });

  const attackerSnapshot = heroSnapshot(attacker);
  const defenderSnapshot = {
    id: neutral.id,
    playerId: null,
    attack: 0,
    defense: 0,
    armies: neutral.stacks.map(stackToUnit),
  };

  if (mode === "AUTO") {
    const summary = resolveAutomaticCombat(attackerSnapshot, defenderSnapshot);
    await applyNeutralCombatResult(summary.winnerId === attacker.id, attacker, neutral.id, summary, neutral.x, neutral.y);
    const combat = await prisma.combat.create({
      data: {
        gameId,
        mode,
        status: "RESOLVED",
        attackerPlayerId: attacker.gamePlayerId,
        attackerHeroId: attacker.id,
        neutralArmyId: neutral.id,
        x: neutral.x,
        y: neutral.y,
        boardState: { units: [] },
        result: JSON.parse(JSON.stringify(summary)),
      },
    });
    return NextResponse.json({ combat, result: summary });
  }

  const combat = await prisma.$transaction(async (tx) => {
    const created = await tx.combat.create({
      data: {
        gameId,
        mode,
        attackerPlayerId: attacker.gamePlayerId,
        attackerHeroId: attacker.id,
        neutralArmyId: neutral.id,
        x: neutral.x,
        y: neutral.y,
        boardState: { units: [] },
        turnQueue: [],
        actionLog: ["Le combat commence."],
      },
    });
    const attackerParticipant = await tx.combatParticipant.create({ data: { combatId: created.id, playerId: attacker.gamePlayerId, heroId: attacker.id, side: "attacker" } });
    const board = createCombatBoard(heroSnapshot(attacker, attackerParticipant.id), defenderSnapshot);
    return tx.combat.update({
      where: { id: created.id },
      data: {
        currentPlayerId: board.currentPlayerId ?? attacker.gamePlayerId,
        currentUnitId: board.currentUnitId,
        boardState: JSON.parse(JSON.stringify(board.boardState)),
        turnQueue: JSON.parse(JSON.stringify(board.turnQueue)),
      },
      include: { participants: true },
    });
  });
  return NextResponse.json({ combat });
}

async function applyNeutralCombatResult(attackerWon: boolean, attacker: LoadedHero, neutralArmyId: string, summary: ReturnType<typeof resolveAutomaticCombat>, x: number, y: number) {
  await prisma.$transaction(async (tx) => {
    if (!attackerWon) {
      await tx.army.deleteMany({ where: { heroId: attacker.id } });
      await tx.hero.delete({ where: { id: attacker.id } });
      return;
    }
    for (const army of applyLossesToArmies(attacker.armies.map(armyToUnit), 0, false)) {
      const loss = summary.attackerLosses.find((item) => item.unitType === army.unitType);
      const nextCount = Math.max(1, army.count - (loss?.lost ?? 0));
      await tx.army.update({ where: { id: army.id }, data: { count: nextCount, health: nextCount * army.maxHealth } });
    }
    await tx.neutralArmy.update({ where: { id: neutralArmyId }, data: { status: "DEFEATED" } });
    await tx.hero.update({ where: { id: attacker.id }, data: { x, y, movement: 0, experience: { increment: summary.experienceGained } } });
  });
}

function heroSnapshot(hero: LoadedHero, participantId?: string) {
  return {
    id: hero.id,
    playerId: hero.gamePlayerId,
    heroId: hero.id,
    participantId: participantId ?? null,
    attack: hero.attack,
    defense: hero.defense,
    armies: hero.armies.map(armyToUnit),
  };
}

function armyToUnit(army: { id: string; unitType: string; count: number; health: number; maxHealth: number; position: number }): UnitStack {
  return { id: army.id, unitType: army.unitType as UnitType, count: army.count, health: army.health, maxHealth: army.maxHealth, position: army.position };
}

function stackToUnit(stack: { id: string; unitType: string; count: number; health: number; maxHealth: number; position: number }): UnitStack {
  return armyToUnit(stack);
}

async function createNeutralArmyFromMap(gameId: string, targetId: string) {
  const neutralId = targetId.startsWith(`${gameId}-`) ? targetId : `${gameId}-${targetId}`;
  const existing = await prisma.neutralArmy.findFirst({
    where: { id: neutralId, gameId },
    include: { stacks: true },
  });
  if (existing) return existing;

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  const mapData = game?.mapData as { tiles?: Array<Array<{ x: number; y: number; object?: { id: string; type: string } }>> } | null;
  const tile = mapData?.tiles?.flatMap((row) => row).find((item) => item.object?.id === targetId && item.object.type === "monster");
  if (!tile) return null;
  const count = 8 + ((tile.x + tile.y) % 12);
  return prisma.neutralArmy.create({
    data: {
      id: neutralId,
      gameId,
      x: tile.x,
      y: tile.y,
      stacks: {
        create: [{ unitType: "pikeman", count, health: count * 12, maxHealth: 12, position: 0 }],
      },
    },
    include: { stacks: true },
  });
}

type LoadedHero = Prisma.HeroGetPayload<{ include: { armies: true; gamePlayer: true } }>;
