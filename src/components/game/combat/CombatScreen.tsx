"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { CombatBoardUnit, CombatEnvironment, CombatTerrainFeature, GameState, PersistentCombat } from "@/lib/game/types";
import { buildCombatEnvironment } from "@/lib/game/combat/environment";
import { getCreature } from "@/lib/game/creature-catalog";
import { getUnitRule } from "@/lib/game/units";
import { buildTurnQueue, COMBAT_COLS, COMBAT_ROWS, getCurrentCombatPlayerId, getHexDistance } from "@/lib/game/combat/persistent";
import { getUnitSpritePath } from "@/lib/rendering/phaser/assets";
import { useGameStore } from "@/lib/stores/gameStore";
import { refreshGameState } from "@/lib/game/refresh";
import { createClient, isUsingSupabaseProxy } from "@/lib/supabase/browser";
import {
  CornerOrnaments,
  FleurDeLis,
  ParchmentBackground,
  goldText,
  ornateFrame,
  ornateFramePolished,
} from "@/components/game/hud/theme";

const TILE_WIDTH = 92;
const TILE_HEIGHT = 64;
const TILE_DEPTH = 0;
const UNIT_HEIGHT = 118;
const COL_STEP = TILE_WIDTH - 4;
const ROW_STEP = TILE_HEIGHT * 0.75;
const ROW_STAGGER = TILE_WIDTH / 2;
const BOARD_PADDING_X = 86;
const BOARD_PADDING_TOP = 128;
const BOARD_PADDING_BOTTOM = 122;
const ISO_GRID_WIDTH = (COMBAT_COLS - 1) * COL_STEP + ROW_STAGGER + TILE_WIDTH + BOARD_PADDING_X * 2;
const ISO_GRID_HEIGHT = (COMBAT_ROWS - 1) * ROW_STEP + TILE_HEIGHT + UNIT_HEIGHT + BOARD_PADDING_TOP + BOARD_PADDING_BOTTOM;
const ISO_ORIGIN_X = BOARD_PADDING_X;
const ISO_ORIGIN_Y = BOARD_PADDING_TOP;
const MIN_BATTLE_ZOOM = 0.58;
const MAX_BATTLE_ZOOM = 1.55;
const RIGHT_DRAG_THRESHOLD = 5;
const UNIT_RENDER_OFFSET_X = 52;
const DEFENDER_RENDER_NUDGE_X = -5;
const UNIT_MOVE_TRANSITION_MS = 980;
const UNIT_MOVE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const UNIT_DAMAGE_ANIMATION_MS = 520;

export type UnitModelKind = "infantry" | "archer" | "cavalry" | "winged" | "large" | "caster" | "beast" | "undead";

type DamagePreview = {
  actorId: string;
  targetId: string;
  actionLabel: string;
  damage: number;
  kills: number;
};

