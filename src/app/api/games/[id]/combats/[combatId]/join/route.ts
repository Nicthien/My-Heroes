import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CombatBoardUnit, CombatSide, CombatTerrainFeature, UnitStack, UnitType } from "@/lib/game/types";
import { addReinforcementUnits } from "@/lib/game/combat/persistent";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id, combatId } = await params;
  const body = await request.json();
  const requestedSide = body.side as CombatSide | undefined;
  if (requestedSide && requestedSide !== "attacker" && requestedSide !== "defender") {
    return NextResponse.json({ error: "Camp invalide" }, { status: 400 });
  }

  const gamePlayer = await prisma.gamePlayer.findFirst({ where: { gameId: id, userId: session.user.id } });
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'êtes pas dans cette partie" }, { status: 403 });

  const game = await prisma.game.findUnique({ where: { id } });
  if (!game || game.status !== "ACTIVE") return NextResponse.json({ error: "Partie inactive" }, { status: 400 });

  const completedTurn = await prisma.turn.findUnique({
    where: { gameId_gamePlayerId_turnNumber: { gameId: id, gamePlayerId: gamePlayer.id, turnNumber: game.turnNumber } },
  });
  if (completedTurn?.isCompleted) return NextResponse.json({ error: "Vous avez déjà terminé votre tour" }, { status: 403 });

  const hero = await prisma.hero.findUnique({ where: { id: String(body.heroId) }, include: { armies: true } });
  if (!hero || hero.gamePlayerId !== gamePlayer.id) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });

  const combat = await prisma.combat.findFirst({
    where: { id: combatId, gameId: id, status: "ACTIVE" },
    include: { participants: true },
  });
  if (!combat) return NextResponse.json({ error: "Combat introuvable" }, { status: 404 });

  const heroCombat = await prisma.combat.findFirst({
    where: { status: "ACTIVE", participants: { some: { heroId: hero.id } } },
  });
  if (heroCombat) return NextResponse.json({ error: "Ce héros est déjà en combat" }, { status: 400 });

  const distance = Math.abs(hero.x - combat.x) + Math.abs(hero.y - combat.y);
  if (distance > Math.max(1, hero.movement)) return NextResponse.json({ error: "Combat trop éloigné" }, { status: 400 });

  const existingPlayerParticipant = combat.participants.find((participant) => participant.playerId === gamePlayer.id);
  const side = existingPlayerParticipant?.side as CombatSide | undefined ?? requestedSide;
  if (!side) return NextResponse.json({ error: "Choisissez le camp à soutenir" }, { status: 400 });

  const updated = await prisma.$transaction(async (tx) => {
    const participant = await tx.combatParticipant.create({
      data: { combatId: combat.id, playerId: gamePlayer.id, heroId: hero.id, side },
    });
    const boardState = combat.boardState as unknown as { units: CombatBoardUnit[]; terrain?: CombatTerrainFeature[] };
    const units = boardState.units.map((unit) => ({ ...unit }));
    addReinforcementUnits({
      units,
      terrain: boardState.terrain ?? [],
      armies: hero.armies.map(armyToUnit),
      side,
      ownerPlayerId: gamePlayer.id,
      heroId: hero.id,
      participantId: participant.id,
      joinsRound: combat.round + 1,
    });
    const actionLog = [
      ...((combat.actionLog as unknown as string[]) ?? []),
      `${hero.name} rejoint le camp ${side === "attacker" ? "attaquant" : "défenseur"} au prochain round.`,
    ];

    await tx.hero.update({ where: { id: hero.id }, data: { x: combat.x, y: combat.y, movement: 0 } });
    return tx.combat.update({
      where: { id: combat.id },
      data: {
        boardState: JSON.parse(JSON.stringify({ units, terrain: boardState.terrain ?? [] })),
        actionLog,
      },
      include: { participants: true },
    });
  });

  return NextResponse.json({ combat: updated });
}

function armyToUnit(army: { id: string; unitType: string; count: number; health: number; maxHealth: number; position: number }): UnitStack {
  return { id: army.id, unitType: army.unitType as UnitType, count: army.count, health: army.health, maxHealth: army.maxHealth, position: army.position };
}
