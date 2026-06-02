import assert from "node:assert/strict";
import {
  computePlayerScore,
  emptyScoreStats,
  normalizeScoreStats,
  rankPlayers,
  scorableFromPlayer,
  type ScorablePlayer,
} from "../src/lib/game/score";
import type { Player, Resources } from "../src/lib/game/types";

const NO_RESOURCES: Resources = { gold: 0, wood: 0, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0 };

function scorable(overrides: Partial<ScorablePlayer>): ScorablePlayer {
  return {
    towns: [],
    heroes: [],
    garrisons: [],
    mineCount: 0,
    resources: NO_RESOURCES,
    scoreStats: emptyScoreStats(),
    ...overrides,
  };
}

function testEmptyPlayerScoresZero() {
  assert.equal(computePlayerScore(scorable({})).total, 0, "an empty player should score 0");
}

function testPossessionsIncreaseScore() {
  const poor = computePlayerScore(scorable({ towns: [{ level: 1, buildings: [] }] })).total;
  const rich = computePlayerScore(
    scorable({ towns: [{ level: 5, buildings: ["a", "b", "c"] }, { level: 2, buildings: [] }] })
  ).total;
  assert.ok(rich > poor, "more/larger towns must score higher");
}

function testCumulativeCountersContribute() {
  const base = computePlayerScore(scorable({})).total;
  const withDefeats = computePlayerScore(
    scorable({ scoreStats: normalizeScoreStats({ playersDefeated: 1, monstersDefeated: 3 }) })
  ).total;
  assert.ok(withDefeats > base, "cumulative defeats must add points");
  // playersDefeated (2000) weighs more than several monsters (100 each).
  const onePlayer = computePlayerScore(scorable({ scoreStats: normalizeScoreStats({ playersDefeated: 1 }) })).total;
  const fiveMonsters = computePlayerScore(scorable({ scoreStats: normalizeScoreStats({ monstersDefeated: 5 }) })).total;
  assert.ok(onePlayer > fiveMonsters, "defeating a player should outweigh five monsters");
}

function testNormalizeScoreStatsCoercesGarbage() {
  const stats = normalizeScoreStats({ monstersDefeated: "4", playersDefeated: -2, bogus: 99 });
  assert.equal(stats.monstersDefeated, 4, "numeric strings are coerced");
  assert.equal(stats.playersDefeated, 0, "negatives clamp to 0");
  assert.equal((stats as unknown as Record<string, number>).bogus, undefined, "unknown keys are dropped");
}

function makePlayer(id: string, scoreStats: ReturnType<typeof emptyScoreStats>): Player {
  return {
    id,
    userId: null,
    name: id,
    isAi: false,
    faction: "castle" as Player["faction"],
    color: "#fff",
    resources: NO_RESOURCES,
    heroes: [],
    towns: [],
    resourceBuildings: [],
    isAlive: true,
    turnOrder: 0,
    exploredTiles: [],
    hasEndedTurn: false,
    scoreStats,
  };
}

function testRankPlayersOrdersDescending() {
  const strong = makePlayer("strong", normalizeScoreStats({ playersDefeated: 2 }));
  const weak = makePlayer("weak", emptyScoreStats());
  const ranked = rankPlayers([weak, strong]);
  assert.equal(ranked[0].player.id, "strong", "highest score ranks first");
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 2);
  assert.ok(ranked[0].breakdown.total > ranked[1].breakdown.total);
}

function testScorableFromPlayerCountsArtifacts() {
  const player = makePlayer("art", emptyScoreStats());
  player.heroes = [
    {
      id: "h1",
      name: "Hero",
      class: "knight" as Player["heroes"][number]["class"],
      level: 3,
      experience: 1000,
      stats: { attack: 4, defense: 3, spellPower: 1, knowledge: 2, morale: 0, luck: 0 },
      mana: 10,
      hasSpellBook: true,
      artifacts: { inventory: ["a"], equipment: { weapon: "b" } },
      position: { x: 0, y: 0, level: "surface" },
      movement: 0,
      maxMovement: 0,
      armies: [],
    } as Player["heroes"][number],
  ];
  const adapted = scorableFromPlayer(player);
  assert.equal(adapted.heroes[0].artifactCount, 2, "inventory + equipped artifacts are counted");
  assert.equal(adapted.heroes[0].statTotal, 10, "primary stats are summed");
}

testEmptyPlayerScoresZero();
testPossessionsIncreaseScore();
testCumulativeCountersContribute();
testNormalizeScoreStatsCoercesGarbage();
testRankPlayersOrdersDescending();
testScorableFromPlayerCountsArtifacts();

console.log("Score validation passed.");
