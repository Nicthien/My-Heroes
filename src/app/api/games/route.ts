import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
  prefixMonsterIds(mapData, randomUUID());
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

  await createNeutralArmies(game.id, mapData);
  await createResourceBuildings(game.id, mapData);

  return NextResponse.json(game, { status: 201 });
}

async function createNeutralArmies(gameId: string, mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>) {
  const monsterTiles = mapData.tiles.flatMap((row) =>
    row.filter((tile) => tile.object?.type === "monster")
  );

  for (const tile of monsterTiles) {
    const id = tile.object?.id;
    if (!id) continue;
    const count = 8 + ((tile.x + tile.y) % 12);
    await prisma.neutralArmy.create({
      data: {
        id,
        gameId,
        x: tile.x,
        y: tile.y,
        stacks: {
          create: [
            {
              unitType: "pikeman",
              count,
              health: count * 12,
              maxHealth: 12,
              position: 0,
            },
          ],
        },
      },
    });
  }
}

function prefixMonsterIds(mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>, prefix: string) {
  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "monster") {
        tile.object.id = `${prefix}-${tile.object.id}`;
      }
    }
  }
}

async function createResourceBuildings(gameId: string, mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>) {
  const buildingTiles = mapData.tiles.flatMap((row) =>
    row.filter((tile) => tile.object?.type === "building")
  );

  for (const tile of buildingTiles) {
    const id = tile.object?.id;
    const buildingType = tile.object?.subtype;
    const guardianPower = tile.object?.guardianPower ?? 200;
    if (!id || !buildingType) continue;

    await prisma.resourceBuilding.create({
      data: {
        id,
        gameId,
        gamePlayerId: null,
        buildingType,
        x: tile.x,
        y: tile.y,
        guardianPower,
      },
    });
  }
}
