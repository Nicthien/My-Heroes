"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { CombatBoardUnit, CombatTerrainFeature, PersistentCombat } from "@/lib/game/types";
import { getUnitRule } from "@/lib/game/units";
import { COMBAT_COLS, COMBAT_ROWS, getHexDistance } from "@/lib/game/combat/persistent";
import { useGameStore } from "@/lib/stores/gameStore";
import { refreshGameState } from "@/lib/game/refresh";
import {
  CornerOrnaments,
  ParchmentBackground,
  goldDivider,
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

export type UnitModelKind = "infantry" | "archer" | "cavalry" | "winged" | "large" | "caster" | "beast" | "undead";

export default function CombatScreen() {
  const { data: session } = useSession();
  const { activeCombat, setActiveCombat, setCombatResult, setGameState, gameState, minimizeCombat } = useGameStore();
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const isSubmittingActionRef = useRef(false);
  const neutralActionKeyRef = useRef<string | null>(null);

  const resolveCombat = useCallback(async (combat: PersistentCombat) => {
    setActiveCombat(null);
    if (combat.result) setCombatResult(combat.result);
    const refreshed = await refreshGameState(combat.gameId, session?.user?.id);
    if (refreshed) setGameState(refreshed);
  }, [session?.user?.id, setActiveCombat, setCombatResult, setGameState]);

  useEffect(() => {
    if (!activeCombat) return;
    const interval = setInterval(async () => {
      const response = await fetchWithSupabaseAuth(`/api/games/${activeCombat.gameId}/combats/${activeCombat.id}`);
      if (!response.ok) return;
      const data = await response.json();
      const mapped = mapCombat(data);
      if (mapped.status === "RESOLVED") {
        await resolveCombat(mapped);
        return;
      }
      setActiveCombat(mapped);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeCombat, resolveCombat, setActiveCombat]);

  useEffect(() => {
    if (!activeCombat || !gameState || activeCombat.status !== "ACTIVE") return;

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
  }, [activeCombat, gameState, resolveCombat, setActiveCombat]);

  if (!activeCombat || !gameState) return null;
  const myPlayer = gameState.players.find((player) => player.userId === session?.user?.id);
  const units = activeCombat.boardState.units;
  const currentUnit = units.find((unit) => unit.id === activeCombat.currentUnitId);
  const isMyAction = Boolean(myPlayer && activeCombat.currentPlayerId === myPlayer.id);
  const canSubmitAction = isMyAction && activeCombat.status === "ACTIVE" && Boolean(currentUnit) && !isSubmittingAction;

  const submitAction = async (action: Record<string, unknown>) => {
    if (!canSubmitAction || isSubmittingActionRef.current) return;

    isSubmittingActionRef.current = true;
    setIsSubmittingAction(true);
    try {
      const response = await fetchWithSupabaseAuth(`/api/games/${activeCombat.gameId}/combats/${activeCombat.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!response.ok) return;
      const data = await response.json();
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
        <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto px-5 pb-5 pt-3">
          <IsoBattlefield combat={activeCombat} isMyAction={canSubmitAction} onAction={submitAction} />
        </main>
        <aside className="relative z-20 flex w-80 flex-col gap-4 border-l border-amber-700/50 bg-gradient-to-b from-[#1a1208]/95 via-[#120f0a]/95 to-stone-950/95 p-4 shadow-[-14px_0_28px_rgba(0,0,0,0.45)]">
          <ParchmentBackground />
          <section className={`relative ${ornateFrame} p-3`}>
            <CornerOrnaments />
            <div className={`text-center text-[11px] font-black uppercase tracking-[0.22em] ${goldText}`}>Unite active</div>
            <div className={`my-2 ${goldDivider}`} />
            <div className="text-sm text-stone-200">
              {currentUnit ? <UnitDetails unit={currentUnit} /> : <div className="py-4 text-center text-stone-400">Aucune</div>}
            </div>
          </section>

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

          <section className={`relative flex min-h-0 flex-1 flex-col ${ornateFramePolished} p-3`}>
            <CornerOrnaments />
            <div className={`text-center text-[11px] font-black uppercase tracking-[0.22em] ${goldText}`}>Journal</div>
            <div className={`my-2 ${goldDivider}`} />
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-sm text-stone-300">
              {activeCombat.actionLog.slice(-20).map((line, index) => (
                <div key={index} className="border-b border-amber-900/20 pb-1 last:border-b-0">{line}</div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function IsoBattlefield({ combat, isMyAction, onAction }: { combat: PersistentCombat; isMyAction: boolean; onAction: (action: Record<string, unknown>) => void }) {
  const [pendingMove, setPendingMove] = useState<{ unitId: string; q: number; r: number; path: { q: number; r: number }[] } | null>(null);
  const units = combat.boardState.units;
  const terrain = useMemo(() => combat.boardState.terrain ?? [], [combat.boardState.terrain]);
  const currentUnit = units.find((unit) => unit.id === combat.currentUnitId);
  const occupied = useMemo(() => new Set(units.map((unit) => `${unit.q},${unit.r}`)), [units]);
  const blocked = useMemo(() => new Set(terrain.map((feature) => `${feature.q},${feature.r}`)), [terrain]);
  const activePendingMove = pendingMove?.unitId === combat.currentUnitId ? pendingMove : null;

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
      const depthScale = getDepthScale(r);
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
          disabled={!canClick}
          onClick={() => {
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
          title={unit ? getUnitTitle(unit) : feature ? getTerrainTitle(feature) : `${q},${r}`}
        >
          <IsoTile
            feature={feature}
            reachable={reachable}
            attackable={attackable}
            pendingDestination={isPendingDestination}
            pendingPath={isPendingPath}
            active={combat.currentUnitId === unit?.id}
          />
          {feature && <TerrainModel feature={feature} />}
          {unit && <UnitModel unit={unit} active={combat.currentUnitId === unit.id} attackable={attackable} lifted depthScale={depthScale} />}
        </button>
      );
    }
  }

  return (
    <div className="relative min-h-[680px] min-w-[1260px] overflow-hidden">
      <BattlefieldScenery />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[68%] bg-[linear-gradient(180deg,rgba(55,66,55,0.12),rgba(35,34,27,0.82)_18%,rgba(22,22,18,0.98)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[58%] h-[520px] w-[1220px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(86,79,58,0.7),rgba(41,42,35,0.68)_55%,transparent_75%)] blur-md" />
      <div
        className="relative"
        style={{
          width: ISO_GRID_WIDTH,
          height: ISO_GRID_HEIGHT,
          filter: "drop-shadow(0 20px 28px rgba(0,0,0,0.45))",
        }}
      >
        {cells}
      </div>
    </div>
  );
}

function BattlefieldScenery() {
  const trees = [
    { left: 5, top: 21, scale: 1.1 },
    { left: 14, top: 12, scale: 0.86 },
    { left: 25, top: 18, scale: 1.0 },
    { left: 66, top: 14, scale: 0.96 },
    { left: 78, top: 20, scale: 1.2 },
    { left: 90, top: 15, scale: 0.9 },
  ];
  const mountains = [
    { left: 10, width: 150, height: 94 },
    { left: 31, width: 210, height: 126 },
    { left: 59, width: 180, height: 108 },
    { left: 78, width: 150, height: 86 },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-52 bg-[linear-gradient(180deg,rgba(166,183,185,0.42),rgba(102,118,111,0.28)_45%,transparent)]" />
      {mountains.map((mountain, index) => (
        <span
          key={index}
          className="absolute top-2 bg-[linear-gradient(145deg,rgba(74,85,80,0.92),rgba(36,43,39,0.64))] blur-[0.2px] [clip-path:polygon(50%_0,100%_100%,0_100%)]"
          style={{ left: `${mountain.left}%`, width: mountain.width, height: mountain.height }}
        />
      ))}
      <span className="absolute left-0 right-0 top-28 h-32 bg-[linear-gradient(180deg,rgba(49,69,58,0.55),rgba(41,52,42,0.2),transparent)]" />
      {trees.map((tree, index) => (
        <span
          key={index}
          className="absolute h-36 w-24 origin-bottom"
          style={{ left: `${tree.left}%`, top: `${tree.top}%`, transform: `scale(${tree.scale})` }}
        >
          <span className="absolute bottom-0 left-1/2 h-16 w-3 -translate-x-1/2 bg-[#3f2c1d]" />
          <span className="absolute bottom-8 left-1/2 h-24 w-20 -translate-x-1/2 bg-[linear-gradient(160deg,#3f5f45,#182a20)] opacity-90 [clip-path:polygon(50%_0,90%_42%,72%_42%,100%_82%,64%_78%,50%_100%,36%_78%,0_82%,28%_42%,10%_42%)]" />
        </span>
      ))}
      <span className="absolute bottom-0 left-0 h-32 w-56 bg-[radial-gradient(ellipse_at_bottom_left,rgba(24,44,23,0.95),transparent_70%)]" />
      <span className="absolute bottom-0 right-0 h-36 w-64 bg-[radial-gradient(ellipse_at_bottom_right,rgba(45,37,25,0.96),transparent_72%)]" />
    </div>
  );
}

function IsoTile({
  feature,
  reachable,
  attackable,
  pendingDestination,
  pendingPath,
  active,
}: {
  feature?: CombatTerrainFeature;
  reachable: boolean;
  attackable: boolean;
  pendingDestination: boolean;
  pendingPath: boolean;
  active: boolean;
}) {
  const topColor = getTileTopColor(feature, reachable, attackable, pendingDestination, pendingPath, active);
  const strokeColor = getTileStrokeColor(feature, reachable, attackable, pendingDestination, pendingPath, active);

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
          strokeWidth={active || attackable || pendingDestination ? 2.4 : reachable || pendingPath ? 2 : 1.15}
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
  lifted = false,
  depthScale = 1,
}: {
  unit: CombatBoardUnit;
  active: boolean;
  attackable: boolean;
  lifted?: boolean;
  depthScale?: number;
}) {
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const sideFlip = unit.side === "defender" ? "scaleX(-1)" : "scaleX(1)";

  return (
    <span
      className={`pointer-events-none absolute block h-[105px] w-[82px] ${
        active ? "drop-shadow-[0_0_12px_rgba(252,211,77,0.75)]" : attackable ? "drop-shadow-[0_0_12px_rgba(248,113,113,0.65)]" : ""
      }`}
      style={{
        left: "calc(50% + 26px)",
        top: lifted ? -48 : 20,
        transform: `translateX(-50%) scale(${depthScale})`,
        transformOrigin: "50% 100%",
      }}
    >
      <span
        className="absolute left-1/2 top-0 block h-[92px] w-[70px] -translate-x-1/2 drop-shadow-[0_10px_8px_rgba(0,0,0,0.55)]"
        style={{ transform: `translateX(-50%) ${sideFlip}` }}
      >
        <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} />
      </span>
      <span
        className={`absolute left-1/2 top-[78px] grid h-5 min-w-8 -translate-x-1/2 place-items-center rounded-sm border px-1 text-center text-[10px] font-black leading-none shadow-lg ${unit.side === "attacker" ? "border-blue-200/70 bg-blue-950/95 text-blue-50" : "border-red-200/70 bg-red-950/95 text-red-50"}`}
      >
        {unit.count}
      </span>
      {unit.ranged && (
        <span className="absolute left-1/2 top-[55px] grid h-4 min-w-6 translate-x-4 place-items-center rounded-sm border border-amber-300/60 bg-amber-950/90 px-1 text-[9px] font-black leading-none text-amber-100">
          {unit.shots}
        </span>
      )}
    </span>
  );
}

export function UnitSilhouette({ kind, palette, ranged }: { kind: UnitModelKind; palette: ReturnType<typeof getUnitPalette>; ranged: boolean }) {
  const gradId = `g-${useId().replace(/:/g, "")}`;
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
      {renderKind(kind, palette, ranged, gradId)}
    </svg>
  );
}

function renderKind(kind: UnitModelKind, palette: ReturnType<typeof getUnitPalette>, ranged: boolean, g: string) {
  if (kind === "cavalry") return <CavalrySvg palette={palette} g={g} />;
  if (kind === "winged") return <WingedSvg palette={palette} g={g} />;
  if (kind === "large") return <LargeSvg palette={palette} g={g} />;
  if (kind === "beast") return <BeastSvg palette={palette} g={g} />;
  if (kind === "caster") return <CasterSvg palette={palette} g={g} />;
  if (kind === "undead") return <UndeadSvg palette={palette} g={g} />;
  return <InfantrySvg palette={palette} ranged={ranged || kind === "archer"} g={g} />;
}

function InfantrySvg({ palette, ranged, g }: { palette: ReturnType<typeof getUnitPalette>; ranged: boolean; g: string }) {
  return (
    <g>
      {/* Legs */}
      <path d="M27 70 L25 86 L31 86 L33 70 Z" fill={palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <path d="M37 70 L39 86 L45 86 L43 70 Z" fill={palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      {/* Boots */}
      <ellipse cx="28" cy="86" rx="5" ry="2" fill="#1f1408" />
      <ellipse cx="42" cy="86" rx="5" ry="2" fill="#1f1408" />
      {/* Torso/armor */}
      <path d="M22 38 Q22 32 28 30 L42 30 Q48 32 48 38 L46 66 Q46 72 35 72 Q24 72 24 66 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
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
      {ranged ? (
        <g>
          {/* Bow */}
          <path d="M55 28 Q62 46 55 64" fill="none" stroke="#7c4a1e" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M55 28 L55 64" stroke="#f5f5f5" strokeWidth="0.6" />
          <path d="M55 46 L48 46" stroke="#f5f5f5" strokeWidth="0.6" />
          <path d="M48 46 L46 44 M48 46 L46 48" stroke="#f5f5f5" strokeWidth="0.6" />
        </g>
      ) : (
        <g>
          {/* Sword */}
          <rect x="54" y="14" width="2" height="38" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.4" />
          <rect x="50" y="52" width="10" height="2.4" fill="#3a2410" />
          <rect x="53.5" y="54" width="3" height="6" fill="#7c4a1e" />
          {/* Shield */}
          <path d="M14 44 Q14 38 20 38 Q26 38 26 44 L26 58 Q20 64 14 58 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
          <path d="M20 42 L20 58 M14 50 L26 50" stroke={palette.light} strokeWidth="0.8" opacity="0.7" />
        </g>
      )}
    </g>
  );
}

function CavalrySvg({ palette, g }: { palette: ReturnType<typeof getUnitPalette>; g: string }) {
  return (
    <g>
      {/* Horse legs */}
      <rect x="14" y="62" width="4" height="22" fill="#3b2410" />
      <rect x="22" y="62" width="4" height="22" fill="#2a1808" />
      <rect x="44" y="62" width="4" height="22" fill="#3b2410" />
      <rect x="52" y="62" width="4" height="22" fill="#2a1808" />
      {/* Horse body */}
      <path d="M10 56 Q10 46 22 44 L52 44 Q62 46 62 56 Q62 66 50 68 L18 68 Q10 66 10 56 Z" fill="#5b3a1d" stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      <path d="M14 50 Q14 46 22 46 L52 46 Q60 48 60 54" fill="none" stroke="#8a5d30" strokeWidth="0.7" opacity="0.8" />
      {/* Horse head */}
      <path d="M52 42 Q60 38 64 44 L62 54 L56 56 Q52 52 52 48 Z" fill="#4a2f17" stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <circle cx="60" cy="46" r="1" fill="#fff" />
      {/* Horse mane */}
      <path d="M44 40 Q50 36 56 40 L54 50 L46 50 Z" fill="#1f1408" />
      {/* Tail */}
      <path d="M10 50 Q4 54 6 64 L10 64 Q12 56 14 54 Z" fill="#1f1408" />
      {/* Rider torso */}
      <path d="M26 24 Q26 16 35 14 Q44 16 44 24 L44 46 Q38 50 30 46 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      {/* Rider pauldrons */}
      <ellipse cx="26" cy="26" rx="4.5" ry="3.5" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      <ellipse cx="44" cy="26" rx="4.5" ry="3.5" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      {/* Rider head */}
      <circle cx="35" cy="10" r="6" fill={`url(#${g}-skin)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      <path d="M29 10 Q29 3 35 2 Q41 3 41 10 L41 12 L29 12 Z" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.5" />
      <path d="M35 0 L37 -3 L33 -3 Z" fill={palette.light} />
      {/* Lance */}
      <line x1="44" y1="6" x2="68" y2="-10" stroke="#7c4a1e" strokeWidth="2" strokeLinecap="round" />
      <path d="M66 -10 L72 -14 L68 -8 Z" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.4" />
      <rect x="42" y="14" width="6" height="2.5" fill="#3a2410" />
    </g>
  );
}

function WingedSvg({ palette, g }: { palette: ReturnType<typeof getUnitPalette>; g: string }) {
  return (
    <g>
      {/* Left wing */}
      <path d="M30 30 Q10 18 2 38 Q6 46 14 48 Q22 46 30 44 Z" fill={`url(#${g}-wing)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      <path d="M30 32 Q18 30 8 38 M30 36 Q20 36 12 44" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
      {/* Right wing */}
      <path d="M40 30 Q60 18 68 38 Q64 46 56 48 Q48 46 40 44 Z" fill={`url(#${g}-wing)`} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      <path d="M40 32 Q52 30 62 38 M40 36 Q50 36 58 44" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
      {/* Body */}
      <path d="M28 30 Q28 20 35 18 Q42 20 42 30 L42 62 Q38 68 35 68 Q32 68 28 62 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      {/* Head */}
      <ellipse cx="35" cy="14" rx="6.5" ry="7" fill={palette.light} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <circle cx="32" cy="13" r="1" fill="#000" />
      <circle cx="38" cy="13" r="1" fill="#000" />
      {/* Legs/talons */}
      <path d="M31 68 L29 82 L26 82 L26 84 L33 84 Z" fill={palette.dark} />
      <path d="M39 68 L41 82 L44 82 L44 84 L37 84 Z" fill={palette.dark} />
      {/* Highlight */}
      <path d="M32 22 Q35 20 38 22" fill="none" stroke={palette.light} strokeWidth="1" opacity="0.6" />
    </g>
  );
}

function LargeSvg({ palette, g }: { palette: ReturnType<typeof getUnitPalette>; g: string }) {
  return (
    <g>
      {/* Legs */}
      <path d="M20 70 L18 86 L28 86 L28 70 Z" fill={palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <path d="M42 70 L42 86 L52 86 L50 70 Z" fill={palette.dark} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <ellipse cx="23" cy="86" rx="6" ry="2" fill="#1a0e04" />
      <ellipse cx="47" cy="86" rx="6" ry="2" fill="#1a0e04" />
      {/* Body */}
      <path d="M14 38 Q14 28 22 26 L48 26 Q56 28 56 38 L54 72 Q44 76 35 76 Q26 76 16 72 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
      {/* Chest plate */}
      <path d="M24 36 L46 36 L44 58 L26 58 Z" fill={palette.light} opacity="0.25" />
      {/* Arms */}
      <path d="M10 40 Q4 54 10 70 L18 70 Q14 56 16 42 Z" fill={palette.main} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      <path d="M60 40 Q66 54 60 70 L52 70 Q56 56 54 42 Z" fill={palette.main} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      {/* Head */}
      <ellipse cx="35" cy="16" rx="9" ry="9" fill={palette.light} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      {/* Horns */}
      <path d="M27 12 Q22 4 24 0 Q28 6 30 12 Z" fill="#1f1408" />
      <path d="M43 12 Q48 4 46 0 Q42 6 40 12 Z" fill="#1f1408" />
      {/* Eyes */}
      <circle cx="31" cy="17" r="1.3" fill="#fef08a" />
      <circle cx="39" cy="17" r="1.3" fill="#fef08a" />
      {/* Tusks */}
      <path d="M31 22 L30 26 L32 25 Z" fill="#f5f5f5" />
      <path d="M39 22 L40 26 L38 25 Z" fill="#f5f5f5" />
      {/* Club */}
      <rect x="62" y="40" width="3" height="26" fill="#3b2410" />
      <ellipse cx="63.5" cy="36" rx="6" ry="7" fill="#5b3a1d" stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      <circle cx="61" cy="34" r="1" fill="#1f1408" />
      <circle cx="66" cy="38" r="1" fill="#1f1408" />
    </g>
  );
}

function BeastSvg({ palette, g }: { palette: ReturnType<typeof getUnitPalette>; g: string }) {
  return (
    <g>
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
      {/* Spine spikes */}
      <path d="M20 40 L23 34 L26 40 M28 40 L31 32 L34 40 M36 40 L39 32 L42 40 M44 40 L47 34 L50 40" fill={palette.light} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      {/* Head */}
      <path d="M52 40 Q66 38 66 52 Q66 60 56 60 Q50 58 50 50 Z" fill={palette.main} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      {/* Ears */}
      <path d="M54 40 L52 32 L58 38 Z" fill={palette.dark} />
      <path d="M62 40 L64 32 L60 38 Z" fill={palette.dark} />
      {/* Eye */}
      <circle cx="60" cy="48" r="1.5" fill="#fef08a" />
      <circle cx="60" cy="48" r="0.6" fill="#000" />
      {/* Fangs */}
      <path d="M58 56 L57 60 L59 58 Z" fill="#fff" />
      <path d="M62 56 L63 60 L61 58 Z" fill="#fff" />
      {/* Tail */}
      <path d="M10 52 Q2 50 0 42 L4 42 Q6 48 12 52 Z" fill={palette.dark} />
    </g>
  );
}

function CasterSvg({ palette, g }: { palette: ReturnType<typeof getUnitPalette>; g: string }) {
  return (
    <g>
      {/* Robe */}
      <path d="M18 38 Q22 28 35 26 Q48 28 52 38 L58 84 Q35 88 12 84 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" />
      {/* Robe trim */}
      <path d="M14 80 Q35 84 56 80" fill="none" stroke={palette.light} strokeWidth="1.5" opacity="0.7" />
      <path d="M30 30 L35 70 L40 30" fill="none" stroke="#facc15" strokeWidth="0.8" opacity="0.6" />
      {/* Hood */}
      <path d="M22 30 Q22 14 35 12 Q48 14 48 30 L46 36 Q35 38 24 36 Z" fill={palette.dark} stroke="rgba(0,0,0,0.6)" strokeWidth="0.7" />
      {/* Face shadow */}
      <ellipse cx="35" cy="24" rx="6" ry="5" fill="#1a0e04" />
      <circle cx="32" cy="23" r="1" fill="#fef08a" />
      <circle cx="38" cy="23" r="1" fill="#fef08a" />
      {/* Staff */}
      <line x1="56" y1="14" x2="58" y2="84" stroke="#7c4a1e" strokeWidth="2" strokeLinecap="round" />
      <circle cx="55" cy="10" r="6" fill={`url(#${g}-glow)`} />
      <circle cx="55" cy="10" r="2.5" fill="#fef9c3" />
      {/* Hands */}
      <circle cx="22" cy="58" r="2.5" fill={`url(#${g}-skin)`} />
      <circle cx="50" cy="58" r="2.5" fill={`url(#${g}-skin)`} />
    </g>
  );
}

function UndeadSvg({ palette, g }: { palette: ReturnType<typeof getUnitPalette>; g: string }) {
  return (
    <g>
      {/* Ribs/torso */}
      <path d="M26 32 Q26 26 35 24 Q44 26 44 32 L42 60 Q35 64 28 60 Z" fill={`url(#${g}-body)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <path d="M28 36 L42 36 M28 42 L42 42 M28 48 L42 48 M28 54 L42 54" stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" />
      <line x1="35" y1="32" x2="35" y2="60" stroke="rgba(0,0,0,0.6)" strokeWidth="0.6" />
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
      {/* Helm/horns */}
      <path d="M28 6 L30 12 L34 8 Z" fill="#1f1408" />
      <path d="M42 6 L40 12 L36 8 Z" fill="#1f1408" />
      {/* Scythe */}
      <line x1="52" y1="20" x2="58" y2="78" stroke="#3b2410" strokeWidth="2" strokeLinecap="round" />
      <path d="M52 20 Q44 14 40 22 Q48 20 52 24 Z" fill={`url(#${g}-steel)`} stroke="rgba(0,0,0,0.55)" strokeWidth="0.5" />
    </g>
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
  return (
    <div className="flex gap-3">
      <div className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-md border border-amber-700/60 bg-gradient-to-b from-stone-900 to-black shadow-[0_0_0_1px_rgba(252,211,77,0.15)_inset]">
        <UnitPortrait unit={unit} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-black ${goldText}`}>{rule.label} x{unit.count}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-300">
          <span>Att. {rule.attack}</span>
          <span>Def. {rule.defense}</span>
          <span>Vit. {unit.speed}</span>
          <span>Deg. {unit.minDamage}-{unit.maxDamage}</span>
        </div>
        {unit.ranged && <div className="mt-2 text-xs font-bold text-amber-200">Tirs : {unit.shots}</div>}
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
        className="absolute left-1/2 top-1/2 block h-[92px] w-[70px] drop-shadow-[0_8px_8px_rgba(0,0,0,0.55)]"
        style={{ transform: `translate(-50%, -50%) scale(0.85) ${sideFlip}`, transformOrigin: "50% 50%" }}
      >
        <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} />
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

function getTileTopColor(
  feature: CombatTerrainFeature | undefined,
  reachable: boolean,
  attackable: boolean,
  pendingDestination: boolean,
  pendingPath: boolean,
  active: boolean
) {
  if (attackable) return "#3c1e1c";
  if (active) return "#3f4648";
  if (pendingDestination) return "#5b4a20";
  if (pendingPath) return "#4a3f24";
  if (reachable) return "#26382b";
  if (feature?.type === "water") return "#213a40";
  if (feature?.type === "rock") return "#3a3934";
  return "#232620";
}

function getTileStrokeColor(
  feature: CombatTerrainFeature | undefined,
  reachable: boolean,
  attackable: boolean,
  pendingDestination: boolean,
  pendingPath: boolean,
  active: boolean
) {
  if (attackable) return "rgba(244,114,74,0.95)";
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
  if (unit.ranged && ["archer", "marksman", "wood_elf", "orc", "cyclops", "lizardman"].some((token) => type.includes(token))) return "archer";
  if (["monk", "zealot", "mage", "lich", "gog", "beholder", "medusa"].some((token) => type.includes(token))) return "caster";
  if (["cavalier", "champion", "centaur", "unicorn", "wolf_rider", "black_knight"].some((token) => type.includes(token))) return "cavalry";
  if (["griffin", "pegasus", "dragon", "devil", "efreet", "gargoyle", "roc", "wyvern", "fly", "harpy", "manticore", "angel"].some((token) => type.includes(token))) return "winged";
  if (["giant", "naga", "hydra", "behemoth", "dendroid", "gorgon", "basilisk", "minotaur", "ogre", "golem"].some((token) => type.includes(token))) return "large";
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
  };
}
