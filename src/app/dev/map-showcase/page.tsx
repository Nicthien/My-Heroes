"use client";

import { useEffect } from "react";
import GameMapComponent from "@/components/game/map/GameMap";
import { AuthContext } from "@/lib/auth/client";
import { applyWorldEdge } from "@/lib/game/engine/world-edge";
import { EXTERNAL_DWELLING_TYPE, getExternalDwellingLabel } from "@/lib/game/external-dwellings";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  AdventureBuildingType,
  BuildingType,
  type DecorKind,
  Faction,
  type Gate,
  type GameMap,
  type GameState,
  HeroClass,
  type MapObject,
  type MapTile,
  ResourceBuildingType,
  type RoadType,
  TerrainType,
  UnitType,
} from "@/lib/game/types";

const MOCK_USER_ID = "dev-map-user";
const WIDTH = 30;
const HEIGHT = 28;
const RESOURCE_BUILDING_Y = 23;
const RESOURCE_PICKUP_Y = 25;
const NEUTRAL_GATE_POSITION = { x: 21, y: 25 };
const OWNED_GATE_POSITION = { x: 27, y: 23 };

const TERRAIN_GALLERY = [
  TerrainType.GRASS,
  TerrainType.FOREST,
  TerrainType.DIRT,
  TerrainType.SAND,
  TerrainType.SNOW,
  TerrainType.SWAMP,
  TerrainType.MOUNTAIN,
  TerrainType.LAVA,
] as const;

const DECOR_VARIANTS: Array<DecorKind | null> = [
  null,
  "grass-tuft",
  "flower",
  "rock-small",
  "bush",
  "tree-oak",
  "tree-pine",
  "tree-dead",
];

const RESOURCE_BUILDINGS = [
  ResourceBuildingType.GOLD_MINE,
  ResourceBuildingType.SAWMILL,
  ResourceBuildingType.ORE_PIT,
  ResourceBuildingType.ALCHEMIST_LAB,
  ResourceBuildingType.CRYSTAL_CAVERN,
  ResourceBuildingType.GEM_POND,
  ResourceBuildingType.SULFUR_DUNE,
] as const;

const RESOURCES = ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"] as const;

const mockAuthValue = {
  data: { user: { id: MOCK_USER_ID, email: "dev-map@local", name: "Map Showcase" } },
  status: "authenticated" as const,
  user: null,
};

export default function DevMapShowcasePage() {
  useEffect(() => {
    const store = useGameStore.getState();
    store.setGameState(buildShowcaseState());
    store.setDevRevealMap(true);
    store.selectHero("showcase-hero-castle");
    store.focusTile(23, 23);

    return () => useGameStore.getState().resetGame();
  }, []);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <main className="relative h-screen w-screen overflow-hidden bg-[#11140f] text-stone-100">
        <GameMapComponent />
        <div className="pointer-events-none absolute left-4 top-4 border border-stone-700/70 bg-black/55 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 shadow-lg">
          Carte de test visuelle
        </div>
      </main>
    </AuthContext.Provider>
  );
}

