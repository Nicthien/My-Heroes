"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CombatBoardUnit, CombatEnvironment, GameState, PersistentCombat } from "@/lib/game/types";
import { buildCombatEnvironment } from "@/lib/game/combat/environment";
import { getCellKey, isSiegeLandingBlocked } from "@/lib/game/combat/siege";
import {
  COMBAT_COLS,
  COMBAT_BASE_ROWS,
  COMBAT_ROWS,
  findHexPath,
  findMeleeApproach,
  getBlockedCombatCells,
  getOccupiedCombatCells,
} from "@/lib/game/combat/movement";
import { getAttackProfile, hasAdjacentEnemy } from "@/lib/game/combat/rules";
import { getUnitRule } from "@/lib/game/units";
import { playCombatDamageHit } from "@/lib/audio/combatAudio";
import { GAME_CURSORS } from "@/lib/ui/cursors";
import { BattlefieldScenery, IsoTile, SiegeMoatModel, TerrainModel } from "./battlefieldScenery";
import { DamagePreviewPanel } from "./combatPanels";
import { CombatSceneActors } from "./combatSceneActors";
import { SiegeOverlay } from "./SiegeOverlay";
import { UnitBadges, UnitModel } from "./battlefieldUnits";
import {
  DEFAULT_BATTLE_PAN_X,
  DEFAULT_BATTLE_PAN_Y,
  DEFAULT_BATTLE_ZOOM,
  ISO_GRID_WIDTH,
  MAX_BATTLE_ZOOM,
  MIN_BATTLE_ZOOM,
  RIGHT_DRAG_THRESHOLD,
  TILE_DEPTH,
  TILE_HEIGHT,
  TILE_WIDTH,
  UNIT_ATTACK_ANIMATION_MS,
  UNIT_ATTACK_IMPACT_OFFSET_MS,
  UNIT_ATTACK_POST_PAUSE_MS,
  UNIT_ATTACK_PRE_PAUSE_MS,
  UNIT_DAMAGE_ANIMATION_MS,
  UNIT_HEIGHT,
  UNIT_MOVE_TRANSITION_MS,
  buildPreAttackVisualUnits,
  clamp,
  clearTimeouts,
  getDamagePreview,
  getDepthScale,
  getIsoPosition,
  getIsoGridHeight,
  getTerrainTitle,
  getUnitRenderOffsetX,
  getUnitMoveTransition,
  getUnitTitle,
} from "./combatLayout";

type CombatHoverAction = "move" | "mêlée" | "ranged" | "rangedHampered";

const COMBAT_CURSORS: Record<CombatHoverAction, string> = {
  move: GAME_CURSORS.combat.moveWalk,
  mêlée: GAME_CURSORS.combat.attack,
  ranged: GAME_CURSORS.combat.shotGood,
  rangedHampered: GAME_CURSORS.combat.shotBad,
};

function getPointerCenter(points: Map<number, { x: number; y: number }>) {
  if (points.size === 0) return null;
  let x = 0;
  let y = 0;
  for (const point of points.values()) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.size, y: y / points.size };
}

