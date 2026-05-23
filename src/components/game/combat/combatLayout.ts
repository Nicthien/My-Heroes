import { CombatBoardUnit, CombatTerrainFeature, GameState, PersistentCombat } from "@/lib/game/types";
import { calculateCombatDamageRange, hasAdjacentEnemy } from "@/lib/game/combat/rules";
import { COMBAT_COLS, COMBAT_ROWS, findMeleeApproach, getHexDistance } from "@/lib/game/combat/movement";
import { getUnitRule } from "@/lib/game/units";

// Board geometry
export const TILE_WIDTH = 92;
export const TILE_HEIGHT = 64;
export const TILE_DEPTH = 0;
export const UNIT_HEIGHT = 118;
export const COL_STEP = TILE_WIDTH - 4;
export const ROW_STEP = TILE_HEIGHT * 0.75;
export const ROW_STAGGER = TILE_WIDTH / 2;
export const BOARD_PADDING_X = 86;
export const BOARD_PADDING_TOP = 128;
export const BOARD_PADDING_BOTTOM = 122;
export const ISO_GRID_WIDTH = (COMBAT_COLS - 1) * COL_STEP + ROW_STAGGER + TILE_WIDTH + BOARD_PADDING_X * 2;
export const ISO_GRID_HEIGHT = (COMBAT_ROWS - 1) * ROW_STEP + TILE_HEIGHT + UNIT_HEIGHT + BOARD_PADDING_TOP + BOARD_PADDING_BOTTOM;
export const ISO_ORIGIN_X = BOARD_PADDING_X;
export const ISO_ORIGIN_Y = BOARD_PADDING_TOP;

// Camera / interaction
export const MIN_BATTLE_ZOOM = 0.58;
export const MAX_BATTLE_ZOOM = 1.55;
export const DEFAULT_BATTLE_ZOOM = 0.82;
export const DEFAULT_BATTLE_PAN_X = -95;
export const DEFAULT_BATTLE_PAN_Y = 12;
export const RIGHT_DRAG_THRESHOLD = 5;

// Unit rendering offsets
export const UNIT_RENDER_OFFSET_X = 52;
export const DEFENDER_RENDER_NUDGE_X = -5;

// Animation timings
export const UNIT_MOVE_TRANSITION_MS = 1700;
export const UNIT_MOVE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const UNIT_ATTACK_ANIMATION_MS = 650;
export const UNIT_ATTACK_PRE_PAUSE_MS = 120;
export const UNIT_ATTACK_POST_PAUSE_MS = 80;
export const UNIT_ATTACK_IMPACT_OFFSET_MS = 280;
export const UNIT_DAMAGE_ANIMATION_MS = 520;
export const AUTOMATED_COMBAT_THINK_DELAY_MS = 350;
export const COMBAT_ACTION_SETTLE_BUFFER_MS = 140;

export type DamagePreview = {
  actorId: string;
  targetId: string;
  actionLabel: string;
  minDamage: number;
  maxDamage: number;
  minKills: number;
  maxKills: number;
};

export function getIsoPosition(q: number, r: number) {
  return {
    x: ISO_ORIGIN_X + q * COL_STEP + (r % 2) * ROW_STAGGER,
    y: ISO_ORIGIN_Y + r * ROW_STEP,
  };
}

export function getDepthScale(r: number) {
  return 0.86 + (r / Math.max(1, COMBAT_ROWS - 1)) * 0.22;
}

export function getUnitRenderOffsetX(unit: CombatBoardUnit) {
  return UNIT_RENDER_OFFSET_X + (unit.side === "defender" ? DEFENDER_RENDER_NUDGE_X : 0);
}