function buildShowcaseState(): GameState {
  const map = buildShowcaseMap();
  const gates = buildShowcaseGates();
  const townPositions = [
    { id: "town-castle", faction: Faction.CASTLE, x: 17, y: 3, name: "Castle" },
    { id: "town-rampart", faction: Faction.RAMPART, x: 21, y: 3, name: "Rampart" },
    { id: "town-tower", faction: Faction.TOWER, x: 25, y: 3, name: "Tower" },
    { id: "town-inferno", faction: Faction.INFERNO, x: 17, y: 7, name: "Inferno" },
    { id: "town-necropolis", faction: Faction.NECROPOLIS, x: 21, y: 7, name: "Necropolis" },
    { id: "town-dungeon", faction: Faction.DUNGEON, x: 25, y: 7, name: "Dungeon" },
    { id: "town-stronghold", faction: Faction.STRONGHOLD, x: 17, y: 11, name: "Stronghold" },
    { id: "town-fortress", faction: Faction.FORTRESS, x: 21, y: 11, name: "Fortress" },
    { id: "town-conflux", faction: Faction.CONFLUX, x: 25, y: 11, name: "Conflux" },
  ];

  for (const town of townPositions) {
    placeObject(map, town.x, town.y, {
      type: "town",
      id: town.id,
      subtype: town.faction,
      name: town.name,
    }, false);
  }

  const allTiles = map.tiles.flat().map((tile) => `${tile.x},${tile.y}`);

  return {
    id: "dev-map-showcase",
    status: "ACTIVE",
    maxPlayers: 3,
    turnNumber: 12,
    calendar: {
      dayNumber: 12,
      dayOfWeek: 5,
      weekNumber: 2,
      weekOfMonth: 2,
      monthNumber: 1,
      monthOfYear: 1,
      yearNumber: 1,
    },
    currentTurnPlayerId: "p1",
    map,
    activeCombats: [
      {
        id: "showcase-combat",
        gameId: "dev-map-showcase",
        mode: "AUTO",
        status: "ACTIVE",
        attackerPlayerId: "p1",
        attackerHeroId: "showcase-hero-castle",
        currentPlayerId: "p1",
        round: 1,
        position: { x: 24, y: 23 },
        boardState: { units: [] },
        turnQueue: [],
        actionLog: [],
      },
    ],
    players: [
      {
        id: "p1",
        userId: MOCK_USER_ID,
        name: "Dev",
        isAi: false,
        faction: Faction.CASTLE,
        color: "#3b82f6",
        resources: { gold: 22000, wood: 34, ore: 31, mercury: 12, crystals: 11, gems: 15, sulfur: 9 },
        heroes: [
          buildHero("showcase-hero-castle", "Catherine", HeroClass.KNIGHT, { x: 14, y: 11 }, UnitType.CHAMPION, 14, 22),
          buildHero("showcase-hero-boat", "Marina", HeroClass.RANGER, { x: 11, y: 11 }, UnitType.CORSAIR, 18, 22),
          buildHero("showcase-hero-town", "Roland", HeroClass.CLERIC, { x: 17, y: 3 }, UnitType.MONK, 6, 22),
        ],
        towns: townPositions.slice(0, 3).map((town) => buildTown(town.id, town.name, town.faction, town.x, town.y)),
        resourceBuildings: [
          { id: "rb-gold_mine", type: ResourceBuildingType.GOLD_MINE, position: getResourceBuildingPosition(0), ownerId: "p1", guardianPower: 0 },
          { id: "rb-sawmill", type: ResourceBuildingType.SAWMILL, position: getResourceBuildingPosition(1), ownerId: "p1", guardianPower: 0 },
          { id: "rb-ore_pit", type: ResourceBuildingType.ORE_PIT, position: getResourceBuildingPosition(2), ownerId: "p1", guardianPower: 0 },
        ],
        isAlive: true,
        turnOrder: 0,
        exploredTiles: allTiles,
        hasEndedTurn: false,
      },
      {
        id: "p2",
        userId: "ai-red",
        name: "Red",
        isAi: true,
        faction: Faction.INFERNO,
        color: "#ef4444",
        resources: { gold: 8000, wood: 10, ore: 10, mercury: 5, crystals: 5, gems: 5, sulfur: 5 },
        heroes: [
          buildHero("showcase-hero-inferno", "Xyron", HeroClass.HERETIC, { x: 19, y: 9 }, UnitType.EFREET, 20, 20),
        ],
        towns: townPositions.slice(3, 6).map((town) => buildTown(town.id, town.name, town.faction, town.x, town.y)),
        resourceBuildings: [
          { id: "rb-alchemist_lab", type: ResourceBuildingType.ALCHEMIST_LAB, position: getResourceBuildingPosition(3), ownerId: "p2", guardianPower: 0 },
          { id: "rb-crystal_cavern", type: ResourceBuildingType.CRYSTAL_CAVERN, position: getResourceBuildingPosition(4), ownerId: "p2", guardianPower: 0 },
        ],
        isAlive: true,
        turnOrder: 1,
        exploredTiles: allTiles,
        hasEndedTurn: false,
      },
      {
        id: "p3",
        userId: "ai-green",
        name: "Green",
        isAi: true,
        faction: Faction.STRONGHOLD,
        color: "#22c55e",
        resources: { gold: 9000, wood: 12, ore: 12, mercury: 5, crystals: 5, gems: 5, sulfur: 5 },
        heroes: [],
        towns: townPositions.slice(6).map((town) => buildTown(town.id, town.name, town.faction, town.x, town.y)),
        resourceBuildings: [
          { id: "rb-gem_pond", type: ResourceBuildingType.GEM_POND, position: getResourceBuildingPosition(5), ownerId: "p3", guardianPower: 0 },
          { id: "rb-sulfur_dune", type: ResourceBuildingType.SULFUR_DUNE, position: getResourceBuildingPosition(6), ownerId: "p3", guardianPower: 0 },
        ],
        isAlive: true,
        turnOrder: 2,
        exploredTiles: allTiles,
        hasEndedTurn: false,
      },
    ],
    neutralArmies: [],
    gates,
  };
}