function getPointerDistance(points: Map<number, { x: number; y: number }>) {
  const [first, second] = Array.from(points.values());
  if (!first || !second) return 0;
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getCombatCursor(action: CombatHoverAction, currentUnit: CombatBoardUnit | undefined) {
  if (action !== "move") return COMBAT_CURSORS[action];
  const abilities = currentUnit ? getUnitRule(currentUnit.unitType).abilities ?? [] : [];
  return abilities.includes("flying") ? GAME_CURSORS.combat.moveFly : COMBAT_CURSORS.move;
}

function resolveBattlefieldEnvironment(combat: PersistentCombat, gameState: GameState): CombatEnvironment {
  const mapEnvironment = buildCombatEnvironment(gameState.map, combat.position);
  const storedEnvironment = combat.boardState.environment;
  if (!storedEnvironment) return mapEnvironment;

  const usesLegacyBuildingTheme =
    storedEnvironment.theme === "building" &&
    (storedEnvironment.objectType === "building" || storedEnvironment.objectType === "adventure_building");
  const usesLegacyRoadOrCoastTheme =
    (storedEnvironment.theme === "road" || storedEnvironment.theme === "coast") &&
    storedEnvironment.theme !== mapEnvironment.theme;

  if (
    (usesLegacyBuildingTheme || usesLegacyRoadOrCoastTheme) &&
    storedEnvironment.terrain === mapEnvironment.terrain &&
    storedEnvironment.objectType === mapEnvironment.objectType
  ) {
    return { ...storedEnvironment, road: mapEnvironment.road, theme: mapEnvironment.theme };
  }

  return storedEnvironment;
}

export function IsoBattlefield({
  combat,
  gameState,
  inspectedUnitId,
  isMyAction,
  onAction,
  onInspectUnit,
  pendingSpellTarget = false,
  onSpellTarget,
  displayedCurrentUnitId,
  tacticsSelectedUnitId,
  onTacticsSelectedUnitChange,
}: {
  combat: PersistentCombat;
  gameState: GameState;
  inspectedUnitId: string | null;
  isMyAction: boolean;
  onAction: (action: Record<string, unknown>) => void;
  onInspectUnit: (unitId: string | null) => void;
  pendingSpellTarget?: boolean;
  onSpellTarget?: (unitId: string) => void;
  // ID of the unit shown as "active" in the UI (yellow highlight, hover
  // previews, pending move). Lags `combat.currentUnitId` while the previous
  // action's animation is still playing so the selection doesn't visually
  // jump to the next unit mid-attack.
  displayedCurrentUnitId: string | null;
  tacticsSelectedUnitId?: string | null;
  onTacticsSelectedUnitChange?: (unitId: string | null) => void;
}) {
  const [pendingMove, setPendingMove] = useState<{ unitId: string; q: number; r: number; path: { q: number; r: number }[] } | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ zoom: DEFAULT_BATTLE_ZOOM, panX: DEFAULT_BATTLE_PAN_X, panY: DEFAULT_BATTLE_PAN_Y });
  const units = combat.boardState.units;
  const terrain = combat.boardState.terrain ?? [];
  const [visualUnits, setVisualUnits] = useState<CombatBoardUnit[]>(units);
  const [damagedUnitIds, setDamagedUnitIds] = useState(() => new Set<string>());
  const [attackingUnit, setAttackingUnit] = useState<{ id: string; kind: "mêlée" | "ranged" } | null>(null);
  const [attackEffect, setAttackEffect] = useState<
    | { kind: "mêlée"; targetQ: number; targetR: number; key: number }
    | { kind: "ranged"; fromQ: number; fromR: number; targetQ: number; targetR: number; key: number }
    | null
  >(null);
  const tacticsPhase = (combat.boardState as { tacticsPhase?: { side: "attacker" | "defender"; maxColumn?: number; minColumn?: number } }).tacticsPhase;
  const isTacticsActive = Boolean(tacticsPhase);
  const selectedTacticsUnitId = tacticsSelectedUnitId ?? null;
  const setSelectedTacticsUnitId = onTacticsSelectedUnitChange ?? (() => undefined);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rightDragRef = useRef({ active: false, dragged: false, startX: 0, startY: 0, lastX: 0, lastY: 0 });
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const touchGestureRef = useRef<{ dragged: boolean; lastDistance: number; lastCenter: { x: number; y: number } | null }>({
    dragged: false,
    lastDistance: 0,
    lastCenter: null,
  });
  const previousCombatIdRef = useRef<string | null>(null);
  const previousUnitsRef = useRef<CombatBoardUnit[]>(units);
  const previousCurrentUnitIdRef = useRef<string | null>(combat.currentUnitId);
  const damageTimeoutsRef = useRef<number[]>([]);
  const revealDamageTimeoutsRef = useRef<number[]>([]);
  const attackTimeoutsRef = useRef<number[]>([]);
  const environment = useMemo(
    () => resolveBattlefieldEnvironment(combat, gameState),
    [combat, gameState]
  );
  const effectiveCurrentUnitId = displayedCurrentUnitId ?? combat.currentUnitId;
  const currentUnit = units.find((unit) => unit.id === effectiveCurrentUnitId);
  const occupied = currentUnit ? getOccupiedCombatCells(units, currentUnit.id) : getOccupiedCombatCells(units);
  const siege = combat.boardState.siege;
  const moatCells = useMemo(() => new Set((siege?.moat.cells ?? []).map(getCellKey)), [siege]);
  const blocked = getBlockedCombatCells(terrain, siege, units, currentUnit);
  const activePendingMove = pendingMove?.unitId === effectiveCurrentUnitId ? pendingMove : null;
  const previewTarget = units.find((unit) => unit.id === (hoveredUnitId ?? inspectedUnitId));
  const preview = currentUnit && previewTarget && previewTarget.side !== currentUnit.side
    ? getDamagePreview(currentUnit, previewTarget, combat, gameState)
    : null;

  const flashDamagedUnits = useCallback((unitIds: string[]) => {
    void playCombatDamageHit(0.55 + unitIds.length * 0.18);
    setDamagedUnitIds((previous) => new Set([...previous, ...unitIds]));
    const timeout = window.setTimeout(() => {
      setDamagedUnitIds((previous) => {
        const next = new Set(previous);
        unitIds.forEach((id) => next.delete(id));
        return next;
      });
    }, UNIT_DAMAGE_ANIMATION_MS);
    damageTimeoutsRef.current.push(timeout);
  }, []);

  useEffect(() => {
    const previousUnits = previousUnitsRef.current;
    const previousActorId = previousCurrentUnitIdRef.current;
    const previousById = new Map(previousUnits.map((unit) => [unit.id, unit]));
    const currentById = new Map(units.map((unit) => [unit.id, unit]));

    if (previousCombatIdRef.current !== combat.id) {
      previousCombatIdRef.current = combat.id;
      previousUnitsRef.current = units;
      previousCurrentUnitIdRef.current = combat.currentUnitId;
      setVisualUnits(units);
      setDamagedUnitIds(new Set());
      setAttackingUnit(null);
      setAttackEffect(null);
      return;
    }

    const damagedIds = units
      .filter((unit) => {
        const previous = previousById.get(unit.id);
        return previous && (unit.health < previous.health || unit.count < previous.count);
      })
      .map((unit) => unit.id);
    const removedDamagedIds = previousUnits
      .filter((unit) => unit.count > 0 && !currentById.has(unit.id))
      .map((unit) => unit.id);
    const allDamagedIds = [...damagedIds, ...removedDamagedIds];
    const movedIds = units
      .filter((unit) => {
        const previous = previousById.get(unit.id);
        return previous && (unit.q !== previous.q || unit.r !== previous.r);
      })
      .map((unit) => unit.id);

    const hasAnimatableDiff = movedIds.length > 0 || allDamagedIds.length > 0;
    if (!hasAnimatableDiff) {
      // No movement or damage in this state delta — likely a realtime echo,
      // DEFEND/WAIT action, or pure currentUnitId rotation. Don't disturb any
      // in-flight animation timers; just keep visualUnits in sync.
      previousUnitsRef.current = units;
      previousCurrentUnitIdRef.current = combat.currentUnitId;
      setVisualUnits(units);
      return;
    }

    previousUnitsRef.current = units;
    previousCurrentUnitIdRef.current = combat.currentUnitId;
    clearTimeouts(revealDamageTimeoutsRef);
    clearTimeouts(attackTimeoutsRef);

    if (allDamagedIds.length === 0) {
      // movedIds only — schedule a move-only reveal so visualUnits commits
      // to the final state at the end of the CSS transition. (Not strictly
      // necessary since positions already match, but keeps the flow uniform.)
      const revealTimeout = window.setTimeout(() => setVisualUnits(units), UNIT_MOVE_TRANSITION_MS);
      revealDamageTimeoutsRef.current.push(revealTimeout);
      return;
    }

    const actor = previousActorId
      ? previousById.get(previousActorId) ?? null
      : null;
    const enemyDamagedId = actor
      ? allDamagedIds.find((id) => {
          const target = previousById.get(id) ?? previousUnits.find((u) => u.id === id);
          return target ? target.side !== actor.side : false;
        }) ?? null
      : null;
    const enemyTarget = enemyDamagedId
      ? units.find((u) => u.id === enemyDamagedId) ?? previousUnits.find((u) => u.id === enemyDamagedId) ?? null
      : null;
    const actorMoved = actor ? movedIds.includes(actor.id) : false;
    const attackKind: "mêlée" | "ranged" | null = actor && enemyTarget
      ? actorMoved || !actor.ranged
        ? "mêlée"
        : "ranged"
      : null;
    // Actor position at the moment of impact: where it ends up after the move,
    // which is the current state's q/r for the actor.
    const actorAtImpact = actor ? units.find((u) => u.id === actor.id) ?? actor : null;

    setVisualUnits(buildPreAttackVisualUnits(previousUnits, units, allDamagedIds));

    const moveDelay = movedIds.length > 0 ? UNIT_MOVE_TRANSITION_MS : 0;
    const preAttackPause = attackKind && moveDelay > 0 ? UNIT_ATTACK_PRE_PAUSE_MS : 0;
    const attackStart = moveDelay + preAttackPause;

    if (attackKind && actor) {
      const actorId = actor.id;
      const attackTimeout = window.setTimeout(() => {
        setAttackingUnit({ id: actorId, kind: attackKind });
      }, attackStart);
      attackTimeoutsRef.current.push(attackTimeout);

      const clearAttackTimeout = window.setTimeout(() => {
        setAttackingUnit((prev) => (prev?.id === actorId ? null : prev));
      }, attackStart + UNIT_ATTACK_ANIMATION_MS);
      attackTimeoutsRef.current.push(clearAttackTimeout);

      // Impact effect: slash overlay on target for mêlée, projectile from actor
      // to target for ranged. Triggered at the strike apex of the lunge.
      if (enemyTarget && actorAtImpact) {
        const effectKey = Date.now();
        const impactDelay = attackStart + UNIT_ATTACK_IMPACT_OFFSET_MS;
        const effect =
          attackKind === "mêlée"
            ? { kind: "mêlée" as const, targetQ: enemyTarget.q, targetR: enemyTarget.r, key: effectKey }
            : {
                kind: "ranged" as const,
                fromQ: actorAtImpact.q,
                fromR: actorAtImpact.r,
                targetQ: enemyTarget.q,
                targetR: enemyTarget.r,
                key: effectKey,
              };
        const effectTimeout = window.setTimeout(() => setAttackEffect(effect), impactDelay);
        attackTimeoutsRef.current.push(effectTimeout);
        const effectClearTimeout = window.setTimeout(
          () => setAttackEffect((prev) => (prev?.key === effectKey ? null : prev)),
          impactDelay + 420
        );
        attackTimeoutsRef.current.push(effectClearTimeout);
      }
    }

    const damageDelay = attackKind
      ? attackStart + UNIT_ATTACK_ANIMATION_MS + UNIT_ATTACK_POST_PAUSE_MS
      : moveDelay;
    const revealTimeout = window.setTimeout(() => {
      setVisualUnits(units);
      flashDamagedUnits(allDamagedIds);
    }, damageDelay);
    revealDamageTimeoutsRef.current.push(revealTimeout);
  }, [combat.id, combat.currentUnitId, flashDamagedUnits, units]);

  useEffect(() => {
    return () => {
      clearTimeouts(damageTimeoutsRef);
      clearTimeouts(revealDamageTimeoutsRef);
      clearTimeouts(attackTimeoutsRef);
    };
  }, []);

  const resetCamera = () => setCamera({ zoom: DEFAULT_BATTLE_ZOOM, panX: DEFAULT_BATTLE_PAN_X, panY: DEFAULT_BATTLE_PAN_Y });
  const zoomCamera = (factor: number) => {
    const centerX = viewportRef.current?.clientWidth ? viewportRef.current.clientWidth / 2 : 0;
    const centerY = viewportRef.current?.clientHeight ? viewportRef.current.clientHeight / 2 : 0;
    setCamera((prev) => {
      const nextZoom = clamp(prev.zoom * factor, MIN_BATTLE_ZOOM, MAX_BATTLE_ZOOM);
      if (nextZoom === prev.zoom) return prev;
      return {
        zoom: nextZoom,
        panX: centerX - ((centerX - prev.panX) * nextZoom) / prev.zoom,
        panY: centerY - ((centerY - prev.panY) * nextZoom) / prev.zoom,
      };
    });
  };
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    setCamera((prev) => {
      const nextZoom = clamp(prev.zoom * factor, MIN_BATTLE_ZOOM, MAX_BATTLE_ZOOM);
      if (nextZoom === prev.zoom) return prev;
      return {
        zoom: nextZoom,
        panX: cursorX - ((cursorX - prev.panX) * nextZoom) / prev.zoom,
        panY: cursorY - ((cursorY - prev.panY) * nextZoom) / prev.zoom,
      };
    });
  }, []);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);
  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    rightDragRef.current = {
      active: true,
      dragged: false,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    };
  };
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const drag = rightDragRef.current;
    if (!drag.active) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    const totalDx = event.clientX - drag.startX;
    const totalDy = event.clientY - drag.startY;
    if (Math.hypot(totalDx, totalDy) > RIGHT_DRAG_THRESHOLD) drag.dragged = true;
    if (drag.dragged && (dx !== 0 || dy !== 0)) {
      setCamera((prev) => ({ ...prev, panX: prev.panX + dx, panY: prev.panY + dy }));
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  };
  const stopRightDrag = () => {
    rightDragRef.current.active = false;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    touchGestureRef.current = {
      dragged: false,
      lastDistance: getPointerDistance(touchPointersRef.current),
      lastCenter: getPointerCenter(touchPointersRef.current),
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || !touchPointersRef.current.has(event.pointerId)) return;
    touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const center = getPointerCenter(touchPointersRef.current);
    const distance = getPointerDistance(touchPointersRef.current);
    const gesture = touchGestureRef.current;
    if (!center || !gesture.lastCenter) return;

    const dx = center.x - gesture.lastCenter.x;
    const dy = center.y - gesture.lastCenter.y;
    if (touchPointersRef.current.size >= 2) {
      const delta = distance - gesture.lastDistance;
      setCamera((prev) => {
        const zoomFactor = Math.abs(delta) > 4 ? (delta > 0 ? 1.08 : 0.92) : 1;
        const nextZoom = clamp(prev.zoom * zoomFactor, MIN_BATTLE_ZOOM, MAX_BATTLE_ZOOM);
        return {
          zoom: nextZoom,
          panX: prev.panX + dx,
          panY: prev.panY + dy,
        };
      });
      gesture.dragged = true;
      gesture.lastDistance = distance;
      gesture.lastCenter = center;
      return;
    }

    if (gesture.dragged || Math.hypot(dx, dy) > 6) {
      setCamera((prev) => ({ ...prev, panX: prev.panX + dx, panY: prev.panY + dy }));
      gesture.dragged = true;
    }
    gesture.lastCenter = center;
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    touchPointersRef.current.delete(event.pointerId);
    touchGestureRef.current = {
      dragged: false,
      lastDistance: getPointerDistance(touchPointersRef.current),
      lastCenter: getPointerCenter(touchPointersRef.current),
    };
  };

  const handleTacticsBoardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isTacticsActive || !tacticsPhase || !isMyAction) return;
    if (event.target instanceof Element && event.target.closest('button[data-testid^="combat-cell-"]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = (event.clientX - rect.left) / camera.zoom;
    const localY = (event.clientY - rect.top) / camera.zoom;
    const hitUnit = [...visualUnits]
      .filter((unit) => unit.count > 0 && unit.side === tacticsPhase.side)
      .sort((a, b) => b.r - a.r || b.q - a.q)
      .find((unit) => {
        const { x, y } = getIsoPosition(unit.q, unit.r);
        const left = x + TILE_WIDTH / 2 + getUnitRenderOffsetX(unit) - 54;
        const top = y + UNIT_HEIGHT - 72;
        return localX >= left && localX <= left + 108 && localY >= top && localY <= top + 136;
      });
    if (hitUnit) setSelectedTacticsUnitId(hitUnit.id);
  };
  const visibleRows = Math.max(
    COMBAT_BASE_ROWS,
    Math.min(
      COMBAT_ROWS,
      [...units, ...terrain].reduce((max, item) => Math.max(max, Number(item.r ?? 0)), COMBAT_BASE_ROWS - 1) + 1
    )
  );
  const cells = [];
  for (let r = 0; r < visibleRows; r++) {
    for (let q = 0; q < COMBAT_COLS; q++) {
      const unit = units.find((item) => item.q === q && item.r === r);
      const feature = terrain.find((item) => item.q === q && item.r === r);
      const moatFeature = !feature && moatCells.has(`${q},${r}`) ? { type: "water" as const, q, r } : null;
      const landingBlocked = Boolean(currentUnit && isSiegeLandingBlocked(siege, { q, r }, units, currentUnit));
      const path = currentUnit && !unit && !feature && !landingBlocked ? findHexPath(currentUnit, { q, r }, occupied, blocked) : [];
      const reachable = Boolean(!isTacticsActive && isMyAction && currentUnit && !unit && !feature && !landingBlocked && path.length > 1 && path.length - 1 <= currentUnit.speed);
      const isPendingDestination = activePendingMove?.q === q && activePendingMove.r === r;
      const isPendingPath = Boolean(activePendingMove?.path.some((step) => step.q === q && step.r === r));
      const enemyUnit = currentUnit && unit && unit.side !== currentUnit.side ? unit : null;
      const shotProfile = currentUnit && enemyUnit
        ? getAttackProfile({
            actor: currentUnit,
            target: enemyUnit,
            actionType: "SHOOT",
            terrain,
            actorAdjacentToEnemy: hasAdjacentEnemy(currentUnit, units),
          })
        : null;
      const canShoot = Boolean(shotProfile?.canStrike);
      const meleeApproach = currentUnit && enemyUnit ? findMeleeApproach(currentUnit, enemyUnit, units, terrain, siege) : null;
      const isTacticsSelectableUnit = Boolean(isTacticsActive && tacticsPhase && unit && unit.side === tacticsPhase.side);
      const isTacticsDestination = Boolean(
        isTacticsActive &&
        tacticsPhase &&
        !unit &&
        !feature &&
        selectedTacticsUnitId &&
        (tacticsPhase.side === "attacker"
          ? q < (tacticsPhase.maxColumn ?? 0)
          : q > (tacticsPhase.minColumn ?? 0))
      );
      const hoverAction: CombatHoverAction | null = !isMyAction || isTacticsActive
        ? null
        : pendingSpellTarget
          ? enemyUnit ? "ranged" : null
          : enemyUnit && canShoot
          ? shotProfile && shotProfile.damagePenalty < 1
            ? "rangedHampered"
            : "ranged"
          : enemyUnit && meleeApproach
            ? "mêlée"
            : reachable
              ? "move"
              : null;
      const attackable = hoverAction === "mêlée" || hoverAction === "ranged" || hoverAction === "rangedHampered";
      const { x, y } = getIsoPosition(q, r);
      const canClick = isTacticsActive
        ? Boolean(isMyAction && (isTacticsSelectableUnit || isTacticsDestination))
        : isMyAction && !feature && Boolean(hoverAction);

      cells.push(
        <button
          type="button"
          key={`${q}-${r}`}
          data-testid={`combat-cell-${q}-${r}`}
          data-terrain-feature={feature?.type}
          data-siege-moat={moatFeature ? "true" : undefined}
          data-tactics-destination={isTacticsDestination ? "true" : undefined}
          data-tactics-selected={unit?.id === selectedTacticsUnitId ? "true" : undefined}
          className="absolute overflow-visible text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/80"
          style={{
            left: x,
            top: y + UNIT_HEIGHT,
            width: TILE_WIDTH,
            height: TILE_HEIGHT + TILE_DEPTH,
            zIndex: r * 100 + (unit ? 30 : feature ? 18 : 1),
            cursor: hoverAction
              ? getCombatCursor(hoverAction, currentUnit)
              : unit
                ? GAME_CURSORS.combat.info
                : isMyAction || isTacticsDestination || isTacticsSelectableUnit
                  ? GAME_CURSORS.combat.invalid
                  : GAME_CURSORS.default,
          }}
          aria-disabled={!canClick}
          tabIndex={canClick ? 0 : -1}
          onClick={() => {
            if (isTacticsActive && tacticsPhase) {
              if (!canClick) return;
              if (unit && unit.side === tacticsPhase.side) {
                setSelectedTacticsUnitId(unit.id);
                return;
              }
              if (!unit && !feature && selectedTacticsUnitId) {
                const inZone = tacticsPhase.side === "attacker"
                  ? q < (tacticsPhase.maxColumn ?? 0)
                  : q > (tacticsPhase.minColumn ?? 0);
                if (inZone) {
                  onAction({ type: "TACTICS_MOVE", unitId: selectedTacticsUnitId, q, r });
                  setSelectedTacticsUnitId(null);
                }
              }
              return;
            }
            // First Aid Tent : clic sur allié adjacent pour soigner
            if (currentUnit?.unitType === "first_aid_tent" && unit && unit.side === currentUnit.side && unit.id !== currentUnit.id) {
              const dist = Math.max(Math.abs(unit.q - currentUnit.q), Math.abs(unit.r - currentUnit.r));
              if (dist <= 1 && canClick) {
                onAction({ type: "HEAL", targetUnitId: unit.id });
                return;
              }
            }
            if (!canClick) return;
            if (pendingSpellTarget) {
              if (unit && enemyUnit) onSpellTarget?.(unit.id);
              return;
            }
            if (unit && (hoverAction === "ranged" || hoverAction === "rangedHampered")) {
              setPendingMove(null);
              onAction({ type: "SHOOT", targetUnitId: unit.id });
            } else if (unit && hoverAction === "mêlée") {
              setPendingMove(null);
              onAction({ type: "ATTACK", targetUnitId: unit.id });
            } else if (reachable && currentUnit) {
              if (isPendingDestination) {
                setPendingMove(null);
                onAction({ type: "MOVE", q, r });
                return;
              }
              setPendingMove({ unitId: currentUnit.id, q, r, path });
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            if (unit && !rightDragRef.current.dragged) onInspectUnit(unit.id);
          }}
          onMouseEnter={() => setHoveredUnitId(unit?.id ?? null)}
          onMouseLeave={() => setHoveredUnitId((prev) => (prev === unit?.id ? null : prev))}
          title={unit ? getUnitTitle(unit) : feature ? getTerrainTitle(feature, environment) : `${q},${r}`}
        >
          <IsoTile
            feature={feature}
            environment={environment}
            reachable={reachable || isTacticsDestination}
            attackable={attackable}
            pendingDestination={isPendingDestination}
            pendingPath={isPendingPath}
            active={isTacticsActive ? selectedTacticsUnitId === unit?.id : effectiveCurrentUnitId === unit?.id}
            inspected={inspectedUnitId === unit?.id}
            q={q}
            r={r}
          />
          {feature && <TerrainModel feature={feature} environment={environment} />}
          {moatFeature && <SiegeMoatModel />}
        </button>
      );
    }
  }

  const unitModels = visualUnits.map((unit) => {
    const { x, y } = getIsoPosition(unit.q, unit.r);
    const shotProfile = currentUnit
      ? getAttackProfile({
          actor: currentUnit,
          target: unit,
          actionType: "SHOOT",
          terrain,
          actorAdjacentToEnemy: hasAdjacentEnemy(currentUnit, units),
        })
      : null;
    const canShoot = Boolean(shotProfile?.canStrike);
    const attackable = Boolean(
      isMyAction &&
      currentUnit &&
      unit.side !== currentUnit.side &&
      (canShoot || findMeleeApproach(currentUnit, unit, units, terrain, siege))
    );
    const damaged = damagedUnitIds.has(unit.id);
    const attacking = attackingUnit?.id === unit.id ? attackingUnit.kind : null;

    return (
      <span
        key={unit.id}
        className="pointer-events-none absolute block"
        style={{
          left: x,
          top: y + UNIT_HEIGHT,
          width: TILE_WIDTH,
          height: TILE_HEIGHT + TILE_DEPTH,
          zIndex: unit.r * 100 + 30,
          transition: getUnitMoveTransition(UNIT_MOVE_TRANSITION_MS),
          willChange: "left, top",
        }}
      >
        <UnitModel
          unit={unit}
          active={isTacticsActive ? selectedTacticsUnitId === unit.id : effectiveCurrentUnitId === unit.id}
          attackable={attackable}
          damaged={damaged}
          attacking={attacking}
          lifted
          depthScale={getDepthScale(unit.r)}
          persistentLuckIcon={combat.gameId === "dev-combat-game"}
          interactive={Boolean(isTacticsActive && isMyAction && tacticsPhase && unit.side === tacticsPhase.side && !selectedTacticsUnitId)}
          onClick={() => {
            if (isTacticsActive && tacticsPhase && unit.side === tacticsPhase.side) {
              setSelectedTacticsUnitId(unit.id);
            }
          }}
        />
      </span>
    );
  });


  const unitBadges = visualUnits.map((unit) => {
    const { x, y } = getIsoPosition(unit.q, unit.r);
    const damaged = damagedUnitIds.has(unit.id);

    return (
      <span
        key={`${unit.id}-badges`}
        className="pointer-events-none absolute block overflow-visible"
        style={{
          left: x,
          top: y + UNIT_HEIGHT,
          width: TILE_WIDTH,
          height: TILE_HEIGHT + TILE_DEPTH,
          zIndex: 10000 + unit.r,
          transition: getUnitMoveTransition(UNIT_MOVE_TRANSITION_MS),
          willChange: "left, top",
        }}
      >
        <UnitBadges unit={unit} damaged={damaged} lifted depthScale={getDepthScale(unit.r)} />
      </span>
    );
  });
  return (
    <div
      ref={viewportRef}
      className="mobile-combat-board relative h-full min-h-[680px] w-full min-w-[860px] cursor-default overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopRightDrag}
      onMouseLeave={stopRightDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onContextMenu={(event) => event.preventDefault()}
    >
      <BattlefieldScenery environment={environment} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[68%] bg-[linear-gradient(180deg,rgba(55,66,55,0.08),rgba(35,34,27,0.72)_18%,rgba(22,22,18,0.92)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[58%] h-[520px] w-[1220px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(86,79,58,0.55),rgba(41,42,35,0.5)_55%,transparent_75%)] blur-md" />
      <div className="absolute left-4 top-4 z-30 flex flex-col gap-1">
        <button
          type="button"
          className="rounded-md border border-amber-500/50 bg-black/55 px-2 py-1 text-xs font-black text-amber-100 shadow-lg transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          onClick={resetCamera}
        >
          Vue
        </button>
        <button
          type="button"
          className="grid h-6 w-10 place-items-center rounded-md border border-amber-500/45 bg-black/55 text-sm font-black leading-none text-amber-100 shadow-lg transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          onClick={() => zoomCamera(1.12)}
          aria-label="Zoom avant"
          title="Zoom avant"
        >
          +
        </button>
        <button
          type="button"
          className="grid h-6 w-10 place-items-center rounded-md border border-amber-500/45 bg-black/55 text-sm font-black leading-none text-amber-100 shadow-lg transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          onClick={() => zoomCamera(0.89)}
          aria-label="Zoom arriere"
          title="Zoom arriere"
        >
          -
        </button>
      </div>
      {preview && <DamagePreviewPanel preview={preview} actor={currentUnit} target={previewTarget} />}
      <div
        className="absolute left-1/2 top-1/2"
        onClick={handleTacticsBoardClick}
        style={{
          width: ISO_GRID_WIDTH,
          height: getIsoGridHeight(visibleRows),
          transform: `translate(calc(-50% + ${camera.panX}px), calc(-50% + ${camera.panY}px)) scale(${camera.zoom})`,
          transformOrigin: "0 0",
          filter: "drop-shadow(0 20px 28px rgba(0,0,0,0.45))",
        }}
      >
        <CombatSceneActors combat={combat} gameState={gameState} />
        {cells}
        <SiegeOverlay
          siege={siege}
          units={visualUnits}
          lastTowerShots={(combat.boardState as { lastTowerShots?: Array<{ towerId?: string; towerIndex: number; targetQ: number; targetR: number }> }).lastTowerShots ?? []}
          round={combat.round}
        />
        {unitModels}
        {unitBadges}
        {attackEffect && (() => {
          if (attackEffect.kind === "mêlée") {
            const { x, y } = getIsoPosition(attackEffect.targetQ, attackEffect.targetR);
            return (
              <span
                key={attackEffect.key}
                className="pointer-events-none absolute block"
                style={{
                  left: x,
                  top: y + UNIT_HEIGHT,
                  width: TILE_WIDTH,
                  height: TILE_HEIGHT + TILE_DEPTH,
                  zIndex: attackEffect.targetR * 100 + 60,
                }}
              >
                <span className="combat-mêlée-slash" />
              </span>
            );
          }
          const from = getIsoPosition(attackEffect.fromQ, attackEffect.fromR);
          const to = getIsoPosition(attackEffect.targetQ, attackEffect.targetR);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          return (
            <span
              key={attackEffect.key}
              className="combat-projectile"
              style={
                {
                  left: from.x + TILE_WIDTH / 2 - 7,
                  top: from.y + UNIT_HEIGHT - 8,
                  zIndex: Math.max(attackEffect.fromR, attackEffect.targetR) * 100 + 60,
                  ["--proj-dx" as string]: `${dx}px`,
                  ["--proj-dy" as string]: `${dy}px`,
                } as React.CSSProperties
              }
            />
          );
        })()}
      </div>
    </div>
  );
}
