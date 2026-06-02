import { makeRng } from "@/lib/game/engine/rng";
import type { AiPersonality } from "./personality";

/**
 * Deterministic multiplier around 1.0, within ±amplitude, seeded by the given
 * parts. Used to break objective ties and add a touch of per-turn variability so
 * the AI stops moving in a robotic, coordinate-ordered pattern — while staying
 * fully reproducible for a given seed (no Math.random).
 */
export function scoringJitter(seedParts: Array<string | number>, amplitude = 0.08): number {
  if (amplitude <= 0) return 1;
  const rng = makeRng(`ai-jitter:${seedParts.join(":")}`);
  return 1 + (rng() * 2 - 1) * amplitude;
}

/** How erratic each personality is allowed to be (jitter amplitude). */
export function jitterAmplitude(personality: AiPersonality): number {
  switch (personality) {
    case "OPPORTUNIST": return 0.12;
    case "ECONOMIC": return 0.05;
    case "AGGRESSIVE": return 0.08;
    default: return 0.08;
  }
}
