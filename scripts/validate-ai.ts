// Validation script for the AI strategy modules.
// Runs pure-function checks: personality rolls deterministic, posture transitions,
// spell decision behavior, tactics placement.

import {
  AI_PERSONALITIES,
  getPersonalityProfile,
  mergeDifficultyProfile,
  rollAiPersonality,
} from "../src/lib/game/ai/strategy/personality";
import { chooseAiCombatSpell } from "../src/lib/game/ai/combat-spells";
import { chooseAiCombatAction, planAiTacticsPlacements } from "../src/lib/game/ai/combat-tactics";
import { getHexDistance } from "../src/lib/game/combat/movement";
import { buildAiContext } from "../src/lib/game/ai/context";
import { chooseAiObjective } from "../src/lib/game/ai/utility";
import { getGarrisonPickupStacks } from "../src/lib/game/ai/strategy/army-transfers";
import { canRecruitSingleStackHero } from "../src/lib/game/ai/strategy/recruit-hero";
import { findGateObjectOnAnyLevel, getSubterraneanGateTarget } from "../src/lib/game/engine/level-transition";
import { canBuildBoat, canEmbark } from "../src/lib/game/boats/boat-ops";
import { estimateAttackLossRatio } from "../src/lib/game/ai/combat";
import { scoringJitter } from "../src/lib/game/ai/strategy/scoring-noise";
import { updateOpponentIntel } from "../src/lib/game/ai/strategy/memory";
import { updateMultiTurnPlans } from "../src/lib/game/ai/strategy/planner";
import { UNDERGROUND_LEVEL } from "../src/lib/game/map-levels";
import { BuildingType, Faction, ResourceBuildingType, TerrainType, UnitType, type CombatBoardUnit } from "../src/lib/game/types";

const tests: Array<{ name: string; fn: () => void }> = [];
function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

test("Personalities are deterministic per seed", () => {
  const a = rollAiPersonality("game-1:player-A", "normal");
  const b = rollAiPersonality("game-1:player-A", "normal");
  assert(a === b, `same seed should give same personality (got ${a} vs ${b})`);
});

test("All personalities are valid", () => {
  for (const personality of AI_PERSONALITIES) {
    const profile = getPersonalityProfile(personality);
    assert(profile.buildPriority.length > 0, `${personality} build priority empty`);
    assert(profile.skillPreference.combat > 0, `${personality} combat preference invalid`);
  }
});

test("Aggressive profile is more aggressive than economic", () => {
  const base = {
    neutralPowerRatio: 1.25,
    humanPowerRatio: 1.6,
    threatWeight: 1,
    explorationWeight: 1,
    economyWeight: 1.05,
    aggressionWeight: 1,
  };
  const aggressive = mergeDifficultyProfile(base, "AGGRESSIVE");
  const economic = mergeDifficultyProfile(base, "ECONOMIC");
  assert(
    aggressive.aggressionWeight > economic.aggressionWeight,
    "aggressive should have higher aggressionWeight",
  );
  assert(
    economic.economyWeight > aggressive.economyWeight,
    "economic should have higher economyWeight",
  );
});

test("AI limits extra single-stack hero recruitment", () => {
  const context = {
    player: {
      heroes: [
        { id: "h1", armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20 }] },
        { id: "h2", armies: [{ id: "a2", unitType: UnitType.PIKEMAN, count: 18 }] },
        { id: "h3", armies: [{ id: "a3", unitType: UnitType.PIKEMAN, count: 16 }] },
      ],
      towns: [{ id: "t1" }],
    },
  };

  assert(
    canRecruitSingleStackHero(context, { count: 20 }) === false,
    "AI should not keep recruiting when it already has too many single-stack heroes",
  );
});

test("AI can recruit another hero after consolidating armies", () => {
  const context = {
    player: {
      heroes: [
        { id: "h1", armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 60 }] },
        {
          id: "h2",
          armies: [
            { id: "a2", unitType: UnitType.PIKEMAN, count: 20 },
            { id: "a3", unitType: UnitType.ARCHER, count: 12 },
          ],
        },
        { id: "h3", armies: [{ id: "a4", unitType: UnitType.PIKEMAN, count: 16 }] },
      ],
      towns: [{ id: "t1" }],
    },
  };

  assert(
    canRecruitSingleStackHero(context, { count: 20 }) === true,
    "AI should still recruit once it has enough consolidated armies",
  );
});

