import type { Player, Resources } from "./types";
import { getUnitRule } from "./units";

/**
 * Cumulative per-player counters persisted in the game (`game_players.score_stats`).
 * These accumulate over the lifetime of a single game and never decrease.
 */
export interface ScoreStats {
  monstersDefeated: number;
  heroesDefeated: number;
  playersDefeated: number;
  townsCaptured: number;
  buildingsCaptured: number;
  gatesCaptured: number;
  resourcesCollected: number;
  artifactsCollected: number;
  combatsWon: number;
}

export type ScoreStatKey = keyof ScoreStats;

const SCORE_STAT_KEYS: ScoreStatKey[] = [
  "monstersDefeated",
  "heroesDefeated",
  "playersDefeated",
  "townsCaptured",
  "buildingsCaptured",
  "gatesCaptured",
  "resourcesCollected",
  "artifactsCollected",
  "combatsWon",
];

export function emptyScoreStats(): ScoreStats {
  return {
    monstersDefeated: 0,
    heroesDefeated: 0,
    playersDefeated: 0,
    townsCaptured: 0,
    buildingsCaptured: 0,
    gatesCaptured: 0,
    resourcesCollected: 0,
    artifactsCollected: 0,
    combatsWon: 0,
  };
}

/** Coerce an untyped jsonb blob into a complete, numeric ScoreStats. */
export function normalizeScoreStats(raw: unknown): ScoreStats {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stats = emptyScoreStats();
  for (const key of SCORE_STAT_KEYS) {
    const value = Number(source[key]);
    stats[key] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  return stats;
}

/**
 * Single source of truth for score weighting — tune here.
 * Snapshot weights reward current possessions; cumulative weights reward lifetime achievements.
 */
export const SCORE_WEIGHTS = {
  town: { base: 1000, perLevel: 250, perBuilding: 60 },
  hero: { base: 200, perLevel: 40, perExperience: 0.02, perStatPoint: 15 },
  minePerBuilding: 250,
  armyPowerFactor: 0.05,
  artifactHeld: 150,
  resources: { gold: 0.002, basic: 0.02, rare: 0.04 },
  cumulative: {
    monstersDefeated: 100,
    heroesDefeated: 500,
    playersDefeated: 2000,
    townsCaptured: 400,
    buildingsCaptured: 150,
    gatesCaptured: 100,
    resourcesCollected: 0.01,
    artifactsCollected: 200,
    combatsWon: 50,
  },
} as const;

export interface ScoreCategory {
  key: string;
  label: string;
  points: number;
}

export interface ScoreBreakdown {
  categories: ScoreCategory[];
  total: number;
}

/** Normalized, shape-agnostic view of a player used by the scoring core. */
export interface ScorablePlayer {
  towns: Array<{ level?: number; buildings?: unknown[] }>;
  heroes: Array<{
    level?: number;
    experience?: number;
    statTotal: number;
    artifactCount: number;
    armies: Array<{ unitType: string; count: number }>;
  }>;
  garrisons: Array<{ unitType: string; count: number }>;
  mineCount: number;
  resources: Resources;
  scoreStats: ScoreStats;
}

function armyPower(stacks: Array<{ unitType: string; count: number }>): number {
  return stacks.reduce((total, stack) => {
    const count = Math.max(0, Number(stack.count ?? 0));
    if (count <= 0) return total;
    return total + getUnitRule(stack.unitType).power * count;
  }, 0);
}

export function computePlayerScore(player: ScorablePlayer): ScoreBreakdown {
  const w = SCORE_WEIGHTS;

  const townsPoints = player.towns.reduce(
    (sum, town) =>
      sum + w.town.base + (Number(town.level ?? 1)) * w.town.perLevel + (town.buildings?.length ?? 0) * w.town.perBuilding,
    0
  );

  const heroesPoints = player.heroes.reduce(
    (sum, hero) =>
      sum +
      w.hero.base +
      Number(hero.level ?? 1) * w.hero.perLevel +
      Number(hero.experience ?? 0) * w.hero.perExperience +
      hero.statTotal * w.hero.perStatPoint,
    0
  );

  const minesPoints = player.mineCount * w.minePerBuilding;

  const heroArmyPower = player.heroes.reduce((sum, hero) => sum + armyPower(hero.armies), 0);
  const armyPoints = (heroArmyPower + armyPower(player.garrisons)) * w.armyPowerFactor;

  const heldArtifacts = player.heroes.reduce((sum, hero) => sum + hero.artifactCount, 0);
  const artifactsPoints =
    heldArtifacts * w.artifactHeld + player.scoreStats.artifactsCollected * w.cumulative.artifactsCollected;

  const r = player.resources;
  const resourcesPoints =
    r.gold * w.resources.gold +
    (r.wood + r.ore) * w.resources.basic +
    (r.mercury + r.crystals + r.gems + r.sulfur) * w.resources.rare +
    player.scoreStats.resourcesCollected * w.cumulative.resourcesCollected;

  const s = player.scoreStats;
  const defeatedPoints =
    s.monstersDefeated * w.cumulative.monstersDefeated +
    s.heroesDefeated * w.cumulative.heroesDefeated +
    s.playersDefeated * w.cumulative.playersDefeated +
    s.combatsWon * w.cumulative.combatsWon;

  const capturesPoints =
    s.townsCaptured * w.cumulative.townsCaptured +
    s.buildingsCaptured * w.cumulative.buildingsCaptured +
    s.gatesCaptured * w.cumulative.gatesCaptured;

  const categories: ScoreCategory[] = [
    { key: "towns", label: "Châteaux", points: townsPoints },
    { key: "heroes", label: "Héros", points: heroesPoints },
    { key: "army", label: "Armée", points: armyPoints },
    { key: "mines", label: "Mines", points: minesPoints },
    { key: "artifacts", label: "Artefacts", points: artifactsPoints },
    { key: "resources", label: "Ressources", points: resourcesPoints },
    { key: "defeated", label: "Ennemis vaincus", points: defeatedPoints },
    { key: "captures", label: "Conquêtes", points: capturesPoints },
  ].map((category) => ({ ...category, points: Math.round(category.points) }));

  const total = categories.reduce((sum, category) => sum + category.points, 0);
  return { categories, total };
}

/** Adapter: build the normalized scorable from a client-side domain Player. */
export function scorableFromPlayer(player: Player): ScorablePlayer {
  return {
    towns: player.towns.map((town) => ({ level: town.level, buildings: town.buildings })),
    heroes: player.heroes.map((hero) => ({
      level: hero.level,
      experience: hero.experience,
      statTotal:
        hero.stats.attack + hero.stats.defense + hero.stats.spellPower + hero.stats.knowledge,
      artifactCount: hero.artifacts.inventory.length + Object.keys(hero.artifacts.equipment).length,
      armies: hero.armies.map((stack) => ({ unitType: stack.unitType, count: stack.count })),
    })),
    garrisons: player.towns.flatMap((town) =>
      town.garrison.map((stack) => ({ unitType: stack.unitType, count: stack.count }))
    ),
    mineCount: player.resourceBuildings.length,
    resources: player.resources,
    scoreStats: normalizeScoreStats(player.scoreStats),
  };
}

/**
 * Player shape as returned by the Supabase relations mapper (`toGame`/`toPlayer`):
 * flat resource fields, flat hero stats, camelCase army stacks. Used by the
 * server to score players from authoritative (un-sanitized) data.
 */
export interface DbScorablePlayer {
  gold?: number; wood?: number; ore?: number; mercury?: number; crystals?: number; gems?: number; sulfur?: number;
  scoreStats?: unknown;
  heroes?: Array<{
    level?: number; experience?: number;
    attack?: number; defense?: number; spellPower?: number; knowledge?: number;
    artifacts?: { inventory?: string[]; equipment?: Record<string, unknown> };
    armies?: Array<{ unitType: string; count: number }>;
  }>;
  towns?: Array<{ level?: number; buildings?: unknown[]; garrison?: Array<{ unitType: string; count: number }> }>;
  resourceBuildings?: unknown[];
}

/** Adapter: build the normalized scorable from a Supabase-relations player row. */
export function scorableFromDbPlayer(player: DbScorablePlayer): ScorablePlayer {
  return {
    towns: (player.towns ?? []).map((town) => ({ level: town.level, buildings: town.buildings })),
    heroes: (player.heroes ?? []).map((hero) => ({
      level: hero.level,
      experience: hero.experience,
      statTotal:
        Number(hero.attack ?? 0) + Number(hero.defense ?? 0) + Number(hero.spellPower ?? 0) + Number(hero.knowledge ?? 0),
      artifactCount:
        (hero.artifacts?.inventory?.length ?? 0) + Object.keys(hero.artifacts?.equipment ?? {}).length,
      armies: (hero.armies ?? []).map((stack) => ({ unitType: stack.unitType, count: stack.count })),
    })),
    garrisons: (player.towns ?? []).flatMap((town) =>
      (town.garrison ?? []).map((stack) => ({ unitType: stack.unitType, count: stack.count }))
    ),
    mineCount: (player.resourceBuildings ?? []).length,
    resources: {
      gold: Number(player.gold ?? 0),
      wood: Number(player.wood ?? 0),
      ore: Number(player.ore ?? 0),
      mercury: Number(player.mercury ?? 0),
      crystals: Number(player.crystals ?? 0),
      gems: Number(player.gems ?? 0),
      sulfur: Number(player.sulfur ?? 0),
    },
    scoreStats: normalizeScoreStats(player.scoreStats),
  };
}

/** Total score for a Supabase-relations player row (authoritative, full data). */
export function computeDbPlayerScore(player: DbScorablePlayer): number {
  return computePlayerScore(scorableFromDbPlayer(player)).total;
}

export interface RankedPlayer {
  player: Player;
  breakdown: ScoreBreakdown;
  rank: number;
}

/** Rank players by total score (descending). Ties share neither rank slot; stable by order. */
export function rankPlayers(players: Player[]): RankedPlayer[] {
  return players
    .map((player) => ({ player, breakdown: computePlayerScore(scorableFromPlayer(player)) }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
