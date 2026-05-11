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

  const gamePlayer = await prisma.gamePlayer.findFirst({
    where: { gameId: id, userId: session.user.id },
  });

  if (!gamePlayer) {
    return NextResponse.json(
      { error: "Vous n'êtes pas dans cette partie" },
      { status: 403 }
    );
  }

  if (gamePlayer.turnOrder === 0) {
    return NextResponse.json(
      { error: "Le créateur doit supprimer la partie au lieu de la quitter" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) {
    return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
  }

  if (game.status !== "PENDING") {
    return NextResponse.json(
      { error: "Impossible de quitter une partie en cours. Revenez au dashboard, la partie reste en attente de votre tour." },
      { status: 400 }
    );
  }

  await prisma.gamePlayer.delete({ where: { id: gamePlayer.id } });

  return NextResponse.json({ success: true });
}
