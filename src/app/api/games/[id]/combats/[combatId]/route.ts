import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id, combatId } = await params;

  const gamePlayer = await prisma.gamePlayer.findFirst({ where: { gameId: id, userId: session.user.id } });
  if (!gamePlayer) return NextResponse.json({ error: "Vous n'êtes pas dans cette partie" }, { status: 403 });

  const combat = await prisma.combat.findFirst({ where: { id: combatId, gameId: id }, include: { participants: true } });
  if (!combat) return NextResponse.json({ error: "Combat introuvable" }, { status: 404 });

  return NextResponse.json(combat);
}
