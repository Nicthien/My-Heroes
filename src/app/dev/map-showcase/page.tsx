"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { DevPerformancePanel, useDevPerformanceStats } from "@/components/game/hud/DevPerformancePanel";
import GameMapComponent from "@/components/game/map/GameMap";
import { AuthContext } from "@/lib/auth/client";
import { generateMap } from "@/lib/game/engine";
import { applyWorldEdge } from "@/lib/game/engine/world-edge";
import { EXTERNAL_DWELLING_TYPE, getExternalDwellingLabel } from "@/lib/game/external-dwellings";
import { SURFACE_LEVEL } from "@/lib/game/map-levels";
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
const WIDTH = 36;
const HEIGHT = 28;
const PERF_MAP_SIZES = {
  S: 36,
  M: 72,
  L: 108,
  XL: 144,
} as const;
type PerfMapSize = keyof typeof PERF_MAP_SIZES;
type PerfFogMode = "revealed" | "partial";
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
  TerrainType.ROUGH,
  TerrainType.SUBTERRANEAN,
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
  return (
    <Suspense fallback={<DevMapShowcaseShell />}>
      <DevMapShowcaseContent />
    </Suspense>
  );
}

function DevMapShowcaseContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const perfSize = parsePerfMapSize(searchParams.get("size"));
  const perfFogMode = parsePerfFogMode(searchParams.get("fog"));
  const night = searchParams.get("night") === "1";
  const devPerformanceStats = useDevPerformanceStats(Boolean(perfSize));
  const modeLabel = perfSize
    ? t("devpage.mapShowcase.perfLabel", {
        size: perfSize,
        dim: PERF_MAP_SIZES[perfSize],
        fog: perfFogMode === "partial" ? t("devpage.mapShowcase.fogPartial") : "",
      })
    : t("devpage.mapShowcase.title");

  useEffect(() => {
    const store = useGameStore.getState();
    const nextState = perfSize ? buildGeneratedPerfState(perfSize, perfFogMode) : buildShowcaseState(night);
    store.setAdminObserverMode(false);
    store.setDevRevealMap(!perfSize || perfFogMode !== "partial");
    store.setActiveCombat(null);
    store.setGameState(nextState);
    store.selectHero(perfSize ? "perf-hero" : "showcase-hero-castle");
    if (perfSize) {
      const hero = nextState.players[0]?.heroes[0];
      store.focusTile(hero?.position.x ?? Math.floor(nextState.map.width / 2), hero?.position.y ?? Math.floor(nextState.map.height / 2));
      if (perfFogMode === "partial") {
        window.setTimeout(() => useGameStore.getState().setDevRevealMap(false), 0);
      }
    } else {
      store.focusTile(23, 23);
    }

    return () => useGameStore.getState().resetGame();
  }, [night, perfFogMode, perfSize]);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <main className="game-shell relative bg-[#11140f] text-stone-100">
        <GameMapComponent />
        <div className="pointer-events-none absolute left-4 top-4 border border-stone-700/70 bg-black/55 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 shadow-lg">
          {modeLabel}
        </div>
        {perfSize && (
          <div className="pointer-events-auto absolute right-4 top-4 z-50 max-h-[calc(100vh-2rem)] w-80 overflow-y-auto rounded-xl border border-amber-500/60 bg-stone-950/95 px-4 pb-4 pt-1 text-amber-100 shadow-2xl shadow-black/70">
            <DevPerformancePanel stats={devPerformanceStats} />
          </div>
        )}
      </main>
    </AuthContext.Provider>
  );
}

function DevMapShowcaseShell() {
  return (
    <main className="game-shell grid place-items-center bg-[#11140f] text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
      Chargement de la carte...
    </main>
  );
}

function parsePerfMapSize(value: string | null): PerfMapSize | null {
  if (value === "S" || value === "M" || value === "L" || value === "XL") return value;
  return null;
}

function parsePerfFogMode(value: string | null): PerfFogMode {
  return value === "partial" ? "partial" : "revealed";
}

