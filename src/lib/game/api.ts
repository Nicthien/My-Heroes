import {
  GameState, Faction, HeroClass, UnitType, BuildingType,
  Hero, Town, Player, GameMap, MapTile,
} from "./types";

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
}

export function mapApiToGameState(data: Record<string, unknown>, currentUserId?: string): GameState {
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
    })),
    isAlive: p.isAlive,
    turnOrder: p.turnOrder,
    exploredTiles: p.exploredTiles ?? [],
  }));

  const mapData = data.mapData as GameMap;
  const mapState = (data.mapState as Record<string, unknown>) ?? {};
  const collected = new Set<string>((mapState.collected as string[]) ?? []);
  const killed = new Set<string>((mapState.killed as string[]) ?? []);

  const exploredSet = new Set(currentPlayer?.exploredTiles ?? []);
  if (mapData?.tiles) {
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y]?.[x] as MapTile | undefined;
        if (!tile) continue;
        if (tile.object) {
          const obj = tile.object;
          if (obj.type === "resource" && collected.has(obj.id)) {
            delete tile.object;
          } else if (obj.type === "monster" && killed.has(obj.id)) {
            delete tile.object;
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
    players,
    map: mapData,
    turnNumber: data.turnNumber as number,
    currentTurnPlayerId: (data.currentTurnPlayerId as string) || "",
    winnerId: data.winnerId as string | undefined,
  };
}
