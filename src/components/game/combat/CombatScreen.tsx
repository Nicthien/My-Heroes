"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { PersistentCombat } from "@/lib/game/types";
import { getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import { useGameStore } from "@/lib/stores/gameStore";
import { refreshGameState } from "@/lib/game/refresh";
import { createClient, isUsingSupabaseProxy } from "@/lib/supabase/browser";
import CombatAudioControl from "./CombatAudioControl";
import { goldText, ornateFrame, ornateFramePolished } from "@/components/game/hud/theme";
import { InitiativeQueue, UnitDetails } from "./combatPanels";
import { CombatFloatingPanel } from "./CombatFloatingPanel";

import { UnitSilhouette, getUnitModel, getUnitPalette, type UnitModelKind } from "./unitSvg";
export { UnitSilhouette, getUnitModel, getUnitPalette, type UnitModelKind };
import {
  AUTOMATED_COMBAT_THINK_DELAY_MS,
  delay,
  getCombatActionSettleMs,
  mapCombat,
} from "./combatLayout";

import { IsoBattlefield } from "./IsoBattlefield";

export default function CombatScreen() {
  const { data: session } = useSession();
  const activeCombat = useGameStore((state) => state.activeCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const setCombatResult = useGameStore((state) => state.setCombatResult);
  const setGameState = useGameStore((state) => state.setGameState);
  const gameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const devGodMode = useGameStore((state) => state.devGodMode);
  const minimizeCombat = useGameStore((state) => state.minimizeCombat);
  const focusTile = useGameStore((state) => state.focusTile);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [combatAnimationBlocked, setCombatAnimationBlocked] = useState(false);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const isSubmittingActionRef = useRef(false);
  const actionSubmissionTokenRef = useRef(0);
  const neutralActionKeyRef = useRef<string | null>(null);
  const fetchCombatInFlightRef = useRef(false);
  const combatAnimationTimeoutRef = useRef<number | null>(null);
  const previousCombatForAnimationRef = useRef<PersistentCombat | null>(null);
  const activeCombatId = activeCombat?.id;

  const releaseSubmissionLock = useCallback((submissionToken: number) => {
    if (actionSubmissionTokenRef.current !== submissionToken) return;
    isSubmittingActionRef.current = false;
    setIsSubmittingAction(false);
  }, []);

  const blockCombatAnimation = useCallback((durationMs: number) => {
    if (durationMs <= 0) return;
    if (combatAnimationTimeoutRef.current !== null) {
      window.clearTimeout(combatAnimationTimeoutRef.current);
    }
    setCombatAnimationBlocked(true);
    combatAnimationTimeoutRef.current = window.setTimeout(() => {
      combatAnimationTimeoutRef.current = null;
      setCombatAnimationBlocked(false);
    }, durationMs);
  }, []);

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

  const settleResolvedCombat = useCallback(async (previousCombat: PersistentCombat, resolvedCombat: PersistentCombat) => {
    const durationMs = getCombatActionSettleMs(previousCombat, resolvedCombat);
    setActiveCombat(resolvedCombat);
    blockCombatAnimation(durationMs);
    if (durationMs > 0) await delay(durationMs);
    const current = useGameStore.getState().activeCombat;
    if (current?.id === resolvedCombat.id) {
      await resolveCombat(resolvedCombat);
    }
  }, [blockCombatAnimation, resolveCombat, setActiveCombat]);

  useEffect(() => {
    if (!activeCombat) {
      previousCombatForAnimationRef.current = null;
      if (combatAnimationTimeoutRef.current !== null) {
        window.clearTimeout(combatAnimationTimeoutRef.current);
        combatAnimationTimeoutRef.current = null;
      }
      window.setTimeout(() => setCombatAnimationBlocked(false), 0);
      return;
    }

    const previousCombat = previousCombatForAnimationRef.current;
    previousCombatForAnimationRef.current = activeCombat;
    if (!previousCombat || previousCombat.id !== activeCombat.id) {
      window.setTimeout(() => setCombatAnimationBlocked(false), 0);
      return;
    }

    blockCombatAnimation(getCombatActionSettleMs(previousCombat, activeCombat));
  }, [activeCombat, blockCombatAnimation]);

  useEffect(() => {
    return () => {
      if (combatAnimationTimeoutRef.current !== null) window.clearTimeout(combatAnimationTimeoutRef.current);
    };
  }, []);

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
          await settleResolvedCombat(current, mapped);
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
  }, [activeCombatId, settleResolvedCombat, setActiveCombat]);

  useEffect(() => {
    if (!activeCombat || !gameState) return;
    const syncedCombat = gameState.activeCombats?.find((combat) => combat.id === activeCombat.id);
    if (!syncedCombat || syncedCombat === activeCombat) return;
    setActiveCombat(syncedCombat);
  }, [activeCombat, gameState, setActiveCombat]);

  useEffect(() => {
    if (!activeCombat || !gameState || activeCombat.status !== "ACTIVE") return;
    if (combatAnimationBlocked) return;

    const currentActor = activeCombat.boardState.units.find((unit) => unit.id === activeCombat.currentUnitId);
    const currentActorPlayer = currentActor?.ownerPlayerId
      ? gameState.players.find((player) => player.id === currentActor.ownerPlayerId)
      : null;
    const isAutomatedActor = Boolean(currentActor && (currentActor.ownerPlayerId === null || currentActorPlayer?.isAi));
    if (!isAutomatedActor) return;

    const actionKey = [
      activeCombat.id,
      activeCombat.currentUnitId,
      activeCombat.round,
      activeCombat.turnQueue.join(","),
      activeCombat.actionLog.length,
    ].join(":");
    if (neutralActionKeyRef.current === actionKey || isSubmittingActionRef.current) return;

    let cancelled = false;
    let started = false;
    const combat = activeCombat;
    const submissionToken = ++actionSubmissionTokenRef.current;
    neutralActionKeyRef.current = actionKey;
    isSubmittingActionRef.current = true;
    setIsSubmittingAction(true);

    async function playAutomatedTurn() {
      started = true;
      try {
        const response = await fetchWithSupabaseAuth(`/api/games/${combat.gameId}/combats/${combat.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(devGodMode && selectedHeroId ? { devGodModeHeroId: selectedHeroId } : {}),
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
          await settleResolvedCombat(combat, { ...mapped, result: mapped.result ?? data.result });
        } else {
          setActiveCombat(mapped);
        }
      } finally {
        releaseSubmissionLock(submissionToken);
      }
    }

    const timeout = window.setTimeout(() => void playAutomatedTurn(), AUTOMATED_COMBAT_THINK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (!started) {
        neutralActionKeyRef.current = null;
        releaseSubmissionLock(submissionToken);
      }
    };
  }, [activeCombat, combatAnimationBlocked, devGodMode, gameState, releaseSubmissionLock, selectedHeroId, setActiveCombat, settleResolvedCombat]);

  if (!activeCombat || !gameState) return null;
  const myPlayer = gameState.players.find((player) => player.userId === session?.user?.id);
  const units = activeCombat.boardState.units;
  const currentUnit = units.find((unit) => unit.id === activeCombat.currentUnitId);
  const inspectedUnit = units.find((unit) => unit.id === inspectedUnitId) ?? null;
  const currentPlayerId = getCurrentCombatPlayerId(activeCombat.boardState, activeCombat.currentUnitId, activeCombat.currentPlayerId);
  const isMyAction = Boolean(myPlayer && currentPlayerId === myPlayer.id);
  const canSubmitAction = isMyAction && activeCombat.status === "ACTIVE" && Boolean(currentUnit) && !isSubmittingAction && !combatAnimationBlocked;

  const submitAction = async (action: Record<string, unknown>) => {
    if (!canSubmitAction || isSubmittingActionRef.current) return;

    const submissionToken = ++actionSubmissionTokenRef.current;
    isSubmittingActionRef.current = true;
    setIsSubmittingAction(true);
    try {
      const response = await fetchWithSupabaseAuth(`/api/games/${activeCombat.gameId}/combats/${activeCombat.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...action,
          ...(devGodMode && selectedHeroId ? { devGodModeHeroId: selectedHeroId } : {}),
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
        await settleResolvedCombat(activeCombat, { ...mapped, result: mapped.result ?? data.result });
      } else {
        setActiveCombat(mapped);
      }
    } finally {
      releaseSubmissionLock(submissionToken);
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
          {combatAnimationBlocked ? "Action en cours" : isMyAction ? "A vous de jouer" : "En attente de l'adversaire"}
        </div>
        <div className="flex items-center gap-3">
          <CombatAudioControl />
          <button
            type="button"
            className="rounded-md border border-amber-600/60 bg-gradient-to-b from-stone-900 to-stone-950 px-3 py-1 text-sm font-bold text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.15)_inset] transition hover:from-stone-800 hover:to-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
            onClick={() => minimizeCombat(activeCombat.id)}
          >
            Reduire
          </button>
        </div>
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