test("AI prioritizes an easy nearby resource mine", () => {
  const exploredTiles: string[] = [];
  const tiles = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => {
      if (x <= 3 && y <= 3) exploredTiles.push(`${x},${y}`);
      return {
        x,
        y,
        terrain: TerrainType.GRASS,
        movementCost: 100,
        isPassable: true,
        object: x === 3 && y === 2
          ? {
              type: "building" as const,
              id: "test-sawmill",
              subtype: ResourceBuildingType.SAWMILL,
              guardianPower: 180,
            }
          : undefined,
      };
    }),
  );
  const game = {
    id: "ai-mine-test",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 1,
    currentTurnPlayerId: "p1",
    mapData: { width: 8, height: 8, tiles },
    mapState: {},
    players: [
      {
        id: "p1",
        userId: null,
        isAi: true,
        aiDifficulty: "normal",
        isAlive: true,
        faction: "castle",
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles,
        heroes: [{
          id: "h1",
          x: 2,
          y: 2,
          movement: 1560,
          attack: 1,
          defense: 0,
          morale: 0,
          luck: 0,
          armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
        }],
        towns: [],
        resourceBuildings: [],
      },
      {
        id: "p2",
        userId: null,
        isAi: false,
        isAlive: true,
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles: [],
        heroes: [],
        towns: [],
        resourceBuildings: [],
      },
    ],
    neutralArmies: [],
    gates: [],
    combats: [],
  };

  const context = buildAiContext(game, game.players[0]);
  const choice = chooseAiObjective(context, context.player.heroes[0], "BUILDER");
  if (!choice) throw new Error("expected AI to choose an objective");
  assert(choice.objective.type === "resource_building", `expected resource_building, got ${choice.objective.type}`);
  assert(choice.objective.id === "test-sawmill", `expected test-sawmill, got ${choice.objective.id}`);
  assert(choice.objective.canAutoWin === true, "easy mine should be auto-winnable");
});

test("AI sometimes returns to town for garrison reinforcements", () => {
  const exploredTiles: string[] = [];
  const tiles = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => {
      exploredTiles.push(`${x},${y}`);
      return {
        x,
        y,
        terrain: TerrainType.GRASS,
        movementCost: 100,
        isPassable: true,
        object: x === 5 && y === 2
          ? {
              type: "town" as const,
              id: "home-town",
            }
          : undefined,
      };
    }),
  );
  const townGarrison = [
    { id: "g1", unitType: UnitType.ARCHER, count: 60, health: 600, maxHealth: 10, position: 0 },
  ];
  const game = {
    id: "ai-garrison-pickup-test",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 8,
    currentTurnPlayerId: "p1",
    mapData: { width: 8, height: 8, tiles },
    mapState: {},
    players: [
      {
        id: "p1",
        userId: null,
        isAi: true,
        aiDifficulty: "normal",
        isAlive: true,
        faction: "castle",
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles,
        heroes: [{
          id: "h1",
          x: 2,
          y: 2,
          movement: 1560,
          attack: 1,
          defense: 0,
          morale: 0,
          luck: 0,
          armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 5, health: 50, maxHealth: 10, position: 0 }],
        }],
        towns: [{
          id: "home-town",
          x: 5,
          y: 2,
          townType: "castle",
          buildings: [],
          garrison: townGarrison,
        }],
        resourceBuildings: [],
      },
      {
        id: "p2",
        userId: null,
        isAi: false,
        isAlive: true,
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles: [],
        heroes: [],
        towns: [],
        resourceBuildings: [],
      },
    ],
    neutralArmies: [],
    gates: [],
    combats: [],
  };

  const context = buildAiContext(game, game.players[0]);
  const choice = chooseAiObjective(context, context.player.heroes[0], "CHAMPION");
  if (!choice) throw new Error("expected AI to choose an objective");
  assert(choice.objective.type === "pickup_garrison", `expected pickup_garrison, got ${choice.objective.type}`);

  const pickup = getGarrisonPickupStacks(context.player.towns[0]);
  assert(pickup.length === 1, "AI should take a reinforcement stack");
  assert(pickup[0].count === 45, `AI should leave a quarter of the stack in defense, picked ${pickup[0].count}`);
});

test("AI prioritizes a visible neutral town over a nearby mine", () => {
  const exploredTiles: string[] = [];
  const tiles = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => {
      exploredTiles.push(`${x},${y}`);
      return {
        x,
        y,
        terrain: TerrainType.GRASS,
        movementCost: 100,
        isPassable: true,
        object: x === 3 && y === 2
          ? {
              type: "building" as const,
              id: "nearby-sawmill",
              subtype: ResourceBuildingType.SAWMILL,
            }
          : x === 2 && y === 3
            ? {
                type: "town" as const,
                id: "neutral-castle-object",
                targetId: "neutral-castle",
              }
            : undefined,
      };
    }),
  );
  const game = {
    id: "ai-neutral-town-priority-test",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 6,
    currentTurnPlayerId: "p1",
    mapData: { width: 8, height: 8, tiles },
    mapState: {},
    players: [
      {
        id: "p1",
        userId: null,
        isAi: true,
        aiDifficulty: "normal",
        isAlive: true,
        faction: "castle",
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles,
        heroes: [{
          id: "h1",
          x: 2,
          y: 2,
          movement: 1560,
          attack: 1,
          defense: 0,
          morale: 0,
          luck: 0,
          armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
        }],
        towns: [],
        resourceBuildings: [],
      },
      {
        id: "p2",
        userId: null,
        isAi: false,
        isAlive: true,
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles: [],
        heroes: [],
        towns: [],
        resourceBuildings: [],
      },
    ],
    neutralArmies: [],
    gates: [],
    combats: [],
  };

  const context = buildAiContext(game, game.players[0]);
  context.resourceNeeds.wood = 10;
  const choice = chooseAiObjective(context, context.player.heroes[0], "BUILDER");
  if (!choice) throw new Error("expected AI to choose an objective");
  assert(choice.objective.type === "neutral_town", `expected neutral_town, got ${choice.objective.type}`);
  assert(choice.objective.id === "neutral-castle", `expected neutral-castle, got ${choice.objective.id}`);
});

