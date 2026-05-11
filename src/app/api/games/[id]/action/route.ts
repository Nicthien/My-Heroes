import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BUILDING_RULES, UNIT_RULES, canAfford, subtractCost } from "@/lib/game/economy";
import { BuildingType, Resources, UnitType, GameMap } from "@/lib/game/types";
import { computeVisibleTiles, getPlayerVisionCenters, normalizeMapMovement } from "@/lib/game/engine";
import {
  applyLossesToWinnerArmies,
  autoResolveCombat,
} from "@/lib/game/combat/autoResolve";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const action = await request.json();

    const gamePlayer = await prisma.gamePlayer.findFirst({
      where: { gameId: id, userId: session.user.id },
    });

    if (!gamePlayer) {
      return NextResponse.json({ error: "Vous n'êtes pas dans cette partie" }, { status: 403 });
    }

    const game = await prisma.game.findUnique({ where: { id } });
    if (!game) {
      return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
    }

    if (game.status !== "ACTIVE") {
      return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });
    }

    const completedTurn = await prisma.turn.findUnique({
      where: {
        gameId_gamePlayerId_turnNumber: {
          gameId: id,
          gamePlayerId: gamePlayer.id,
          turnNumber: game.turnNumber,
        },
      },
    });

    if (completedTurn?.isCompleted && action.type !== "END_TURN") {
      return NextResponse.json({ error: "Vous avez déjà terminé votre tour" }, { status: 403 });
    }

    switch (action.type) {
    case "MOVE_HERO": {
      const hero = await prisma.hero.findUnique({
        where: { id: action.heroId },
      });
      if (!hero || hero.gamePlayerId !== gamePlayer.id) {
        return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
      }

      const activeCombat = await prisma.combat.findFirst({
        where: {
          status: "ACTIVE",
          OR: [{ attackerHeroId: hero.id }, { defenderHeroId: hero.id }],
        },
      });
      if (activeCombat) {
        return NextResponse.json({ error: "Ce héros est engagé dans un combat" }, { status: 400 });
      }

      const mapDataForVisibility = normalizeMapMovement(game.mapData as unknown as GameMap);
      const moveValidation = validateMovePath(
        mapDataForVisibility,
        { x: hero.x, y: hero.y },
        action.path,
        hero.movement
      );
      if (!moveValidation.ok) {
        return NextResponse.json({ error: moveValidation.error }, { status: 400 });
      }

      const lastPos = action.path[action.path.length - 1];

      await prisma.hero.update({
        where: { id: hero.id },
        data: {
          x: lastPos.x,
          y: lastPos.y,
          movement: Math.max(0, hero.movement - moveValidation.usedMovement),
        },
      });

      // Update explored tiles for the player
      const [allPlayerHeroes, allPlayerTowns] = await Promise.all([
        prisma.hero.findMany({ where: { gamePlayerId: gamePlayer.id } }),
        prisma.town.findMany({ where: { gamePlayerId: gamePlayer.id } }),
      ]);
      const newlyVisible = computeVisibleTiles(
        mapDataForVisibility,
        getPlayerVisionCenters({
          heroes: allPlayerHeroes.map((h) => ({ position: { x: h.x, y: h.y } })),
          towns: allPlayerTowns.map((town) => ({ position: { x: town.x, y: town.y } })),
        }),
        5
      );
      const existingExplored = new Set<string>(
        ((gamePlayer.exploredTiles as string[]) ?? [])
      );
      for (const key of newlyVisible) {
        existingExplored.add(key);
      }
      await prisma.gamePlayer.update({
        where: { id: gamePlayer.id },
        data: { exploredTiles: Array.from(existingExplored) },
      });

      // Check for resource or monster on destination tile
      const mapData = game.mapData as { tiles?: Array<Array<{ x:number; y:number; terrain:string; object?:{ type:string; subtype?:string; id:string } }>> } | null;
      const tile = mapData?.tiles?.[lastPos.y]?.[lastPos.x];
      const mapState = (game.mapState as Record<string, unknown>) ?? {};
      const collected = (mapState.collected as string[]) ?? [];
      const killed = (mapState.killed as string[]) ?? [];
      const collectedSet = new Set(collected);
      const killedSet = new Set(killed);

      let interaction: { type: string; resource?: string; gold?: number } | null = null;

      if (tile?.object?.type === "resource" && !collectedSet.has(tile.object.id)) {
        collectedSet.add(tile.object.id);
        const resourceType = tile.object.subtype ?? "gold";
        const amount = resourceType === "gold" ? 500 : 2;

        const nextMapState = {
          ...mapState,
          collected: Array.from(collectedSet),
        };

        if (resourceType === "gold") {
          await prisma.gamePlayer.update({ where: { id: gamePlayer.id }, data: { gold: { increment: amount } } });
        } else if (resourceType === "wood") {
          await prisma.gamePlayer.update({ where: { id: gamePlayer.id }, data: { wood: { increment: amount } } });
        } else if (resourceType === "ore") {
          await prisma.gamePlayer.update({ where: { id: gamePlayer.id }, data: { ore: { increment: amount } } });
        } else if (resourceType === "mercury") {
          await prisma.gamePlayer.update({ where: { id: gamePlayer.id }, data: { mercury: { increment: amount } } });
        } else if (resourceType === "crystals") {
          await prisma.gamePlayer.update({ where: { id: gamePlayer.id }, data: { crystals: { increment: amount } } });
        } else if (resourceType === "sulfur") {
          await prisma.gamePlayer.update({ where: { id: gamePlayer.id }, data: { sulfur: { increment: amount } } });
        }

        await prisma.game.update({
          where: { id },
          data: { mapState: JSON.parse(JSON.stringify(nextMapState)) },
        });

        interaction = { type: "COLLECT", resource: resourceType, gold: resourceType === "gold" ? amount : undefined };
      }

      if (tile?.object?.type === "monster" && !killedSet.has(tile.object.id)) {
        killedSet.add(tile.object.id);

        const monsterPower = 200 + Math.floor(Math.random() * 400);
        const armyAgg = await prisma.army.aggregate({
          where: { heroId: hero.id },
          _sum: { count: true },
        });
        const heroPower = (hero.attack + hero.defense) * 50 + (armyAgg._sum.count ?? 0) * 20;
        const won = heroPower >= monsterPower;

        const nextMapState = {
          ...mapState,
          collected: Array.from(collectedSet),
          killed: Array.from(killedSet),
        };

        if (won) {
          const xpGain = 100 + Math.floor(Math.random() * 200);
          await prisma.hero.update({
            where: { id: hero.id },
            data: { experience: { increment: xpGain } },
          });
          await prisma.game.update({
            where: { id },
            data: { mapState: JSON.parse(JSON.stringify(nextMapState)) },
          });
          interaction = { type: "FIGHT", resource: "victory", gold: xpGain };
        } else {
          await prisma.$transaction(async (tx) => {
            await tx.army.deleteMany({ where: { heroId: hero.id } });
            await tx.hero.delete({ where: { id: hero.id } });
            await tx.game.update({
              where: { id },
              data: { mapState: JSON.parse(JSON.stringify(nextMapState)) },
            });
            await refreshEliminationsAndGameStatus(tx, id, game.currentTurnPlayerId);
          });
          interaction = { type: "FIGHT", resource: "defeat" };
        }
      }

      return NextResponse.json({ success: true, interaction });
    }
    case "ATTACK": {
      const attacker = await prisma.hero.findUnique({
        where: { id: action.heroId },
        include: { armies: true, gamePlayer: true },
      });
      const defender = await prisma.hero.findUnique({
        where: { id: action.targetId },
        include: { armies: true, gamePlayer: true },
      });

      if (!attacker || attacker.gamePlayerId !== gamePlayer.id) {
        return NextResponse.json({ error: "Héros attaquant invalide" }, { status: 400 });
      }

      if (!defender || defender.gamePlayerId === gamePlayer.id) {
        return NextResponse.json({ error: "Cible invalide" }, { status: 400 });
      }

      const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
      if (distance > Math.max(1, attacker.movement)) {
        return NextResponse.json({ error: "Cible trop éloignée" }, { status: 400 });
      }

      const result = autoResolveCombat(
        {
          id: attacker.id,
          attack: attacker.attack,
          defense: attacker.defense,
          armies: attacker.armies.map((army) => ({
            id: army.id,
            unitType: army.unitType as UnitType,
            count: army.count,
            health: army.health,
            maxHealth: army.maxHealth,
            position: army.position,
          })),
        },
        {
          id: defender.id,
          attack: defender.attack,
          defense: defender.defense,
          armies: defender.armies.map((army) => ({
            id: army.id,
            unitType: army.unitType as UnitType,
            count: army.count,
            health: army.health,
            maxHealth: army.maxHealth,
            position: army.position,
          })),
        }
      );

      const winner = result.winnerHeroId === attacker.id ? attacker : defender;
      const loser = result.loserHeroId === attacker.id ? attacker : defender;
      const winnerArmies = applyLossesToWinnerArmies(
        winner.armies.map((army) => ({
          id: army.id,
          unitType: army.unitType as UnitType,
          count: army.count,
          health: army.health,
          maxHealth: army.maxHealth,
          position: army.position,
        })),
        result.winnerLossRatio
      );

      await prisma.$transaction(async (tx) => {
        await tx.army.deleteMany({ where: { heroId: loser.id } });
        await tx.hero.delete({ where: { id: loser.id } });

        for (const army of winnerArmies) {
          await tx.army.update({
            where: { id: army.id },
            data: {
              count: army.count,
              health: army.health,
            },
          });
        }

        await tx.hero.update({
          where: { id: winner.id },
          data: {
            x: defender.x,
            y: defender.y,
            movement: 0,
            experience: { increment: 500 },
          },
        });

        await refreshEliminationsAndGameStatus(tx, id, game.currentTurnPlayerId);
      });

      return NextResponse.json({ success: true, combat: result });
    }
    case "CAPTURE_TOWN": {
      const attacker = await prisma.hero.findUnique({
        where: { id: action.heroId },
      });
      const town = await prisma.town.findUnique({ where: { id: action.townId } });

      if (!attacker || attacker.gamePlayerId !== gamePlayer.id) {
        return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
      }

      if (!town || town.gamePlayerId === gamePlayer.id) {
        return NextResponse.json({ error: "Château invalide" }, { status: 400 });
      }

      const distance = Math.abs(attacker.x - town.x) + Math.abs(attacker.y - town.y);
      if (distance > Math.max(1, attacker.movement)) {
        return NextResponse.json({ error: "Château trop éloigné" }, { status: 400 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.town.update({
          where: { id: town.id },
          data: { gamePlayerId: gamePlayer.id },
        });

        await tx.hero.update({
          where: { id: attacker.id },
          data: {
            x: town.x,
            y: town.y,
            movement: 0,
            experience: { increment: 250 },
          },
        });

        const [allPlayerHeroes, allPlayerTowns] = await Promise.all([
          tx.hero.findMany({ where: { gamePlayerId: gamePlayer.id } }),
          tx.town.findMany({ where: { gamePlayerId: gamePlayer.id } }),
        ]);
        const newlyVisible = computeVisibleTiles(
          normalizeMapMovement(game.mapData as unknown as GameMap),
          getPlayerVisionCenters({
            heroes: allPlayerHeroes.map((h) => ({ position: { x: h.x, y: h.y } })),
            towns: allPlayerTowns.map((item) => ({ position: { x: item.x, y: item.y } })),
          }),
          5
        );
        const exploredSet = new Set<string>((gamePlayer.exploredTiles as string[]) ?? []);
        for (const key of newlyVisible) exploredSet.add(key);
        await tx.gamePlayer.update({
          where: { id: gamePlayer.id },
          data: { exploredTiles: Array.from(exploredSet) },
        });

        await refreshEliminationsAndGameStatus(tx, id, game.currentTurnPlayerId);
      });

      return NextResponse.json({ success: true, interaction: { type: "CAPTURE" } });
    }
    case "BUILD": {
      const building = action.building as BuildingType;
      const rule = BUILDING_RULES.find((item) => item.type === building);
      if (!rule) {
        return NextResponse.json({ error: "Bâtiment invalide" }, { status: 400 });
      }

      const town = await prisma.town.findUnique({ where: { id: action.townId } });
      if (!town || town.gamePlayerId !== gamePlayer.id) {
        return NextResponse.json({ error: "Ville invalide" }, { status: 400 });
      }

      if (town.lastBuiltTurn === game.turnNumber) {
        return NextResponse.json({ error: "Une construction a déjà été réalisée aujourd'hui dans ce château" }, { status: 400 });
      }

      const buildings = (town.buildings as string[]) ?? [];
      if (buildings.includes(building)) {
        return NextResponse.json({ error: "Bâtiment déjà construit" }, { status: 400 });
      }

      const missingRequirement = rule.requires?.find(
        (requirement) => !buildings.includes(requirement)
      );
      if (missingRequirement) {
        return NextResponse.json({ error: "Prérequis manquant" }, { status: 400 });
      }

      const resources: Resources = {
        gold: gamePlayer.gold,
        wood: gamePlayer.wood,
        ore: gamePlayer.ore,
        mercury: gamePlayer.mercury,
        crystals: gamePlayer.crystals,
        sulfur: gamePlayer.sulfur,
      };

      if (!canAfford(resources, rule.cost)) {
        return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });
      }

      const nextResources = subtractCost(resources, rule.cost);

      const availableRecruits = addImmediateDwellingGrowth(
        normalizeRecruitStock(town.availableRecruits),
        building
      );

      await prisma.$transaction([
        prisma.gamePlayer.update({
          where: { id: gamePlayer.id },
          data: nextResources,
        }),
        prisma.town.update({
          where: { id: town.id },
          data: {
            buildings: [...buildings, building],
            availableRecruits,
            lastBuiltTurn: game.turnNumber,
          },
        }),
      ]);
      break;
    }
    case "RECRUIT_UNIT": {
      const unitType = action.unitType as UnitType;
      const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
      const rule = UNIT_RULES.find((item) => item.type === unitType);
      if (!rule) {
        return NextResponse.json({ error: "Unité invalide" }, { status: 400 });
      }

      const town = await prisma.town.findUnique({ where: { id: action.townId } });
      if (!town || town.gamePlayerId !== gamePlayer.id) {
        return NextResponse.json({ error: "Ville invalide" }, { status: 400 });
      }

      const buildings = (town.buildings as string[]) ?? [];
      if (!buildings.includes(rule.dwelling)) {
        return NextResponse.json({ error: "Bâtiment de recrutement manquant" }, { status: 400 });
      }

      const availableRecruits = normalizeRecruitStock(town.availableRecruits);
      if ((availableRecruits[unitType] ?? 0) < count) {
        return NextResponse.json({ error: "Stock hebdomadaire insuffisant dans ce château" }, { status: 400 });
      }

      const resources: Resources = {
        gold: gamePlayer.gold,
        wood: gamePlayer.wood,
        ore: gamePlayer.ore,
        mercury: gamePlayer.mercury,
        crystals: gamePlayer.crystals,
        sulfur: gamePlayer.sulfur,
      };

      const totalCost = {
        gold: (rule.cost.gold ?? 0) * count,
        wood: (rule.cost.wood ?? 0) * count,
        ore: (rule.cost.ore ?? 0) * count,
        mercury: (rule.cost.mercury ?? 0) * count,
        crystals: (rule.cost.crystals ?? 0) * count,
        sulfur: (rule.cost.sulfur ?? 0) * count,
      };

      if (!canAfford(resources, totalCost)) {
        return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });
      }

      const firstHero = await prisma.hero.findFirst({
        where: { gamePlayerId: gamePlayer.id },
        include: { armies: true },
      });
      if (!firstHero) {
        return NextResponse.json({ error: "Aucun héros disponible" }, { status: 400 });
      }

      const existingStack = firstHero.armies.find((army) => army.unitType === unitType);
      const nextResources = subtractCost(resources, totalCost);

      await prisma.$transaction(async (tx) => {
        await tx.gamePlayer.update({
          where: { id: gamePlayer.id },
          data: nextResources,
        });

        await tx.town.update({
          where: { id: town.id },
          data: {
            availableRecruits: {
              ...availableRecruits,
              [unitType]: (availableRecruits[unitType] ?? 0) - count,
            },
          },
        });

        if (existingStack) {
          await tx.army.update({
            where: { id: existingStack.id },
            data: {
              count: { increment: count },
              health: { increment: rule.health * count },
            },
          });
          return;
        }

        await tx.army.create({
          data: {
            heroId: firstHero.id,
            unitType,
            count,
            health: rule.health * count,
            maxHealth: rule.health,
            position: firstHero.armies.length,
          },
        });
      });
      break;
    }
    case "END_TURN": {
      const activeCombats = await prisma.combat.count({ where: { gameId: id, status: "ACTIVE" } });
      if (activeCombats > 0) {
        return NextResponse.json({ error: "Terminez les combats en cours avant de finir le tour" }, { status: 400 });
      }
      if (completedTurn?.isCompleted) break;
      await completePlayerTurn(id, game.turnNumber, gamePlayer.id);
      break;
    }
  }

  return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Action error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

