"use client";

import { useEffect } from "react";
import HUD from "@/components/game/hud/HUD";
import { AuthContext } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  BuildingType,
  Faction,
  GameState,
  HeroClass,
  ResourceBuildingType,
  TerrainType,
  UnitType,
} from "@/lib/game/types";

const MOCK_USER_ID = "dev-user";

function buildMockState(): GameState {
  const tiles = Array.from({ length: 20 }, (_, y) =>
    Array.from({ length: 20 }, (_, x) => ({
      x,
      y,
      terrain: TerrainType.GRASS,
      elevation: 0,
      isPassable: true,
      movementCost: 1,
    }))
  );

  return {
    id: "dev-game",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 5,
    calendar: {
      dayNumber: 5,
      dayOfWeek: 5,
      weekNumber: 1,
      weekOfMonth: 1,
      monthNumber: 1,
      monthOfYear: 1,
      yearNumber: 1,
    },
    currentTurnPlayerId: "p1",
    activeCombats: [],
    map: { width: 20, height: 20, tiles },
    players: [
      {
        id: "p1",
        userId: MOCK_USER_ID,
        name: "Leon Sticky-Fingers",
        isAi: false,
        faction: Faction.CASTLE,
        color: "#3b82f6",
        resources: { gold: 15000, wood: 30, ore: 30, mercury: 20, crystals: 20, gems: 20, sulfur: 20 },
        heroes: [
          {
            id: "h1",
            name: "Leon",
            class: HeroClass.KNIGHT,
            level: 5,
            experience: 1200,
            stats: { attack: 4, defense: 3, spellPower: 1, knowledge: 1 },
            position: { x: 5, y: 5 },
            movement: 12,
            maxMovement: 18,
            armies: [
              { id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 200, position: 0 },
              { id: "a2", unitType: UnitType.ARCHER, count: 11, health: 110, maxHealth: 110, position: 1 },
              { id: "a3", unitType: UnitType.GRIFFIN, count: 5, health: 150, maxHealth: 150, position: 2 },
            ],
          },
          {
            id: "h2",
            name: "Aldric",
            class: HeroClass.CLERIC,
            level: 2,
            experience: 200,
            stats: { attack: 1, defense: 1, spellPower: 3, knowledge: 3 },
            position: { x: 9, y: 7 },
            movement: 18,
            maxMovement: 18,
            armies: [],
          },
        ],
        towns: [
          {
            id: "t1",
            name: "Château Astral",
            faction: Faction.CASTLE,
            position: { x: 3, y: 12 },
            level: 3,
            buildings: [BuildingType.VILLAGE_HALL, BuildingType.TAVERN, BuildingType.BARRACKS, BuildingType.DWELLING_1, BuildingType.DWELLING_2],
            garrison: [],
            availableRecruits: { [UnitType.PIKEMAN]: 12, [UnitType.ARCHER]: 8 },
            lastBuiltTurn: null,
          },
        ],
        resourceBuildings: [
          { id: "rb1", type: ResourceBuildingType.GOLD_MINE, position: { x: 7, y: 3 }, ownerId: "p1", guardianPower: 0 },
          { id: "rb2", type: ResourceBuildingType.SAWMILL, position: { x: 4, y: 8 }, ownerId: "p1", guardianPower: 0 },
          { id: "rb3", type: ResourceBuildingType.ORE_PIT, position: { x: 11, y: 6 }, ownerId: "p1", guardianPower: 0 },
        ],
        isAlive: true,
        turnOrder: 0,
        exploredTiles: [],
        hasEndedTurn: false,
      },
      {
        id: "p2",
        userId: "other-user",
        name: "Adversaire",
        isAi: false,
        faction: Faction.INFERNO,
        color: "#ef4444",
        resources: { gold: 8000, wood: 10, ore: 10, mercury: 5, crystals: 5, gems: 5, sulfur: 5 },
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
}

const mockAuthValue = {
  data: { user: { id: MOCK_USER_ID, email: "dev@local", name: "Dev" } },
  status: "authenticated" as const,
  user: null,
};

export default function DevHudPage() {
  useEffect(() => {
    useGameStore.getState().setGameState(buildMockState());
    useGameStore.getState().selectHero("h1");
  }, []);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <div className="relative h-screen w-screen overflow-hidden bg-gradient-to-br from-emerald-900 via-stone-800 to-slate-900">
        {/* Fake map backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 40%, #65a30d 0, transparent 40%), radial-gradient(circle at 70% 60%, #1e3a8a 0, transparent 35%), radial-gradient(circle at 50% 80%, #78350f 0, transparent 40%)",
          }}
        />
        <HUD />
      </div>
    </AuthContext.Provider>
  );
}