function buildShowcaseMap(): GameMap {
  const tiles = Array.from({ length: HEIGHT }, (_, y) =>
    Array.from({ length: WIDTH }, (_, x) => makeTile(x, y, TerrainType.GRASS, y > 13 ? 1 : 0))
  );
  const map: GameMap = { width: WIDTH, height: HEIGHT, tiles, seed: "SHOWCASE", templateId: "visual-showcase" };

  for (let row = 0; row < TERRAIN_GALLERY.length; row++) {
    const terrain = TERRAIN_GALLERY[row];
    for (let column = 0; column < DECOR_VARIANTS.length; column++) {
      const x = column + 1;
      const y = row + 1;
      const tile = map.tiles[y][x];
      tile.terrain = terrain;
      tile.elevation = terrain === TerrainType.MOUNTAIN ? 2 : row % 3 === 0 ? 1 : 0;
      tile.movementCost = terrain === TerrainType.SWAMP ? 2 : 1;
      tile.isPassable = true;
      const decor = DECOR_VARIANTS[column];
      if (decor) tile.decor = { type: decor, blocking: false, variant: column };
    }
  }

  paintArea(map, 10, 11, 12, 11, TerrainType.WATER, 0, false);
  paintArea(map, 10, 12, 15, 16, TerrainType.WATER, 0, false);
  paintArea(map, 18, 20, 20, 21, TerrainType.WATER, 0, false);
  paintArea(map, 1, 18, 8, 20, TerrainType.SAND, 0, true);
  paintArea(map, 10, 18, 15, 20, TerrainType.SWAMP, 0, true);
  paintArea(map, 18, 16, 27, 19, TerrainType.FOREST, 1, true);
  paintArea(map, 22, 14, 28, 15, TerrainType.SNOW, 1, true);
  paintArea(map, 10, 1, 14, 4, TerrainType.MOUNTAIN, 2, true);
  paintArea(map, 10, 5, 14, 8, TerrainType.LAVA, 1, true);
  paintArea(map, 11, 9, 11, 9, TerrainType.GRASS, 2, true);
  paintArea(map, 12, 10, 12, 10, TerrainType.GRASS, 2, true);
  paintArea(map, 14, 9, 14, 9, TerrainType.GRASS, 2, true);
  paintArea(map, 15, 10, 15, 10, TerrainType.GRASS, 2, true);
  paintArea(map, 29, 3, 29, 7, TerrainType.WATER, 0, false);
  paintArea(map, 29, 10, 29, 12, TerrainType.SNOW, 1, true);
  paintArea(map, 29, 18, 29, 22, TerrainType.WATER, 0, false);
  paintArea(map, 5, 27, 9, 27, TerrainType.SAND, 0, true);
  paintArea(map, 16, 27, 23, 27, TerrainType.WATER, 0, false);
  paintArea(map, 24, 27, 28, 27, TerrainType.SNOW, 1, true);

  drawRoad(map, [
    [2, 13], [3, 13], [4, 13], [5, 13], [6, 13], [7, 13], [8, 13], [9, 13],
    [10, 13], [11, 13], [12, 13], [13, 13], [14, 13], [15, 13], [16, 13],
    [17, 13], [18, 13], [19, 13], [20, 13], [21, 13], [22, 13], [23, 13],
  ], "paved");
  drawRoad(map, [[8, 13], [8, 14], [8, 15], [8, 16], [8, 17], [8, 18]], "gravel");
  drawRoad(map, [[17, 13], [17, 12], [17, 11], [17, 10], [17, 9], [17, 8], [17, 7], [17, 6], [17, 5]], "dirt");
  drawRoad(map, [[21, 13], [21, 12], [21, 11], [21, 10], [21, 9], [21, 8], [21, 7], [21, 6], [21, 5]], "gravel");
  drawRoad(map, [[17, 25], [18, 25], [19, 25], [20, 25], [21, 25], [22, 25], [23, 25], [24, 25], [25, 25]], "paved");
  drawRoad(map, [[27, 20], [27, 21], [27, 22], [27, 23], [27, 24], [27, 25], [27, 26]], "gravel");

  placeObject(map, NEUTRAL_GATE_POSITION.x, NEUTRAL_GATE_POSITION.y, {
    type: "gate",
    id: "showcase-gate-neutral",
    subtype: "brick",
    guardianPower: 900,
  }, true);
  placeObject(map, OWNED_GATE_POSITION.x, OWNED_GATE_POSITION.y, {
    type: "gate",
    id: "showcase-gate-owned",
    subtype: "natural",
    ownerId: "p1",
    guardianPower: 480,
  }, true);

  for (const [index, type] of RESOURCE_BUILDINGS.entries()) {
    const position = getResourceBuildingPosition(index);
    placeObject(map, position.x, position.y, {
      type: "building",
      id: `rb-${type}`,
      subtype: type,
      name: type,
      guardianPower: index >= 5 ? 420 : 0,
    }, false);
  }

  for (const [index, resource] of RESOURCES.entries()) {
    placeObject(map, 2 + index * 2, RESOURCE_PICKUP_Y, {
      type: "resource",
      id: `res-${resource}`,
      subtype: resource,
      amount: resource === "gold" ? 750 : 4,
    }, true);
  }

  const adventureBuildings = [
    [AdventureBuildingType.OBSERVATORY, 17, 17],
    [AdventureBuildingType.CAMPFIRE, 19, 17],
    [AdventureBuildingType.LIGHTHOUSE, 21, 17],
    [AdventureBuildingType.STARGATE, 23, 17],
  ] as const;
  for (const [type, x, y] of adventureBuildings) {
    placeObject(map, x, y, {
      type: "adventure_building",
      id: `adv-${type}`,
      subtype: type,
      name: type,
    }, false);
  }

  const externalDwellings = [
    [UnitType.PIKEMAN, 17, 19],
    [UnitType.WOOD_ELF, 19, 19],
    [UnitType.SERPENT_FLY, 21, 19],
  ] as const;
  for (const [unitType, x, y] of externalDwellings) {
    placeObject(map, x, y, {
      type: "adventure_building",
      id: `adv-external-dwelling-${unitType}`,
      subtype: EXTERNAL_DWELLING_TYPE,
      name: getExternalDwellingLabel(unitType),
      targetId: unitType,
    }, false);
  }

  const monsters = [
    [UnitType.PHOENIX, 11, 3],
    [UnitType.BLACK_DRAGON, 13, 4],
    [UnitType.HYDRA, 11, 7],
    [UnitType.TITAN, 13, 8],
    [UnitType.SEA_SERPENT, 19, 20],
    [UnitType.MAMMOTH, 24, 15],
    [UnitType.CRYSTAL_DRAGON, 27, 15],
  ] as const;
  for (const [unit, x, y] of monsters) {
    placeObject(map, x, y, {
      type: "monster",
      id: `monster-${unit}`,
      subtype: unit,
      name: unit,
      guardianPower: 500,
    }, false);
  }

  placeObject(map, 1, 11, { type: "wall", id: "wall-brick-1", subtype: "brick" }, false);
  placeObject(map, 2, 11, { type: "wall", id: "wall-brick-2", subtype: "brick" }, false);
  placeObject(map, 3, 11, { type: "wall", id: "wall-brick-3", subtype: "brick" }, false);
  placeDecor(map, 4, 10, "grove-pine", true);
  placeDecor(map, 5, 10, "grove-oak", true);
  placeDecor(map, 6, 10, "grove-dead", true);
  placeDecor(map, 7, 10, "boulder-cluster", true);
  placeDecor(map, 24, 18, "tree-oak", false);
  placeDecor(map, 25, 18, "flower", false);
  placeDecor(map, 26, 18, "bush", false);
  placeDecor(map, 27, 18, "grass-tuft", false);

  applyWorldEdge(map.tiles, map.width, map.height, "SHOWCASE");

  return map;
}

