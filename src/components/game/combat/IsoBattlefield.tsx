"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CombatBoardUnit, GameState, PersistentCombat } from "@/lib/game/types";
import { buildCombatEnvironment } from "@/lib/game/combat/environment";
import {
  COMBAT_COLS,
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
import { BattlefieldScenery, IsoTile, TerrainModel } from "./battlefieldScenery";
import { DamagePreviewPanel } from "./combatPanels";
import { UnitBadges, UnitModel } from "./battlefieldUnits";
import {
  ISO_GRID_HEIGHT,
  ISO_GRID_WIDTH,
  MAX_BATTLE_ZOOM,
  MIN_BATTLE_ZOOM,
  RIGHT_DRAG_THRESHOLD,
  TILE_DEPTH,
  TILE_HEIGHT,
  TILE_WIDTH,
  UNIT_DAMAGE_ANIMATION_MS,
  UNIT_HEIGHT,
  UNIT_MOVE_TRANSITION_MS,
  buildPreAttackVisualUnits,
  clamp,
  clearTimeouts,
  getDamagePreview,
  getDepthScale,
  getIsoPosition,
  getTerrainTitle,
  getUnitMoveTransition,
  getUnitTitle,
} from "./combatLayout";

type CombatHoverAction = "move" | "melee" | "ranged" | "rangedHampered";

const COMBAT_CURSORS: Record<CombatHoverAction, string> = {
  move: GAME_CURSORS.combat.moveWalk,
  melee: GAME_CURSORS.combat.attack,
  ranged: GAME_CURSORS.combat.shotGood,
  rangedHampered: GAME_CURSORS.combat.shotBad,
};

function getCombatCursor(action: CombatHoverAction, currentUnit: CombatBoardUnit | undefined) {
  if (action !== "move") return COMBAT_CURSORS[action];
  const abilities = currentUnit ? getUnitRule(currentUnit.unitType).abilities ?? [] : [];
  return abilities.includes("flying") ? GAME_CURSORS.combat.moveFly : COMBAT_CURSORS.move;
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
}: {
  combat: PersistentCombat;
  gameState: GameState;
  inspectedUnitId: string | null;
  isMyAction: boolean;
  onAction: (action: Record<string, unknown>) => void;
  onInspectUnit: (unitId: string | null) => void;
  pendingSpellTarget?: boolean;
  onSpellTarget?: (unitId: string) => void;
}) {
  const [pendingMove, setPendingMove] = useState<{ unitId: string; q: number; r: number; path: { q: number; r: number }[] } | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ zoom: 1, panX: 0, panY: 0 });
  const units = combat.boardState.units;
  const terrain = combat.boardState.terrain ?? [];
  const [visualUnits, setVisualUnits] = useState<CombatBoardUnit[]>(units);
  const [damagedUnitIds, setDamagedUnitIds] = useState(() => new Set<string>());
  const viewportRef = useRef<HTMLDivElement>(null);
  const rightDragRef = useRef({ active: false, dragged: false, startX: 0, startY: 0, lastX: 0, lastY: 0 });
  const previousCombatIdRef = useRef<string | null>(null);
  const previousUnitsRef = useRef<CombatBoardUnit[]>(units);
  const damageTimeoutsRef = useRef<number[]>([]);
  const revealDamageTimeoutsRef = useRef<number[]>([]);
  const environment = useMemo(
    () => combat.boardState.environment ?? buildCombatEnvironment(gameState.map, combat.position),
    [combat.boardState.environment, combat.position, gameState.map]
  );
  const currentUnit = units.find((unit) => unit.id === combat.currentUnitId);
  const occupied = currentUnit ? getOccupiedCombatCells(units, currentUnit.id) : getOccupiedCombatCells(units);
  const blocked = getBlockedCombatCells(terrain);
  const activePendingMove = pendingMove?.unitId === combat.currentUnitId ? pendingMove : null;
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
    const previousById = new Map(previousUnits.map((unit) => [unit.id, unit]));
    const currentById = new Map(units.map((unit) => [unit.id, unit]));

    if (previousCombatIdRef.current !== combat.id) {
      previousCombatIdRef.current = combat.id;
      previousUnitsRef.current = units;
      setVisualUnits(units);
      setDamagedUnitIds(new Set());
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

    previousUnitsRef.current = units;
    clearTimeouts(revealDamageTimeoutsRef);

    if (movedIds.length > 0 && allDamagedIds.length > 0) {
      setVisualUnits(buildPreAttackVisualUnits(previousUnits, units, allDamagedIds));
      const revealTimeout = window.setTimeout(() => {
        setVisualUnits(units);
        flashDamagedUnits(allDamagedIds);
      }, UNIT_MOVE_TRANSITION_MS);
      revealDamageTimeoutsRef.current.push(revealTimeout);
      return;
    }

    setVisualUnits(units);
    if (allDamagedIds.length > 0) flashDamagedUnits(allDamagedIds);
  }, [combat.id, flashDamagedUnits, units]);

  useEffect(() => {
    return () => {
      clearTimeouts(damageTimeoutsRef);
      clearTimeouts(revealDamageTimeoutsRef);
    };
  }, []);

  const resetCamera = () => setCamera({ zoom: 1, panX: 0, panY: 0 });
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

  const cells = [];
  for (let r = 0; r < COMBAT_ROWS; r++) {
    for (let q = 0; q < COMBAT_COLS; q++) {
      const unit = units.find((item) => item.q === q && item.r === r);
      const feature = terrain.find((item) => item.q === q && item.r === r);
      const path = currentUnit && !unit && !feature ? findHexPath(currentUnit, { q, r }, occupied, blocked) : [];
      const reachable = Boolean(isMyAction && currentUnit && !unit && !feature && path.length > 1 && path.length - 1 <= currentUnit.speed);
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
      const meleeApproach = currentUnit && enemyUnit ? findMeleeApproach(currentUnit, enemyUnit, units, terrain) : null;
      const hoverAction: CombatHoverAction | null = !isMyAction
        ? null
        : pendingSpellTarget
          ? enemyUnit ? "ranged" : null
          : enemyUnit && canShoot
          ? shotProfile && shotProfile.damagePenalty < 1
            ? "rangedHampered"
            : "ranged"
          : enemyUnit && meleeApproach
            ? "melee"
            : reachable
              ? "move"
              : null;
      const attackable = hoverAction === "melee" || hoverAction === "ranged" || hoverAction === "rangedHampered";
      const { x, y } = getIsoPosition(q, r);
      const canClick = isMyAction && !feature && Boolean(hoverAction);

      cells.push(
        <button
          type="button"
          key={`${q}-${r}`}
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
                : isMyAction
                  ? GAME_CURSORS.combat.invalid
                  : GAME_CURSORS.default,
          }}
          aria-disabled={!canClick}
          tabIndex={canClick ? 0 : -1}
          onClick={() => {
            if (!canClick) return;
            if (pendingSpellTarget) {
              if (unit && enemyUnit) onSpellTarget?.(unit.id);
              return;
            }
            if (unit && (hoverAction === "ranged" || hoverAction === "rangedHampered")) {
              setPendingMove(null);
              onAction({ type: "SHOOT", targetUnitId: unit.id });
            } else if (unit && hoverAction === "melee") {
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
          title={unit ? getUnitTitle(unit) : feature ? getTerrainTitle(feature) : `${q},${r}`}
        >
          <IsoTile
            feature={feature}
            environment={environment}
            reachable={reachable}
            attackable={attackable}
            pendingDestination={isPendingDestination}
            pendingPath={isPendingPath}
            active={combat.currentUnitId === unit?.id}
            inspected={inspectedUnitId === unit?.id}
          />
          {feature && <TerrainModel feature={feature} />}
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
      (canShoot || findMeleeApproach(currentUnit, unit, units, terrain))
    );
    const damaged = damagedUnitIds.has(unit.id);

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
        <UnitModel unit={unit} active={combat.currentUnitId === unit.id} attackable={attackable} damaged={damaged} lifted depthScale={getDepthScale(unit.r)} />
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
      className="relative h-full min-h-[680px] w-full min-w-[860px] cursor-default overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopRightDrag}
      onMouseLeave={stopRightDrag}
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
          100%
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
        style={{
          width: ISO_GRID_WIDTH,
          height: ISO_GRID_HEIGHT,
          transform: `translate(calc(-50% + ${camera.panX}px), calc(-50% + ${camera.panY}px)) scale(${camera.zoom})`,
          transformOrigin: "0 0",
          filter: "drop-shadow(0 20px 28px rgba(0,0,0,0.45))",
        }}
      >
        {cells}
        {unitModels}
        {unitBadges}
      </div>
    </div>
  );
}
