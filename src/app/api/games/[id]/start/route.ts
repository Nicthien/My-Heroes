import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
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
    include: { players: { orderBy: { turnOrder: "asc" } } },
  });

  if (!game) {
    return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  }

  const currentUserPlayer = game.players.find(
    (player) => player.userId === session.user!.id
  );

  if (!currentUserPlayer) {
    return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
  }

  if (game.status !== "PENDING") {
    return NextResponse.json({ error: "La partie est deja demarree" }, { status: 400 });
  }

  const firstPlayer = game.players[0];
  if (!firstPlayer) {
    return NextResponse.json({ error: "Aucun joueur dans la partie" }, { status: 400 });
  }

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      status: "ACTIVE",
      currentTurnPlayerId: firstPlayer.id,
    },
  });

  return NextResponse.json(updatedGame);
}
