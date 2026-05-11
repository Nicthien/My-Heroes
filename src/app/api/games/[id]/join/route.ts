import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeVisibleTiles, placePlayerStart } from "@/lib/game/engine";

const HERO_NAMES: Record<string, string[]> = {
  castle: ["Sire Christian", "Seigneur Haart", "Sire Vorcharch", "Rion", "Adela"],
  rampart: ["Gemma", "Mephala", "Ufretin", "Ryland", "Ivor"],
  tower: ["Josefa", "Astral", "Terek", "Fafner", "Neela"],
  inferno: ["Fiona", "Rashka", "Marius", "Ignatius", "Octavia"],
  necropolis: ["Thant", "Moandor", "Nagash", "Sirus", "Vidomina"],
  dungeon: ["Lorena", "Suzerain", "Dace", "Ajit", "Damacon"],
  stronghold: ["Yog", "Gurnisson", "Shiva", "Tyraxor", "Crag Hack"],
  fortress: ["Voy", "Drakon", "Wystan", "Ros", "Tiva"],
};

const PLAYER_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];

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
  const faction = (body.faction || "castle") as string;

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      players: {
        include: { heroes: true, towns: true },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Partie non trouvée" }, { status: 404 });
  }

  const existingPlayer = game.players.find((p) => p.userId === session.user!.id);
  if (existingPlayer) {
    return NextResponse.json({ error: "Déjà dans cette partie" }, { status: 400 });
  }

  if (game.status !== "PENDING") {
    return NextResponse.json({ error: "La partie a déjà commencé" }, { status: 400 });
  }

  if (game.players.length >= game.maxPlayers) {
    return NextResponse.json({ error: "La partie est pleine" }, { status: 400 });
  }

  const turnOrder = game.players.length;
  const color = PLAYER_COLORS[turnOrder] || "#ffffff";

  const mapData = game.mapData as Record<string, unknown>;
  const startPos = placePlayerStart(mapData, turnOrder);

  const heroNames = HERO_NAMES[faction] || HERO_NAMES.castle;
  const heroName = heroNames[turnOrder % heroNames.length];

  const initialExplored = computeVisibleTiles(
    mapData as unknown as Parameters<typeof computeVisibleTiles>[0],
    [{ x: startPos.x, y: startPos.y }],
    5
  );

  const gamePlayer = await prisma.gamePlayer.create({
    data: {
      gameId: id,
      userId: session.user.id,
      faction,
      color,
      turnOrder,
      exploredTiles: Array.from(initialExplored),
      heroes: {
        create: {
          name: heroName,
          attack: 2,
          defense: 2,
          spellPower: 1,
          knowledge: 1,
          x: startPos.x,
          y: startPos.y,
          armies: {
            create: [
              { unitType: "pikeman", count: 20, health: 240, maxHealth: 12, position: 0 },
              { unitType: "archer", count: 12, health: 144, maxHealth: 12, position: 1 },
              { unitType: "griffin", count: 4, health: 120, maxHealth: 30, position: 2 },
            ],
          },
        },
      },
      towns: {
        create: {
          name: "Château",
          townType: faction,
          x: startPos.x,
          y: startPos.y,
          buildings: ["castle"],
          garrison: [],
        },
      },
    },
    include: {
      heroes: { include: { armies: true } },
      towns: true,
    },
  });

  const allPlayers = [...game.players, gamePlayer];
  const shouldStart = allPlayers.length >= game.maxPlayers;

  if (shouldStart) {
    await prisma.game.update({
      where: { id },
      data: {
        status: "ACTIVE",
        currentTurnPlayerId: allPlayers[0].id,
      },
    });
  }

  return NextResponse.json({
    gamePlayer,
    gameStarted: shouldStart,
  }, { status: 201 });
}
