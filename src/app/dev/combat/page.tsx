"use client";

import { useEffect, useState } from "react";
import CombatScreen from "@/components/game/combat/CombatScreen";
import { AuthContext } from "@/lib/auth/client";
import { buildCombatEnvironment } from "@/lib/game/combat/environment";
import { COMBAT_BASE_ROWS, COMBAT_COLS } from "@/lib/game/combat/movement";
import { buildTurnQueue } from "@/lib/game/combat/persistent";
import { createCastleSiegeState, filterSiegeTerrain } from "@/lib/game/combat/siege";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  CombatBoardUnit,
  Faction,
  GameState,
  HeroClass,
  MapTile,
  PersistentCombat,
  ResourceBuildingType,
  TerrainType,
  UnitType,
} from "@/lib/game/types";

const MOCK_USER_ID = "dev-user";
type CombatPreviewScenario = "hero" | "mine" | "town" | "adventure";
type CombatPreviewPhase = "start" | "tactics" | "mid" | "end" | "death" | "truce" | "truceAcked";

const COMBAT_PREVIEW_SCENARIOS: Array<{ id: CombatPreviewScenario; label: string }> = [
  { id: "hero", label: "Héros" },
  { id: "mine", label: "Mine" },
  { id: "town", label: "Chateau" },
  { id: "adventure", label: "Bâtiment" },
];
const COMBAT_PREVIEW_PHASES: Array<{ id: CombatPreviewPhase; label: string }> = [
  { id: "start", label: "Debut" },
  { id: "tactics", label: "Tactique" },
  { id: "mid", label: "Milieu" },
  { id: "end", label: "Fin" },
  { id: "death", label: "Mort" },
  { id: "truce", label: "Trêve" },
  { id: "truceAcked", label: "Trêve OK" },
];

function buildUnit(params: Partial<CombatBoardUnit> & Pick<CombatBoardUnit, "id" | "unitType" | "count" | "side" | "q" | "r">): CombatBoardUnit {
  return {
    health: params.count * 10,
    maxHealth: 10,
    position: 0,
    ownerPlayerId: params.side === "attacker" ? "p1" : "p2",
    heroId: params.side === "attacker" ? "h1" : "h2",
    participantId: null,
    joinsRound: 1,
    speed: 6,
    minDamage: 2,
    maxDamage: 5,
    ranged: false,
    shots: 0,
    hasRetaliated: false,
    defended: false,
    waited: false,
    morale: 0,
    moraleApplied: false,
    moraleBonus: false,
    luck: 0,
    luckTriggered: false,
    ...params,
  };
}

