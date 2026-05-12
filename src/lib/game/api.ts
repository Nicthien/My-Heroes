import {
  GameState, Faction, HeroClass, UnitType, BuildingType,
  Hero, Town, Player, GameMap, MapTile, PersistentCombat,
  ResourceBuilding, ResourceBuildingType,
} from "./types";
import { computeVisibleTiles, getPlayerVisionCenters, normalizeMapMovement } from "./engine";

interface ApiPlayer {
  id: string;
  userId: string;
  user?: { name: string | null };
  faction: string;
  color: string;
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  sulfur: number;
  isAlive: boolean;
  turnOrder: number;
  exploredTiles: string[];
  heroes: ApiHero[];
  towns: ApiTown[];
  resourceBuildings?: ApiResourceBuilding[];
}

interface ApiTurn {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
}

interface ApiHero {
  id: string;
  name: string;
  level: number;
  experience: number;
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
  x: number;
  y: number;
  movement: number;
  maxMovement: number;
  armies: ApiArmy[];
}

interface ApiArmy {
  id: string;
  unitType: string;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

interface ApiTown {
  id: string;
  name: string;
  x: number;
  y: number;
  level: number;
  buildings: string[];
  garrison: string[];
  availableRecruits?: Record<string, number>;
  lastBuiltTurn?: number | null;
}

interface ApiResourceBuilding {
  id: string;
  gamePlayerId: string | null;
  buildingType: string;
  x: number;
  y: number;
  guardianPower: number;
}

interface ApiCombat {
  id: string;
  gameId: string;
  mode: "AUTO" | "MANUAL";
  status: "ACTIVE" | "RESOLVED";
  attackerPlayerId: string;
  defenderPlayerId?: string | null;
  attackerHeroId: string;
  defenderHeroId?: string | null;
  neutralArmyId?: string | null;
  currentPlayerId?: string | null;
  currentUnitId?: string | null;
  round: number;
  x: number;
  y: number;
  boardState: PersistentCombat["boardState"];
  turnQueue: string[];
  actionLog: string[];
  participants?: PersistentCombat["participants"];
  result?: PersistentCombat["result"];
}

export function mapApiToGameState(data: Record<string, unknown>, currentUserId?: string): GameState {
  const turnNumber = data.turnNumber as number;
  const completedTurnPlayerIds = new Set(
    ((data.turns as ApiTurn[] | undefined) ?? [])
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );
  const currentPlayer = (data.players as ApiPlayer[]).find(
    (p) => p.userId === currentUserId
  );

  const players = (data.players as ApiPlayer[]).map((p): Player => ({
    id: p.id,
    userId: p.userId,
    name: p.user?.name || "Joueur inconnu",
    faction: p.faction as Faction,
    color: p.color,
    resources: {
      gold: p.gold,
      wood: p.wood,
      ore: p.ore,
      mercury: p.mercury,
      crystals: p.crystals,
      sulfur: p.sulfur,
    },
    heroes: p.heroes.map((h): Hero => ({
      id: h.id,
      name: h.name,
      class: "knight" as HeroClass,
      level: h.level,
      experience: h.experience,
      stats: {
        attack: h.attack,
        defense: h.defense,
        spellPower: h.spellPower,
        knowledge: h.knowledge,
      },
      position: { x: h.x, y: h.y },
      movement: h.movement,
      maxMovement: h.maxMovement,
      armies: h.armies.map((a) => ({
        id: a.id,
        unitType: a.unitType as UnitType,
        count: a.count,
        health: a.health,
        maxHealth: a.maxHealth,
        position: a.position,
      })),
    })),
    towns: p.towns.map((t): Town => ({
      id: t.id,
      name: t.name,
      faction: p.faction as Faction,
      position: { x: t.x, y: t.y },
      level: t.level,
      buildings: (t.buildings || []) as BuildingType[],
      garrison: (t.garrison || []) as never[],
      availableRecruits: (t.availableRecruits ?? {}) as Partial<Record<UnitType, number>>,
      lastBuiltTurn: t.lastBuiltTurn ?? null,
    })),
    resourceBuildings: (p.resourceBuildings ?? []).map((b): ResourceBuilding => ({
      id: b.id,
      type: b.buildingType as ResourceBuildingType,
      position: { x: b.x, y: b.y },
      ownerId: b.gamePlayerId,
      guardianPower: b.guardianPower ?? 0,
    })),
    isAlive: p.isAlive,
    turnOrder: p.turnOrder,
    exploredTiles: p.exploredTiles ?? [],
    hasEndedTurn: completedTurnPlayerIds.has(p.id),
  }));

  const mapData = normalizeMapMovement(data.mapData as GameMap);
  const mapState = (data.mapState as Record<string, unknown>) ?? {};
  const collected = new Set<string>((mapState.collected as string[]) ?? []);
  const killed = new Set<string>((mapState.killed as string[]) ?? []);
  const defeatedNeutralArmies = new Set(
    ((data.neutralArmies as Array<{ id: string; status: string }> | undefined) ?? [])
      .filter((army) => army.status !== "ACTIVE")
      .map((army) => army.id)
  );

  const exploredSet = new Set(currentPlayer?.exploredTiles ?? []);
  if (currentPlayer) {
    const visionCenters = getPlayerVisionCenters({
      heroes: currentPlayer.heroes.map((hero) => ({ position: { x: hero.x, y: hero.y } })),
      towns: currentPlayer.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
    });
    for (const key of computeVisibleTiles(mapData, visionCenters, 5)) {
      exploredSet.add(key);
    }
  }
  const allBuildings = players.flatMap((p) => p.resourceBuildings);

  if (mapData?.tiles) {
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y]?.[x] as MapTile | undefined;
        if (!tile) continue;
        if (tile.object) {
          const obj = tile.object;
          if (obj.type === "resource" && collected.has(obj.id)) {
            delete tile.object;
          } else if (obj.type === "monster" && (killed.has(obj.id) || defeatedNeutralArmies.has(obj.id))) {
            delete tile.object;
          } else if (obj.type === "building") {
            const buildingData = allBuildings.find((b) => b.id === obj.id || (b.position.x === x && b.position.y === y));
            if (buildingData) {
              obj.guardianPower = buildingData.guardianPower;
            }
            if (!exploredSet.has(`${x},${y}`)) {
              delete tile.object;
            }
          } else if (!exploredSet.has(`${x},${y}`)) {
            delete tile.object;
          }
        }
        if (!exploredSet.has(`${x},${y}`)) {
          tile.terrain = "grass" as never;
          tile.elevation = 0;
          tile.isPassable = false;
          tile.movementCost = 999;
        }
      }
    }
  }

  return {
    id: data.id as string,
    status: data.status as GameState["status"],
    maxPlayers: (data.maxPlayers as number) ?? 8,
    players,
    map: mapData,
    turnNumber,
    calendar: getGameCalendar(turnNumber),
    currentTurnPlayerId: (data.currentTurnPlayerId as string) || "",
    winnerId: data.winnerId as string | undefined,
    activeCombats: ((data.combats as ApiCombat[] | undefined) ?? [])
      .filter((combat) => combat.status === "ACTIVE")
      .map((combat) => ({
      id: combat.id,
      gameId: combat.gameId,
      mode: combat.mode,
      status: combat.status,
      attackerPlayerId: combat.attackerPlayerId,
      defenderPlayerId: combat.defenderPlayerId,
      attackerHeroId: combat.attackerHeroId,
      defenderHeroId: combat.defenderHeroId,
      neutralArmyId: combat.neutralArmyId,
      currentPlayerId: combat.currentPlayerId,
      currentUnitId: combat.currentUnitId,
      round: combat.round,
      position: { x: combat.x, y: combat.y },
      boardState: combat.boardState,
      turnQueue: combat.turnQueue,
      actionLog: combat.actionLog,
      participants: combat.participants ?? [],
      result: combat.result,
    })),
  };
}

function getGameCalendar(dayNumber: number) {
  const zeroBasedDay = Math.max(0, dayNumber - 1);
  return {
    dayNumber,
    dayOfWeek: (zeroBasedDay % 7) + 1,
    weekNumber: Math.floor(zeroBasedDay / 7) + 1,
    weekOfMonth: (Math.floor(zeroBasedDay / 7) % 4) + 1,
    monthNumber: Math.floor(zeroBasedDay / 28) + 1,
    monthOfYear: (Math.floor(zeroBasedDay / 28) % 12) + 1,
    yearNumber: Math.floor(zeroBasedDay / 336) + 1,
  };
}