function buildShowcaseState(night = false): GameState {
  const map = buildShowcaseMap();
  const gates = buildShowcaseGates();
  const townPositions = [
    { id: "town-castle", faction: Faction.CASTLE, x: 17, y: 3, name: "Couronnes d'Acier" },
    { id: "town-rampart", faction: Faction.RAMPART, x: 21, y: 3, name: "Pacte des Sylves" },
    { id: "town-tower", faction: Faction.TOWER, x: 25, y: 3, name: "Cercle d'Azur" },
    { id: "town-inferno", faction: Faction.INFERNO, x: 17, y: 7, name: "Braises Profanes" },
    { id: "town-necropolis", faction: Faction.NECROPOLIS, x: 21, y: 7, name: "Voile d'Os" },
    { id: "town-dungeon", faction: Faction.DUNGEON, x: 25, y: 7, name: "Royaume Sous-Roche" },
    { id: "town-stronghold", faction: Faction.STRONGHOLD, x: 17, y: 11, name: "Marteaux Rouges" },
    { id: "town-fortress", faction: Faction.FORTRESS, x: 21, y: 11, name: "Serments du Marais" },
    { id: "town-conflux", faction: Faction.CONFLUX, x: 25, y: 11, name: "Orbe Primordial" },
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
        // `?night=1` marks the local player as waiting → GameMap fades the map to night.
        hasEndedTurn: night,
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
          buildHero("showcase-hero-inferno", "Xavrek", HeroClass.HERETIC, { x: 19, y: 9 }, UnitType.EFREET, 20, 20),
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

function buildGeneratedPerfState(size: PerfMapSize, fogMode: PerfFogMode): GameState {
  const dimension = PERF_MAP_SIZES[size];
  const map = generateMap({
    width: dimension,
    height: dimension,
    seed: `PHASER-PERF-${size}`,
    playerCount: 4,
  });
  const heroPosition = findFirstPassableTile(map);
  const townPosition = findNearestPassableTile(map, heroPosition.x + 3, heroPosition.y + 3) ?? heroPosition;
  const exploredTiles = fogMode === "partial"
    ? getExploredPerfTiles(map, heroPosition)
    : map.tiles.flat().map((tile) => `${SURFACE_LEVEL}:${tile.x},${tile.y}`);

  return {
    id: `dev-map-showcase-${size}`,
    status: "ACTIVE",
    maxPlayers: 4,
    turnNumber: 1,
    calendar: {
      dayNumber: 1,
      dayOfWeek: 1,
      weekNumber: 1,
      weekOfMonth: 1,
      monthNumber: 1,
      monthOfYear: 1,
      yearNumber: 1,
    },
    currentTurnPlayerId: "p1",
    map,
    activeCombats: [],
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
          buildHero("perf-hero", "Catherine", HeroClass.KNIGHT, heroPosition, UnitType.CHAMPION, 18, 18),
        ],
        towns: [
          buildTown("perf-town", "Chateau de test", Faction.CASTLE, townPosition.x, townPosition.y),
        ],
        resourceBuildings: [],
        isAlive: true,
        turnOrder: 0,
        exploredTiles,
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
        heroes: [],
        towns: [],
        resourceBuildings: [],
        isAlive: true,
        turnOrder: 1,
        exploredTiles,
        hasEndedTurn: false,
      },
    ],
    neutralArmies: [],
    gates: [],
  };
}

function getExploredPerfTiles(map: GameMap, center: { x: number; y: number }) {
  const radius = Math.max(12, Math.floor(Math.min(map.width, map.height) * 0.18));
  const tiles: string[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const distance = Math.abs(x - center.x) + Math.abs(y - center.y);
      if (distance <= radius) {
        tiles.push(`${SURFACE_LEVEL}:${x},${y}`);
      }
    }
  }

  return tiles;
}

function findFirstPassableTile(map: GameMap) {
  const centerX = Math.floor(map.width / 2);
  const centerY = Math.floor(map.height / 2);
  return findNearestPassableTile(map, centerX, centerY) ?? { x: centerX, y: centerY };
}

