// Headless AI calibration harness.
// Replays the pure decision logic (chooseAiObjective) over a matrix of scenarios
// to observe how the loss-aversion (A) and jitter (C) constants behave, without
// any DB. Run: npx tsx scripts/calibrate-ai.ts

import { buildAiContext } from "../src/lib/game/ai/context";
import { chooseAiObjective } from "../src/lib/game/ai/utility";
import { AI_PERSONALITIES, type AiPersonality } from "../src/lib/game/ai/strategy/personality";
import { ResourceBuildingType, TerrainType, UnitType } from "../src/lib/game/types";

const SIZE = 9;

type Tile = { x: number; y: number; terrain: TerrainType; movementCost: number; isPassable: boolean; object?: unknown };

function grid(mutate?: (t: Tile) => void): Tile[][] {
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      const t: Tile = { x, y, terrain: TerrainType.GRASS, movementCost: 100, isPassable: true, object: undefined };
      mutate?.(t);
      return t;
    }),
  );
}

function explored(): string[] {
  const keys: string[] = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) keys.push(`surface:${x},${y}`);
  return keys;
}

function makeGame(tiles: Tile[][], heroId: string, hx: number, hy: number, personality: AiPersonality, armyCount: number) {
  return {
    id: "calib",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 5,
    currentTurnPlayerId: "p1",
    mapData: { width: SIZE, height: SIZE, tiles },
    mapState: { aiMemory: { p1: { personality } } },
    players: [
      {
        id: "p1", userId: null, isAi: true, aiDifficulty: "normal", isAlive: true, faction: "castle",
        gold: 0, wood: 0, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0,
        exploredTiles: explored(),
        heroes: [{
          id: heroId, x: hx, y: hy, mapLevel: "surface", movement: 1560, attack: 3, defense: 3, morale: 0, luck: 0,
          armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: armyCount, health: armyCount * 10, maxHealth: 10, position: 0 }],
        }],
        towns: [], resourceBuildings: [],
      },
      { id: "p2", userId: null, isAi: false, isAlive: true, faction: "castle", gold: 0, wood: 0, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0, exploredTiles: [], heroes: [], towns: [], resourceBuildings: [] },
    ],
    neutralArmies: [], gates: [], boats: [], combats: [],
  };
}

// --- A) Loss-aversion sweep: hero vs a guarded gold mine, varying guard power ---
console.log("\n=== A) Engagement vs a guarded gold mine (army=50 pikemen) ===");
console.log("guard | " + AI_PERSONALITIES.map((p) => p.padEnd(12)).join(""));
for (const guard of [200, 600, 1000, 1500, 2200, 3000, 4200]) {
  const cells: string[] = [];
  for (const personality of AI_PERSONALITIES) {
    const tiles = grid((t) => {
      if (t.x === 5 && t.y === 4) t.object = { type: "building", id: "mine", subtype: ResourceBuildingType.GOLD_MINE, guardianPower: guard };
    });
    const game = makeGame(tiles, "h1", 4, 4, personality, 50);
    const context = buildAiContext(game as never, game.players[0] as never);
    const choice = chooseAiObjective(context, context.player.heroes[0] as never, "BUILDER");
    if (choice?.objective.id === "mine") {
      const loss = Math.round((choice.objective.expectedLossRatio ?? 0) * 100);
      cells.push(`FIGHT ${loss}%`.padEnd(12));
    } else {
      cells.push(`skip(${choice?.objective.type ?? "none"})`.padEnd(12));
    }
  }
  console.log(String(guard).padEnd(6) + "| " + cells.join(""));
}

// --- C) Jitter spread: two symmetric equal-value gold piles, many hero seeds ---
console.log("\n=== C) Tie-break spread over 200 hero seeds (two equal piles) ===");
for (const personality of AI_PERSONALITIES) {
  let left = 0;
  let right = 0;
  let other = 0;
  for (let i = 0; i < 200; i++) {
    const tiles = grid((t) => {
      if (t.x === 2 && t.y === 4) t.object = { type: "resource", id: "pile-left", subtype: "gold", amount: 500 };
      if (t.x === 6 && t.y === 4) t.object = { type: "resource", id: "pile-right", subtype: "gold", amount: 500 };
    });
    const game = makeGame(tiles, `hero-${i}`, 4, 4, personality, 50);
    const context = buildAiContext(game as never, game.players[0] as never);
    const choice = chooseAiObjective(context, context.player.heroes[0] as never, "SCOUT");
    if (choice?.objective.id === "pile-left") left++;
    else if (choice?.objective.id === "pile-right") right++;
    else other++;
  }
  console.log(`${personality.padEnd(12)} left=${left} right=${right} other=${other}`);
}

// --- A2) High-value exemption: an enemy town must NOT be vetoed for losses ---
console.log("\n=== A2) Enemy town (high value, loss-exempt) reachable at heavy loss, BALANCED ===");
for (const guardCount of [22, 30] /* ~2200, ~3000 power */) {
  const tiles = grid();
  const game = makeGame(tiles, "h1", 4, 4, "BALANCED", 50);
  game.players[1].isAlive = true;
  (game.players[1] as { towns: unknown[] }).towns = [{
    id: "enemy-town", x: 5, y: 4, mapLevel: "surface", townType: "castle", buildings: [],
    garrison: [{ id: "eg", unitType: UnitType.PIKEMAN, count: guardCount, health: guardCount * 10, maxHealth: 10, position: 0 }],
  }];
  const context = buildAiContext(game as never, game.players[0] as never);
  const choice = chooseAiObjective(context, context.player.heroes[0] as never, "CHAMPION");
  console.log(`garrison=${guardCount} -> chose ${choice?.objective.type ?? "none"} (${choice?.objective.id ?? "-"}), loss=${Math.round((choice?.objective.expectedLossRatio ?? 0) * 100)}%`);
}

// --- C2) Determinism check: same seed → same pick ---
console.log("\n=== C2) Determinism (same hero id → same pick) ===");
{
  const make = () => {
    const tiles = grid((t) => {
      if (t.x === 2 && t.y === 4) t.object = { type: "resource", id: "pile-left", subtype: "gold", amount: 500 };
      if (t.x === 6 && t.y === 4) t.object = { type: "resource", id: "pile-right", subtype: "gold", amount: 500 };
    });
    const game = makeGame(tiles, "fixed-hero", 4, 4, "BALANCED", 50);
    const context = buildAiContext(game as never, game.players[0] as never);
    return chooseAiObjective(context, context.player.heroes[0] as never, "SCOUT")?.objective.id;
  };
  const a = make();
  const b = make();
  console.log(`run1=${a} run2=${b} -> ${a === b ? "DETERMINISTIC" : "NON-DETERMINISTIC (bug!)"}`);
}