function buildMockState(scenario: CombatPreviewScenario, phase: CombatPreviewPhase): { gameState: GameState; combat: PersistentCombat } {
  const tiles: MapTile[][] = Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => ({
      x,
      y,
      terrain: TerrainType.GRASS,
      elevation: 0,
      isPassable: true,
      movementCost: 1,
    }))
  );

  if (scenario === "mine") {
    tiles[4][4].object = {
      type: "building",
      id: "gold-mine-preview",
      subtype: ResourceBuildingType.GOLD_MINE,
      guardianPower: 120,
    };
  } else if (scenario === "town") {
    tiles[4][4].object = {
      type: "town",
      id: "neutral-town-preview",
      subtype: Faction.CASTLE,
      name: "Chateau neutre",
    };
  } else if (scenario === "adventure") {
    tiles[4][4].object = {
      type: "adventure_building",
      id: "dragon-utopia-preview",
      subtype: "dragon_utopia",
      name: "Utopie des dragons",
      guardianPower: 280,
    };
  }

  const gameState: GameState = {
    id: "dev-combat-game",
    status: "ACTIVE",
    maxPlayers: 2,
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
    map: { width: 12, height: 12, tiles },
    players: [
      {
        id: "p1",
        userId: MOCK_USER_ID,
        name: "Joueur bleu",
        isAi: false,
        faction: Faction.CASTLE,
        color: "#2563eb",
        resources: { gold: 0, wood: 0, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0 },
        heroes: [{
          id: "h1",
          name: "Astral",
          class: HeroClass.WIZARD,
          level: 6,
          experience: 2500,
          stats: { attack: 1, defense: 1, spellPower: 5, knowledge: 4, morale: 0, luck: 0 },
          mana: 40,
          hasSpellBook: true,
          knownSpellIds: ["magic_arrow"],
          artifacts: { inventory: [], equipment: {} },
          position: { x: 4, y: 4 },
          movement: 1800,
          maxMovement: 1800,
          armies: [],
        }],
        towns: [],
        resourceBuildings: [],
        isAlive: true,
        turnOrder: 0,
        exploredTiles: [],
        hasEndedTurn: false,
      },
      {
        id: "p2",
        userId: "other-user",
        name: "Joueur rouge",
        isAi: false,
        faction: Faction.INFERNO,
        color: "#dc2626",
        resources: { gold: 0, wood: 0, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0 },
        heroes: [{
          id: "h2",
          name: "Pyra",
          class: HeroClass.HERETIC,
          level: 4,
          experience: 1200,
          stats: { attack: 1, defense: 1, spellPower: 3, knowledge: 3, morale: 0, luck: 0 },
          mana: 30,
          hasSpellBook: true,
          knownSpellIds: ["magic_arrow"],
          artifacts: { inventory: [], equipment: {} },
          position: { x: 4, y: 4 },
          movement: 1800,
          maxMovement: 1800,
          armies: [],
        }],
        towns: [],
        resourceBuildings: [],
        isAlive: true,
        turnOrder: 1,
        exploredTiles: [],
        hasEndedTurn: false,
      },
    ],
  };

  const attackerTypes = [
    UnitType.PIKEMAN, UnitType.ARCHER, UnitType.GRIFFIN, UnitType.SWORDSMAN, UnitType.MONK,
    UnitType.CAVALIER, UnitType.CENTAUR, UnitType.WOOD_ELF, UnitType.DWARF, UnitType.GREMLIN,
    UnitType.GARGOYLE, UnitType.GOLEM, UnitType.IMP, UnitType.GOG, UnitType.SKELETON,
    UnitType.WALKING_DEAD, UnitType.TROGLODYTE, UnitType.HARPY, UnitType.BEHOLDER, UnitType.MEDUSA,
  ];
  const defenderTypes = [
    UnitType.DEMON, UnitType.GOG, UnitType.EFREET, UnitType.PIT_FIEND, UnitType.DEVIL,
    UnitType.ORC, UnitType.WOLF_RIDER, UnitType.OGRE, UnitType.ROC, UnitType.CYCLOPS,
    UnitType.LIZARDMAN, UnitType.SERPENT_FLY, UnitType.BASILISK, UnitType.WYVERN, UnitType.GNOLL,
    UnitType.TROGLODYTE, UnitType.HARPY, UnitType.BEHOLDER, UnitType.MINOTAUR, UnitType.MANTICORE,
  ];
  const units = [
    ...attackerTypes.map((unitType, index) => buildUnit({
      id: `atk-${index}`,
      unitType,
      count: 12 + index * 3,
      side: "attacker" as const,
      q: index < COMBAT_BASE_ROWS ? 1 : 0,
      r: index % COMBAT_BASE_ROWS,
      ranged: [UnitType.ARCHER, UnitType.MONK, UnitType.WOOD_ELF, UnitType.GREMLIN, UnitType.GOG, UnitType.BEHOLDER, UnitType.MEDUSA].includes(unitType),
      shots: 12,
      speed: 4 + (index % 5),
    })),
    ...defenderTypes.map((unitType, index) => buildUnit({
      id: `def-${index}`,
      unitType,
      count: 10 + index * 2,
      side: "defender" as const,
      q: index < COMBAT_BASE_ROWS ? COMBAT_COLS - 2 : COMBAT_COLS - 1,
      r: index % COMBAT_BASE_ROWS,
      ranged: [UnitType.GOG, UnitType.ORC, UnitType.CYCLOPS, UnitType.LIZARDMAN, UnitType.BEHOLDER, UnitType.MEDUSA].includes(unitType),
      shots: 12,
      speed: 4 + (index % 6),
    })),
  ];
  const scenarioUnits = scenario === "hero"
    ? units
    : units.map((unit) => unit.side === "defender" ? { ...unit, ownerPlayerId: null, heroId: null } : unit);
  const combatUnits = (phase === "death"
    ? scenarioUnits.map((unit) => unit.id === "def-1" ? { ...unit, count: 0, health: 0 } : unit)
    : scenarioUnits
  ).map((unit) => (unit.id === "atk-1" ? { ...unit, luckTriggered: true } : unit));
  const fullTurnQueue = buildTurnQueue(combatUnits, 1);
  const phaseTurnQueue = getPhaseTurnQueue(fullTurnQueue, phase);
  const currentUnitId = phase === "tactics" ? null : phaseTurnQueue[0] ?? fullTurnQueue[0] ?? null;
  const currentPlayerId = combatUnits.find((unit) => unit.id === currentUnitId)?.ownerPlayerId ?? null;

  const isSiege = scenario === "town";
  const siegeFortifications = isSiege
    ? createCastleSiegeState({ towerCount: 3, towerDamage: 30 })
    : undefined;
  if (siegeFortifications) {
    siegeFortifications.walls = siegeFortifications.walls.map((wall) => ({ ...wall, hp: 2 as const }));
    siegeFortifications.gate = { ...siegeFortifications.gate, hp: 2 };
    siegeFortifications.towers = siegeFortifications.towers.map((tower, index) => ({ ...tower, hp: ([2, 1, 2] as const)[index] }));
  }
  const terrain = filterSiegeTerrain([
    { type: "rock" as const, q: 5, r: 2 },
    { type: "rock" as const, q: 7, r: 6 },
    { type: "water" as const, q: 5, r: 5 },
    { type: "water" as const, q: 6, r: 5 },
  ], siegeFortifications);

  const combat: PersistentCombat = {
    id: "dev-combat",
    gameId: gameState.id,
    mode: "MANUAL",
    status: "ACTIVE",
    attackerPlayerId: "p1",
    defenderPlayerId: scenario === "hero" ? "p2" : null,
    attackerHeroId: "h1",
    defenderHeroId: scenario === "hero" ? "h2" : null,
    neutralArmyId: null,
    currentPlayerId,
    currentUnitId,
    round: 1,
    position: { x: 4, y: 4 },
    boardState: {
      units: combatUnits,
      environment: buildCombatEnvironment(gameState.map, { x: 4, y: 4 }),
      terrain,
      ...(siegeFortifications ? { siege: siegeFortifications } : {}),
      ...(phase === "tactics" ? { tacticsPhase: { side: "attacker" as const, maxColumn: 4 } } : {}),
    },
    turnQueue: phaseTurnQueue,
    actionLog: phase === "tactics" ? ["Phase de tactique."] : ["Combat lance."],
    participants: [],
    truces: phase === "truce" || phase === "truceAcked"
      ? [{
          id: "dev-truce",
          combatId: "dev-combat",
          requestedByPlayerId: "p1",
          requestedByHeroId: "h1",
          side: "attacker",
          pauseUntilTurn: 2,
          acknowledgedPlayerIds: phase === "truceAcked" ? ["p1"] : [],
          status: "ACTIVE",
        }]
      : [],
    result: null,
  };

  return { gameState: { ...gameState, activeCombats: [combat] }, combat };
}