test("AI ignores already visited adventure buildings", () => {
  const exploredTiles: string[] = [];
  const tiles = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => {
      exploredTiles.push(`${x},${y}`);
      return {
        x,
        y,
        terrain: TerrainType.GRASS,
        movementCost: 100,
        isPassable: true,
        object: x === 3 && y === 2
          ? {
              type: "adventure_building" as const,
              id: "visited-camp",
              subtype: "mercenary_camp",
            }
          : undefined,
      };
    }),
  );
  const game = {
    id: "ai-visited-building-test",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 3,
    currentTurnPlayerId: "p1",
    mapData: { width: 8, height: 8, tiles },
    mapState: {
      heroAdventureVisits: { h1: ["visited-camp"] },
    },
    players: [
      {
        id: "p1",
        userId: null,
        isAi: true,
        aiDifficulty: "normal",
        isAlive: true,
        faction: "castle",
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles,
        heroes: [{
          id: "h1",
          x: 2,
          y: 2,
          movement: 1560,
          level: 1,
          attack: 1,
          defense: 0,
          morale: 0,
          luck: 0,
          armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
        }],
        towns: [],
        resourceBuildings: [],
      },
      {
        id: "p2",
        userId: null,
        isAi: false,
        isAlive: true,
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles: [],
        heroes: [],
        towns: [],
        resourceBuildings: [],
      },
    ],
    neutralArmies: [],
    gates: [],
    combats: [],
  };

  const context = buildAiContext(game, game.players[0]);
  const choice = chooseAiObjective(context, context.player.heroes[0], "SCOUT");
  assert(choice?.objective.id !== "visited-camp", "AI should not target an already visited hero building");
  assert(
    choice?.objective.position.x !== 3 || choice.objective.position.y !== 2,
    "AI should not use an already visited building tile as an exploration waypoint",
  );
});

test("AI ignores magic wells when mana is already full", () => {
  const exploredTiles: string[] = [];
  const tiles = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => {
      exploredTiles.push(`${x},${y}`);
      return {
        x,
        y,
        terrain: TerrainType.GRASS,
        movementCost: 100,
        isPassable: true,
        object: x === 3 && y === 2
          ? {
              type: "adventure_building" as const,
              id: "full-mana-well",
              subtype: "magic_well",
            }
          : undefined,
      };
    }),
  );
  const game = {
    id: "ai-full-mana-well-test",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 4,
    currentTurnPlayerId: "p1",
    mapData: { width: 8, height: 8, tiles },
    mapState: {},
    players: [
      {
        id: "p1",
        userId: null,
        isAi: true,
        aiDifficulty: "normal",
        isAlive: true,
        faction: "castle",
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles,
        heroes: [{
          id: "h1",
          x: 2,
          y: 2,
          movement: 1560,
          level: 1,
          attack: 1,
          defense: 0,
          knowledge: 2,
          mana: 20,
          morale: 0,
          luck: 0,
          armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
        }],
        towns: [],
        resourceBuildings: [],
      },
      {
        id: "p2",
        userId: null,
        isAi: false,
        isAlive: true,
        gold: 0,
        wood: 0,
        ore: 0,
        mercury: 0,
        crystals: 0,
        gems: 0,
        sulfur: 0,
        exploredTiles: [],
        heroes: [],
        towns: [],
        resourceBuildings: [],
      },
    ],
    neutralArmies: [],
    gates: [],
    combats: [],
  };

  const context = buildAiContext(game, game.players[0]);
  const choice = chooseAiObjective(context, context.player.heroes[0], "SCOUT");
  assert(choice?.objective.id !== "full-mana-well", "AI should not target a magic well at full mana");
});