function buildShowcaseGates(): Gate[] {
  return [
    {
      id: "showcase-gate-neutral",
      ownerId: null,
      position: NEUTRAL_GATE_POSITION,
      guardianPower: 900,
      garrison: [
        { id: "showcase-gate-neutral-a", unitType: UnitType.SWORDSMAN, count: 20, health: 200, maxHealth: 200, position: 0 },
        { id: "showcase-gate-neutral-b", unitType: UnitType.MONK, count: 8, health: 80, maxHealth: 80, position: 1 },
      ],
    },
    {
      id: "showcase-gate-owned",
      ownerId: "p1",
      position: OWNED_GATE_POSITION,
      guardianPower: 480,
      garrison: [
        { id: "showcase-gate-owned-a", unitType: UnitType.PIKEMAN, count: 28, health: 280, maxHealth: 280, position: 0 },
        { id: "showcase-gate-owned-b", unitType: UnitType.ARCHER, count: 14, health: 140, maxHealth: 140, position: 1 },
      ],
    },
  ];
}

function getResourceBuildingPosition(index: number) {
  return { x: 2 + index * 2, y: RESOURCE_BUILDING_Y };
}

function makeTile(x: number, y: number, terrain: TerrainType, elevation: number): MapTile {
  const isWater = terrain === TerrainType.WATER;
  return {
    x,
    y,
    terrain,
    elevation,
    isPassable: !isWater,
    movementCost: isWater ? 2 : 1,
  };
}

