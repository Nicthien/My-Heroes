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
import { planAiTacticsPlacements } from "../src/lib/game/ai/combat-tactics";
import { buildAiContext } from "../src/lib/game/ai/context";
import { chooseAiObjective } from "../src/lib/game/ai/utility";
import { getGarrisonPickupStacks } from "../src/lib/game/ai/strategy/army-transfers";
import { canRecruitSingleStackHero } from "../src/lib/game/ai/strategy/recruit-hero";
import { ResourceBuildingType, TerrainType, UnitType, type CombatBoardUnit } from "../src/lib/game/types";

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