test("Tactics placement advances melee units", () => {
  const units: CombatBoardUnit[] = [
    {
      id: "u1",
      side: "attacker",
      unitType: UnitType.PIKEMAN,
      count: 10,
      health: 100,
      maxHealth: 10,
      q: 0,
      r: 2,
      speed: 4,
      ranged: false,
      shots: 0,
      ownerPlayerId: "p1",
      heroId: "h1",
      defended: false,
      waited: false, hasRetaliated: false, joinsRound: 0, minDamage: 1, maxDamage: 2, position: 0,
    },
    {
      id: "u2",
      side: "attacker",
      unitType: UnitType.ARCHER,
      count: 5,
      health: 50,
      maxHealth: 10,
      q: 0,
      r: 4,
      speed: 4,
      ranged: true,
      shots: 12,
      ownerPlayerId: "p1",
      heroId: "h1",
      defended: false,
      waited: false, hasRetaliated: false, joinsRound: 0, minDamage: 1, maxDamage: 2, position: 0,
    },
  ];
  const placements = planAiTacticsPlacements(units, "attacker", { maxColumn: 3 });
  const meleeMove = placements.find((p) => p.unitId === "u1");
  const rangedMove = placements.find((p) => p.unitId === "u2");
  assert(meleeMove && meleeMove.q > 0, "melee unit should advance");
  assert(!rangedMove, "ranged unit should stay in back");
});

test("AI spell choice picks high-value AOE", () => {
  const enemyUnits: CombatBoardUnit[] = [
    {
      id: "e1",
      side: "defender",
      unitType: UnitType.PIKEMAN,
      count: 10,
      health: 100,
      maxHealth: 10,
      q: 12,
      r: 2,
      speed: 4,
      ranged: false,
      shots: 0,
      ownerPlayerId: "p2",
      heroId: "h2",
      defended: false,
      waited: false, hasRetaliated: false, joinsRound: 0, minDamage: 1, maxDamage: 2, position: 0,
    },
    {
      id: "e2",
      side: "defender",
      unitType: UnitType.ARCHER,
      count: 8,
      health: 80,
      maxHealth: 10,
      q: 12,
      r: 3,
      speed: 4,
      ranged: true,
      shots: 12,
      ownerPlayerId: "p2",
      heroId: "h2",
      defended: false,
      waited: false, hasRetaliated: false, joinsRound: 0, minDamage: 1, maxDamage: 2, position: 0,
    },
  ];
  const choice = chooseAiCombatSpell({
    hero: {
      heroId: "h1",
      side: "attacker",
      playerId: "p1",
      spellPower: 5,
      knowledge: 5,
      mana: 50,
      knownSpellIds: ["magic_arrow", "lightning_bolt", "fireball"],
      hasSpellBook: true,
    },
    units: enemyUnits,
    terrain: [],
    round: 1,
    spellCastsByRound: {},
  });
  assert(choice !== null, "AI should pick a spell when conditions favorable");
  assert(["magic_arrow", "lightning_bolt", "fireball"].includes(choice!.spell.id), "spell must be from known list");
});

test("AI declines spell when mana too low", () => {
  const enemyUnits: CombatBoardUnit[] = [
    {
      id: "e1",
      side: "defender",
      unitType: UnitType.PIKEMAN,
      count: 10,
      health: 100,
      maxHealth: 10,
      q: 12,
      r: 2,
      speed: 4,
      ranged: false,
      shots: 0,
      ownerPlayerId: "p2",
      heroId: "h2",
      defended: false,
      waited: false, hasRetaliated: false, joinsRound: 0, minDamage: 1, maxDamage: 2, position: 0,
    },
  ];
  const choice = chooseAiCombatSpell({
    hero: {
      heroId: "h1",
      side: "attacker",
      playerId: "p1",
      spellPower: 3,
      knowledge: 1,
      mana: 0,
      knownSpellIds: ["lightning_bolt"],
      hasSpellBook: true,
    },
    units: enemyUnits,
    terrain: [],
    round: 1,
    spellCastsByRound: {},
  });
  assert(choice === null, "should not cast when mana too low");
});

test("AI does not cast twice in same round", () => {
  const enemyUnits: CombatBoardUnit[] = [
    {
      id: "e1",
      side: "defender",
      unitType: UnitType.PIKEMAN,
      count: 10,
      health: 100,
      maxHealth: 10,
      q: 12,
      r: 2,
      speed: 4,
      ranged: false,
      shots: 0,
      ownerPlayerId: "p2",
      heroId: "h2",
      defended: false,
      waited: false, hasRetaliated: false, joinsRound: 0, minDamage: 1, maxDamage: 2, position: 0,
    },
  ];
  const choice = chooseAiCombatSpell({
    hero: {
      heroId: "h1",
      side: "attacker",
      playerId: "p1",
      spellPower: 5,
      knowledge: 5,
      mana: 50,
      knownSpellIds: ["magic_arrow"],
      hasSpellBook: true,
    },
    units: enemyUnits,
    terrain: [],
    round: 1,
    spellCastsByRound: { "1": ["h1"] },
  });
  assert(choice === null, "should not cast twice");
});

// ---------------------------------------------------------------------------
// Level transitions (subterranean gates / stargates) and boats
// ---------------------------------------------------------------------------