type RecruitStock = Record<string, number>;

function normalizeRecruitStock(value: unknown): RecruitStock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([unitType, count]) => [
      unitType,
      Math.max(0, Math.floor(Number(count) || 0)),
    ])
  );
}

function addImmediateDwellingGrowth(stock: RecruitStock, building: BuildingType): RecruitStock {
  const rule = UNIT_RULES.find((item) => item.dwelling === building);
  if (!rule) return stock;
  return {
    ...stock,
    [rule.type]: (stock[rule.type] ?? 0) + rule.growth,
  };
}

function addWeeklyGrowth(stock: RecruitStock, buildings: string[]): RecruitStock {
  const nextStock = { ...stock };
  for (const rule of UNIT_RULES) {
    if (!buildings.includes(rule.dwelling)) continue;
    nextStock[rule.type] = (nextStock[rule.type] ?? 0) + rule.growth;
  }
  return nextStock;
}

async function completePlayerTurn(gameId: string, turnNumber: number, gamePlayerId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.turn.upsert({
      where: {
        gameId_gamePlayerId_turnNumber: {
          gameId,
          gamePlayerId,
          turnNumber,
        },
      },
      create: {
        gameId,
        gamePlayerId,
        turnNumber,
        actions: [],
        isCompleted: true,
      },
      update: { isCompleted: true },
    });

    const players = await tx.gamePlayer.findMany({
      where: { gameId, isAlive: true },
      orderBy: { turnOrder: "asc" },
      include: { towns: true },
    });
    if (players.length === 0) return;

    const completedTurns = await tx.turn.count({
      where: {
        gameId,
        turnNumber,
        isCompleted: true,
        gamePlayerId: { in: players.map((player) => player.id) },
      },
    });
    if (completedTurns < players.length) return;

    const nextTurnNumber = turnNumber + 1;
    const startsNewWeek = (nextTurnNumber - 1) % 7 === 0;

    for (const player of players) {
      let goldIncome = 500;
      let woodIncome = 2;
      let oreIncome = 1;
      for (const town of player.towns) {
        const buildings = town.buildings as string[];
        goldIncome += 500;
        if (buildings.includes("resource_silo")) goldIncome += 500;
        woodIncome += 2;
        oreIncome += 1;

        if (startsNewWeek) {
          await tx.town.update({
            where: { id: town.id },
            data: {
              availableRecruits: addWeeklyGrowth(
                normalizeRecruitStock(town.availableRecruits),
                buildings
              ),
            },
          });
        }
      }

      await tx.gamePlayer.update({
        where: { id: player.id },
        data: {
          gold: { increment: goldIncome },
          wood: { increment: woodIncome },
          ore: { increment: oreIncome },
        },
      });

      await tx.hero.updateMany({
        where: { gamePlayerId: player.id },
        data: { movement: 10 },
      });
    }

    await tx.game.update({
      where: { id: gameId },
      data: {
        turnNumber: nextTurnNumber,
        currentTurnPlayerId: players[0]?.id ?? null,
      },
    });
  });
}

