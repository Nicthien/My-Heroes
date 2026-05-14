"use client";

import { useEffect } from "react";
import CombatScreen from "@/components/game/combat/CombatScreen";
import { AuthContext } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";
import { CombatBoardUnit, Faction, GameState, PersistentCombat, TerrainType, UnitType } from "@/lib/game/types";

const MOCK_USER_ID = "dev-user";

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
    ...params,
  };
}

function buildMockState(): { gameState: GameState; combat: PersistentCombat } {
  const tiles = Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => ({
      x,
      y,
      terrain: TerrainType.GRASS,
      elevation: 0,
      isPassable: true,
      movementCost: 1,
    }))
  );

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
        faction: Faction.CASTLE,
        color: "#2563eb",
        resources: { gold: 0, wood: 0, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0 },
        heroes: [],
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
        faction: Faction.INFERNO,
        color: "#dc2626",
        resources: { gold: 0, wood: 0, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0 },
        heroes: [],
        towns: [],
        resourceBuildings: [],
        isAlive: true,
        turnOrder: 1,
        exploredTiles: [],
        hasEndedTurn: false,
      },
    ],
  };

  const units = [
    buildUnit({ id: "u1", unitType: UnitType.PIKEMAN, count: 28, side: "attacker", q: 1, r: 1, speed: 4 }),
    buildUnit({ id: "u2", unitType: UnitType.ARCHER, count: 18, side: "attacker", q: 2, r: 3, ranged: true, shots: 12, speed: 4 }),
    buildUnit({ id: "u3", unitType: UnitType.GRIFFIN, count: 6, side: "attacker", q: 1, r: 6, speed: 6, maxHealth: 25, health: 150 }),
    buildUnit({ id: "u4", unitType: UnitType.CAVALIER, count: 4, side: "attacker", q: 4, r: 5, speed: 7, maxHealth: 100, health: 400 }),
    buildUnit({ id: "u5", unitType: UnitType.DEMON, count: 22, side: "defender", q: 11, r: 2, speed: 5, maxHealth: 35, health: 770 }),
    buildUnit({ id: "u6", unitType: UnitType.GOG, count: 16, side: "defender", q: 10, r: 4, ranged: true, shots: 12, speed: 4 }),
    buildUnit({ id: "u7", unitType: UnitType.EFREET, count: 3, side: "defender", q: 11, r: 7, speed: 9, maxHealth: 90, health: 270 }),
  ];

  const combat: PersistentCombat = {
    id: "dev-combat",
    gameId: gameState.id,
    mode: "MANUAL",
    status: "ACTIVE",
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    attackerHeroId: "h1",
    defenderHeroId: "h2",
    neutralArmyId: null,
    currentPlayerId: "p1",
    currentUnitId: "u3",
    round: 1,
    position: { x: 4, y: 4 },
    boardState: {
      units,
      terrain: [
        { type: "rock", q: 5, r: 2 },
        { type: "rock", q: 7, r: 6 },
        { type: "water", q: 5, r: 5 },
        { type: "water", q: 6, r: 5 },
      ],
    },
    turnQueue: units.map((unit) => unit.id),
    actionLog: ["Combat lance."],
    participants: [],
    result: null,
  };

  return { gameState: { ...gameState, activeCombats: [combat] }, combat };
}

const mockAuthValue = {
  data: { user: { id: MOCK_USER_ID, email: "dev@local", name: "Dev" } },
  status: "authenticated" as const,
  user: null,
};

export default function DevCombatPage() {
  useEffect(() => {
    const { gameState, combat } = buildMockState();
    useGameStore.getState().setGameState(gameState);
    useGameStore.getState().setActiveCombat(combat);
  }, []);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <div className="relative h-screen w-screen overflow-hidden bg-stone-950">
        <CombatScreen />
      </div>
    </AuthContext.Provider>
  );
}