interface TestTile {
  x: number;
  y: number;
  terrain: TerrainType;
  movementCost: number;
  isPassable: boolean;
  object?: unknown;
}

function makeLayer(size: number, terrain: TerrainType, mutate?: (tile: TestTile) => void) {
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const isWater = terrain === TerrainType.WATER;
      const tile: TestTile = { x, y, terrain, movementCost: 100, isPassable: true, object: undefined };
      void isWater;
      mutate?.(tile);
      return tile;
    }),
  );
}

function makeTwoLevelMap(
  size: number,
  surfaceMutate?: (tile: TestTile) => void,
  undergroundMutate?: (tile: TestTile) => void,
) {
  const surfaceTiles = makeLayer(size, TerrainType.GRASS, surfaceMutate);
  const undergroundTiles = makeLayer(size, TerrainType.DIRT, undergroundMutate);
  return {
    width: size,
    height: size,
    tiles: surfaceTiles,
    levels: {
      surface: { id: "surface", width: size, height: size, tiles: surfaceTiles },
      underground: { id: "underground", width: size, height: size, tiles: undergroundTiles },
    },
  };
}

function makeAiPlayer(overrides: Record<string, unknown>) {
  return {
    id: "p1",
    userId: null,
    isAi: true,
    aiDifficulty: "normal",
    isAlive: true,
    faction: "castle",
    gold: 0,
    wood: 0,
    ore: 0,
    mercury: 0,
    crystals: 0,
    gems: 0,
    sulfur: 0,
    exploredTiles: [] as string[],
    heroes: [] as unknown[],
    towns: [] as unknown[],
    resourceBuildings: [] as unknown[],
    ...overrides,
  };
}

function makeAiGame(mapData: unknown, player: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: "ai-level-boat-test",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 3,
    currentTurnPlayerId: "p1",
    mapData,
    mapState: {},
    players: [player],
    neutralArmies: [],
    gates: [],
    boats: [],
    combats: [],
    ...overrides,
  };
}

test("Subterranean gate resolves the opposite-level passable target", () => {
  const map = makeTwoLevelMap(
    8,
    (tile) => {
      if (tile.x === 3 && tile.y === 2) {
        tile.object = {
          type: "adventure_building",
          id: "sg-surface",
          subtype: "subterranean_gate",
          targetId: "sg-under",
          targetLevel: "underground",
          targetPosition: { x: 4, y: 4, level: "underground" },
        };
      }
    },
    (tile) => {
      if (tile.x === 4 && tile.y === 4) {
        tile.object = {
          type: "adventure_building",
          id: "sg-under",
          subtype: "subterranean_gate",
          targetId: "sg-surface",
          targetLevel: "surface",
          targetPosition: { x: 3, y: 2, level: "surface" },
        };
      }
    },
  );
  const gateObject = map.levels.surface.tiles[2][3].object as Parameters<typeof getSubterraneanGateTarget>[1];
  const target = getSubterraneanGateTarget(map as never, gateObject);
  assert(!!target, "expected a gate target");
  assert(target!.level === UNDERGROUND_LEVEL, `expected underground target, got ${target!.level}`);
  assert(target!.position.x === 4 && target!.position.y === 4, "expected target at (4,4)");
});

test("Stargate destination resolves on the underground layer (cross-level)", () => {
  const map = makeTwoLevelMap(
    8,
    (tile) => {
      if (tile.x === 1 && tile.y === 1) {
        tile.object = { type: "adventure_building", id: "star-surface", subtype: "stargate", targetId: "star-under" };
      }
    },
    (tile) => {
      if (tile.x === 5 && tile.y === 5) {
        tile.object = { type: "adventure_building", id: "star-under", subtype: "stargate", targetId: "star-surface" };
      }
    },
  );
  const found = findGateObjectOnAnyLevel(map as never, "star-under");
  assert(!!found, "expected to find the stargate pair");
  assert(found!.level === UNDERGROUND_LEVEL, `expected underground, got ${found!.level}`);
  assert(found!.position.x === 5 && found!.position.y === 5, "expected destination at (5,5)");
});

test("AI context binds to the underground layer with level-scoped fog", () => {
  const map = makeTwoLevelMap(8);
  // Hero sits far from (0,0) so vision cannot re-reveal it on the underground frame.
  const player = makeAiPlayer({
    exploredTiles: ["surface:0,0", "underground:4,4"],
    heroes: [{
      id: "h1",
      x: 7,
      y: 7,
      mapLevel: "underground",
      movement: 1560,
      attack: 1,
      defense: 0,
      morale: 0,
      luck: 0,
      armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
    }],
  });
  const game = makeAiGame(map, player);
  const context = buildAiContext(game as never, game.players[0] as never, UNDERGROUND_LEVEL);
  assert(context.activeLevel === UNDERGROUND_LEVEL, "context should be on the underground level");
  assert(context.map.tiles[4][4].terrain === TerrainType.DIRT, "map should be bound to the underground layer");
  assert(context.explored.has("4,4"), "underground explored tile should be present");
  assert(!context.explored.has("0,0"), "surface-only explored tile must be excluded on the underground frame");
});

