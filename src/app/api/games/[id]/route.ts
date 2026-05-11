import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      players: {
        include: {
          heroes: { include: { armies: true } },
          towns: true,
          user: { select: { name: true } },
        },
      },
      turns: { orderBy: { turnNumber: "desc" }, take: 100 },
      combats: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: { participants: true },
      },
      neutralArmies: true,
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  }

  const playerId = session?.user?.id
    ? (
        await prisma.gamePlayer.findFirst({
          where: { gameId: id, userId: session.user.id },
          select: { id: true },
        })
      )?.id
    : null;

  const filteredGame = {
    ...game,
    players: game.players.map((p) => ({
      ...p,
      exploredTiles: p.id === playerId ? p.exploredTiles : [],
    })),
  };

  return NextResponse.json(filteredGame);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const gamePlayer = await prisma.gamePlayer.findFirst({
    where: { gameId: id, userId: session.user.id },
  });

  if (!gamePlayer) {
    return NextResponse.json({ error: "Vous n'êtes pas dans cette partie" }, { status: 403 });
  }

  const currentGame = await prisma.game.findUnique({ where: { id } });
  if (!currentGame) {
    return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  }

  if (currentGame.currentTurnPlayerId !== gamePlayer.id) {
    return NextResponse.json({ error: "Ce n'est pas votre tour" }, { status: 403 });
  }

  const players = await prisma.gamePlayer.findMany({
    where: { gameId: id, isAlive: true },
    orderBy: { turnOrder: "asc" },
  });
  const currentIndex = players.findIndex((player) => player.id === currentGame.currentTurnPlayerId);
  const nextPlayerId = players[(currentIndex + 1) % players.length]?.id;

  if (!nextPlayerId || body.nextPlayerId !== nextPlayerId) {
    return NextResponse.json({ error: "Prochain joueur invalide" }, { status: 400 });
  }

  const game = await prisma.game.update({
    where: { id },
    data: { currentTurnPlayerId: nextPlayerId },
  });

  await prisma.turn.create({
    data: {
      gameId: id,
      gamePlayerId: gamePlayer.id,
      turnNumber: game.turnNumber,
      actions: body.actions || [],
      isCompleted: true,
    },
  });

  return NextResponse.json(game);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  const hostPlayer = await prisma.gamePlayer.findFirst({
    where: {
      gameId: id,
      userId: session.user.id,
      turnOrder: 0,
    },
  });

  if (!hostPlayer) {
    return NextResponse.json(
      { error: "Seul le créateur peut supprimer cette partie" },
      { status: 403 }
    );
  }

  await prisma.game.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