function findNearestPassableTile(map: GameMap, startX: number, startY: number) {
  const maxRadius = Math.max(map.width, map.height);
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let y = startY - radius; y <= startY + radius; y++) {
      for (let x = startX - radius; x <= startX + radius; x++) {
        if (Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) continue;
        const tile = map.tiles[y]?.[x];
        if (tile?.isPassable && !tile.object) return { x, y };
      }
    }
  }
  return null;
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
    [AdventureBuildingType.ARENA, 25, 17],
    [AdventureBuildingType.MERCENARY_CAMP, 27, 17],
    [AdventureBuildingType.MARLETTO_TOWER, 29, 17],
    [AdventureBuildingType.STAR_AXIS, 17, 21],
    [AdventureBuildingType.GARDEN_OF_REVELATION, 19, 21],
    [AdventureBuildingType.LEARNING_STONE, 21, 21],
    [AdventureBuildingType.SCHOOL_OF_WAR, 23, 21],
    [AdventureBuildingType.SCHOOL_OF_MAGIC, 25, 21],
    [AdventureBuildingType.LIBRARY_OF_ENLIGHTENMENT, 27, 21],
    [AdventureBuildingType.CARTOGRAPHER, 29, 21],
    [AdventureBuildingType.REDWOOD_OBSERVATORY, 31, 21],
    [AdventureBuildingType.MYSTICAL_GARDEN, 33, 21],
    [AdventureBuildingType.STABLES, 17, 23],
    [AdventureBuildingType.TEMPLE, 19, 23],
    [AdventureBuildingType.FOUNTAIN_OF_FORTUNE, 21, 23],
    [AdventureBuildingType.IDOL_OF_FORTUNE, 23, 23],
    [AdventureBuildingType.MAGIC_WELL, 25, 23],
    [AdventureBuildingType.MAGIC_SHRINE, 27, 23],
    [AdventureBuildingType.WATER_MILL, 29, 23],
    [AdventureBuildingType.WATER_WHEEL, 31, 23],
    [AdventureBuildingType.ABANDONED_WAGON, 33, 23],
    [AdventureBuildingType.CRATE, 17, 25],
    [AdventureBuildingType.SKELETON, 19, 25],
    [AdventureBuildingType.OBELISK, 21, 25],
    [AdventureBuildingType.WARRIOR_TOMB, 23, 25],
    [AdventureBuildingType.CURSED_ALTAR, 25, 25],
    [AdventureBuildingType.SPELL_SHRINE_1, 27, 26],
    [AdventureBuildingType.SPELL_SHRINE_2, 29, 26],
    [AdventureBuildingType.SPELL_SHRINE_3, 31, 26],
    [AdventureBuildingType.TREE_OF_KNOWLEDGE, 33, 26],
    [AdventureBuildingType.SEER_HUT, 17, 26],
    [AdventureBuildingType.MERMAID, 19, 26],
    [AdventureBuildingType.BUOY, 21, 26],
    [AdventureBuildingType.FLOTSAM, 23, 26],
    [AdventureBuildingType.SEA_CHEST, 25, 26],
  ] as const;
  for (const [type, x, y] of adventureBuildings) {
    placeObject(map, x, y, {
      type: "adventure_building",
      id: `adv-${type}`,
      subtype: type,
      name: type,
    }, false);
  }

  const riskyBanks = [
    ["crypt", 27, 25],
    ["ruins", 29, 25],
    ["shipwreck", 31, 25],
    ["bandit_camp", 33, 25],
  ] as const;
  for (const [type, x, y] of riskyBanks) {
    placeObject(map, x, y, {
      type: "adventure_building",
      id: `creature-bank-${type}`,
      subtype: type,
      name: type,
      guardianPower: 1200,
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

  placeObject(map, 1, 11, { type: "wall", id: "rampart-wall-1", subtype: "brick" }, false);
  placeObject(map, 2, 11, { type: "wall", id: "rampart-wall-2", subtype: "brick" }, false);
  placeObject(map, 3, 11, { type: "wall", id: "rampart-wall-3", subtype: "brick" }, false);
  placeDecor(map, 4, 11, "forest-pine-grove", true);
  placeDecor(map, 5, 11, "grass-oak-copse", true);
  placeDecor(map, 6, 11, "deadwood-thicket", true);
  placeDecor(map, 7, 11, "boulder-cluster", true);
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
    stats: { attack: 5, defense: 4, spellPower: 2, knowledge: 2, morale: 0, luck: 0 },
    mana: 20,
    hasSpellBook: true,
    knownSpellIds: null,
    artifacts: { inventory: [], equipment: {} },
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