test("canBuildBoat gates on shipyard, gold and coastal water", () => {
  const map = makeTwoLevelMap(6, (tile) => {
    // A small body of coastal water next to the town at (2,2).
    if ((tile.x === 2 && tile.y === 3) || (tile.x === 3 && tile.y === 3) || (tile.x === 3 && tile.y === 2)) {
      tile.terrain = TerrainType.WATER;
    }
  });
  const town = { x: 2, y: 2, mapLevel: "surface", townType: "castle", buildings: [BuildingType.SHIPYARD] };
  const resources = { gold: 2000, wood: 20, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0 };
  const ok = canBuildBoat({ town, faction: Faction.CASTLE, resources, mapData: map.levels.surface as never, boats: [] });
  assert(ok.ok === true, `expected build allowed, got ${ok.ok === false ? ok.reason : "ok"}`);

  const noShipyard = canBuildBoat({ town: { ...town, buildings: [] }, faction: Faction.CASTLE, resources, mapData: map.levels.surface as never, boats: [] });
  assert(noShipyard.ok === false, "expected build refused without a shipyard");
});

test("canEmbark allows an adjacent empty boat but not from underground", () => {
  const map = makeTwoLevelMap(6, (tile) => {
    if (tile.x === 1 && tile.y === 2) tile.terrain = TerrainType.WATER;
  });
  const boat = { id: "b1", heroId: null, x: 1, y: 2, mapLevel: "surface" };
  const surfaceHero = { id: "h1", x: 1, y: 1, mapLevel: "surface" };
  const ok = canEmbark({ hero: surfaceHero, boat, boats: [boat], mapData: map.levels.surface as never });
  assert(ok.ok === true, `expected embark allowed, got ${ok.ok === false ? ok.reason : "ok"}`);

  const undergroundHero = { id: "h1", x: 1, y: 1, mapLevel: "underground" };
  const blocked = canEmbark({ hero: undergroundHero, boat, boats: [boat], mapData: map.levels.surface as never });
  assert(blocked.ok === false, "expected embark refused from the underground");
});

test("AI embarks a boat to reach a water-separated mine", () => {
  const exploredTiles: string[] = [];
  const heroLand = new Set(["1,1", "1,2", "2,1", "2,2"]);
  const mineLand = new Set(["6,5", "6,6"]);
  const tiles = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => {
      exploredTiles.push(`surface:${x},${y}`);
      const key = `${x},${y}`;
      const isLand = heroLand.has(key) || mineLand.has(key);
      return {
        x,
        y,
        terrain: isLand ? TerrainType.GRASS : TerrainType.WATER,
        movementCost: 100,
        isPassable: true,
        object: x === 6 && y === 6
          ? { type: "building" as const, id: "island-mine", subtype: ResourceBuildingType.GOLD_MINE }
          : undefined,
      };
    }),
  );
  const map = { width: 8, height: 8, tiles };
  const player = makeAiPlayer({
    exploredTiles,
    heroes: [{
      id: "h1",
      x: 1,
      y: 1,
      mapLevel: "surface",
      movement: 1560,
      attack: 1,
      defense: 0,
      morale: 0,
      luck: 0,
      armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
    }],
  });
  const game = makeAiGame(map, player, {
    boats: [{ id: "b1", ownerId: null, heroId: null, faction: "castle", x: 3, y: 2, mapLevel: "surface" }],
  });
  const context = buildAiContext(game as never, game.players[0] as never);
  const choice = chooseAiObjective(context, context.player.heroes[0] as never, "SCOUT");
  if (!choice) throw new Error("expected AI to choose an objective");
  assert(choice.objective.type === "embark_boat", `expected embark_boat, got ${choice.objective.type}`);
  assert(choice.objective.boatId === "b1", `expected boat b1, got ${choice.objective.boatId}`);
});

test("AI descends through a subterranean gate toward an underground mine", () => {
  const map = makeTwoLevelMap(
    8,
    (tile) => {
      if (tile.x === 3 && tile.y === 2) {
        tile.object = {
          type: "adventure_building",
          id: "sg-surface",
          subtype: "subterranean_gate",
          targetId: "sg-under",
          targetLevel: "underground",
          targetPosition: { x: 4, y: 4, level: "underground" },
        };
      }
    },
    (tile) => {
      if (tile.x === 4 && tile.y === 5) {
        tile.object = { type: "building", id: "deep-gold-mine", subtype: ResourceBuildingType.GOLD_MINE };
      }
    },
  );
  const exploredTiles: string[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) exploredTiles.push(`surface:${x},${y}`);
  exploredTiles.push("underground:4,4", "underground:4,5", "underground:3,4", "underground:5,4");
  const player = makeAiPlayer({
    exploredTiles,
    heroes: [{
      id: "h1",
      x: 2,
      y: 2,
      mapLevel: "surface",
      movement: 1560,
      attack: 1,
      defense: 0,
      morale: 0,
      luck: 0,
      armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
    }],
  });
  const game = makeAiGame(map, player);
  const context = buildAiContext(game as never, game.players[0] as never);
  const choice = chooseAiObjective(context, context.player.heroes[0] as never, "SCOUT");
  if (!choice) throw new Error("expected AI to choose an objective");
  assert(choice.objective.type === "level_transition", `expected level_transition, got ${choice.objective.type}`);
  assert(choice.objective.id === "level-transition:sg-surface", `expected gate objective, got ${choice.objective.id}`);
});

