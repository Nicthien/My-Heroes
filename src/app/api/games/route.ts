import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeVisibleTiles } from "@/lib/game/engine";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const games = await prisma.game.findMany({
    where: {
      players: {
        some: { userId: session.user.id },
      },
    },
    include: {
      players: {
        include: { user: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(games);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await request.json();
  const { name, maxPlayers = 2, mapWidth = 36, mapHeight = 36, faction = "castle" } = body;

  const { generateMap, placePlayerStart } = await import("@/lib/game/engine");
  const mapData = generateMap(mapWidth, mapHeight);
  const startPos = placePlayerStart(mapData, 0);

  const initialExplored = computeVisibleTiles(mapData, [{ x: startPos.x, y: startPos.y }], 5);

  const game = await prisma.game.create({
    data: {
      name: name || `Partie de ${session.user.name || "Inconnu"}`,
      maxPlayers,
      mapWidth,
      mapHeight,
      status: "PENDING",
      mapData: JSON.parse(JSON.stringify(mapData)),
      gameConfig: { turnTimeLimit: 86400 },
      players: {
        create: {
          userId: session.user.id,
          faction,
          color: "#3b82f6",
          turnOrder: 0,
          exploredTiles: Array.from(initialExplored),
          heroes: {
            create: {
              name: "Sire Christian",
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
              townType: "castle",
              x: startPos.x,
              y: startPos.y,
              buildings: ["castle"],
              garrison: [],
            },
          },
        },
      },
    },
    include: {
      players: {
        include: {
          heroes: { include: { armies: true } },
          towns: true,
        },
      },
    },
  });

  return NextResponse.json(game, { status: 201 });
}