export function getUnitMoveTransition(durationMs: number) {
  if (durationMs <= 0) return "none";
  return `left ${durationMs}ms ${UNIT_MOVE_EASING}, top ${durationMs}ms ${UNIT_MOVE_EASING}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function formatRange(min: number, max: number) {
  return min === max ? String(min) : `${min}-${max}`;
}

export function getTerrainTitle(feature: CombatTerrainFeature) {
  return feature.type === "rock" ? "Rochers" : "Eau";
}

export function getUnitTitle(unit: CombatBoardUnit) {
  const base = `${getUnitRule(unit.unitType).label} x${unit.count}`;
  return unit.ranged ? `${base} | Tirs : ${unit.shots}` : base;
}

export function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function clearTimeouts(timeoutRef: { current: number[] }) {
  timeoutRef.current.forEach((timeout) => window.clearTimeout(timeout));
  timeoutRef.current = [];
}

export function getCombatSideStats(side: "attacker" | "defender", combat: PersistentCombat, gameState: GameState) {
  const heroId = side === "attacker" ? combat.attackerHeroId : combat.defenderHeroId;
  const hero = gameState.players.flatMap((player) => player.heroes).find((item) => item.id === heroId);
  return {
    attack: hero?.stats.attack ?? 0,
    defense: hero?.stats.defense ?? 0,
  };
}

export function getDamagePreview(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  combat: PersistentCombat,
  gameState: GameState
): DamagePreview {
  const distance = getHexDistance(actor, target);
  const canShoot = Boolean(actor.ranged && actor.shots > 0 && distance > 1 && !hasAdjacentEnemy(actor, combat.boardState.units));
  const actionType = canShoot ? "SHOOT" : "ATTACK";
  const approach = actionType === "ATTACK" && distance > 1
    ? findMeleeApproach(actor, target, combat.boardState.units, combat.boardState.terrain ?? [])
    : null;
  const previewActor = approach
    ? { ...actor, q: approach.destination.q, r: approach.destination.r }
    : actor;
  const attackerStats = getCombatSideStats(actor.side, combat, gameState);
  const defenderStats = getCombatSideStats(target.side, combat, gameState);
  const range = calculateCombatDamageRange({
    attacker: previewActor,
    defender: target,
    attackerStats,
    defenderStats,
    actionType,
    terrain: combat.boardState.terrain ?? [],
    actorAdjacentToEnemy: hasAdjacentEnemy(previewActor, combat.boardState.units),
  });

  return {
    actorId: actor.id,
    targetId: target.id,
    actionLabel: range.profile.actionLabel,
    minDamage: range.minDamage,
    maxDamage: range.maxDamage,
    minKills: range.minKills,
    maxKills: range.maxKills,
  };
}

export function buildPreAttackVisualUnits(previousUnits: CombatBoardUnit[], currentUnits: CombatBoardUnit[], damagedUnitIds: string[]) {
  const damagedIds = new Set(damagedUnitIds);
  const previousById = new Map(previousUnits.map((unit) => [unit.id, unit]));
  const currentIds = new Set(currentUnits.map((unit) => unit.id));
  const unitsWithDelayedDamage = currentUnits.map((unit) => {
    if (!damagedIds.has(unit.id)) return unit;
    const previous = previousById.get(unit.id);
    return previous
      ? { ...unit, count: previous.count, health: previous.health, shots: previous.shots }
      : unit;
  });
  const defeatedUnits = previousUnits.filter((unit) => damagedIds.has(unit.id) && !currentIds.has(unit.id));
  return [...unitsWithDelayedDamage, ...defeatedUnits];
}

export function getCombatActionSettleMs(previousCombat: PersistentCombat, currentCombat: PersistentCombat) {
  if (previousCombat.id !== currentCombat.id) return 0;

  const previousUnits = previousCombat.boardState.units;
  const currentUnits = currentCombat.boardState.units;
  const previousById = new Map(previousUnits.map((unit) => [unit.id, unit]));
  const currentIds = new Set(currentUnits.map((unit) => unit.id));
  const moved = currentUnits.some((unit) => {
    const previous = previousById.get(unit.id);
    return Boolean(previous && (unit.q !== previous.q || unit.r !== previous.r));
  });
  const damaged = currentUnits.some((unit) => {
    const previous = previousById.get(unit.id);
    return Boolean(previous && (unit.health < previous.health || unit.count < previous.count));
  });
  const defeated = previousUnits.some((unit) => unit.count > 0 && !currentIds.has(unit.id));
  const turnAdvanced =
    currentCombat.currentUnitId !== previousCombat.currentUnitId ||
    currentCombat.round !== previousCombat.round ||
    currentCombat.actionLog.length > previousCombat.actionLog.length;

  if (!moved && !damaged && !defeated && !turnAdvanced) return 0;

  let duration = 0;
  if (moved) duration = Math.max(duration, UNIT_MOVE_TRANSITION_MS);
  if (damaged || defeated) {
    const base = moved ? UNIT_MOVE_TRANSITION_MS + UNIT_ATTACK_PRE_PAUSE_MS : 0;
    duration = Math.max(
      duration,
      base + UNIT_ATTACK_ANIMATION_MS + UNIT_ATTACK_POST_PAUSE_MS + UNIT_DAMAGE_ANIMATION_MS
    );
  }
  if (duration === 0) duration = 450;
  return duration + COMBAT_ACTION_SETTLE_BUFFER_MS;
}

export function getCenteredInitiativeSlots(order: string[], currentUnitId: string | null | undefined, radius: number, nextRoundStartIndex = order.length) {
  if (order.length === 0) return [];
  const currentIndex = Math.max(0, currentUnitId ? order.indexOf(currentUnitId) : 0);
  const offsets = order.length === 1
    ? [0]
    : Array.from({ length: radius * 2 + 1 }, (_, index) => index - radius);

  return offsets.map((offset) => {
    const rawIndex = currentIndex + offset;
    const index = ((rawIndex % order.length) + order.length) % order.length;
    const startsNextRound = offset > 0 && rawIndex === nextRoundStartIndex;
    return {
      id: order[index],
      offset,
      startsNextRound,
    };
  });
}

export function mapCombat(combat: Record<string, unknown>): PersistentCombat {
  return {
    id: combat.id as string,
    gameId: combat.gameId as string,
    mode: combat.mode as "AUTO" | "MANUAL",
    status: combat.status as "ACTIVE" | "RESOLVED",
    attackerPlayerId: combat.attackerPlayerId as string,
    defenderPlayerId: combat.defenderPlayerId as string | null,
    attackerHeroId: combat.attackerHeroId as string,
    defenderHeroId: combat.defenderHeroId as string | null,
    neutralArmyId: combat.neutralArmyId as string | null,
    currentPlayerId: combat.currentPlayerId as string | null,
    currentUnitId: combat.currentUnitId as string | null,
    round: combat.round as number,
    position: { x: combat.x as number, y: combat.y as number },
    boardState: combat.boardState as PersistentCombat["boardState"],
    turnQueue: combat.turnQueue as string[],
    actionLog: combat.actionLog as string[],
    participants: (combat.participants as PersistentCombat["participants"]) ?? [],
    result: combat.result as PersistentCombat["result"],
    visibility: (combat.visibility as PersistentCombat["visibility"]) ?? "full",
  };
}