test("AI sails toward a separated island when already embarked", () => {
  const exploredTiles: string[] = [];
  const mineLand = new Set(["6,5", "6,6"]);
  const tiles = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => {
      exploredTiles.push(`surface:${x},${y}`);
      return {
        x,
        y,
        terrain: mineLand.has(`${x},${y}`) ? TerrainType.GRASS : TerrainType.WATER,
        movementCost: 100,
        isPassable: true,
        object: x === 6 && y === 6
          ? { type: "building" as const, id: "island-mine", subtype: ResourceBuildingType.GOLD_MINE }
          : undefined,
      };
    }),
  );
  const player = makeAiPlayer({
    exploredTiles,
    heroes: [{
      id: "h1",
      x: 1,
      y: 4,
      mapLevel: "surface",
      movement: 1560,
      attack: 1,
      defense: 0,
      morale: 0,
      luck: 0,
      armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
    }],
  });
  const game = makeAiGame({ width: 8, height: 8, tiles }, player, {
    boats: [{ id: "b1", ownerId: "p1", heroId: "h1", faction: "castle", x: 1, y: 4, mapLevel: "surface" }],
  });
  const context = buildAiContext(game as never, game.players[0] as never);
  const choice = chooseAiObjective(context, context.player.heroes[0] as never, "SCOUT");
  if (!choice) throw new Error("expected embarked AI to choose an objective");
  assert(
    choice.objective.type === "sail" || choice.objective.type === "disembark_boat",
    `expected sail/disembark_boat, got ${choice.objective.type}`,
  );
});

// ---------------------------------------------------------------------------
// Human-like AI improvements: loss-aware combat, jitter, intel, logistics
// ---------------------------------------------------------------------------

test("Loss estimate: lopsided win bleeds little, an even fight bleeds a lot", () => {
  const strongHero = {
    id: "h1",
    attack: 5,
    defense: 5,
    armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 100, health: 1000, maxHealth: 10, position: 0 }],
  };
  const weakDefender = {
    id: "d1",
    armies: [{ id: "g1", unitType: UnitType.PIKEMAN, count: 10, health: 100, maxHealth: 10, position: 0 }],
  };
  const evenDefender = {
    id: "d2",
    armies: [{ id: "g2", unitType: UnitType.PIKEMAN, count: 92, health: 920, maxHealth: 10, position: 0 }],
  };
  const lopsided = estimateAttackLossRatio(strongHero, weakDefender);
  const even = estimateAttackLossRatio(strongHero, evenDefender);
  assert(lopsided < 0.2, `lopsided win should bleed little, got ${lopsided}`);
  assert(even > lopsided + 0.1, `even fight should bleed much more (got even ${even} vs lopsided ${lopsided})`);
});

test("Scoring jitter is deterministic and bounded", () => {
  const a = scoringJitter(["g", "h1", 3, "obj"], 0.08);
  const b = scoringJitter(["g", "h1", 3, "obj"], 0.08);
  const c = scoringJitter(["g", "h1", 4, "obj"], 0.08);
  assert(a === b, "same seed must give the same jitter");
  assert(a >= 0.92 && a <= 1.08, `jitter out of bounds: ${a}`);
  assert(a !== c, "different turn should usually shift the jitter");
  assert(scoringJitter(["x"], 0) === 1, "zero amplitude must be a no-op");
});

test("Opponent intel records peak power and purges dead rivals", () => {
  const opponent = {
    id: "p2",
    isAlive: true,
    heroes: [{ id: "eh1", attack: 2, defense: 2, armies: [{ id: "ea", unitType: UnitType.PIKEMAN, count: 40, health: 400, maxHealth: 10, position: 0 }] }],
    towns: [],
  };
  const game = {
    players: [
      { id: "p1", isAlive: true },
      opponent,
      { id: "p3", isAlive: false },
    ],
  };
  const previous = {
    p2: { maxPowerSeen: 9999, lastSeenPower: 9999, lastSeenTurn: 1 },
    p3: { maxPowerSeen: 100, lastSeenPower: 100, lastSeenTurn: 1 },
  };
  const next = updateOpponentIntel(previous as never, game as never, [opponent] as never, 5);
  assert(next.p2.maxPowerSeen === 9999, "should keep the highest power ever seen");
  assert(next.p2.lastSeenTurn === 5, "should refresh last-seen turn");
  assert(next.p2.lastSeenPower > 0, "should record current power");
  assert(!next.p3, "dead rival intel must be purged");
});

