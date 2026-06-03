import type { VictoryCondition, VictoryConditionType } from "./types";
import type { Locale } from "@/lib/i18n/types";

/**
 * Defaults and helpers for the selectable game victory conditions.
 *
 * The condition is stored inside `games.game_config.victory` (no dedicated
 * column), normalized through {@link normalizeVictoryCondition} on every read
 * so legacy games (no victory key) transparently behave as "DOMINATION".
 */

export const DEFAULT_GOLD_TARGET = 100_000;
export const DEFAULT_TURN_LIMIT = 100;

export const GOLD_TARGET_BOUNDS = { min: 10_000, max: 1_000_000 } as const;
export const TURN_LIMIT_BOUNDS = { min: 10, max: 500 } as const;

const VICTORY_TYPES: readonly VictoryConditionType[] = ["DOMINATION", "GOLD", "TURN_LIMIT", "CAPTURE_TOWN"];

export interface VictoryConditionMeta {
  type: VictoryConditionType;
  label: string;
  labelEn: string;
  /** Short description shown next to the option in the wizard. */
  description: string;
  descriptionEn: string;
}

export const VICTORY_CONDITION_META: Record<VictoryConditionType, VictoryConditionMeta> = {
  DOMINATION: {
    type: "DOMINATION",
    label: "Domination",
    labelEn: "Domination",
    description: "Soyez le dernier joueur à posséder un héros ou une ville.",
    descriptionEn: "Be the last player to own a hero or a town.",
  },
  GOLD: {
    type: "GOLD",
    label: "Accumulation d'or",
    labelEn: "Gold accumulation",
    description: "Soyez le premier à atteindre le seuil d'or fixé.",
    descriptionEn: "Be the first to reach the set gold threshold.",
  },
  TURN_LIMIT: {
    type: "TURN_LIMIT",
    label: "Limite de tours",
    labelEn: "Turn limit",
    description: "À la fin du dernier tour, le meilleur score l'emporte.",
    descriptionEn: "When the final turn ends, the highest score wins.",
  },
  CAPTURE_TOWN: {
    type: "CAPTURE_TOWN",
    label: "Capture d'une ville",
    labelEn: "Capture a town",
    description: "Capturez la ville cible désignée sur la carte.",
    descriptionEn: "Capture the designated target town on the map.",
  },
};

export function victoryConditionLabel(type: VictoryConditionType, locale: Locale): string {
  const meta = VICTORY_CONDITION_META[type];
  return locale === "en" ? meta.labelEn : meta.label;
}

export function victoryConditionDescription(type: VictoryConditionType, locale: Locale): string {
  const meta = VICTORY_CONDITION_META[type];
  return locale === "en" ? meta.descriptionEn : meta.description;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isVictoryType(value: unknown): value is VictoryConditionType {
  return typeof value === "string" && (VICTORY_TYPES as readonly string[]).includes(value);
}

/**
 * Coerce an untyped `game_config.victory` blob into a complete VictoryCondition.
 * Unknown / missing values collapse to DOMINATION so old games keep working.
 */
export function normalizeVictoryCondition(raw: unknown): VictoryCondition {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = isVictoryType(source.type) ? source.type : "DOMINATION";

  if (type === "GOLD") {
    return { type, goldTarget: clamp(Number(source.goldTarget ?? DEFAULT_GOLD_TARGET), GOLD_TARGET_BOUNDS.min, GOLD_TARGET_BOUNDS.max) };
  }

  if (type === "TURN_LIMIT") {
    return { type, turnLimit: clamp(Number(source.turnLimit ?? DEFAULT_TURN_LIMIT), TURN_LIMIT_BOUNDS.min, TURN_LIMIT_BOUNDS.max) };
  }

  if (type === "CAPTURE_TOWN") {
    const target = source.targetTown && typeof source.targetTown === "object"
      ? (source.targetTown as Record<string, unknown>)
      : null;
    // A capture objective with no resolvable target town degrades to domination.
    if (!target || !Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.y))) {
      return { type: "DOMINATION" };
    }
    return {
      type,
      targetTown: {
        x: Math.floor(Number(target.x)),
        y: Math.floor(Number(target.y)),
        mapLevel: typeof target.mapLevel === "string" ? target.mapLevel : "surface",
      },
      targetTownName: typeof source.targetTownName === "string" ? source.targetTownName : undefined,
    };
  }

  return { type: "DOMINATION" };
}