function getPhaseTurnQueue(fullTurnQueue: string[], phase: CombatPreviewPhase) {
  if (phase === "mid") return fullTurnQueue.slice(Math.min(2, fullTurnQueue.length));
  if (phase === "end") return fullTurnQueue.slice(-1);
  if (phase === "death") return fullTurnQueue.slice(Math.min(2, fullTurnQueue.length));
  if (phase === "truce" || phase === "truceAcked") return fullTurnQueue;
  return fullTurnQueue;
}

const mockAuthValue = {
  data: { user: { id: MOCK_USER_ID, email: "dev@local", name: "Dev" } },
  status: "authenticated" as const,
  user: null,
};

export default function DevCombatPage() {
  const [scenario, setScenario] = useState<CombatPreviewScenario>("hero");
  const [phase, setPhase] = useState<CombatPreviewPhase>("mid");

  useEffect(() => {
    const { gameState, combat } = buildMockState(scenario, phase);
    useGameStore.getState().setGameState(gameState);
    useGameStore.getState().setActiveCombat(combat);
  }, [phase, scenario]);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <div className="game-shell relative bg-stone-950">
        <div className="desktop-only absolute bottom-4 left-4 z-50 space-y-2 rounded-md border border-amber-600/40 bg-black/70 p-2 shadow-xl">
          <div className="flex gap-2">
            {COMBAT_PREVIEW_SCENARIOS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded-md border px-3 py-1 text-xs font-black text-amber-100 transition ${
                  scenario === item.id
                    ? "border-amber-300 bg-amber-800/80"
                    : "border-amber-700/50 bg-stone-900/80 hover:border-amber-400"
                }`}
                onClick={() => setScenario(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {COMBAT_PREVIEW_PHASES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded-md border px-3 py-1 text-xs font-black text-amber-100 transition ${
                  phase === item.id
                    ? "border-sky-300 bg-sky-900/80"
                    : "border-sky-700/50 bg-stone-900/80 hover:border-sky-400"
                }`}
                onClick={() => setPhase(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <CombatScreen />
      </div>
    </AuthContext.Provider>
  );
}
