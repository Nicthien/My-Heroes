import type { Resources } from "./types";
import { hashSeed } from "./engine/rng";
import { pickArtifactId } from "./artifacts";

export interface MonsterReward {
  gold: number;
  resources: Partial<Resources>;
  /** A minor-class artifact id carried by ~50% of eligible monsters; null otherwise. */
  artifactId: string | null;
}

const SECONDARY_COMMON = ["wood", "ore"] as const;
const SECONDARY_RARE = ["mercury", "crystals", "gems", "sulfur"] as const;

/**
 * Pocket guardians (`pocket-mon-*`) already guard a pocket artifact, so they grant no extra
 * loot. Every other neutral monster army — wandering (`mon-zone-*`), patrol (`mon-patrol-*`)
 * and sea patrol (`sea-mon-patrol-*`) — is eligible.
 */
export function isMonsterRewardEligible(monsterId: string | undefined | null): boolean {
  return typeof monsterId === "string" && monsterId.length > 0 && !monsterId.startsWith("pocket-mon-");
}

/**
 * Deterministic loot for a defeated neutral monster, seeded by its id so the map-hover
 * preview and the server-side grant always agree. Scales with the monster's guardianPower.
 * "Generous" tuning: ~2× the budget in gold + one common resource, plus a rare resource on
 * bigger packs. ~50% of monsters additionally carry a minor artifact (minor-class artifacts
 * are reserved for this drop and no longer spawn loose on the map).
 */
export function getMonsterReward(monsterId: string, guardianPower: number): MonsterReward {
  const budget = Math.max(60, Math.floor(guardianPower));
  const seed = hashSeed(`${monsterId}:reward`);

  const jitter = 0.85 + ((seed % 31) / 30) * 0.3; // 0.85 .. 1.15
  const gold = Math.max(50, Math.round(budget * 2 * jitter));

  const resources: Partial<Resources> = {};
  const common = SECONDARY_COMMON[(seed >>> 3) % SECONDARY_COMMON.length];
  resources[common] = Math.max(1, Math.round(budget / 100));
  if (budget >= 400) {
    const rare = SECONDARY_RARE[(seed >>> 7) % SECONDARY_RARE.length];
    resources[rare] = Math.max(1, Math.round(budget / 350));
  }

  const artifactId = (seed >>> 11) % 100 < 50
    ? pickArtifactId("minor", `${monsterId}:minor-loot`)
    : null;

  return { gold, resources, artifactId };
}