function paintArea(
  map: GameMap,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  terrain: TerrainType,
  elevation: number,
  passable: boolean
) {
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const tile = map.tiles[y]?.[x];
      if (!tile) continue;
      tile.terrain = terrain;
      tile.elevation = elevation;
      tile.isPassable = passable;
      tile.movementCost = terrain === TerrainType.SWAMP ? 2 : 1;
    }
  }
}

function drawRoad(map: GameMap, points: Array<[number, number]>, road: RoadType) {
  for (const [x, y] of points) {
    const tile = map.tiles[y]?.[x];
    if (!tile) continue;
    tile.road = road;
    tile.isPassable = true;
  }
}

function placeObject(map: GameMap, x: number, y: number, object: MapObject, passable: boolean) {
  const tile = map.tiles[y]?.[x];
  if (!tile) return;
  tile.object = object;
  tile.isPassable = passable;
}

function placeDecor(map: GameMap, x: number, y: number, type: DecorKind, blocking: boolean) {
  const tile = map.tiles[y]?.[x];
  if (!tile) return;
  tile.decor = { type, blocking, variant: x + y };
  if (blocking) tile.isPassable = false;
}

function buildHero(
  id: string,
  name: string,
  heroClass: HeroClass,
  position: { x: number; y: number },
  unitType: UnitType,
  movement: number,
  maxMovement: number
) {
  return {
    id,
    name,
    class: heroClass,
    level: 7,
    experience: 4300,
    stats: { attack: 5, defense: 4, spellPower: 2, knowledge: 2, morale: 0 },
    mana: 20,
    hasSpellBook: true,
    knownSpellIds: null,
    position,
    movement,
    maxMovement,
    armies: [
      { id: `${id}-a`, unitType, count: 12, health: 120, maxHealth: 120, position: 0 },
      { id: `${id}-b`, unitType: UnitType.ARCHER, count: 18, health: 180, maxHealth: 180, position: 1 },
    ],
  };
}

function buildTown(id: string, name: string, faction: Faction, x: number, y: number) {
  return {
    id,
    name,
    faction,
    townType: faction,
    position: { x, y },
    level: 3,
    buildings: [BuildingType.VILLAGE_HALL, BuildingType.TAVERN, BuildingType.MARKET, BuildingType.BARRACKS],
    garrison: [],
    availableRecruits: { [UnitType.PIKEMAN]: 16, [UnitType.ARCHER]: 10 },
    lastBuiltTurn: null,
  };
}