function validateMovePath(
  map: GameMap,
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
  movement: number
): { ok: true; usedMovement: number } | { ok: false; error: string } {
  if (!Array.isArray(path) || path.length < 2) {
    return { ok: false, error: "Chemin invalide" };
  }

  if (path[0]?.x !== start.x || path[0]?.y !== start.y) {
    return { ok: false, error: "Le chemin ne commence pas sur le héros" };
  }

  let usedMovement = 0;
  for (let i = 1; i < path.length; i++) {
    const previous = path[i - 1];
    const current = path[i];
    if (Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y) !== 1) {
      return { ok: false, error: "Chemin invalide" };
    }

    const tile = map.tiles[current.y]?.[current.x];
    if (!tile || !tile.isPassable) {
      return { ok: false, error: "Terrain infranchissable" };
    }

    usedMovement += tile.movementCost;
  }

  if (usedMovement > movement) {
    return { ok: false, error: "Déplacement insuffisant" };
  }

  return { ok: true, usedMovement };
}

async function refreshEliminationsAndGameStatus(
  tx: Prisma.TransactionClient,
  gameId: string,
  currentTurnPlayerId: string | null
) {
  const players = await tx.gamePlayer.findMany({
    where: { gameId },
    orderBy: { turnOrder: "asc" },
    include: {
      _count: { select: { heroes: true, towns: true } },
    },
  });

  const alivePlayers = players.filter(
    (player) => player._count.heroes > 0 && player._count.towns > 0
  );

  for (const player of players) {
    const isAlive = alivePlayers.some((alivePlayer) => alivePlayer.id === player.id);
    if (player.isAlive === isAlive) continue;
    await tx.gamePlayer.update({
      where: { id: player.id },
      data: { isAlive },
    });
  }

  if (alivePlayers.length <= 1) {
    await tx.game.update({
      where: { id: gameId },
      data: {
        status: "COMPLETED",
        winnerId: alivePlayers[0]?.id ?? null,
        currentTurnPlayerId: null,
      },
    });
    return;
  }

  if (alivePlayers.some((player) => player.id === currentTurnPlayerId)) return;

  const currentPlayer = players.find((player) => player.id === currentTurnPlayerId);
  const nextPlayer =
    alivePlayers.find((player) => player.turnOrder > (currentPlayer?.turnOrder ?? -1)) ??
    alivePlayers[0];

  await tx.game.update({
    where: { id: gameId },
    data: { currentTurnPlayerId: nextPlayer.id },
  });
}