export default function CombatScreen() {
  const { data: session } = useSession();
  const activeCombat = useGameStore((state) => state.activeCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const setCombatResult = useGameStore((state) => state.setCombatResult);
  const setGameState = useGameStore((state) => state.setGameState);
  const gameState = useGameStore((state) => state.gameState);
  const minimizeCombat = useGameStore((state) => state.minimizeCombat);
  const focusTile = useGameStore((state) => state.focusTile);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const isSubmittingActionRef = useRef(false);
  const neutralActionKeyRef = useRef<string | null>(null);
  const fetchCombatInFlightRef = useRef(false);
  const activeCombatId = activeCombat?.id;

  useEffect(() => {
    if (activeCombat?.visibility === "joinable_summary") setActiveCombat(null);
  }, [activeCombat?.visibility, setActiveCombat]);

  const resolveCombat = useCallback(async (combat: PersistentCombat) => {
    setActiveCombat(null);
    if (combat.result) setCombatResult(combat.result);
    const myPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);
    const didLose = Boolean(
      combat.result &&
      myPlayer &&
      (combat.attackerPlayerId === myPlayer.id || combat.defenderPlayerId === myPlayer.id || combat.participants?.some((participant) => participant.playerId === myPlayer.id)) &&
      combat.result.winnerPlayerId !== myPlayer.id
    );
    if (didLose && myPlayer) {
      const mainTown = myPlayer.towns[0];
      if (mainTown) {
        focusTile(mainTown.position.x, mainTown.position.y);
      }
    }
    const refreshed = await refreshGameState(combat.gameId, session?.user?.id);
    if (refreshed) setGameState(refreshed);
  }, [focusTile, gameState?.players, session?.user?.id, setActiveCombat, setCombatResult, setGameState]);

  useEffect(() => {
    if (!activeCombatId) return;
    const supabase = createClient();
    let cancelled = false;

    const fetchLatestCombat = async () => {
      if (fetchCombatInFlightRef.current) return;
      fetchCombatInFlightRef.current = true;
      try {
        const current = useGameStore.getState().activeCombat;
        if (!current || current.id !== activeCombatId) return;
        if (current.status !== "ACTIVE") return;

        const response = await fetchWithSupabaseAuth(`/api/games/${current.gameId}/combats/${current.id}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled) return;
        const mapped = mapCombat(data);
        if (mapped.status === "RESOLVED") {
          await resolveCombat(mapped);
          return;
        }
        setActiveCombat(mapped);
      } finally {
        fetchCombatInFlightRef.current = false;
      }
    };

    void fetchLatestCombat();
    const channel = isUsingSupabaseProxy()
      ? null
      : supabase
          .channel(`combat:${activeCombatId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "combats", filter: `id=eq.${activeCombatId}` },
            () => void fetchLatestCombat()
          )
          .subscribe();
    const interval = setInterval(fetchLatestCombat, isUsingSupabaseProxy() ? 1000 : 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeCombatId, resolveCombat, setActiveCombat]);

  useEffect(() => {
    if (!activeCombat || !gameState) return;
    const syncedCombat = gameState.activeCombats?.find((combat) => combat.id === activeCombat.id);
    if (!syncedCombat || syncedCombat === activeCombat) return;
    setActiveCombat(syncedCombat);
  }, [activeCombat, gameState, setActiveCombat]);

  useEffect(() => {
    if (!activeCombat || !gameState || activeCombat.status !== "ACTIVE") return;
    const myPlayer = gameState.players.find((player) => player.userId === session?.user?.id);
    if (myPlayer?.isAlive === false) return;

    const currentActor = activeCombat.boardState.units.find((unit) => unit.id === activeCombat.currentUnitId);
    if (!currentActor || currentActor.ownerPlayerId !== null) return;

    const actionKey = [
      activeCombat.id,
      activeCombat.currentUnitId,
      activeCombat.round,
      activeCombat.turnQueue.join(","),
      activeCombat.actionLog.length,
    ].join(":");
    if (neutralActionKeyRef.current === actionKey || isSubmittingActionRef.current) return;

    let cancelled = false;
    const combat = activeCombat;
    neutralActionKeyRef.current = actionKey;
    isSubmittingActionRef.current = true;
    setIsSubmittingAction(true);

    async function playNeutralTurns() {
      try {
        const response = await fetchWithSupabaseAuth(`/api/games/${combat.gameId}/combats/${combat.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!response.ok) {
          neutralActionKeyRef.current = null;
          return;
        }

        const data = await response.json();
        const combatPayload = data.combat ?? data;
        if (!combatPayload || cancelled) return;

        const mapped = mapCombat(combatPayload);
        if (mapped.status === "RESOLVED" || data.result) {
          await resolveCombat({ ...mapped, result: mapped.result ?? data.result });
        } else {
          setActiveCombat(mapped);
        }
      } finally {
        isSubmittingActionRef.current = false;
        if (!cancelled) setIsSubmittingAction(false);
      }
    }

    playNeutralTurns();

    return () => {
      cancelled = true;
    };
  }, [activeCombat, gameState, resolveCombat, session?.user?.id, setActiveCombat]);

  if (!activeCombat || !gameState) return null;
  const myPlayer = gameState.players.find((player) => player.userId === session?.user?.id);
  const units = activeCombat.boardState.units;
  const currentUnit = units.find((unit) => unit.id === activeCombat.currentUnitId);
  const inspectedUnit = units.find((unit) => unit.id === inspectedUnitId) ?? null;
  const currentPlayerId = getCurrentCombatPlayerId(activeCombat.boardState, activeCombat.currentUnitId, activeCombat.currentPlayerId);
  const isMyAction = Boolean(myPlayer && currentPlayerId === myPlayer.id);
  const canSubmitAction = isMyAction && activeCombat.status === "ACTIVE" && Boolean(currentUnit) && !isSubmittingAction;

  const submitAction = async (action: Record<string, unknown>) => {
    if (!canSubmitAction || isSubmittingActionRef.current) return;

    isSubmittingActionRef.current = true;
    setIsSubmittingAction(true);
    try {
      const response = await fetchWithSupabaseAuth(`/api/games/${activeCombat.gameId}/combats/${activeCombat.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...action,
          expectedCurrentUnitId: activeCombat.currentUnitId,
          expectedRound: activeCombat.round,
          expectedActionLogLength: activeCombat.actionLog.length,
        }),
      });
      const data = await response.json();
      if (!response.ok && !data.combat) return;
      const combatPayload = data.combat ?? data;
      if (!combatPayload) return;
      const mapped = mapCombat(combatPayload);
      if (mapped.status === "RESOLVED" || data.result) {
        await resolveCombat({ ...mapped, result: mapped.result ?? data.result });
      } else {
        setActiveCombat(mapped);
      }
    } finally {
      isSubmittingActionRef.current = false;
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-[#151712] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#51616b_0%,#8a8973_17%,#4d4b3e_31%,#2e3029_46%,#161712_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,rgba(239,214,151,0.15),transparent_42rem),linear-gradient(90deg,rgba(0,0,0,0.24),transparent_26%,transparent_74%,rgba(0,0,0,0.24))]" />
      <header className="relative z-20 flex items-center justify-between border-b border-amber-700/50 bg-gradient-to-b from-[#1a1208]/95 via-stone-950/95 to-black/90 px-5 py-3 shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset,0_8px_30px_rgba(0,0,0,0.6)]">
        <div>
          <div className={`text-xs font-black uppercase tracking-[0.28em] ${goldText}`}>Combat tactique</div>
          <div className={`mt-0.5 text-lg font-black ${goldText}`}>Round {activeCombat.round}</div>
        </div>
        <div className={`rounded-md border px-3 py-1 text-sm font-black shadow-[0_0_0_1px_rgba(0,0,0,0.4)_inset] ${isMyAction ? "border-emerald-400/60 bg-emerald-950/80 text-emerald-100" : "border-red-500/50 bg-red-950/75 text-red-100"}`}>
          {isMyAction ? "A vous de jouer" : "En attente de l'adversaire"}
        </div>
        <button
          type="button"
          className="rounded-md border border-amber-600/60 bg-gradient-to-b from-stone-900 to-stone-950 px-3 py-1 text-sm font-bold text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.15)_inset] transition hover:from-stone-800 hover:to-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          onClick={() => minimizeCombat(activeCombat.id)}
        >
          Reduire
        </button>
      </header>
      <div className="relative z-10 flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div className="absolute left-1/2 top-3 z-30 w-[min(760px,calc(100%-7rem))] -translate-x-1/2">
            <InitiativeQueue combat={activeCombat} inspectedUnitId={inspectedUnitId} onInspectUnit={setInspectedUnitId} />
          </div>
          <IsoBattlefield
            combat={activeCombat}
            gameState={gameState}
            inspectedUnitId={inspectedUnitId}
            isMyAction={canSubmitAction}
            onAction={submitAction}
            onInspectUnit={setInspectedUnitId}
          />
        </main>
        <aside className="pointer-events-auto absolute bottom-0 right-0 top-0 z-20 flex w-80 max-w-[calc(100%-1rem)] flex-col gap-4 overflow-y-auto p-4 pr-3">
          <CombatFloatingPanel title={inspectedUnit ? "Creature inspectee" : "Unite active"} className={ornateFrame} bodyClassName="px-3 pb-3 pt-2">
            <div className="text-sm text-stone-200">
              {(inspectedUnit ?? currentUnit) ? (
                <UnitDetails unit={(inspectedUnit ?? currentUnit)!} />
              ) : (
                <div className="py-4 text-center text-stone-400">Aucune</div>
              )}
            </div>
          </CombatFloatingPanel>

          <CombatFloatingPanel title="Actions" className={ornateFramePolished} bodyClassName="px-3 pb-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canSubmitAction}
                onClick={() => submitAction({ type: "WAIT" })}
                className="rounded-md border border-amber-600/50 bg-gradient-to-b from-stone-800 to-stone-950 px-3 py-2 font-bold text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset] transition hover:from-stone-700 hover:to-stone-900 disabled:opacity-40"
              >
                Attendre
              </button>
              <button
                type="button"
                disabled={!canSubmitAction}
                onClick={() => submitAction({ type: "DEFEND" })}
                className="rounded-md border border-sky-400/60 bg-gradient-to-b from-sky-900 to-sky-950 px-3 py-2 font-bold text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.18)_inset] transition hover:from-sky-800 hover:to-sky-900 disabled:opacity-40"
              >
                Defendre
              </button>
            </div>
          </CombatFloatingPanel>

          <CombatFloatingPanel title="Journal" className={`flex flex-col ${ornateFramePolished}`} expandedClassName="min-h-64 flex-1" bodyClassName="min-h-0 flex-1 px-3 pb-3 pt-2">
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-sm text-stone-300">
              {activeCombat.actionLog.slice(-20).map((line, index) => (
                <div key={index} className="border-b border-amber-900/20 pb-1 last:border-b-0">{line}</div>
              ))}
            </div>
          </CombatFloatingPanel>
        </aside>
      </div>
    </div>
  );
}

function CombatFloatingPanel({
  title,
  children,
  className,
  expandedClassName,
  bodyClassName,
  defaultCollapsed = false,
}: {
  title: string;
  children: React.ReactNode;
  className: string;
  expandedClassName?: string;
  bodyClassName?: string;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className={`pointer-events-auto relative overflow-hidden ${className} ${collapsed ? "" : expandedClassName ?? ""}`}>
      <CornerOrnaments />
      <ParchmentBackground />
      <button
        type="button"
        className="relative z-10 flex w-full min-w-0 items-center gap-2 border-b border-amber-700/40 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        title={collapsed ? "Deplier" : "Replier"}
      >
        <FleurDeLis className="h-3 w-3 shrink-0 text-amber-400" />
        <span className={`min-w-0 flex-1 truncate text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>{title}</span>
        <FleurDeLis className="h-3 w-3 shrink-0 text-amber-400" />
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-amber-300/80 transition ${collapsed ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {!collapsed && (
        <div className={`relative z-10 ${bodyClassName ?? ""}`}>
          {children}
        </div>
      )}
    </section>
  );
}

function IsoBattlefield({
  combat,
  gameState,
  inspectedUnitId,
  isMyAction,
  onAction,
  onInspectUnit,
}: {
  combat: PersistentCombat;
  gameState: GameState;
  inspectedUnitId: string | null;
  isMyAction: boolean;
  onAction: (action: Record<string, unknown>) => void;
  onInspectUnit: (unitId: string | null) => void;
}) {
  const [pendingMove, setPendingMove] = useState<{ unitId: string; q: number; r: number; path: { q: number; r: number }[] } | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [damagedUnitIds, setDamagedUnitIds] = useState(() => new Set<string>());
  const viewportRef = useRef<HTMLDivElement>(null);
  const rightDragRef = useRef({ active: false, dragged: false, startX: 0, startY: 0, lastX: 0, lastY: 0 });
  const previousCombatIdRef = useRef<string | null>(null);
  const previousUnitVitalsRef = useRef(new Map<string, { count: number; health: number }>());
  const damageTimeoutsRef = useRef<number[]>([]);
  const combatStateKey = `${combat.id}:${combat.round}:${combat.currentUnitId ?? ""}:${combat.actionLog.length}`;
  const units = combat.boardState.units;
  const terrain = useMemo(() => combat.boardState.terrain ?? [], [combatStateKey]);
  const environment = useMemo(
    () => combat.boardState.environment ?? buildCombatEnvironment(gameState.map, combat.position),
    [combat.boardState.environment, combat.position, combatStateKey, gameState.map]
  );
  const currentUnit = useMemo(
    () => units.find((unit) => unit.id === combat.currentUnitId),
    [combat.currentUnitId, combatStateKey, units]
  );
  const occupied = useMemo(() => new Set(units.map((unit) => `${unit.q},${unit.r}`)), [combatStateKey, units]);
  const blocked = useMemo(() => new Set(terrain.map((feature) => `${feature.q},${feature.r}`)), [combatStateKey, terrain]);
  const activePendingMove = pendingMove?.unitId === combat.currentUnitId ? pendingMove : null;
  const previewTarget = units.find((unit) => unit.id === (hoveredUnitId ?? inspectedUnitId));
  const preview = currentUnit && previewTarget && previewTarget.side !== currentUnit.side
    ? getDamagePreview(currentUnit, previewTarget, combat, gameState)
    : null;

  useEffect(() => {
    const currentVitals = new Map(units.map((unit) => [unit.id, { count: unit.count, health: unit.health }]));

    if (previousCombatIdRef.current !== combat.id) {
      previousCombatIdRef.current = combat.id;
      previousUnitVitalsRef.current = currentVitals;
      setDamagedUnitIds(new Set());
      return;
    }

    const damagedIds = units
      .filter((unit) => {
        const previous = previousUnitVitalsRef.current.get(unit.id);
        return previous && (unit.health < previous.health || unit.count < previous.count);
      })
      .map((unit) => unit.id);

    previousUnitVitalsRef.current = currentVitals;
    if (damagedIds.length === 0) return;

    setDamagedUnitIds((previous) => new Set([...previous, ...damagedIds]));
    const timeout = window.setTimeout(() => {
      setDamagedUnitIds((previous) => {
        const next = new Set(previous);
        damagedIds.forEach((id) => next.delete(id));
        return next;
      });
    }, UNIT_DAMAGE_ANIMATION_MS);
    damageTimeoutsRef.current.push(timeout);
  }, [combat.id, units]);

  useEffect(() => {
    return () => {
      damageTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      damageTimeoutsRef.current = [];
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
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
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
  };
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
      const distance = currentUnit ? getHexDistance(currentUnit, { q, r }) : 999;
      const path = currentUnit && !unit && !feature ? findHexPath(currentUnit, { q, r }, occupied, blocked) : [];
      const reachable = Boolean(isMyAction && currentUnit && !unit && !feature && path.length > 1 && path.length - 1 <= currentUnit.speed);
      const isPendingDestination = activePendingMove?.q === q && activePendingMove.r === r;
      const isPendingPath = Boolean(activePendingMove?.path.some((step) => step.q === q && step.r === r));
      const attackable = Boolean(isMyAction && currentUnit && unit && unit.side !== currentUnit.side && (distance <= 1 || (currentUnit.ranged && currentUnit.shots > 0)));
      const { x, y } = getIsoPosition(q, r);
      const canClick = isMyAction && !feature && (reachable || attackable);

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
            cursor: canClick ? "pointer" : "default",
          }}
          aria-disabled={!canClick}
          tabIndex={canClick ? 0 : -1}
          onClick={() => {
            if (!canClick) return;
            if (attackable && unit) {
              setPendingMove(null);
              onAction({ type: distance <= 1 ? "ATTACK" : "SHOOT", targetUnitId: unit.id });
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

  const unitModels = units.map((unit) => {
    const { x, y } = getIsoPosition(unit.q, unit.r);
    const distance = currentUnit ? getHexDistance(currentUnit, unit) : 999;
    const attackable = Boolean(isMyAction && currentUnit && unit.side !== currentUnit.side && (distance <= 1 || (currentUnit.ranged && currentUnit.shots > 0)));
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

  const unitBadges = units.map((unit) => {
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
      onWheel={handleWheel}
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

function BattlefieldScenery({ environment }: { environment: CombatEnvironment }) {
  const preset = getSceneryPreset(environment);
  const trees = preset.trees;
  const mountains = preset.mountains;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: preset.background }}>
      <div className="absolute inset-x-0 top-0 h-52" style={{ background: preset.sky }} />
      <span className="absolute left-0 right-0 top-24 h-36" style={{ background: preset.horizon }} />
      {mountains.map((mountain, index) => (
        <span
          key={index}
          className="absolute top-2 blur-[0.2px] [clip-path:polygon(50%_0,100%_100%,0_100%)]"
          style={{ left: `${mountain.left}%`, width: mountain.width, height: mountain.height, background: preset.mountain }}
        />
      ))}
      {trees.map((tree, index) => (
        <span
          key={index}
          className="absolute h-36 w-24 origin-bottom"
          style={{ left: `${tree.left}%`, top: `${tree.top}%`, transform: `scale(${tree.scale})` }}
        >
          <span className="absolute bottom-0 left-1/2 h-16 w-3 -translate-x-1/2" style={{ background: preset.trunk }} />
          <span
            className="absolute bottom-8 left-1/2 h-24 w-20 -translate-x-1/2 opacity-90 [clip-path:polygon(50%_0,90%_42%,72%_42%,100%_82%,64%_78%,50%_100%,36%_78%,0_82%,28%_42%,10%_42%)]"
            style={{ background: preset.tree }}
          />
        </span>
      ))}
      {environment.theme === "road" && (
        <span className="absolute bottom-[10%] left-1/2 h-28 w-[62rem] -translate-x-1/2 skew-x-[-18deg] rounded-[50%] bg-stone-700/45 shadow-[inset_0_0_22px_rgba(250,204,21,0.12)]" />
      )}
      {(environment.theme === "coast" || environment.theme === "water") && (
        <span className="absolute bottom-[13%] left-[8%] h-28 w-[34rem] -skew-x-12 rounded-[50%] bg-cyan-300/18 shadow-[inset_0_0_34px_rgba(125,211,252,0.34)]" />
      )}
      {(environment.theme === "settlement" || environment.theme === "building") && (
        <span className="absolute right-[8%] top-[18%] h-36 w-44 bg-[linear-gradient(145deg,rgba(120,91,54,0.78),rgba(39,25,13,0.58))] shadow-[0_18px_32px_rgba(0,0,0,0.28)] [clip-path:polygon(12%_100%,12%_42%,28%_42%,28%_22%,50%_4%,72%_22%,72%_42%,88%_42%,88%_100%)]" />
      )}
      {environment.theme === "lava" && (
        <span className="absolute bottom-[16%] right-[12%] h-24 w-[28rem] -skew-x-12 rounded-[50%] bg-orange-500/22 shadow-[0_0_42px_rgba(249,115,22,0.35),inset_0_0_22px_rgba(254,240,138,0.35)]" />
      )}
      <span className="absolute bottom-0 left-0 h-32 w-56" style={{ background: preset.leftVignette }} />
      <span className="absolute bottom-0 right-0 h-36 w-64" style={{ background: preset.rightVignette }} />
    </div>
  );
}

function IsoTile({
  feature,
  environment,
  reachable,
  attackable,
  pendingDestination,
  pendingPath,
  active,
  inspected,
}: {
  feature?: CombatTerrainFeature;
  environment: CombatEnvironment;
  reachable: boolean;
  attackable: boolean;
  pendingDestination: boolean;
  pendingPath: boolean;
  active: boolean;
  inspected: boolean;
}) {
  const topColor = getTileTopColor(feature, environment, reachable, attackable, pendingDestination, pendingPath, active, inspected);
  const strokeColor = getTileStrokeColor(feature, reachable, attackable, pendingDestination, pendingPath, active, inspected);

  return (
    <span className="absolute left-0 top-0 block" style={{ width: TILE_WIDTH, height: TILE_HEIGHT + TILE_DEPTH }}>
      <svg
        className="absolute left-0 top-0 overflow-visible transition duration-150"
        width={TILE_WIDTH}
        height={TILE_HEIGHT}
        viewBox="0 0 92 64"
        aria-hidden="true"
      >
        <polygon
          points="46,2 90,18 90,46 46,62 2,46 2,18"
          fill={topColor}
          stroke="rgba(0,0,0,0.62)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <polygon
          points="46,2 90,18 90,46 46,62 2,46 2,18"
          fill="none"
          stroke={strokeColor}
          strokeWidth={active || attackable || pendingDestination || inspected ? 2.4 : reachable || pendingPath ? 2 : 1.15}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {(reachable || pendingPath || pendingDestination) && (
          <polygon
            points="46,8 82,22 82,42 46,56 10,42 10,22"
            fill={pendingDestination || pendingPath ? "rgba(229,169,57,0.16)" : "rgba(113,174,104,0.06)"}
            stroke={pendingDestination || pendingPath ? "rgba(229,169,57,0.82)" : "rgba(121,184,112,0.36)"}
            strokeWidth={pendingDestination || pendingPath ? 1.55 : 1}
            strokeLinejoin="round"
          />
        )}
        <polygon
          points="46,8 82,22 82,42 46,56 10,42 10,22"
          fill="none"
          stroke="rgba(255,255,255,0.055)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function TerrainModel({ feature }: { feature: CombatTerrainFeature }) {
  if (feature.type === "water") {
    return (
      <span className="pointer-events-none absolute left-[18px] top-[7px] h-8 w-[50px] -skew-y-12 rounded-[50%] bg-cyan-300/20 shadow-[inset_0_0_18px_rgba(125,211,252,0.55)]">
        <span className="absolute left-2 top-3 h-px w-9 bg-cyan-100/60" />
        <span className="absolute left-6 top-5 h-px w-5 bg-cyan-100/50" />
      </span>
    );
  }

  return (
    <span className="pointer-events-none absolute left-[23px] top-[-30px] block h-20 w-12">
      <span className="absolute bottom-3 left-2 h-14 w-8 skew-x-[-10deg] bg-gradient-to-br from-stone-300 via-stone-600 to-stone-950 shadow-[8px_8px_16px_rgba(0,0,0,0.45)] [clip-path:polygon(50%_0,88%_42%,72%_100%,18%_100%,0_40%)]" />
      <span className="absolute bottom-3 left-5 h-12 w-6 skew-x-[12deg] bg-gradient-to-b from-stone-200 to-stone-700 opacity-70 [clip-path:polygon(45%_0,100%_70%,50%_100%,0_58%)]" />
    </span>
  );
}

function UnitModel({
  unit,
  active,
  attackable,
  damaged = false,
  lifted = false,
  depthScale = 1,
}: {
  unit: CombatBoardUnit;
  active: boolean;
  attackable: boolean;
  damaged?: boolean;
  lifted?: boolean;
  depthScale?: number;
}) {
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const sideFlip = unit.side === "defender" ? "scaleX(-1)" : "scaleX(1)";
  const renderOffsetX = getUnitRenderOffsetX(unit);

  return (
    <span
      className={`pointer-events-none absolute block h-[159px] w-[125px] ${damaged ? "combat-unit-damaged" : ""} ${
        active ? "drop-shadow-[0_0_12px_rgba(252,211,77,0.75)]" : attackable ? "drop-shadow-[0_0_12px_rgba(248,113,113,0.65)]" : ""
      }`}
      style={{
        left: `calc(50% + ${renderOffsetX}px)`,
        top: lifted ? -64 : 4,
        transform: `translateX(-50%) scale(${depthScale})`,
        transformOrigin: "50% 100%",
      }}
    >
      <span
        className="absolute left-1/2 top-0 block h-[140px] w-[107px] -translate-x-1/2 drop-shadow-[0_10px_8px_rgba(0,0,0,0.55)]"
        style={{ transform: `translateX(-50%) ${sideFlip}` }}
      >
        <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitType={unit.unitType} />
      </span>
      {damaged && <span className="combat-unit-hit-flash absolute left-1/2 top-4 h-24 w-24 -translate-x-1/2 rounded-full bg-red-500/35 blur-sm" />}
    </span>
  );
}

function UnitBadges({
  unit,
  damaged = false,
  lifted = false,
  depthScale = 1,
}: {
  unit: CombatBoardUnit;
  damaged?: boolean;
  lifted?: boolean;
  depthScale?: number;
}) {
  const renderOffsetX = getUnitRenderOffsetX(unit);
  const badgeOffsetX = renderOffsetX / depthScale;

  return (
    <span
      className="absolute block h-[159px] w-[125px]"
      style={{
        left: `calc(50% + ${renderOffsetX}px)`,
        top: lifted ? -64 : 4,
        transform: `translateX(-50%) scale(${depthScale})`,
        transformOrigin: "50% 100%",
      }}
    >
      <span
        className={`absolute top-[108px] grid h-[18px] min-w-8 -translate-x-1/2 place-items-center rounded-sm border px-1 text-center text-[10px] font-black leading-none shadow-lg ${damaged ? "combat-unit-count-damaged" : ""} ${unit.side === "attacker" ? "border-blue-200/70 bg-blue-950/95 text-blue-50" : "border-red-200/70 bg-red-950/95 text-red-50"}`}
        style={{ left: `calc(50% - ${badgeOffsetX}px)` }}
      >
        {unit.count}
      </span>
      {unit.ranged && (
        <span
          className="absolute top-[91px] grid h-[14px] min-w-6 -translate-x-1/2 place-items-center rounded-sm border border-amber-300/60 bg-amber-950/90 px-1 text-[9px] font-black leading-none text-amber-100"
          style={{ left: `calc(50% - ${badgeOffsetX}px)` }}
        >
          {unit.shots}
        </span>
      )}
    </span>
  );
}

export function UnitSilhouette({
  kind,
  palette,
  ranged,
  unitType,
}: {
  kind: UnitModelKind;
  palette: ReturnType<typeof getUnitPalette>;
  ranged: boolean;
  unitType?: string;
}) {
  const gradId = `g-${useId().replace(/:/g, "")}`;
  if (unitType) {
    const spritePath = getUnitSpritePath(unitType);

    return (
      <Image
        src={spritePath}
        alt=""
        width={96}
        height={96}
        unoptimized
        draggable={false}
        className="h-full w-full object-contain"
        aria-hidden="true"
      />
    );
  }

  return (
    <svg viewBox="0 0 70 92" width="100%" height="100%" className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`${gradId}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.light} />
          <stop offset="55%" stopColor={palette.main} />
          <stop offset="100%" stopColor={palette.dark} />
        </linearGradient>
        <linearGradient id={`${gradId}-skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4d3aa" />
          <stop offset="100%" stopColor="#a87648" />
        </linearGradient>
        <linearGradient id={`${gradId}-steel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="55%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <radialGradient id={`${gradId}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef9c3" stopOpacity="1" />
          <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${gradId}-wing`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.light} stopOpacity="0.95" />
          <stop offset="100%" stopColor={palette.dark} stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={`${gradId}-shadow`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </linearGradient>
      </defs>
      <ellipse cx="35" cy="88" rx="22" ry="3.5" fill="rgba(0,0,0,0.45)" />
      {renderKind(kind, palette, ranged, gradId, unitType)}
    </svg>
  );
}

function renderKind(kind: UnitModelKind, palette: ReturnType<typeof getUnitPalette>, ranged: boolean, g: string, unitType?: string) {
  const visual = getUnitVisual(unitType, kind, ranged);
  const namedUnit = renderNamedUnit(unitType, palette, g, visual);
  if (namedUnit) return namedUnit;
  if (kind === "cavalry") return <CavalrySvg palette={palette} g={g} visual={visual} />;
  if (kind === "winged") return <WingedSvg palette={palette} g={g} visual={visual} />;
  if (kind === "large") return <LargeSvg palette={palette} g={g} visual={visual} />;
  if (kind === "beast") return <BeastSvg palette={palette} g={g} visual={visual} />;
  if (kind === "caster") return <CasterSvg palette={palette} g={g} visual={visual} />;
  if (kind === "undead") return <UndeadSvg palette={palette} g={g} visual={visual} />;
  return <InfantrySvg palette={palette} ranged={ranged || kind === "archer"} g={g} visual={visual} />;
}

function renderNamedUnit(unitType: string | undefined, palette: ReturnType<typeof getUnitPalette>, g: string, visual: UnitVisual) {
  if (!unitType) return null;
  if (unitType === "griffin" || unitType === "royal_griffin") return <GriffinCreature g={g} visual={visual} royal={unitType === "royal_griffin"} />;
  if (unitType === "unicorn") return <UnicornCreature visual={visual} />;
  if (unitType === "pegasus") return <PegasusCreature g={g} visual={visual} />;
  if (unitType === "green_dragon" || unitType === "red_dragon" || unitType === "bone_dragon" || unitType === "wyvern") {
    return <DragonCreature g={g} visual={visual} bone={unitType === "bone_dragon"} wyvern={unitType === "wyvern"} />;
  }
  if (unitType === "hydra") return <HydraCreature visual={visual} />;
  if (unitType === "dendroid") return <DendroidCreature visual={visual} />;
  if (unitType === "beholder") return <BeholderCreature visual={visual} />;
  if (unitType === "manticore") return <ManticoreCreature g={g} visual={visual} />;
  if (unitType === "roc") return <RocCreature g={g} visual={visual} />;
  if (unitType === "hell_hound") return <HoundCreature visual={visual} infernal />;
  if (unitType === "basilisk") return <LizardCreature visual={visual} gaze />;
  if (unitType === "gorgon") return <GorgonCreature visual={visual} />;
  if (unitType === "serpent_fly") return <SerpentFlyCreature visual={visual} />;
  return null;
}

type UnitVisual = {
  accent: string;
  secondary: string;
  metal: string;
  weapon: "spear" | "halberd" | "bow" | "crossbow" | "sword" | "greatsword" | "mace" | "hammer" | "axe" | "dagger" | "horn" | "staff" | "orb" | "lance" | "trident" | "claws" | "none";
  headgear: "crest" | "visor" | "hood" | "horns" | "antlers" | "crown" | "halo" | "cap" | "spikes" | "skull" | "none";
  motif: "cross" | "chevron" | "star" | "rune" | "leaf" | "fang" | "skull" | "eye" | "flame" | "gem" | "bolt" | "moon" | "sun" | "scale" | "claw" | "stripe";
  aura: "holy" | "flame" | "arcane" | "ghost" | "stone" | "leaf" | "none";
  shield: "kite" | "round" | "tower" | "none";
  wing: "feather" | "bat" | "dragon" | "stone" | "insect";
  body: "slim" | "stocky" | "tall" | "heavy" | "serpent" | "tree" | "bone" | "hound";
  extra: "banner" | "horn" | "antlers" | "tail" | "spikes" | "book" | "mane" | "chains" | "cape" | "none";
  mount: "horse" | "wolf" | "centaur" | "unicorn" | "nightmare" | "none";
};

const UNIT_VISUALS: Record<string, Partial<UnitVisual>> = {
  pikeman: { weapon: "spear", headgear: "crest", motif: "stripe", shield: "tower", accent: "#d7dde8" },
  halberdier: { weapon: "halberd", headgear: "visor", motif: "chevron", shield: "tower", accent: "#f2c94c" },
  archer: { weapon: "bow", headgear: "cap", motif: "leaf", shield: "none", accent: "#8fd3ff" },
  marksman: { weapon: "crossbow", headgear: "visor", motif: "star", shield: "none", accent: "#f8d66d" },
  griffin: { wing: "feather", headgear: "spikes", motif: "claw", extra: "mane", accent: "#f6c453" },
  royal_griffin: { wing: "feather", headgear: "crown", motif: "sun", extra: "mane", aura: "holy", accent: "#fff0a8" },
  swordsman: { weapon: "sword", headgear: "visor", motif: "cross", shield: "round", accent: "#c7d2fe" },
  crusader: { weapon: "greatsword", headgear: "crest", motif: "cross", shield: "kite", aura: "holy", accent: "#fef3c7" },
  monk: { weapon: "staff", headgear: "hood", motif: "sun", extra: "book", aura: "holy", accent: "#fde68a" },
  zealot: { weapon: "orb", headgear: "halo", motif: "bolt", extra: "book", aura: "holy", accent: "#fff7ad" },
  cavalier: { weapon: "lance", headgear: "crest", motif: "stripe", mount: "horse", accent: "#dbeafe" },
  champion: { weapon: "lance", headgear: "crown", motif: "sun", mount: "horse", extra: "banner", aura: "holy", accent: "#fef08a" },
  angel: { weapon: "sword", wing: "feather", headgear: "halo", motif: "sun", aura: "holy", accent: "#fff7ed" },
  archangel: { weapon: "greatsword", wing: "feather", headgear: "halo", motif: "star", aura: "holy", extra: "banner", accent: "#fefce8" },
  centaur: { weapon: "spear", headgear: "cap", motif: "leaf", mount: "centaur", accent: "#bbf7d0" },
  dwarf: { weapon: "axe", headgear: "horns", motif: "gem", shield: "round", body: "stocky", accent: "#fbbf24" },
  wood_elf: { weapon: "bow", headgear: "cap", motif: "leaf", shield: "none", aura: "leaf", accent: "#86efac" },
  pegasus: { wing: "feather", headgear: "halo", motif: "moon", mount: "horse", aura: "holy", accent: "#d9f99d" },
  dendroid: { weapon: "none", headgear: "antlers", motif: "leaf", body: "tree", aura: "leaf", extra: "spikes", accent: "#65a30d" },
  unicorn: { weapon: "none", headgear: "horns", motif: "star", mount: "unicorn", aura: "holy", accent: "#f0fdf4" },
  green_dragon: { wing: "dragon", headgear: "horns", motif: "scale", extra: "tail", aura: "leaf", accent: "#86efac" },
  gremlin: { weapon: "mace", headgear: "cap", motif: "bolt", body: "slim", accent: "#93c5fd" },
  gargoyle: { wing: "stone", headgear: "horns", motif: "rune", body: "stocky", aura: "stone", accent: "#cbd5e1" },
  golem: { weapon: "hammer", headgear: "spikes", motif: "gem", body: "heavy", aura: "stone", accent: "#94a3b8" },
  mage: { weapon: "staff", headgear: "hood", motif: "rune", aura: "arcane", extra: "book", accent: "#bfdbfe" },
  genie: { weapon: "orb", headgear: "crown", motif: "moon", aura: "arcane", body: "slim", accent: "#7dd3fc" },
  naga: { weapon: "sword", headgear: "crown", motif: "scale", body: "serpent", accent: "#c4b5fd" },
  giant: { weapon: "hammer", headgear: "crown", motif: "bolt", body: "tall", aura: "arcane", accent: "#dbeafe" },
  imp: { weapon: "claws", headgear: "horns", motif: "flame", wing: "bat", aura: "flame", body: "slim", accent: "#fb7185" },
  gog: { weapon: "orb", headgear: "horns", motif: "flame", aura: "flame", accent: "#fb923c" },
  hell_hound: { weapon: "claws", headgear: "spikes", motif: "fang", aura: "flame", body: "hound", extra: "tail", accent: "#f97316" },
  demon: { weapon: "axe", headgear: "horns", motif: "flame", shield: "round", body: "heavy", aura: "flame", accent: "#ef4444" },
  pit_fiend: { weapon: "trident", headgear: "horns", motif: "rune", aura: "flame", extra: "chains", accent: "#f87171" },
  efreet: { wing: "bat", headgear: "horns", motif: "flame", aura: "flame", body: "slim", accent: "#fb923c" },
  devil: { weapon: "trident", wing: "bat", headgear: "horns", motif: "fang", aura: "flame", extra: "tail", accent: "#f43f5e" },
  skeleton: { weapon: "sword", headgear: "skull", motif: "skull", shield: "round", body: "bone", aura: "ghost", accent: "#f8fafc" },
  zombie: { weapon: "mace", headgear: "none", motif: "stripe", body: "stocky", aura: "ghost", accent: "#a3e635" },
  wight: { weapon: "claws", headgear: "hood", motif: "moon", body: "slim", aura: "ghost", accent: "#c4b5fd" },
  vampire: { weapon: "sword", headgear: "crown", motif: "fang", aura: "ghost", extra: "cape", accent: "#fca5a5" },
  lich: { weapon: "staff", headgear: "crown", motif: "skull", aura: "ghost", extra: "book", accent: "#d8b4fe" },
  black_knight: { weapon: "greatsword", headgear: "horns", motif: "moon", shield: "kite", mount: "nightmare", aura: "ghost", accent: "#94a3b8" },
  bone_dragon: { wing: "dragon", headgear: "horns", motif: "skull", body: "bone", aura: "ghost", extra: "tail", accent: "#e5e7eb" },
  troglodyte: { weapon: "claws", headgear: "spikes", motif: "eye", body: "slim", accent: "#a78bfa" },
  harpy: { weapon: "claws", wing: "bat", headgear: "spikes", motif: "claw", extra: "tail", accent: "#c084fc" },
  beholder: { weapon: "orb", headgear: "none", motif: "eye", aura: "arcane", body: "heavy", accent: "#f0abfc" },
  medusa: { weapon: "bow", headgear: "spikes", motif: "scale", body: "serpent", aura: "arcane", accent: "#86efac" },
  minotaur: { weapon: "axe", headgear: "horns", motif: "fang", body: "heavy", accent: "#fb923c" },
  manticore: { wing: "bat", headgear: "spikes", motif: "claw", extra: "tail", accent: "#f472b6" },
  red_dragon: { wing: "dragon", headgear: "horns", motif: "flame", extra: "tail", aura: "flame", accent: "#f87171" },
  goblin: { weapon: "dagger", headgear: "cap", motif: "fang", body: "slim", accent: "#bef264" },
  wolf_rider: { weapon: "spear", headgear: "cap", motif: "fang", mount: "wolf", extra: "mane", accent: "#fdba74" },
  orc: { weapon: "axe", headgear: "horns", motif: "stripe", accent: "#fb923c" },
  ogre: { weapon: "mace", headgear: "none", motif: "fang", body: "heavy", accent: "#fed7aa" },
  roc: { wing: "feather", headgear: "spikes", motif: "bolt", extra: "mane", accent: "#fcd34d" },
  cyclops: { weapon: "hammer", headgear: "none", motif: "eye", body: "tall", accent: "#fdba74" },
  behemoth: { weapon: "claws", headgear: "horns", motif: "claw", body: "heavy", aura: "stone", extra: "spikes", accent: "#fb923c" },
  gnoll: { weapon: "axe", headgear: "cap", motif: "claw", body: "slim", accent: "#facc15" },
  lizardman: { weapon: "bow", headgear: "spikes", motif: "scale", accent: "#86efac" },
  serpent_fly: { wing: "insect", headgear: "spikes", motif: "bolt", aura: "leaf", body: "slim", accent: "#67e8f9" },
  basilisk: { weapon: "claws", headgear: "spikes", motif: "eye", body: "hound", aura: "stone", accent: "#84cc16" },
  gorgon: { weapon: "horn", headgear: "horns", motif: "scale", body: "heavy", aura: "stone", accent: "#94a3b8" },
  wyvern: { wing: "dragon", headgear: "horns", motif: "fang", extra: "tail", aura: "leaf", accent: "#4ade80" },
  hydra: { weapon: "claws", headgear: "spikes", motif: "scale", body: "heavy", extra: "tail", aura: "leaf", accent: "#86efac" },
};

function getUnitVisual(unitType: string | undefined, kind: UnitModelKind, ranged: boolean): UnitVisual {
  const defaults: UnitVisual = {
    accent: ranged ? "#fde68a" : "#dbeafe",
    secondary: kind === "undead" ? "#64748b" : "#7c2d12",
    metal: "#cbd5e1",
    weapon: ranged ? "bow" : kind === "caster" ? "staff" : kind === "winged" || kind === "beast" ? "claws" : "sword",
    headgear: kind === "caster" ? "hood" : kind === "undead" ? "skull" : "visor",
    motif: ranged ? "star" : "stripe",
    aura: "none",
    shield: ranged || kind !== "infantry" ? "none" : "round",
    wing: "feather",
    body: "slim",
    extra: "none",
    mount: "none",
  };
  const spec = unitType ? UNIT_VISUALS[unitType] : undefined;
  const visual = { ...defaults, ...spec };
  visual.secondary = spec?.secondary ?? darkenAccent(visual.accent);
  visual.metal = spec?.metal ?? (kind === "large" || visual.aura === "stone" ? "#94a3b8" : "#d1d5db");
  return visual;
}

function darkenAccent(color: string) {
  if (!color.startsWith("#") || color.length !== 7) return "#713f12";
  const r = Math.max(24, Math.floor(parseInt(color.slice(1, 3), 16) * 0.5));
  const g = Math.max(20, Math.floor(parseInt(color.slice(3, 5), 16) * 0.45));
  const b = Math.max(18, Math.floor(parseInt(color.slice(5, 7), 16) * 0.45));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function Aura({ visual }: { visual: UnitVisual }) {
  if (visual.aura === "none") return null;
  const color = visual.aura === "holy" ? "#fef9c3" : visual.aura === "flame" ? "#fb923c" : visual.aura === "arcane" ? "#a78bfa" : visual.aura === "leaf" ? "#86efac" : visual.aura === "stone" ? "#cbd5e1" : "#c4b5fd";
  return (
    <g opacity="0.58">
      <ellipse cx="35" cy="45" rx="28" ry="38" fill={color} opacity="0.12" />
      <path d="M18 58 Q12 44 22 30 M52 58 Q58 44 48 30" fill="none" stroke={color} strokeWidth="1.3" strokeDasharray={visual.aura === "flame" ? "2 3" : "4 4"} />
      {visual.aura === "flame" && <path d="M18 70 C14 60 22 55 18 46 C28 55 24 64 30 72 M54 70 C58 60 50 55 54 46 C44 55 48 64 42 72" fill={color} opacity="0.32" />}
      {visual.aura === "holy" && <path d="M24 8 Q35 2 46 8" fill="none" stroke={color} strokeWidth="1.4" />}
    </g>
  );
}

function ChestMotif({ visual, x = 35, y = 48, size = 1 }: { visual: UnitVisual; x?: number; y?: number; size?: number }) {
  const s = size;
  if (visual.motif === "cross") return <path d={`M${x} ${y - 7 * s} V${y + 7 * s} M${x - 6 * s} ${y - 1 * s} H${x + 6 * s}`} stroke={visual.accent} strokeWidth={1.6 * s} strokeLinecap="round" />;
  if (visual.motif === "chevron") return <path d={`M${x - 8 * s} ${y - 4 * s} L${x} ${y + 4 * s} L${x + 8 * s} ${y - 4 * s}`} fill="none" stroke={visual.accent} strokeWidth={1.7 * s} strokeLinecap="round" strokeLinejoin="round" />;
  if (visual.motif === "star") return <path d={`M${x} ${y - 8 * s} L${x + 2 * s} ${y - 2 * s} L${x + 8 * s} ${y - 2 * s} L${x + 3 * s} ${y + 2 * s} L${x + 5 * s} ${y + 8 * s} L${x} ${y + 4 * s} L${x - 5 * s} ${y + 8 * s} L${x - 3 * s} ${y + 2 * s} L${x - 8 * s} ${y - 2 * s} L${x - 2 * s} ${y - 2 * s} Z`} fill={visual.accent} opacity="0.9" />;
  if (visual.motif === "leaf") return <path d={`M${x - 1 * s} ${y + 7 * s} C${x - 12 * s} ${y - 1 * s} ${x - 4 * s} ${y - 10 * s} ${x + 7 * s} ${y - 7 * s} C${x + 8 * s} ${y + 2 * s} ${x + 5 * s} ${y + 6 * s} ${x - 1 * s} ${y + 7 * s} Z M${x - 1 * s} ${y + 6 * s} L${x + 5 * s} ${y - 6 * s}`} fill={visual.accent} stroke={visual.secondary} strokeWidth={0.5 * s} />;
  if (visual.motif === "fang") return <path d={`M${x - 5 * s} ${y - 6 * s} L${x - 1 * s} ${y + 8 * s} L${x + 2 * s} ${y - 5 * s} M${x + 4 * s} ${y - 6 * s} L${x + 8 * s} ${y + 8 * s} L${x + 11 * s} ${y - 5 * s}`} fill="none" stroke={visual.accent} strokeWidth={1.2 * s} strokeLinecap="round" />;
  if (visual.motif === "skull" || visual.motif === "eye") return (
    <g>
      <ellipse cx={x} cy={y} rx={8 * s} ry={5 * s} fill={visual.accent} opacity="0.9" />
      <circle cx={x - 3 * s} cy={y} r={1.3 * s} fill="#0f172a" />
      <circle cx={x + 3 * s} cy={y} r={1.3 * s} fill="#0f172a" />
      {visual.motif === "eye" && <circle cx={x} cy={y} r={2.2 * s} fill="#fef3c7" />}
    </g>
  );
  if (visual.motif === "flame") return <path d={`M${x} ${y + 8 * s} C${x - 9 * s} ${y} ${x - 1 * s} ${y - 5 * s} ${x - 2 * s} ${y - 12 * s} C${x + 6 * s} ${y - 4 * s} ${x + 11 * s} ${y + 1 * s} ${x} ${y + 8 * s} Z`} fill={visual.accent} opacity="0.92" />;
  if (visual.motif === "gem" || visual.motif === "rune") return <path d={`M${x} ${y - 8 * s} L${x + 8 * s} ${y} L${x} ${y + 8 * s} L${x - 8 * s} ${y} Z`} fill={visual.accent} stroke={visual.secondary} strokeWidth={0.6 * s} />;
  if (visual.motif === "bolt") return <path d={`M${x + 2 * s} ${y - 10 * s} L${x - 7 * s} ${y + 2 * s} H${x} L${x - 3 * s} ${y + 10 * s} L${x + 8 * s} ${y - 4 * s} H${x + 1 * s} Z`} fill={visual.accent} />;
  if (visual.motif === "moon") return <path d={`M${x + 5 * s} ${y - 7 * s} C${x - 6 * s} ${y - 5 * s} ${x - 7 * s} ${y + 6 * s} ${x + 4 * s} ${y + 8 * s} C${x - 2 * s} ${y + 2 * s} ${x - 1 * s} ${y - 2 * s} ${x + 5 * s} ${y - 7 * s} Z`} fill={visual.accent} />;
  if (visual.motif === "sun") return <circle cx={x} cy={y} r={6 * s} fill={visual.accent} stroke="#fef3c7" strokeWidth={1 * s} />;
  if (visual.motif === "scale") return <path d={`M${x - 9 * s} ${y - 5 * s} Q${x - 5 * s} ${y - 10 * s} ${x} ${y - 5 * s} Q${x + 5 * s} ${y - 10 * s} ${x + 9 * s} ${y - 5 * s} M${x - 8 * s} ${y + 2 * s} Q${x - 3 * s} ${y - 3 * s} ${x + 2 * s} ${y + 2 * s} Q${x + 7 * s} ${y - 3 * s} ${x + 12 * s} ${y + 2 * s}`} fill="none" stroke={visual.accent} strokeWidth={1.2 * s} />;
  if (visual.motif === "claw") return <path d={`M${x - 8 * s} ${y + 6 * s} L${x - 4 * s} ${y - 6 * s} M${x} ${y + 7 * s} V${y - 7 * s} M${x + 8 * s} ${y + 6 * s} L${x + 4 * s} ${y - 6 * s}`} stroke={visual.accent} strokeWidth={1.4 * s} strokeLinecap="round" />;
  return <path d={`M${x - 9 * s} ${y - 5 * s} H${x + 9 * s} M${x - 7 * s} ${y} H${x + 7 * s} M${x - 5 * s} ${y + 5 * s} H${x + 5 * s}`} stroke={visual.accent} strokeWidth={1.2 * s} strokeLinecap="round" />;
}

function Headgear({ visual, cx, cy }: { visual: UnitVisual; cx: number; cy: number }) {
  if (visual.headgear === "none") return null;
  if (visual.headgear === "crest") return <path d={`M${cx - 2} ${cy - 11} Q${cx} ${cy - 18} ${cx + 5} ${cy - 10}`} fill="none" stroke={visual.accent} strokeWidth="2" strokeLinecap="round" />;
  if (visual.headgear === "visor") return <path d={`M${cx - 7} ${cy - 1} H${cx + 7} M${cx - 4} ${cy + 3} H${cx + 4}`} stroke="#111827" strokeWidth="1.1" strokeLinecap="round" />;
  if (visual.headgear === "hood") return <path d={`M${cx - 9} ${cy + 1} Q${cx} ${cy - 15} ${cx + 9} ${cy + 1} Q${cx} ${cy - 3} ${cx - 9} ${cy + 1} Z`} fill={visual.secondary} opacity="0.86" />;
  if (visual.headgear === "horns") return <path d={`M${cx - 7} ${cy - 4} Q${cx - 16} ${cy - 13} ${cx - 10} ${cy - 1} M${cx + 7} ${cy - 4} Q${cx + 16} ${cy - 13} ${cx + 10} ${cy - 1}`} fill="none" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" />;
  if (visual.headgear === "antlers") return <path d={`M${cx - 6} ${cy - 5} Q${cx - 15} ${cy - 16} ${cx - 13} ${cy - 3} M${cx - 14} ${cy - 10} L${cx - 19} ${cy - 15} M${cx + 6} ${cy - 5} Q${cx + 15} ${cy - 16} ${cx + 13} ${cy - 3} M${cx + 14} ${cy - 10} L${cx + 19} ${cy - 15}`} fill="none" stroke={visual.accent} strokeWidth="1.6" strokeLinecap="round" />;
  if (visual.headgear === "crown") return <path d={`M${cx - 9} ${cy - 5} L${cx - 5} ${cy - 12} L${cx} ${cy - 5} L${cx + 5} ${cy - 12} L${cx + 9} ${cy - 5} Z`} fill={visual.accent} stroke={visual.secondary} strokeWidth="0.6" />;
  if (visual.headgear === "halo") return <ellipse cx={cx} cy={cy - 12} rx="10" ry="3" fill="none" stroke={visual.accent} strokeWidth="1.5" />;
  if (visual.headgear === "cap") return <path d={`M${cx - 8} ${cy - 6} Q${cx} ${cy - 12} ${cx + 8} ${cy - 6} L${cx + 10} ${cy - 3} H${cx - 9} Z`} fill={visual.secondary} />;
  if (visual.headgear === "spikes") return <path d={`M${cx - 9} ${cy - 5} L${cx - 6} ${cy - 13} L${cx - 2} ${cy - 5} L${cx + 2} ${cy - 14} L${cx + 6} ${cy - 5} L${cx + 9} ${cy - 12}`} fill="none" stroke={visual.accent} strokeWidth="1.4" strokeLinecap="round" />;
  return <path d={`M${cx - 5} ${cy - 9} H${cx + 5} M${cx - 3} ${cy - 12} H${cx + 3}`} stroke={visual.accent} strokeWidth="1.4" strokeLinecap="round" />;
}

function HeldWeapon({ visual, g, ranged, x = 53, y = 44 }: { visual: UnitVisual; g: string; ranged?: boolean; x?: number; y?: number }) {
  const weapon = visual.weapon === "none" && ranged ? "bow" : visual.weapon;
  if (weapon === "none") return null;
  if (weapon === "bow") return (
    <g>
      <path d={`M${x + 3} ${y - 18} Q${x + 12} ${y} ${x + 3} ${y + 20}`} fill="none" stroke="#7c4a1e" strokeWidth="2.2" strokeLinecap="round" />
      <path d={`M${x + 3} ${y - 18} L${x + 3} ${y + 20} M${x + 3} ${y} H${x - 7}`} stroke="#f8fafc" strokeWidth="0.7" />
      <path d={`M${x - 7} ${y} L${x - 10} ${y - 2} M${x - 7} ${y} L${x - 10} ${y + 2}`} stroke="#f8fafc" strokeWidth="0.7" />
    </g>
  );
  if (weapon === "crossbow") return (
    <g>
      <path d={`M${x - 10} ${y - 1} H${x + 14} M${x + 2} ${y - 8} V${y + 9}`} stroke="#7c4a1e" strokeWidth="2.1" strokeLinecap="round" />
      <path d={`M${x + 2} ${y} H${x + 16} M${x + 14} ${y} L${x + 11} ${y - 2} M${x + 14} ${y} L${x + 11} ${y + 2}`} stroke="#f8fafc" strokeWidth="0.8" />
    </g>
  );
  if (weapon === "spear" || weapon === "lance" || weapon === "halberd" || weapon === "trident") return (
    <g>
      <line x1={x} y1={y + 28} x2={weapon === "lance" ? x + 18 : x + 4} y2={y - 30} stroke="#7c4a1e" strokeWidth={weapon === "lance" ? 2.4 : 2} strokeLinecap="round" />
      {weapon === "halberd" ? <path d={`M${x + 4} ${y - 30} L${x + 13} ${y - 22} L${x + 5} ${y - 17} Z`} fill={`url(#${g}-steel)`} /> : weapon === "trident" ? <path d={`M${x + 4} ${y - 30} L${x + 4} ${y - 18} M${x - 1} ${y - 27} L${x + 4} ${y - 18} L${x + 10} ${y - 27}`} fill="none" stroke={`url(#${g}-steel)`} strokeWidth="2" strokeLinecap="round" /> : <path d={`M${weapon === "lance" ? x + 18 : x + 4} ${y - 30} L${weapon === "lance" ? x + 25 : x + 9} ${y - 36} L${weapon === "lance" ? x + 20 : x + 6} ${y - 26} Z`} fill={`url(#${g}-steel)`} />}
      {visual.extra === "banner" && <path d={`M${x + 5} ${y - 22} Q${x + 17} ${y - 19} ${x + 8} ${y - 11} L${x + 5} ${y - 14} Z`} fill={visual.accent} />}
    </g>
  );
  if (weapon === "staff" || weapon === "orb") return (
    <g>
      <line x1={x + 2} y1={y - 28} x2={x + 5} y2={y + 38} stroke="#7c4a1e" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx={x + 2} cy={y - 31} r={weapon === "orb" ? 6 : 4.5} fill={visual.accent} opacity="0.85" />
      <circle cx={x + 2} cy={y - 31} r="2" fill="#fef9c3" />
    </g>
  );
  if (weapon === "mace" || weapon === "hammer" || weapon === "axe") return (
    <g>
      <line x1={x} y1={y + 20} x2={x + 8} y2={y - 16} stroke="#7c4a1e" strokeWidth="2.5" strokeLinecap="round" />
      {weapon === "mace" && <circle cx={x + 9} cy={y - 19} r="5.5" fill={visual.metal} stroke="#1f2937" strokeWidth="0.7" />}
      {weapon === "hammer" && <rect x={x + 3} y={y - 24} width="14" height="8" rx="1.5" fill={visual.metal} stroke="#1f2937" strokeWidth="0.7" />}
      {weapon === "axe" && <path d={`M${x + 7} ${y - 20} C${x + 20} ${y - 26} ${x + 18} ${y - 10} ${x + 8} ${y - 13} Z`} fill={visual.metal} stroke="#1f2937" strokeWidth="0.7" />}
    </g>
  );
  if (weapon === "claws") return <path d={`M${x - 2} ${y + 8} L${x + 5} ${y + 18} M${x + 2} ${y + 6} L${x + 10} ${y + 16} M${x + 6} ${y + 3} L${x + 15} ${y + 12}`} stroke={visual.accent} strokeWidth="1.6" strokeLinecap="round" />;
  if (weapon === "dagger") {
    return (
      <g>
        <rect x={x + 2} y={y - 12} width="2" height="22" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.4" />
        <rect x={x - 1} y={y + 8} width="8" height="2" fill="#3a2410" />
      </g>
    );
  }
  if (weapon === "horn") {
    return <path d={`M${x - 4} ${y + 12} Q${x + 12} ${y - 4} ${x + 3} ${y - 19} Q${x + 17} ${y - 12} ${x + 19} ${y + 3}`} fill={visual.accent} stroke={visual.secondary} strokeWidth="0.8" />;
  }
  return (
    <g>
      <rect x={x + 1} y={weapon === "greatsword" ? y - 34 : y - 24} width={weapon === "greatsword" ? 2.8 : 2} height={weapon === "greatsword" ? 48 : 38} fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.4" />
      <rect x={x - 4} y={y + 14} width="12" height="2.5" fill="#3a2410" />
      <rect x={x} y={y + 16} width="4" height="7" fill="#7c4a1e" />
    </g>
  );
}

function Shield({ visual, g, x = 16, y = 48 }: { visual: UnitVisual; g: string; x?: number; y?: number }) {
  if (visual.shield === "none") return null;
  if (visual.shield === "round") {
    return (
      <g>
        <circle cx={x + 4} cy={y + 3} r="8" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.58)" strokeWidth="0.8" />
        <ChestMotif visual={visual} x={x + 4} y={y + 3} size={0.55} />
      </g>
    );
  }
  const path = visual.shield === "tower" ? `M${x} ${y - 12} H${x + 13} V${y + 12} Q${x + 7} ${y + 17} ${x} ${y + 12} Z` : `M${x} ${y - 10} Q${x + 7} ${y - 15} ${x + 14} ${y - 10} V${y + 7} Q${x + 7} ${y + 16} ${x} ${y + 7} Z`;
  return (
    <g>
      <path d={path} fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.58)" strokeWidth="0.8" />
      <ChestMotif visual={visual} x={x + 7} y={y + 1} size={0.52} />
    </g>
  );
}

function ExtraDetails({ visual, x = 35, y = 62 }: { visual: UnitVisual; x?: number; y?: number }) {
  if (visual.extra === "none") return null;
  if (visual.extra === "spikes") return <path d={`M${x - 16} ${y - 22} L${x - 12} ${y - 31} L${x - 7} ${y - 22} M${x} ${y - 24} L${x + 4} ${y - 35} L${x + 8} ${y - 24} M${x + 15} ${y - 22} L${x + 20} ${y - 31} L${x + 22} ${y - 22}`} fill="none" stroke={visual.accent} strokeWidth="1.2" strokeLinecap="round" />;
  if (visual.extra === "chains") return <path d={`M${x - 14} ${y - 12} Q${x} ${y - 5} ${x + 14} ${y - 12} M${x - 10} ${y - 8} Q${x} ${y - 2} ${x + 10} ${y - 8}`} fill="none" stroke={visual.metal} strokeWidth="1.2" strokeDasharray="2 2" />;
  if (visual.extra === "cape") return <path d={`M${x - 14} ${y - 30} Q${x} ${y - 18} ${x + 14} ${y - 30} L${x + 20} ${y + 18} Q${x} ${y + 28} ${x - 20} ${y + 18} Z`} fill={visual.secondary} opacity="0.68" />;
  if (visual.extra === "book") return <path d={`M${x - 22} ${y - 6} Q${x - 16} ${y - 9} ${x - 10} ${y - 6} V${y + 5} Q${x - 16} ${y + 2} ${x - 22} ${y + 5} Z M${x - 10} ${y - 6} Q${x - 4} ${y - 9} ${x + 2} ${y - 6} V${y + 5} Q${x - 4} ${y + 2} ${x - 10} ${y + 5} Z`} fill="#fef3c7" stroke={visual.secondary} strokeWidth="0.6" />;
  if (visual.extra === "tail") return <path d={`M${x - 24} ${y - 6} Q${x - 36} ${y + 4} ${x - 30} ${y + 16} Q${x - 22} ${y + 9} ${x - 15} ${y + 2}`} fill="none" stroke={visual.secondary} strokeWidth="3" strokeLinecap="round" />;
  if (visual.extra === "mane") return <path d={`M${x - 6} ${y - 34} Q${x + 2} ${y - 24} ${x - 2} ${y - 10} Q${x + 9} ${y - 22} ${x + 5} ${y - 36}`} fill="none" stroke={visual.accent} strokeWidth="2" strokeLinecap="round" />;
  return null;
}

function FeatheredWing({ g, side, visual, x = 35, y = 35, scale = 1 }: { g: string; side: -1 | 1; visual: UnitVisual; x?: number; y?: number; scale?: number }) {
  const s = scale;
  const transform = `translate(${x} ${y}) scale(${side * s} ${s})`;
  return (
    <g transform={transform}>
      <path d="M0 5 C-12 -17 -27 -24 -35 -9 C-27 -7 -22 -2 -18 6 C-13 0 -6 2 0 11 Z" fill={`url(#${g}-wing)`} stroke="rgba(0,0,0,0.56)" strokeWidth="0.8" />
      <path d="M-4 3 C-13 -5 -20 -8 -30 -7 M-2 7 C-12 6 -20 10 -27 16 M-1 12 C-9 15 -16 22 -20 29" fill="none" stroke={visual.secondary} strokeWidth="1" opacity="0.72" />
      <path d="M-34 -8 C-29 2 -24 10 -19 29 C-11 21 -6 16 0 12 C-10 10 -18 4 -24 -3 Z" fill="rgba(255,255,255,0.18)" />
    </g>
  );
}

function GriffinCreature({ g, visual, royal }: { g: string; visual: UnitVisual; royal: boolean }) {
  return (
    <g>
      <Aura visual={visual} />
      <path d="M30 48 C19 26 9 17 3 31 C10 34 17 43 22 55 C25 51 27 49 30 48 Z" fill="#334155" stroke="rgba(0,0,0,0.58)" strokeWidth="0.8" />
      <path d="M34 47 C41 22 55 10 66 22 C56 29 49 42 44 58 C41 52 38 49 34 47 Z" fill={`url(#${g}-wing)`} stroke="rgba(0,0,0,0.58)" strokeWidth="0.85" />
      <path d="M9 31 C16 38 20 47 23 56 M59 23 C50 33 46 45 43 58 M54 28 C48 38 45 47 41 60" fill="none" stroke="#0f172a" strokeWidth="1.1" opacity="0.55" />
      <path d="M12 63 C16 48 31 42 47 47 C58 51 62 61 57 70 C51 81 31 81 18 73 C13 70 11 67 12 63 Z" fill="#9a6428" stroke="rgba(0,0,0,0.64)" strokeWidth="0.95" />
      <path d="M20 55 C30 48 43 50 52 58 C44 58 33 62 25 72 C18 68 17 61 20 55 Z" fill="#c48437" opacity="0.72" />
      <path d="M35 48 C34 33 43 24 54 25 C61 26 65 31 64 38 C57 35 53 37 48 42 C45 46 41 48 35 48 Z" fill="#f8fafc" stroke="rgba(0,0,0,0.58)" strokeWidth="0.85" />
      <path d="M60 32 C69 33 71 37 62 42 L55 39 C59 37 62 35 60 32 Z" fill="#eab308" stroke="rgba(0,0,0,0.62)" strokeWidth="0.75" />
      <circle cx="55" cy="32" r="1.4" fill="#111827" />
      <path d="M39 40 C44 35 51 34 58 36 M39 44 C46 42 51 42 58 44" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" />
      {royal && <path d="M45 24 L49 16 L53 24 L59 18 L59 28 L44 28 Z" fill={visual.accent} stroke={visual.secondary} strokeWidth="0.6" />}
      <path d="M18 70 L12 86 M31 74 L27 88 M49 71 L45 86" stroke="#d99b45" strokeWidth="3.3" strokeLinecap="round" />
      <path d="M9 87 Q13 80 19 86 M24 89 Q29 82 35 87 M42 87 Q47 81 54 86" fill="none" stroke="#111827" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M56 66 C68 67 68 78 55 80 C61 75 62 70 54 69 Z" fill="#7c4a1e" stroke="rgba(0,0,0,0.48)" strokeWidth="0.7" />
    </g>
  );
}

function UnicornCreature({ visual }: { visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      <path d="M9 61 C13 49 26 43 43 46 C56 48 64 57 60 67 C55 78 37 80 22 73 C13 70 7 66 9 61 Z" fill="#f8fafc" stroke="rgba(0,0,0,0.58)" strokeWidth="0.95" />
      <path d="M20 53 C31 47 47 49 57 59" fill="none" stroke="#dbeafe" strokeWidth="1.8" opacity="0.78" />
      <path d="M44 47 C45 36 54 27 62 31 C68 34 66 42 57 45 C53 43 49 44 44 47 Z" fill="#f8fafc" stroke="rgba(0,0,0,0.58)" strokeWidth="0.85" />
      <path d="M56 30 L62 10 L64 33 Z" fill="#fef3c7" stroke="#c084fc" strokeWidth="0.85" />
      <path d="M45 45 C40 34 50 25 59 29 C53 31 50 37 50 47 Z" fill="#e0e7ff" />
      <circle cx="59" cy="35" r="1.25" fill="#111827" />
      <path d="M15 67 L11 86 M28 72 L26 88 M47 70 L45 87 M56 66 L60 86" stroke="#e5e7eb" strokeWidth="3.1" strokeLinecap="round" />
      <path d="M8 87 H16 M23 89 H31 M42 88 H50 M57 87 H65" stroke="#111827" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M10 61 C0 58 0 48 10 43 C7 51 10 56 18 59 Z" fill="#f8fafc" stroke="rgba(0,0,0,0.45)" strokeWidth="0.7" />
      <path d="M9 44 C3 35 10 29 15 37 C12 38 10 41 9 44 Z" fill="#e0e7ff" />
      <path d="M17 49 C27 38 40 39 50 46" fill="none" stroke="#d8b4fe" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 46 C24 55 20 67 16 75" fill="none" stroke="#d8b4fe" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
    </g>
  );
}

function PegasusCreature({ g, visual }: { g: string; visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      <path d="M31 49 C17 28 8 24 4 39 C12 41 19 50 23 63 C26 56 28 52 31 49 Z" fill="#c7d2fe" stroke="rgba(0,0,0,0.5)" strokeWidth="0.8" />
      <path d="M37 49 C45 26 58 20 67 34 C58 40 50 51 45 65 C43 57 41 52 37 49 Z" fill={`url(#${g}-wing)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.8" />
      <path d="M9 61 C13 50 26 45 43 48 C56 50 64 58 60 68 C55 78 38 80 23 74 C14 71 7 67 9 61 Z" fill="#eef2ff" stroke="rgba(0,0,0,0.56)" strokeWidth="0.9" />
      <path d="M44 48 C47 37 56 32 63 37 C67 40 65 46 57 48 C53 46 49 46 44 48 Z" fill="#eef2ff" stroke="rgba(0,0,0,0.56)" strokeWidth="0.78" />
      <circle cx="58" cy="39" r="1.2" fill="#111827" />
      <path d="M15 68 L11 85 M29 72 L27 87 M47 71 L45 86 M56 67 L60 85" stroke="#e5e7eb" strokeWidth="3" strokeLinecap="round" />
      <path d="M8 86 H16 M24 88 H31 M42 87 H50 M57 86 H65" stroke="#111827" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 62 C2 58 2 49 11 46 C7 52 10 56 17 58 Z" fill="#e0e7ff" />
      <path d="M18 51 C29 42 44 43 53 50" fill="none" stroke={visual.accent} strokeWidth="1.35" strokeLinecap="round" opacity="0.85" />
    </g>
  );
}

function DragonCreature({ g, visual, bone, wyvern }: { g: string; visual: UnitVisual; bone: boolean; wyvern: boolean }) {
  const bodyFill = bone ? "#d1d5db" : `url(#${g}-body)`;
  const ribStroke = bone ? "#64748b" : visual.accent;
  return (
    <g>
      <Aura visual={visual} />
      <path d="M30 45 C18 24 8 25 5 46 C16 42 24 47 31 60 Z" fill={bone ? "#cbd5e1" : visual.secondary} stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
      <path d="M39 45 C51 22 63 24 67 47 C55 42 47 47 39 61 Z" fill={bone ? "#cbd5e1" : visual.secondary} stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
      <path d="M9 46 L24 48 M14 32 L27 51 M63 47 L47 48 M57 32 L44 51" stroke={ribStroke} strokeWidth="1" opacity="0.72" />
      <path d="M10 64 C15 49 30 43 48 48 C60 52 64 63 56 72 C47 82 27 80 16 71 C11 68 9 66 10 64 Z" fill={bodyFill} stroke="rgba(0,0,0,0.62)" strokeWidth="0.95" />
      <path d="M43 49 C45 35 56 26 65 32 C71 36 68 45 58 48 C53 45 48 46 43 49 Z" fill={bodyFill} stroke="rgba(0,0,0,0.62)" strokeWidth="0.85" />
      <path d="M58 31 L56 18 L63 29 M65 35 L71 27 L68 41" fill={visual.accent} stroke="rgba(0,0,0,0.45)" strokeWidth="0.55" />
      <circle cx="59" cy="37" r="1.35" fill="#fef3c7" />
      <path d="M48 53 C38 54 26 55 15 64" fill="none" stroke={ribStroke} strokeWidth="1.1" opacity="0.68" />
      <path d="M15 70 L10 86 M29 74 L26 88 M49 72 L45 87" stroke={bone ? "#e5e7eb" : visual.secondary} strokeWidth="3" strokeLinecap="round" />
      <path d="M8 87 Q12 81 18 86 M24 89 Q28 82 34 87 M42 88 Q46 81 53 86" fill="none" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 65 C-1 62 0 51 13 48 C8 55 11 60 20 62 Z" fill={bodyFill} stroke="rgba(0,0,0,0.45)" strokeWidth="0.7" />
      {!wyvern && <path d="M55 68 C69 71 66 84 50 82 C58 78 60 73 53 70 Z" fill={bone ? "#e5e7eb" : visual.secondary} stroke="rgba(0,0,0,0.45)" strokeWidth="0.7" />}
      {bone && <path d="M23 52 H47 M20 59 H53 M23 67 H49" stroke="#475569" strokeWidth="0.9" opacity="0.8" />}
    </g>
  );
}

function HydraCreature({ visual }: { visual: UnitVisual }) {
  const heads = [18, 27, 36, 45, 54];
  return (
    <g>
      <Aura visual={visual} />
      <path d="M10 62 C13 48 28 42 47 46 C61 49 66 60 58 71 C49 82 25 80 14 70 C10 68 9 65 10 62 Z" fill="#166534" stroke="rgba(0,0,0,0.64)" strokeWidth="0.95" />
      {heads.map((x, index) => (
        <g key={x}>
          <path d={`M${x + (index - 2) * 1.4} 48 C${x - 3} 36 ${x - 2} 27 ${x + 3} 19`} fill="none" stroke="#15803d" strokeWidth="4.2" strokeLinecap="round" />
          <path d={`M${x - 3} 20 C${x + 1} 11 ${x + 10} 13 ${x + 11} 21 C${x + 6} 25 ${x + 1} 25 ${x - 3} 20 Z`} fill="#22c55e" stroke="rgba(0,0,0,0.55)" strokeWidth="0.65" />
          <circle cx={x + 4} cy="19" r="1" fill="#fef3c7" />
          <path d={`M${x + 7} 15 L${x + 10} 8 M${x + 2} 14 L${x - 1} 8`} stroke={visual.accent} strokeWidth="1.1" strokeLinecap="round" />
        </g>
      ))}
      <path d="M18 59 C30 54 47 55 59 64" fill="none" stroke={visual.accent} strokeWidth="1.4" opacity="0.65" />
      <path d="M17 70 L12 85 M31 74 L29 87 M51 71 L56 85" stroke="#14532d" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M10 86 H18 M26 88 H34 M53 86 H61" stroke="#111827" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M56 68 C69 73 64 85 48 81 C57 77 60 72 54 69 Z" fill="#14532d" stroke="rgba(0,0,0,0.45)" strokeWidth="0.7" />
    </g>
  );
}

function DendroidCreature({ visual }: { visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      <path d="M25 78 C21 62 23 45 30 31 L40 31 C47 45 50 63 45 78 C40 84 30 84 25 78 Z" fill="#6b3f1d" stroke="rgba(0,0,0,0.62)" strokeWidth="0.9" />
      <path d="M31 32 C25 25 21 18 18 8 M38 32 C44 24 48 17 52 8 M34 31 C35 22 35 15 35 6" fill="none" stroke="#4d2f18" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 8 L12 17 M18 8 L25 14 M52 8 L58 17 M52 8 L45 15 M35 6 L29 14 M35 6 L42 14" stroke={visual.accent} strokeWidth="2" strokeLinecap="round" />
      <path d="M24 42 C31 38 40 39 46 44 M25 55 C32 50 42 51 47 58" fill="none" stroke="#a16207" strokeWidth="1.3" opacity="0.8" />
      <circle cx="31" cy="41" r="1.7" fill="#fef3c7" />
      <circle cx="40" cy="41" r="1.7" fill="#fef3c7" />
      <path d="M27 50 Q35 56 43 50" fill="none" stroke="#1f1408" strokeWidth="1" strokeLinecap="round" />
      <path d="M23 61 C14 61 10 54 13 47 M47 61 C57 60 61 53 57 46" fill="none" stroke="#4d2f18" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 78 L17 87 M44 78 L52 87 M34 79 L34 88" stroke="#3f2a14" strokeWidth="3.3" strokeLinecap="round" />
      <path d="M12 88 H22 M29 89 H39 M48 88 H58" stroke="#1f1408" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  );
}

function BeholderCreature({ visual }: { visual: UnitVisual }) {
  const stalks = [
    { x: 20, y: 28, tx: 11, ty: 15 },
    { x: 28, y: 25, tx: 23, ty: 10 },
    { x: 36, y: 24, tx: 37, ty: 8 },
    { x: 44, y: 26, tx: 51, ty: 12 },
    { x: 50, y: 31, tx: 62, ty: 20 },
  ];
  return (
    <g>
      <Aura visual={visual} />
      {stalks.map((stalk) => (
        <g key={`${stalk.tx}-${stalk.ty}`}>
          <path d={`M${stalk.x} ${stalk.y} Q${(stalk.x + stalk.tx) / 2} ${stalk.y - 10} ${stalk.tx} ${stalk.ty}`} fill="none" stroke={visual.secondary} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx={stalk.tx} cy={stalk.ty} r="4.1" fill="#f8fafc" stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
          <circle cx={stalk.tx} cy={stalk.ty} r="1.5" fill={visual.accent} />
        </g>
      ))}
      <ellipse cx="35" cy="50" rx="24" ry="27" fill="#5b21b6" stroke="rgba(0,0,0,0.65)" strokeWidth="0.9" />
      <ellipse cx="35" cy="46" rx="13" ry="11" fill="#f8fafc" stroke="rgba(0,0,0,0.58)" strokeWidth="0.8" />
      <circle cx="35" cy="46" r="5.2" fill={visual.accent} />
      <circle cx="35" cy="46" r="2.2" fill="#111827" />
      <path d="M24 64 Q35 72 48 64" fill="none" stroke="#111827" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19 53 C8 49 8 39 19 36 M51 53 C63 49 63 39 52 36" fill="none" stroke="#7e22ce" strokeWidth="3" strokeLinecap="round" />
      <path d="M25 78 C30 84 42 84 48 78" fill="none" stroke="#3b0764" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  );
}

function ManticoreCreature({ g, visual }: { g: string; visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      <path d="M31 43 C18 25 7 30 7 51 C19 44 25 48 31 58 Z" fill={visual.secondary} stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
      <path d="M39 43 C52 25 63 30 63 51 C51 44 45 48 39 58 Z" fill={visual.secondary} stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
      <path d="M13 60 C14 47 27 40 43 43 C56 46 62 57 56 69 C49 80 29 80 17 70 C13 67 12 64 13 60 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.62)" strokeWidth="0.9" />
      <path d="M43 44 C46 33 55 29 62 35 C65 38 63 44 56 47 C51 44 47 43 43 44 Z" fill={visual.accent} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      <path d="M56 33 L60 23 M62 37 L69 30" stroke="#f8fafc" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="57" cy="38" r="1.2" fill="#111827" />
      <path d="M17 68 L12 84 M31 72 L29 86 M50 69 L55 84" stroke={visual.secondary} strokeWidth="3" strokeLinecap="round" />
      <path d="M55 65 C68 62 69 75 58 79 C59 72 55 69 49 69 Z" fill={visual.secondary} stroke="rgba(0,0,0,0.48)" strokeWidth="0.7" />
      <path d="M63 64 L69 58" stroke={visual.accent} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function RocCreature({ g, visual }: { g: string; visual: UnitVisual }) {
  return (
    <g>
      <FeatheredWing g={g} side={-1} visual={visual} x={37} y={38} scale={1.15} />
      <FeatheredWing g={g} side={1} visual={visual} x={33} y={38} scale={1.15} />
      <path d="M24 42 C26 28 42 25 49 37 C55 47 50 66 36 73 C24 66 21 54 24 42 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.62)" strokeWidth="0.9" />
      <path d="M38 31 C45 24 57 28 58 38 C52 35 47 36 42 42 Z" fill="#fef3c7" stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      <path d="M53 35 L64 38 L54 42 Z" fill="#eab308" stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <circle cx="49" cy="34" r="1.2" fill="#111827" />
      <path d="M30 72 L27 85 M43 71 L47 85" stroke="#7c2d12" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 86 Q29 80 35 85 M44 86 Q49 80 55 85" fill="none" stroke="#111827" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

function HoundCreature({ visual, infernal = false }: { visual: UnitVisual; infernal?: boolean }) {
  return (
    <g>
      {infernal && <Aura visual={visual} />}
      <path d="M11 61 C11 48 24 43 42 45 C56 47 64 55 61 66 C57 77 38 80 22 73 C15 70 11 66 11 61 Z" fill="#431407" stroke="rgba(0,0,0,0.65)" strokeWidth="0.9" />
      <path d="M46 45 C49 34 59 31 65 38 C68 42 64 48 56 49 C52 46 49 45 46 45 Z" fill="#7f1d1d" stroke="rgba(0,0,0,0.58)" strokeWidth="0.75" />
      <path d="M51 38 L50 28 L57 36 M61 40 L68 34 L65 44" fill={visual.accent} stroke="rgba(0,0,0,0.45)" strokeWidth="0.5" />
      <circle cx="58" cy="42" r="1.3" fill="#fef08a" />
      <path d="M56 49 L54 55 L58 52 M62 48 L64 54 L60 52" fill="#f8fafc" />
      <path d="M16 68 L11 84 M29 72 L27 86 M50 69 L55 84" stroke="#2a1308" strokeWidth="3" strokeLinecap="round" />
      <path d="M8 85 H16 M24 87 H31 M52 85 H60" stroke="#111827" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 61 C2 58 2 49 12 46" fill="none" stroke="#2a1308" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 46 L24 37 L29 45 M34 44 L38 35 L43 45" fill={visual.accent} opacity="0.85" />
    </g>
  );
}

function LizardCreature({ visual, gaze = false }: { visual: UnitVisual; gaze?: boolean }) {
  return (
    <g>
      <Aura visual={visual} />
      <path d="M10 63 C11 50 25 43 44 45 C58 48 65 57 60 68 C54 80 33 80 18 72 C12 69 9 66 10 63 Z" fill="#3f6212" stroke="rgba(0,0,0,0.62)" strokeWidth="0.9" />
      <path d="M45 45 C49 35 60 31 66 38 C68 42 65 48 56 49 C52 46 49 45 45 45 Z" fill="#65a30d" stroke="rgba(0,0,0,0.58)" strokeWidth="0.75" />
      <path d="M20 45 L23 36 L27 45 M31 43 L34 33 L38 44 M43 45 L47 36 L51 46" fill={visual.accent} stroke="rgba(0,0,0,0.35)" strokeWidth="0.4" />
      <circle cx="58" cy="41" r={gaze ? 2.1 : 1.3} fill={gaze ? "#fef08a" : "#111827"} />
      {gaze && <circle cx="58" cy="41" r="0.7" fill="#111827" />}
      <path d="M16 69 L12 84 M30 73 L28 86 M50 70 L55 84" stroke="#365314" strokeWidth="3" strokeLinecap="round" />
      <path d="M58 66 C69 69 66 80 53 78 C59 74 61 70 56 68 Z" fill="#365314" />
      <path d="M17 56 C30 51 45 53 58 60" fill="none" stroke={visual.accent} strokeWidth="1.2" opacity="0.65" />
    </g>
  );
}

function GorgonCreature({ visual }: { visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      <path d="M12 63 C13 48 27 42 46 46 C60 49 65 60 58 70 C49 82 26 80 15 71 C12 68 11 65 12 63 Z" fill="#475569" stroke="rgba(0,0,0,0.65)" strokeWidth="0.95" />
      <path d="M44 45 C47 33 58 30 65 38 C68 42 64 49 55 50 C51 47 48 45 44 45 Z" fill="#64748b" stroke="rgba(0,0,0,0.58)" strokeWidth="0.75" />
      <path d="M51 38 Q48 27 56 23 M60 39 Q70 31 67 24" fill="none" stroke="#e5e7eb" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="57" cy="42" r="1.4" fill="#fef08a" />
      <path d="M20 47 C31 42 45 45 55 54" fill="none" stroke="#94a3b8" strokeWidth="1.4" opacity="0.82" />
      <ChestMotif visual={visual} x={37} y={57} size={0.72} />
      <path d="M18 69 L13 85 M32 73 L30 87 M51 70 L56 85" stroke="#334155" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M10 86 H18 M27 88 H35 M53 86 H61" stroke="#111827" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
}

function SerpentFlyCreature({ visual }: { visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      <path d="M30 39 C10 13 0 30 15 53 C24 52 29 46 30 39 Z" fill="#67e8f9" opacity="0.62" stroke="rgba(0,0,0,0.42)" strokeWidth="0.7" />
      <path d="M40 39 C60 13 70 30 55 53 C46 52 41 46 40 39 Z" fill="#67e8f9" opacity="0.62" stroke="rgba(0,0,0,0.42)" strokeWidth="0.7" />
      <path d="M35 25 C44 37 45 61 35 77 C25 61 26 37 35 25 Z" fill="#16a34a" stroke="rgba(0,0,0,0.62)" strokeWidth="0.8" />
      <path d="M35 25 C28 21 28 12 35 9 C42 12 42 21 35 25 Z" fill="#22c55e" stroke="rgba(0,0,0,0.58)" strokeWidth="0.7" />
      <circle cx="32" cy="17" r="1.3" fill="#fef3c7" />
      <circle cx="38" cy="17" r="1.3" fill="#fef3c7" />
      <path d="M31 10 L25 3 M39 10 L45 3" stroke={visual.accent} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M35 37 C30 45 31 56 35 66 C39 56 40 45 35 37 Z" fill={visual.accent} opacity="0.55" />
      <path d="M31 75 L25 86 M39 75 L45 86" stroke="#14532d" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  );
}

function InfantrySvg({ palette, ranged, g, visual }: { palette: ReturnType<typeof getUnitPalette>; ranged: boolean; g: string; visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      {/* Legs */}
      <path d="M27 70 L25 86 L31 86 L33 70 Z" fill={palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <path d="M37 70 L39 86 L45 86 L43 70 Z" fill={palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      {/* Boots */}
      <ellipse cx="28" cy="86" rx="5" ry="2" fill="#1f1408" />
      <ellipse cx="42" cy="86" rx="5" ry="2" fill="#1f1408" />
      {/* Torso/armor */}
      <path d="M22 38 Q22 32 28 30 L42 30 Q48 32 48 38 L46 66 Q46 72 35 72 Q24 72 24 66 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      <path d="M28 35 L42 35 L44 50 Q35 55 26 50 Z" fill={visual.accent} opacity="0.18" />
      <ChestMotif visual={visual} />
      {/* Belt */}
      <rect x="23" y="58" width="24" height="3" fill="#2a1a08" />
      <rect x="33" y="58" width="4" height="3" fill="#facc15" />
      {/* Pauldrons */}
      <ellipse cx="22" cy="38" rx="5" ry="4" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      <ellipse cx="48" cy="38" rx="5" ry="4" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      {/* Arms */}
      <path d="M18 40 Q14 52 19 64 L24 62 Q22 50 24 42 Z" fill={palette.main} stroke="rgba(0,0,0,0.45)" strokeWidth="0.5" />
      <path d="M52 40 Q56 52 51 64 L46 62 Q48 50 46 42 Z" fill={palette.main} stroke="rgba(0,0,0,0.45)" strokeWidth="0.5" />
      {/* Head */}
      <circle cx="35" cy="22" r="8" fill={`url(#${g}-skin)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      {/* Helmet */}
      <path d="M27 22 Q27 12 35 11 Q43 12 43 22 L43 25 L27 25 Z" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <rect x="33" y="20" width="4" height="6" fill="#1a1a1a" />
      <path d="M35 9 L35 5 L38 7 Z" fill={palette.light} />
      <Headgear visual={visual} cx={35} cy={13} />
      <HeldWeapon visual={visual} g={g} ranged={ranged} />
      <Shield visual={visual} g={g} />
      <ExtraDetails visual={visual} />
    </g>
  );
}

function CavalrySvg({ palette, g, visual }: { palette: ReturnType<typeof getUnitPalette>; g: string; visual: UnitVisual }) {
  const mountColor = visual.mount === "nightmare" ? "#111827" : visual.mount === "unicorn" ? "#e5e7eb" : visual.mount === "wolf" ? "#4b5563" : visual.mount === "centaur" ? "#8b5a2b" : "#5b3a1d";
  return (
    <g>
      <Aura visual={visual} />
      {/* Horse legs */}
      <rect x="14" y="62" width="4" height="22" fill={visual.secondary} />
      <rect x="22" y="62" width="4" height="22" fill="#2a1808" />
      <rect x="44" y="62" width="4" height="22" fill={visual.secondary} />
      <rect x="52" y="62" width="4" height="22" fill="#2a1808" />
      {/* Horse body */}
      <path d="M10 56 Q10 46 22 44 L52 44 Q62 46 62 56 Q62 66 50 68 L18 68 Q10 66 10 56 Z" fill={mountColor} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      <path d="M18 49 H50 Q57 50 60 54" fill="none" stroke={visual.accent} strokeWidth="1.2" opacity="0.8" />
      <ChestMotif visual={visual} x={36} y={56} size={0.62} />
      {/* Horse head */}
      <path d="M52 42 Q60 38 64 44 L62 54 L56 56 Q52 52 52 48 Z" fill={mountColor} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <circle cx="60" cy="46" r="1" fill="#fff" />
      {visual.mount === "unicorn" && <path d="M61 39 L66 29 L66 42 Z" fill={visual.accent} />}
      {visual.mount === "wolf" && <path d="M54 42 L52 34 L59 39 M62 42 L67 35 L66 45" fill={visual.secondary} />}
      {/* Horse mane */}
      <path d="M44 40 Q50 36 56 40 L54 50 L46 50 Z" fill={visual.secondary} />
      {/* Tail */}
      <path d="M10 50 Q4 54 6 64 L10 64 Q12 56 14 54 Z" fill={visual.secondary} />
      {/* Rider torso */}
      <path d="M26 24 Q26 16 35 14 Q44 16 44 24 L44 46 Q38 50 30 46 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      {/* Rider pauldrons */}
      <ellipse cx="26" cy="26" rx="4.5" ry="3.5" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      <ellipse cx="44" cy="26" rx="4.5" ry="3.5" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      {/* Rider head */}
      <circle cx="35" cy="10" r="6" fill={`url(#${g}-skin)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      <path d="M29 10 Q29 3 35 2 Q41 3 41 10 L41 12 L29 12 Z" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.5" />
      <path d="M35 0 L37 -3 L33 -3 Z" fill={palette.light} />
      <Headgear visual={visual} cx={35} cy={4} />
      <HeldWeapon visual={visual} g={g} x={45} y={24} />
      <rect x="42" y="14" width="6" height="2.5" fill="#3a2410" />
    </g>
  );
}

function WingedSvg({ palette, g, visual }: { palette: ReturnType<typeof getUnitPalette>; g: string; visual: UnitVisual }) {
  const wingStroke = visual.wing === "stone" ? visual.metal : visual.secondary;
  const leftWing = visual.wing === "bat" || visual.wing === "dragon"
    ? "M30 32 Q12 12 4 38 L16 36 L20 50 L30 45 Z"
    : visual.wing === "insect"
      ? "M30 32 C9 8 0 28 12 48 C20 50 27 43 30 32 Z"
      : "M30 30 Q10 18 2 38 Q6 46 14 48 Q22 46 30 44 Z";
  const rightWing = visual.wing === "bat" || visual.wing === "dragon"
    ? "M40 32 Q58 12 66 38 L54 36 L50 50 L40 45 Z"
    : visual.wing === "insect"
      ? "M40 32 C61 8 70 28 58 48 C50 50 43 43 40 32 Z"
      : "M40 30 Q60 18 68 38 Q64 46 56 48 Q48 46 40 44 Z";
  return (
    <g>
      <Aura visual={visual} />
      {/* Left wing */}
      <path d={leftWing} fill={`url(#${g}-wing)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      <path d="M30 32 Q18 30 8 38 M30 36 Q20 36 12 44" fill="none" stroke={wingStroke} strokeWidth="0.55" opacity="0.7" />
      {/* Right wing */}
      <path d={rightWing} fill={`url(#${g}-wing)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      <path d="M40 32 Q52 30 62 38 M40 36 Q50 36 58 44" fill="none" stroke={wingStroke} strokeWidth="0.55" opacity="0.7" />
      {/* Body */}
      <path d="M28 30 Q28 20 35 18 Q42 20 42 30 L42 62 Q38 68 35 68 Q32 68 28 62 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      <ChestMotif visual={visual} x={35} y={43} size={0.58} />
      {/* Head */}
      <ellipse cx="35" cy="14" rx="6.5" ry="7" fill={palette.light} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <circle cx="32" cy="13" r="1" fill="#000" />
      <circle cx="38" cy="13" r="1" fill="#000" />
      <Headgear visual={visual} cx={35} cy={11} />
      {/* Legs/talons */}
      <path d="M31 68 L29 82 L26 82 L26 84 L33 84 Z" fill={palette.dark} />
      <path d="M39 68 L41 82 L44 82 L44 84 L37 84 Z" fill={palette.dark} />
      {/* Highlight */}
      <path d="M32 22 Q35 20 38 22" fill="none" stroke={palette.light} strokeWidth="1" opacity="0.6" />
      <HeldWeapon visual={visual} g={g} x={52} y={44} />
      <ExtraDetails visual={visual} />
    </g>
  );
}

function LargeSvg({ palette, g, visual }: { palette: ReturnType<typeof getUnitPalette>; g: string; visual: UnitVisual }) {
  const isSerpent = visual.body === "serpent";
  const isTree = visual.body === "tree";
  return (
    <g>
      <Aura visual={visual} />
      {/* Legs */}
      {isSerpent ? (
        <path d="M24 62 Q44 70 32 86 Q50 82 54 70 Q48 62 38 58 Z" fill={palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      ) : (
        <>
          <path d="M20 70 L18 86 L28 86 L28 70 Z" fill={isTree ? "#5b3a1d" : palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
          <path d="M42 70 L42 86 L52 86 L50 70 Z" fill={isTree ? "#3f2a14" : palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
          <ellipse cx="23" cy="86" rx="6" ry="2" fill="#1a0e04" />
          <ellipse cx="47" cy="86" rx="6" ry="2" fill="#1a0e04" />
        </>
      )}
      {/* Body */}
      <path d="M14 38 Q14 28 22 26 L48 26 Q56 28 56 38 L54 72 Q44 76 35 76 Q26 76 16 72 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
      {/* Chest plate */}
      <path d="M24 36 L46 36 L44 58 L26 58 Z" fill={visual.accent} opacity={isTree ? "0.16" : "0.25"} />
      <ChestMotif visual={visual} x={35} y={48} size={0.75} />
      {/* Arms */}
      <path d="M10 40 Q4 54 10 70 L18 70 Q14 56 16 42 Z" fill={palette.main} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      <path d="M60 40 Q66 54 60 70 L52 70 Q56 56 54 42 Z" fill={palette.main} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      {/* Head */}
      <ellipse cx="35" cy="16" rx="9" ry="9" fill={palette.light} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      {/* Horns */}
      <path d="M27 12 Q22 4 24 0 Q28 6 30 12 Z" fill="#1f1408" />
      <path d="M43 12 Q48 4 46 0 Q42 6 40 12 Z" fill="#1f1408" />
      <Headgear visual={visual} cx={35} cy={12} />
      {/* Eyes */}
      <circle cx="31" cy="17" r="1.3" fill="#fef08a" />
      <circle cx="39" cy="17" r="1.3" fill="#fef08a" />
      {/* Tusks */}
      <path d="M31 22 L30 26 L32 25 Z" fill="#f5f5f5" />
      <path d="M39 22 L40 26 L38 25 Z" fill="#f5f5f5" />
      <HeldWeapon visual={visual} g={g} x={57} y={50} />
      <ExtraDetails visual={visual} />
    </g>
  );
}

function BeastSvg({ palette, g, visual }: { palette: ReturnType<typeof getUnitPalette>; g: string; visual: UnitVisual }) {
  const upright = visual.body === "slim" || visual.body === "heavy" || visual.weapon !== "claws";
  if (upright) {
    return (
      <g>
        <Aura visual={visual} />
        <path d="M25 68 L22 84 L29 84 L32 68 Z" fill={palette.dark} />
        <path d="M38 68 L42 84 L49 84 L45 68 Z" fill={palette.dark} />
        <path d="M20 35 Q22 25 34 23 Q49 25 52 38 L48 70 Q35 76 22 70 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
        <ChestMotif visual={visual} x={36} y={48} size={0.7} />
        <path d="M27 22 Q26 13 35 11 Q45 13 44 23 Q36 29 27 22 Z" fill={palette.light} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
        <Headgear visual={visual} cx={35} cy={15} />
        <circle cx="31" cy="20" r="1.2" fill="#111827" />
        <circle cx="39" cy="20" r="1.2" fill="#111827" />
        <path d="M18 40 Q10 53 16 66 L23 63 Q20 51 24 41 Z" fill={palette.main} stroke="rgba(0,0,0,0.48)" strokeWidth="0.5" />
        <path d="M53 40 Q60 52 55 66 L48 63 Q51 51 46 41 Z" fill={palette.main} stroke="rgba(0,0,0,0.48)" strokeWidth="0.5" />
        <HeldWeapon visual={visual} g={g} x={53} y={48} />
        <ExtraDetails visual={visual} />
      </g>
    );
  }
  return (
    <g>
      <Aura visual={visual} />
      {/* Legs */}
      <rect x="14" y="62" width="4" height="22" fill={palette.dark} />
      <rect x="22" y="62" width="4" height="22" fill={palette.dark} />
      <rect x="44" y="62" width="4" height="22" fill={palette.dark} />
      <rect x="52" y="62" width="4" height="22" fill={palette.dark} />
      <ellipse cx="16" cy="84" rx="3" ry="1.5" fill="#1a0e04" />
      <ellipse cx="24" cy="84" rx="3" ry="1.5" fill="#1a0e04" />
      <ellipse cx="46" cy="84" rx="3" ry="1.5" fill="#1a0e04" />
      <ellipse cx="54" cy="84" rx="3" ry="1.5" fill="#1a0e04" />
      {/* Body */}
      <path d="M10 50 Q10 42 20 40 L50 40 Q60 42 60 52 Q60 64 50 66 L20 66 Q10 64 10 52 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      <ChestMotif visual={visual} x={35} y={53} size={0.58} />
      {/* Spine spikes */}
      <path d="M20 40 L23 34 L26 40 M28 40 L31 32 L34 40 M36 40 L39 32 L42 40 M44 40 L47 34 L50 40" fill={visual.accent} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      {/* Head */}
      <path d="M52 40 Q66 38 66 52 Q66 60 56 60 Q50 58 50 50 Z" fill={palette.main} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      {/* Ears */}
      <path d="M54 40 L52 32 L58 38 Z" fill={palette.dark} />
      <path d="M62 40 L64 32 L60 38 Z" fill={palette.dark} />
      <Headgear visual={visual} cx={60} cy={42} />
      {/* Eye */}
      <circle cx="60" cy="48" r="1.5" fill="#fef08a" />
      <circle cx="60" cy="48" r="0.6" fill="#000" />
      {/* Fangs */}
      <path d="M58 56 L57 60 L59 58 Z" fill="#fff" />
      <path d="M62 56 L63 60 L61 58 Z" fill="#fff" />
      {/* Tail */}
      <path d="M10 52 Q2 50 0 42 L4 42 Q6 48 12 52 Z" fill={palette.dark} />
      <ExtraDetails visual={visual} x={35} y={62} />
    </g>
  );
}

function CasterSvg({ palette, g, visual }: { palette: ReturnType<typeof getUnitPalette>; g: string; visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      {/* Robe */}
      <path d="M18 38 Q22 28 35 26 Q48 28 52 38 L58 84 Q35 88 12 84 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      {/* Robe trim */}
      <path d="M14 80 Q35 84 56 80" fill="none" stroke={visual.accent} strokeWidth="1.5" opacity="0.75" />
      <path d="M30 30 L35 70 L40 30" fill="none" stroke={visual.accent} strokeWidth="0.8" opacity="0.65" />
      <ChestMotif visual={visual} x={35} y={50} size={0.72} />
      {/* Hood */}
      <path d="M22 30 Q22 14 35 12 Q48 14 48 30 L46 36 Q35 38 24 36 Z" fill={palette.dark} stroke="rgba(0,0,0,0.6)" strokeWidth="0.7" />
      <Headgear visual={visual} cx={35} cy={16} />
      {/* Face shadow */}
      <ellipse cx="35" cy="24" rx="6" ry="5" fill="#1a0e04" />
      <circle cx="32" cy="23" r="1" fill="#fef08a" />
      <circle cx="38" cy="23" r="1" fill="#fef08a" />
      <HeldWeapon visual={visual} g={g} x={54} y={42} />
      {/* Hands */}
      <circle cx="22" cy="58" r="2.5" fill={`url(#${g}-skin)`} />
      <circle cx="50" cy="58" r="2.5" fill={`url(#${g}-skin)`} />
      <ExtraDetails visual={visual} />
    </g>
  );
}

function UndeadSvg({ palette, g, visual }: { palette: ReturnType<typeof getUnitPalette>; g: string; visual: UnitVisual }) {
  return (
    <g>
      <Aura visual={visual} />
      {/* Ribs/torso */}
      <path d="M26 32 Q26 26 35 24 Q44 26 44 32 L42 60 Q35 64 28 60 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <path d="M28 36 L42 36 M28 42 L42 42 M28 48 L42 48 M28 54 L42 54" stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <line x1="35" y1="32" x2="35" y2="60" stroke="rgba(0,0,0,0.6)" strokeWidth="0.6" />
      <ChestMotif visual={visual} x={35} y={45} size={0.58} />
      {/* Arms (bone) */}
      <line x1="26" y1="34" x2="18" y2="52" stroke={palette.light} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="18" y1="52" x2="22" y2="66" stroke={palette.light} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="44" y1="34" x2="52" y2="52" stroke={palette.light} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="52" y1="52" x2="50" y2="20" stroke={palette.light} strokeWidth="2.2" strokeLinecap="round" />
      {/* Legs */}
      <line x1="30" y1="60" x2="28" y2="82" stroke={palette.light} strokeWidth="2.4" strokeLinecap="round" />
      <line x1="40" y1="60" x2="42" y2="82" stroke={palette.light} strokeWidth="2.4" strokeLinecap="round" />
      {/* Skull */}
      <ellipse cx="35" cy="14" rx="7" ry="8" fill={palette.light} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <ellipse cx="32" cy="14" rx="1.6" ry="2" fill="#000" />
      <ellipse cx="38" cy="14" rx="1.6" ry="2" fill="#000" />
      <path d="M33 18 L33 21 M35 18 L35 21 M37 18 L37 21" stroke="#000" strokeWidth="0.6" />
      <path d="M32 21 L38 21" stroke="#000" strokeWidth="0.6" />
      <Headgear visual={visual} cx={35} cy={8} />
      {/* Helm/horns */}
      <path d="M28 6 L30 12 L34 8 Z" fill="#1f1408" />
      <path d="M42 6 L40 12 L36 8 Z" fill="#1f1408" />
      <HeldWeapon visual={visual} g={g} x={52} y={48} />
      <Shield visual={visual} g={g} x={13} y={50} />
      <ExtraDetails visual={visual} />
    </g>
  );
}

function DamagePreviewPanel({ preview, actor, target }: { preview: DamagePreview; actor?: CombatBoardUnit; target?: CombatBoardUnit }) {
  if (!actor || !target) return null;
  const actorRule = getUnitRule(actor.unitType);
  const targetRule = getUnitRule(target.unitType);
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-30 w-64 rounded-md border border-amber-500/45 bg-black/65 p-3 text-xs text-stone-200 shadow-xl">
      <div className={`text-[11px] font-black uppercase tracking-[0.2em] ${goldText}`}>Preview tactique</div>
      <div className="mt-2 font-bold text-amber-100">{actorRule.label} vers {targetRule.label}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <span className="rounded-sm border border-stone-600/60 bg-stone-950/70 px-2 py-1">{preview.actionLabel}</span>
        <span className="rounded-sm border border-red-500/50 bg-red-950/60 px-2 py-1">{preview.damage} deg.</span>
        <span className="rounded-sm border border-amber-500/50 bg-amber-950/60 px-2 py-1">{preview.kills} pertes</span>
      </div>
    </div>
  );
}

function InitiativeQueue({
  combat,
  inspectedUnitId,
  onInspectUnit,
}: {
  combat: PersistentCombat;
  inspectedUnitId: string | null;
  onInspectUnit: (unitId: string) => void;
}) {
  const queueRef = useRef<HTMLDivElement>(null);
  const [visibleRadius, setVisibleRadius] = useState(3);
  const unitsById = new Map(combat.boardState.units.map((unit) => [unit.id, unit]));
  const initiativeOrder = buildTurnQueue(combat.boardState.units, combat.round).filter((id) => unitsById.get(id)?.count);
  const queue = getCenteredInitiativeSlots(initiativeOrder, combat.currentUnitId, visibleRadius)
    .map((slot) => {
      const unit = unitsById.get(slot.id);
      return unit && unit.count > 0 ? { ...slot, unit } : null;
    })
    .filter((slot): slot is { id: string; offset: number; unit: CombatBoardUnit } => Boolean(slot));

  useEffect(() => {
    const element = queueRef.current;
    if (!element) return;

    const updateRadius = () => {
      const width = element.clientWidth;
      setVisibleRadius(width < 230 ? 1 : width < 420 ? 2 : 3);
    };

    updateRadius();
    const observer = new ResizeObserver(updateRadius);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (queue.length === 0) return null;

  return (
    <div ref={queueRef} className="mx-auto flex max-w-full items-center justify-center overflow-hidden">
      <div className="flex max-w-full items-center gap-1.5 overflow-hidden rounded-md border border-amber-700/50 bg-black/55 px-2 py-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.5),0_0_0_1px_rgba(252,211,77,0.12)_inset] backdrop-blur-sm">
        {queue.map(({ unit, offset }) => {
        const rule = getUnitRule(unit.unitType);
        const active = offset === 0;
        const inspected = inspectedUnitId === unit.id;
        const previous = offset < 0;
        return (
          <button
            type="button"
            key={`${unit.id}-${offset}`}
            className={`group relative shrink-0 overflow-hidden rounded-md border transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 ${
              active
                ? "h-16 w-14 border-amber-200 bg-amber-950/90 shadow-[0_0_18px_rgba(251,191,36,0.68)]"
                : inspected
                  ? "h-14 w-12 border-sky-300 bg-sky-950/85 shadow-[0_0_12px_rgba(125,211,252,0.42)]"
                  : unit.side === "attacker"
                    ? "h-14 w-12 border-blue-400/55 bg-blue-950/65"
                    : "h-14 w-12 border-red-400/55 bg-red-950/65"
            } ${previous ? "opacity-55 saturate-75" : ""}`}
            title={`${offset === 0 ? "Actuel" : offset < 0 ? `${Math.abs(offset)} precedent` : `${offset} suivant`} - ${rule.label} x${unit.count} / v${unit.speed}`}
            onClick={() => onInspectUnit(unit.id)}
          >
            <span className={`${active ? "h-12" : "h-10"} absolute inset-x-0 top-0 overflow-hidden bg-gradient-to-b from-stone-900/75 to-black/30`}>
              <InitiativeMiniature unit={unit} />
            </span>
            {active && <span className="absolute inset-x-1 bottom-4 h-px bg-amber-200/80" />}
            <span className="absolute inset-x-0 bottom-0 grid h-4 place-items-center bg-black/72 px-1 text-[10px] font-black leading-none text-stone-100">
              x{unit.count}
            </span>
          </button>
        );
        })}
      </div>
    </div>
  );
}

function getCenteredInitiativeSlots(order: string[], currentUnitId: string | null | undefined, radius: number) {
  if (order.length === 0) return [];
  const currentIndex = Math.max(0, currentUnitId ? order.indexOf(currentUnitId) : 0);
  const offsets = order.length === 1
    ? [0]
    : Array.from({ length: radius * 2 + 1 }, (_, index) => index - radius);

  return offsets.map((offset) => ({
    id: order[(currentIndex + offset + order.length * 4) % order.length],
    offset,
  }));
}

function InitiativeMiniature({ unit }: { unit: CombatBoardUnit }) {
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const sideFlip = unit.side === "defender" ? "scaleX(-1)" : "scaleX(1)";

  return (
    <span
      className="absolute left-1/2 top-1/2 block h-14 w-12 drop-shadow-[0_6px_5px_rgba(0,0,0,0.65)]"
      style={{ transform: `translate(-50%, -45%) scale(0.9) ${sideFlip}`, transformOrigin: "50% 50%" }}
    >
      <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitType={unit.unitType} />
    </span>
  );
}

function findHexPath(
  start: { q: number; r: number },
  end: { q: number; r: number },
  occupied: Set<string>,
  blocked: Set<string>
) {
  const startKey = `${start.q},${start.r}`;
  const endKey = `${end.q},${end.r}`;
  const queue: { q: number; r: number; path: { q: number; r: number }[] }[] = [
    { q: start.q, r: start.r, path: [{ q: start.q, r: start.r }] },
  ];
  const seen = new Set([startKey]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (`${current.q},${current.r}` === endKey) return current.path;

    for (const neighbor of getHexNeighbors(current.q, current.r)) {
      const key = `${neighbor.q},${neighbor.r}`;
      if (seen.has(key)) continue;
      if (blocked.has(key)) continue;
      if (occupied.has(key) && key !== startKey && key !== endKey) continue;
      seen.add(key);
      queue.push({ ...neighbor, path: [...current.path, neighbor] });
    }
  }

  return [];
}

function UnitDetails({ unit }: { unit: CombatBoardUnit }) {
  const rule = getUnitRule(unit.unitType);
  const creature = getCreature(unit.unitType);
  const states = [
    unit.defended ? "Defend" : null,
    unit.waited ? "Attend" : null,
    unit.hasRetaliated ? "Riposte utilisee" : null,
  ].filter(Boolean);

  return (
    <div className="flex gap-3">
      <div className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-md border border-amber-700/60 bg-gradient-to-b from-stone-900 to-black shadow-[0_0_0_1px_rgba(252,211,77,0.15)_inset]">
        <UnitPortrait unit={unit} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-black ${goldText}`}>{rule.label} x{unit.count}</div>
        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-stone-400">
          {unit.side === "attacker" ? "Attaquant" : "Defenseur"}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-300">
          <span>Att. {rule.attack}</span>
          <span>Def. {rule.defense}</span>
          <span>Vit. {unit.speed}</span>
          <span>Deg. {unit.minDamage}-{unit.maxDamage}</span>
          <span>PV/u {unit.maxHealth}</span>
          <span>PV {unit.health}/{unit.maxHealth * unit.count}</span>
        </div>
        {unit.ranged && <div className="mt-2 text-xs font-bold text-amber-200">Tirs : {unit.shots}</div>}
        {creature.abilities.length > 0 && (
          <div className="mt-2 text-xs text-stone-300">{creature.abilities.join(", ")}</div>
        )}
        {creature.special && <div className="mt-1 text-xs text-amber-100/85">{creature.special}</div>}
        {states.length > 0 && <div className="mt-2 text-xs font-bold text-sky-200">{states.join(" | ")}</div>}
      </div>
    </div>
  );
}

function UnitPortrait({ unit }: { unit: CombatBoardUnit }) {
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const sideFlip = unit.side === "defender" ? "scaleX(-1)" : "scaleX(1)";

  return (
    <div className="relative h-full w-full">
      <span
        className="absolute left-1/2 top-1/2 block h-[104px] w-[80px] drop-shadow-[0_8px_8px_rgba(0,0,0,0.55)]"
        style={{ transform: `translate(-50%, -50%) scale(0.95) ${sideFlip}`, transformOrigin: "50% 50%" }}
      >
        <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} unitType={unit.unitType} />
      </span>
    </div>
  );
}

function getIsoPosition(q: number, r: number) {
  return {
    x: ISO_ORIGIN_X + q * COL_STEP + (r % 2) * ROW_STAGGER,
    y: ISO_ORIGIN_Y + r * ROW_STEP,
  };
}

function getDepthScale(r: number) {
  return 0.86 + (r / Math.max(1, COMBAT_ROWS - 1)) * 0.22;
}

function getUnitRenderOffsetX(unit: CombatBoardUnit) {
  return UNIT_RENDER_OFFSET_X + (unit.side === "defender" ? DEFENDER_RENDER_NUDGE_X : 0);
}

function getDamagePreview(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  combat: PersistentCombat,
  gameState: GameState
): DamagePreview {
  const distance = getHexDistance(actor, target);
  const canStrike = distance <= 1 || (actor.ranged && actor.shots > 0);
  if (!canStrike) {
    return { actorId: actor.id, targetId: target.id, actionLabel: "Hors portee", damage: 0, kills: 0 };
  }

  const attackerStats = getCombatSideStats(actor.side, combat, gameState);
  const defenderStats = getCombatSideStats(target.side, combat, gameState);
  const damage = estimateDamage(actor, target, attackerStats, defenderStats);
  const nextHealth = Math.max(0, target.health - damage);
  const kills = Math.max(0, target.count - (nextHealth > 0 ? Math.ceil(nextHealth / target.maxHealth) : 0));

  return {
    actorId: actor.id,
    targetId: target.id,
    actionLabel: distance <= 1 ? "Melee" : "Tir",
    damage,
    kills,
  };
}

function estimateDamage(
  actor: CombatBoardUnit,
  target: CombatBoardUnit,
  attackerStats: { attack: number; defense: number },
  defenderStats: { attack: number; defense: number }
) {
  const attackValue = getUnitRule(actor.unitType).attack + attackerStats.attack;
  const defenseValue = getUnitRule(target.unitType).defense + defenderStats.defense + (target.defended ? 2 : 0);
  const diff = attackValue - defenseValue;
  const multiplier = diff >= 0 ? 1 + diff * 0.05 : 1 / (1 + Math.abs(diff) * 0.05);
  const damagePerUnit = Math.floor((actor.minDamage + actor.maxDamage) / 2);
  return Math.max(1, Math.floor(damagePerUnit * actor.count * multiplier));
}

function getCombatSideStats(side: "attacker" | "defender", combat: PersistentCombat, gameState: GameState) {
  const heroId = side === "attacker" ? combat.attackerHeroId : combat.defenderHeroId;
  const hero = gameState.players.flatMap((player) => player.heroes).find((item) => item.id === heroId);
  return {
    attack: hero?.stats.attack ?? 0,
    defense: hero?.stats.defense ?? 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getUnitMoveTransition(durationMs: number) {
  if (durationMs <= 0) return "none";
  return `left ${durationMs}ms ${UNIT_MOVE_EASING}, top ${durationMs}ms ${UNIT_MOVE_EASING}`;
}

type SceneryPreset = {
  background: string;
  sky: string;
  horizon: string;
  mountain: string;
  tree: string;
  trunk: string;
  leftVignette: string;
  rightVignette: string;
  trees: Array<{ left: number; top: number; scale: number }>;
  mountains: Array<{ left: number; width: number; height: number }>;
};

function getSceneryPreset(environment: CombatEnvironment): SceneryPreset {
  const defaultTrees = [
    { left: 5, top: 21, scale: 1.1 },
    { left: 14, top: 12, scale: 0.86 },
    { left: 25, top: 18, scale: 1.0 },
    { left: 66, top: 14, scale: 0.96 },
    { left: 78, top: 20, scale: 1.2 },
    { left: 90, top: 15, scale: 0.9 },
  ];
  const sparseTrees = [
    { left: 9, top: 23, scale: 0.74 },
    { left: 82, top: 20, scale: 0.8 },
  ];
  const defaultMountains = [
    { left: 10, width: 150, height: 94 },
    { left: 31, width: 210, height: 126 },
    { left: 59, width: 180, height: 108 },
    { left: 78, width: 150, height: 86 },
  ];
  const noMountains: SceneryPreset["mountains"] = [];
  const base: SceneryPreset = {
    background: "linear-gradient(180deg,#5d6d68 0%,#636a58 26%,#30352b 56%,#141712 100%)",
    sky: "linear-gradient(180deg,rgba(177,192,190,0.48),rgba(112,128,116,0.28) 45%,transparent)",
    horizon: "linear-gradient(180deg,rgba(48,75,55,0.56),rgba(40,53,41,0.2),transparent)",
    mountain: "linear-gradient(145deg,rgba(86,94,84,0.92),rgba(37,45,39,0.64))",
    tree: "linear-gradient(160deg,#3f5f45,#182a20)",
    trunk: "#3f2c1d",
    leftVignette: "radial-gradient(ellipse at bottom left,rgba(24,44,23,0.95),transparent 70%)",
    rightVignette: "radial-gradient(ellipse at bottom right,rgba(45,37,25,0.96),transparent 72%)",
    trees: defaultTrees,
    mountains: defaultMountains,
  };

  switch (environment.theme) {
    case "forest":
      return {
        ...base,
        background: "linear-gradient(180deg,#52665c 0%,#36533f 32%,#1f3527 62%,#101812 100%)",
        horizon: "linear-gradient(180deg,rgba(29,68,43,0.72),rgba(21,54,33,0.42),transparent)",
        tree: "linear-gradient(160deg,#5f8c52,#102516)",
        trees: [...defaultTrees, { left: 39, top: 11, scale: 1.08 }, { left: 54, top: 18, scale: 0.92 }],
      };
    case "sand":
      return {
        ...base,
        background: "linear-gradient(180deg,#9aa2a0 0%,#b99957 30%,#6e572e 62%,#211b13 100%)",
        horizon: "linear-gradient(180deg,rgba(157,124,52,0.52),rgba(108,82,32,0.28),transparent)",
        mountain: "linear-gradient(145deg,rgba(151,115,61,0.88),rgba(71,52,27,0.62))",
        tree: "linear-gradient(160deg,#a3a03a,#4f4b1d)",
        trunk: "#5b341c",
        trees: sparseTrees,
      };
    case "snow":
      return {
        ...base,
        background: "linear-gradient(180deg,#c7d4d8 0%,#9aaeb2 30%,#56666a 62%,#15191b 100%)",
        sky: "linear-gradient(180deg,rgba(236,249,255,0.62),rgba(188,205,211,0.3) 45%,transparent)",
        horizon: "linear-gradient(180deg,rgba(203,218,218,0.5),rgba(106,125,124,0.22),transparent)",
        mountain: "linear-gradient(145deg,rgba(226,232,240,0.9),rgba(91,104,111,0.66))",
        tree: "linear-gradient(160deg,#dbe7de,#2b4a3a)",
      };
    case "swamp":
      return {
        ...base,
        background: "linear-gradient(180deg,#67715a 0%,#4f6139 30%,#2f3a24 62%,#11160d 100%)",
        sky: "linear-gradient(180deg,rgba(149,160,122,0.48),rgba(82,101,62,0.3) 45%,transparent)",
        horizon: "linear-gradient(180deg,rgba(69,91,42,0.64),rgba(40,57,27,0.28),transparent)",
        tree: "linear-gradient(160deg,#617f3d,#1f2f16)",
        trees: [...sparseTrees, { left: 38, top: 24, scale: 0.68 }, { left: 62, top: 23, scale: 0.72 }],
        mountains: noMountains,
      };
    case "lava":
      return {
        ...base,
        background: "linear-gradient(180deg,#5b4b43 0%,#5a2b22 32%,#341817 62%,#110909 100%)",
        sky: "linear-gradient(180deg,rgba(104,71,56,0.58),rgba(90,40,28,0.36) 45%,transparent)",
        horizon: "linear-gradient(180deg,rgba(126,47,27,0.46),rgba(56,19,15,0.35),transparent)",
        mountain: "linear-gradient(145deg,rgba(75,52,45,0.92),rgba(29,20,18,0.75))",
        tree: "linear-gradient(160deg,#3c2b24,#140d0b)",
        trunk: "#27130e",
        trees: sparseTrees,
      };
    case "mountain":
      return {
        ...base,
        background: "linear-gradient(180deg,#8a918b 0%,#686a62 30%,#383b36 62%,#141614 100%)",
        mountain: "linear-gradient(145deg,rgba(142,145,137,0.94),rgba(53,56,52,0.72))",
        trees: sparseTrees,
      };
    case "water":
    case "coast":
      return {
        ...base,
        background: "linear-gradient(180deg,#7c969d 0%,#557884 32%,#264856 62%,#101923 100%)",
        horizon: "linear-gradient(180deg,rgba(56,110,127,0.54),rgba(28,73,91,0.3),transparent)",
        tree: "linear-gradient(160deg,#567a58,#173028)",
        mountains: environment.theme === "water" ? noMountains : defaultMountains.slice(0, 2),
        trees: environment.theme === "water" ? sparseTrees.slice(0, 1) : sparseTrees,
      };
    case "road":
      return {
        ...base,
        background: "linear-gradient(180deg,#69716a 0%,#6b684e 30%,#3d3929 62%,#171510 100%)",
        horizon: "linear-gradient(180deg,rgba(83,78,48,0.5),rgba(48,44,31,0.24),transparent)",
        trees: defaultTrees.slice(0, 4),
      };
    case "settlement":
    case "building":
      return {
        ...base,
        background: "linear-gradient(180deg,#6b716d 0%,#74664c 30%,#453928 62%,#15110d 100%)",
        horizon: "linear-gradient(180deg,rgba(94,72,44,0.54),rgba(56,40,25,0.28),transparent)",
        trees: sparseTrees,
      };
    case "dirt":
      return {
        ...base,
        background: "linear-gradient(180deg,#74746b 0%,#826447 30%,#493726 62%,#18120d 100%)",
        horizon: "linear-gradient(180deg,rgba(104,71,43,0.52),rgba(61,42,27,0.24),transparent)",
        tree: "linear-gradient(160deg,#647342,#202818)",
        trees: defaultTrees.slice(0, 5),
      };
    case "grass":
    default:
      return base;
  }
}

function getBattleTileBaseColor(theme: CombatEnvironment["theme"]) {
  switch (theme) {
    case "forest":
      return "#203327";
    case "sand":
      return "#4b3d22";
    case "snow":
      return "#485153";
    case "swamp":
      return "#2b3521";
    case "lava":
      return "#341d18";
    case "mountain":
      return "#373934";
    case "water":
    case "coast":
      return "#1e3640";
    case "road":
      return "#383327";
    case "settlement":
    case "building":
      return "#3b3024";
    case "dirt":
      return "#382b20";
    case "grass":
    default:
      return "#232b20";
  }
}

function getTileTopColor(
  feature: CombatTerrainFeature | undefined,
  environment: CombatEnvironment,
  reachable: boolean,
  attackable: boolean,
  pendingDestination: boolean,
  pendingPath: boolean,
  active: boolean,
  inspected: boolean
) {
  if (attackable) return "#3c1e1c";
  if (inspected) return "#3d3420";
  if (active) return "#3f4648";
  if (pendingDestination) return "#5b4a20";
  if (pendingPath) return "#4a3f24";
  if (reachable) return "#26382b";
  if (feature?.type === "water") return "#213a40";
  if (feature?.type === "rock") return "#3a3934";
  return getBattleTileBaseColor(environment.theme);
}

function getTileStrokeColor(
  feature: CombatTerrainFeature | undefined,
  reachable: boolean,
  attackable: boolean,
  pendingDestination: boolean,
  pendingPath: boolean,
  active: boolean,
  inspected: boolean
) {
  if (attackable) return "rgba(244,114,74,0.95)";
  if (inspected) return "rgba(251,191,36,0.95)";
  if (active) return "rgba(236,244,246,0.95)";
  if (pendingDestination) return "rgba(255,218,96,0.95)";
  if (pendingPath) return "rgba(229,169,57,0.9)";
  if (reachable) return "rgba(104,177,104,0.58)";
  if (feature?.type === "water") return "rgba(107,172,190,0.68)";
  if (feature?.type === "rock") return "rgba(146,142,128,0.62)";
  return "rgba(142,148,132,0.46)";
}

export function getUnitModel(unit: CombatBoardUnit): UnitModelKind {
  const type = String(unit.unitType);
  if (unit.ranged && ["archer", "marksman", "wood_elf", "orc", "lizardman"].some((token) => type.includes(token))) return "archer";
  if (["monk", "zealot", "mage", "lich", "gog", "beholder", "medusa", "genie"].some((token) => type.includes(token))) return "caster";
  if (["cavalier", "champion", "centaur", "unicorn", "wolf_rider", "black_knight"].some((token) => type.includes(token))) return "cavalry";
  if (["griffin", "pegasus", "dragon", "devil", "efreet", "gargoyle", "roc", "wyvern", "fly", "harpy", "manticore", "angel"].some((token) => type.includes(token))) return "winged";
  if (["giant", "naga", "hydra", "behemoth", "dendroid", "gorgon", "basilisk", "minotaur", "ogre", "golem", "cyclops"].some((token) => type.includes(token))) return "large";
  if (["hound", "gnoll", "goblin", "imp", "troglodyte"].some((token) => type.includes(token))) return "beast";
  if (["skeleton", "zombie", "wight", "vampire", "bone"].some((token) => type.includes(token))) return "undead";
  return "infantry";
}

export function getUnitPalette(unit: CombatBoardUnit) {
  const type = String(unit.unitType);
  if (["skeleton", "zombie", "wight", "vampire", "lich", "black_knight", "bone"].some((token) => type.includes(token))) {
    return { light: "#e5e7eb", main: "#94a3b8", dark: "#334155" };
  }
  if (["imp", "gog", "hound", "demon", "pit", "efreet", "devil"].some((token) => type.includes(token))) {
    return { light: "#fca5a5", main: "#dc2626", dark: "#5f0f0f" };
  }
  if (["dragon", "hydra", "wyvern", "basilisk", "gorgon", "lizard"].some((token) => type.includes(token))) {
    return { light: "#86efac", main: "#15803d", dark: "#052e16" };
  }
  if (["mage", "genie", "golem", "gremlin", "gargoyle", "naga", "giant"].some((token) => type.includes(token))) {
    return { light: "#bfdbfe", main: "#2563eb", dark: "#1e1b4b" };
  }
  if (["goblin", "orc", "ogre", "roc", "cyclops", "behemoth", "wolf"].some((token) => type.includes(token))) {
    return { light: "#fed7aa", main: "#c2410c", dark: "#431407" };
  }
  if (["centaur", "dwarf", "elf", "pegasus", "dendroid", "unicorn"].some((token) => type.includes(token))) {
    return { light: "#bbf7d0", main: "#16a34a", dark: "#14532d" };
  }
  return unit.side === "attacker"
    ? { light: "#dbeafe", main: "#2563eb", dark: "#172554" }
    : { light: "#fecaca", main: "#dc2626", dark: "#450a0a" };
}

function getHexNeighbors(q: number, r: number) {
  const even = r % 2 === 0;
  const deltas = even
    ? [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]]
    : [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];

  return deltas
    .map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
    .filter((cell) => cell.q >= 0 && cell.q < COMBAT_COLS && cell.r >= 0 && cell.r < COMBAT_ROWS);
}

function getTerrainTitle(feature: CombatTerrainFeature) {
  return feature.type === "rock" ? "Rochers" : "Eau";
}

function getUnitTitle(unit: CombatBoardUnit) {
  const base = `${getUnitRule(unit.unitType).label} x${unit.count}`;
  return unit.ranged ? `${base} | Tirs : ${unit.shots}` : base;
}

function mapCombat(combat: Record<string, unknown>): PersistentCombat {
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