/** Lightweight per-contender snapshot consumed by {@link evaluateVictory}. */
export interface VictoryContenderSnapshot {
  id: string;
  gold: number;
  towns: Array<{ x: number; y: number; mapLevel: string }>;
  /** Total score, only consulted to settle a TURN_LIMIT game. */
  score: number;
}

export interface VictoryEvaluationInput {
  condition: VictoryCondition;
  /** Players still in the game (alive and holding a hero or town). */
  contenders: VictoryContenderSnapshot[];
  turnNumber: number;
  /** True when every contender has finished their turn for `turnNumber`. */
  roundComplete: boolean;
}

export type VictoryOutcome =
  | { type: "continue" }
  | { type: "completed"; winnerId: string | null };

/**
 * Pure decision core shared by the server lifecycle and the validation suite.
 * Domination is always enforced (a lone contender wins, zero is a draw); the
 * configured objective can additionally hand an instant or scored win.
 */
export function evaluateVictory(input: VictoryEvaluationInput): VictoryOutcome {
  const { condition, contenders, turnNumber, roundComplete } = input;

  // An objective can be met while opponents are still alive.
  const objectiveWinnerId = findObjectiveWinner(condition, contenders);
  if (objectiveWinnerId) return { type: "completed", winnerId: objectiveWinnerId };

  // Domination fallback: last seated player wins; mutual wipe-out is a draw.
  if (contenders.length <= 1) {
    return { type: "completed", winnerId: contenders[0]?.id ?? null };
  }

  if (condition.type === "TURN_LIMIT" && turnNumber >= (condition.turnLimit ?? Infinity) && roundComplete) {
    return { type: "completed", winnerId: highestScoreContenderId(contenders) };
  }

  return { type: "continue" };
}

function findObjectiveWinner(condition: VictoryCondition, contenders: VictoryContenderSnapshot[]): string | null {
  if (condition.type === "GOLD") {
    const target = condition.goldTarget ?? Infinity;
    return contenders.find((player) => player.gold >= target)?.id ?? null;
  }
  if (condition.type === "CAPTURE_TOWN" && condition.targetTown) {
    const { x, y, mapLevel } = condition.targetTown;
    return (
      contenders.find((player) =>
        player.towns.some((town) => town.x === x && town.y === y && town.mapLevel === mapLevel)
      )?.id ?? null
    );
  }
  return null;
}

function highestScoreContenderId(contenders: VictoryContenderSnapshot[]): string | null {
  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const player of contenders) {
    if (player.score > bestScore) {
      bestScore = player.score;
      bestId = player.id;
    }
  }
  return bestId;
}

/** Human-readable summary of the active condition (lobby, banners). */
export function describeVictoryCondition(condition: VictoryCondition, locale: Locale = "fr"): string {
  const en = locale === "en";
  switch (condition.type) {
    case "GOLD": {
      const amount = (condition.goldTarget ?? DEFAULT_GOLD_TARGET).toLocaleString(en ? "en-US" : "fr-FR");
      return en ? `Reach ${amount} gold` : `Atteindre ${amount} or`;
    }
    case "TURN_LIMIT":
      return en
        ? `Highest score by turn ${condition.turnLimit ?? DEFAULT_TURN_LIMIT}`
        : `Meilleur score au tour ${condition.turnLimit ?? DEFAULT_TURN_LIMIT}`;
    case "CAPTURE_TOWN":
      if (condition.targetTownName) {
        return en ? `Capture ${condition.targetTownName}` : `Capturer ${condition.targetTownName}`;
      }
      return en ? "Capture the target town" : "Capturer la ville cible";
    case "DOMINATION":
    default:
      return en ? "Last player standing" : "Dernier joueur en lice";
  }
}
