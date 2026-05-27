import { BuildingType } from "@/lib/game/types";
import { makeRng } from "@/lib/game/engine/rng";
import type { AiDifficulty, AiDifficultyProfile } from "../types";

export type AiPersonality = "AGGRESSIVE" | "ECONOMIC" | "BALANCED" | "OPPORTUNIST";

export const AI_PERSONALITIES: AiPersonality[] = [
  "AGGRESSIVE",
  "ECONOMIC",
  "BALANCED",
  "OPPORTUNIST",
];

export interface AiPersonalityProfile {
  profileOverrides: Partial<AiDifficultyProfile>;
  buildPriority: BuildingType[];
  recruitHeroBias: number;
  mergeArmyBias: number;
  primaryEnemyAggressionBonus: number;
  skillPreference: {
    combat: number;
    economy: number;
    magic: number;
    utility: number;
  };
}

const DEFAULT_BUILD: BuildingType[] = [
  BuildingType.TOWN_HALL,
  BuildingType.TAVERN,
  BuildingType.MARKET,
  BuildingType.BARRACKS,
  BuildingType.DWELLING_1,
  BuildingType.RESOURCE_SILO,
  BuildingType.DWELLING_2,
  BuildingType.CITY_HALL,
  BuildingType.DWELLING_3,
  BuildingType.DWELLING_4,
];

const AGGRESSIVE_BUILD: BuildingType[] = [
  BuildingType.TOWN_HALL,
  BuildingType.TAVERN,
  BuildingType.BARRACKS,
  BuildingType.DWELLING_1,
  BuildingType.DWELLING_2,
  BuildingType.MARKET,
  BuildingType.DWELLING_3,
  BuildingType.CITY_HALL,
  BuildingType.DWELLING_4,
];

const ECONOMIC_BUILD: BuildingType[] = [
  BuildingType.TOWN_HALL,
  BuildingType.TAVERN,
  BuildingType.MARKET,
  BuildingType.RESOURCE_SILO,
  BuildingType.CITY_HALL,
  BuildingType.BARRACKS,
  BuildingType.DWELLING_1,
  BuildingType.DWELLING_2,
  BuildingType.DWELLING_3,
  BuildingType.DWELLING_4,
];

export const AI_PERSONALITY_PROFILES: Record<AiPersonality, AiPersonalityProfile> = {
  AGGRESSIVE: {
    profileOverrides: {
      aggressionWeight: 1.6,
      neutralPowerRatio: 1.05,
      humanPowerRatio: 1.3,
      threatWeight: 0.7,
      explorationWeight: 0.85,
      economyWeight: 0.85,
    },
    buildPriority: AGGRESSIVE_BUILD,
    recruitHeroBias: 1.2,
    mergeArmyBias: 1.3,
    primaryEnemyAggressionBonus: 1.4,
    skillPreference: { combat: 2.5, economy: 0.6, magic: 1.0, utility: 0.8 },
  },
  ECONOMIC: {
    profileOverrides: {
      aggressionWeight: 0.7,
      neutralPowerRatio: 1.4,
      humanPowerRatio: 1.9,
      threatWeight: 1.3,
      explorationWeight: 1.1,
      economyWeight: 1.5,
    },
    buildPriority: ECONOMIC_BUILD,
    recruitHeroBias: 0.7,
    mergeArmyBias: 0.9,
    primaryEnemyAggressionBonus: 0.9,
    skillPreference: { combat: 0.8, economy: 2.5, magic: 1.1, utility: 1.3 },
  },
  BALANCED: {
    profileOverrides: {},
    buildPriority: DEFAULT_BUILD,
    recruitHeroBias: 1.0,
    mergeArmyBias: 1.0,
    primaryEnemyAggressionBonus: 1.0,
    skillPreference: { combat: 1.3, economy: 1.2, magic: 1.2, utility: 1.0 },
  },
  OPPORTUNIST: {
    profileOverrides: {
      aggressionWeight: 1.2,
      neutralPowerRatio: 1.15,
      humanPowerRatio: 1.5,
      threatWeight: 1.1,
      explorationWeight: 1.25,
      economyWeight: 1.0,
    },
    buildPriority: DEFAULT_BUILD,
    recruitHeroBias: 1.1,
    mergeArmyBias: 1.0,
    primaryEnemyAggressionBonus: 1.15,
    skillPreference: { combat: 1.4, economy: 1.1, magic: 1.2, utility: 1.3 },
  },
};

export function getPersonalityProfile(personality: AiPersonality): AiPersonalityProfile {
  return AI_PERSONALITY_PROFILES[personality];
}

export function rollAiPersonality(seed: string, difficulty: AiDifficulty): AiPersonality {
  const rng = makeRng(`personality:${seed}:${difficulty}`);
  // On hard, slightly bias toward AGGRESSIVE/OPPORTUNIST; on simple, lean ECONOMIC/BALANCED.
  const weights: Record<AiPersonality, number> =
    difficulty === "hard"
      ? { AGGRESSIVE: 0.35, ECONOMIC: 0.15, BALANCED: 0.25, OPPORTUNIST: 0.25 }
      : difficulty === "normal"
        ? { AGGRESSIVE: 0.25, ECONOMIC: 0.25, BALANCED: 0.3, OPPORTUNIST: 0.2 }
        : { AGGRESSIVE: 0.2, ECONOMIC: 0.35, BALANCED: 0.3, OPPORTUNIST: 0.15 };
  const total = AI_PERSONALITIES.reduce((sum, p) => sum + weights[p], 0);
  let r = rng() * total;
  for (const personality of AI_PERSONALITIES) {
    r -= weights[personality];
    if (r <= 0) return personality;
  }
  return "BALANCED";
}

export function mergeDifficultyProfile(
  base: AiDifficultyProfile,
  personality: AiPersonality,
): AiDifficultyProfile {
  const overrides = AI_PERSONALITY_PROFILES[personality].profileOverrides;
  return {
    neutralPowerRatio: overrides.neutralPowerRatio ?? base.neutralPowerRatio,
    humanPowerRatio: overrides.humanPowerRatio ?? base.humanPowerRatio,
    threatWeight: overrides.threatWeight ?? base.threatWeight,
    explorationWeight: overrides.explorationWeight ?? base.explorationWeight,
    economyWeight: overrides.economyWeight ?? base.economyWeight,
    aggressionWeight: overrides.aggressionWeight ?? base.aggressionWeight,
  };
}