test("AI routes a loaded secondary hero to the champion (mule logistics)", () => {
  const tiles = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => ({ x, y, terrain: TerrainType.GRASS, movementCost: 100, isPassable: true, object: undefined })),
  );
  const exploredTiles: string[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) exploredTiles.push(`surface:${x},${y}`);
  const army = (id: string, count: number) => [{ id, unitType: UnitType.PIKEMAN, count, health: count * 10, maxHealth: 10, position: 0 }];
  const player = makeAiPlayer({
    exploredTiles,
    heroes: [
      { id: "champion", x: 1, y: 1, mapLevel: "surface", movement: 1560, attack: 3, defense: 3, armies: army("c", 60) },
      { id: "mule", x: 6, y: 6, mapLevel: "surface", movement: 1560, attack: 1, defense: 1, armies: army("m", 50) },
    ],
  });
  const game = makeAiGame({ width: 8, height: 8, tiles }, player);
  const context = buildAiContext(game as never, game.players[0] as never);
  context.memory.championHeroId = "champion";
  const plans = updateMultiTurnPlans(context, context.memory);
  const mulePlan = plans.find((plan) => plan.heroId === "mule");
  assert(!!mulePlan, "expected a plan for the mule hero");
  assert(mulePlan!.goal === "RALLY_TO_CHAMPION", `expected RALLY_TO_CHAMPION, got ${mulePlan!.goal}`);
});

// ---------------------------------------------------------------------------
// Tactical combat: retaliation awareness (G1) and shooter safety (G4)
// ---------------------------------------------------------------------------

function combatUnit(over: Partial<CombatBoardUnit> & { id: string; side: "attacker" | "defender"; q: number; r: number }): CombatBoardUnit {
  return {
    unitType: UnitType.PIKEMAN,
    count: 10,
    health: 100,
    maxHealth: 10,
    speed: 4,
    ranged: false,
    shots: 0,
    ownerPlayerId: over.side === "attacker" ? "p1" : "p2",
    heroId: over.side === "attacker" ? "h1" : "h2",
    defended: false,
    waited: false,
    hasRetaliated: false,
    joinsRound: 0,
    minDamage: 1,
    maxDamage: 2,
    position: 0,
    ...over,
  } as CombatBoardUnit;
}

const COMBAT_STATS = { attacker: { attack: 1, defense: 1 }, defender: { attack: 1, defense: 1 } };

test("Combat: AI prefers the target that won't retaliate", () => {
  // Two equivalent adjacent enemies; one already retaliated this round (free hit),
  // the other is fresh and hits back hard. The AI should strike the spent one.
  const actor = combatUnit({ id: "me", side: "attacker", q: 5, r: 4, count: 10 });
  const spent = combatUnit({ id: "spent", side: "defender", q: 6, r: 4, count: 50, health: 500, maxHealth: 10, minDamage: 6, maxDamage: 9, hasRetaliated: true });
  const fresh = combatUnit({ id: "fresh", side: "defender", q: 5, r: 3, count: 50, health: 500, maxHealth: 10, minDamage: 6, maxDamage: 9, hasRetaliated: false });
  const action = chooseAiCombatAction(actor, [actor, spent, fresh], [], COMBAT_STATS);
  assert(action.type === "ATTACK", `expected ATTACK, got ${action.type}`);
  assert(action.targetUnitId === "spent", `expected to hit the already-retaliated stack, got ${action.targetUnitId}`);
});

test("Combat: a blocked shooter repositions to a safe firing cell", () => {
  // An archer is pinned by a melee stack it cannot kill; it should step away to
  // shoot rather than swing in melee at reduced damage.
  const archer = combatUnit({ id: "archer", side: "attacker", q: 5, r: 4, ranged: true, shots: 5, count: 10, minDamage: 1, maxDamage: 2 });
  const blocker = combatUnit({ id: "blocker", side: "defender", q: 6, r: 4, count: 100, health: 1000, maxHealth: 10 });
  const action = chooseAiCombatAction(archer, [archer, blocker], [], COMBAT_STATS);
  assert(action.type === "MOVE", `expected MOVE to safety, got ${action.type}`);
  const dest = { q: action.q ?? archer.q, r: action.r ?? archer.r };
  assert(getHexDistance(dest, blocker) > 1, `archer should end out of melee contact, dist=${getHexDistance(dest, blocker)}`);
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`  PASS  ${t.name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL  ${t.name}\n         ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\n${tests.length - failed} / ${tests.length} tests passed`);
if (failed > 0) process.exit(1);
