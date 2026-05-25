"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { PersistentCombat } from "@/lib/game/types";
import { computeSurrenderGoldCost } from "@/lib/game/combat/surrender";
import { getHeroMaxMana, spellRequiresCombatTarget, type SpellDefinition } from "@/lib/game/spells";
import { getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import { getCombatSpellRoundKey } from "@/lib/game/combat/spells";
import { useGameStore } from "@/lib/stores/gameStore";
import { refreshGameState } from "@/lib/game/refresh";
import { createClient, isUsingSupabaseProxy } from "@/lib/supabase/browser";
import CombatAudioControl from "./CombatAudioControl";
import { goldText, ornateFrame, ornateFramePolished } from "@/components/game/hud/theme";
import { InitiativeQueue, UnitDetails } from "./combatPanels";
import { CombatFloatingPanel } from "./CombatFloatingPanel";
import { SpellBookButton, SpellBookModal } from "@/components/game/spells/SpellBookModal";

import { UnitSilhouette, getUnitModel, getUnitPalette, type UnitModelKind } from "./unitSvg";
export { UnitSilhouette, getUnitModel, getUnitPalette, type UnitModelKind };
import {
  AUTOMATED_COMBAT_THINK_DELAY_MS,
  delay,
  getCombatActionSettleMs,
  mapCombat,
} from "./combatLayout";

import { IsoBattlefield } from "./IsoBattlefield";

function computeSurrenderCostForSide(
  combat: PersistentCombat,
  playerId: string,
  skills: Partial<Record<string, "basic" | "advanced" | "expert">>
) {
  const side = combat.attackerPlayerId === playerId ? "attacker" : combat.defenderPlayerId === playerId ? "defender" : null;
  if (!side) return 0;
  return computeSurrenderGoldCost(combat.boardState.units, side, skills);
}

export default function CombatScreen() {
  const { data: session } = useSession();
  const activeCombat = useGameStore((state) => state.activeCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const combatMessage = useGameStore((state) => state.combatMessage);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const setCombatResult = useGameStore((state) => state.setCombatResult);
  const setGameState = useGameStore((state) => state.setGameState);
  const gameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const devGodMode = useGameStore((state) => state.devGodMode);
  const devInfiniteMana = useGameStore((state) => state.devInfiniteMana);
  const minimizeCombat = useGameStore((state) => state.minimizeCombat);
  const focusTile = useGameStore((state) => state.focusTile);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [combatAnimationBlocked, setCombatAnimationBlocked] = useState(false);
  const [displayedCurrentUnitId, setDisplayedCurrentUnitId] = useState<string | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [spellBookOpen, setSpellBookOpen] = useState(false);
  const [pendingTargetSpell, setPendingTargetSpell] = useState<SpellDefinition | null>(null);
  const isSubmittingActionRef = useRef(false);
  const actionSubmissionTokenRef = useRef(0);
  const neutralActionKeyRef = useRef<string | null>(null);
  const fetchCombatInFlightRef = useRef(false);
  const combatAnimationTimeoutRef = useRef<number | null>(null);
  const displayedSwapTimeoutRef = useRef<number | null>(null);
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
      if (displayedSwapTimeoutRef.current !== null) {
        window.clearTimeout(displayedSwapTimeoutRef.current);
        displayedSwapTimeoutRef.current = null;
      }
      window.setTimeout(() => {
        setDisplayedCurrentUnitId(null);
        setCombatAnimationBlocked(false);
      }, 0);
      return;
    }

    const previousCombat = previousCombatForAnimationRef.current;
    previousCombatForAnimationRef.current = activeCombat;
    if (!previousCombat || previousCombat.id !== activeCombat.id) {
      const newDisplay = activeCombat.currentUnitId ?? null;
      if (displayedSwapTimeoutRef.current !== null) {
        window.clearTimeout(displayedSwapTimeoutRef.current);
        displayedSwapTimeoutRef.current = null;
      }
      // setState inside an effect must be deferred — calling it synchronously
      // in this render-phase commit is silently dropped under React 19.
      window.setTimeout(() => {
        setDisplayedCurrentUnitId(newDisplay);
        setCombatAnimationBlocked(false);
      }, 0);
      return;
    }

    const settleMs = getCombatActionSettleMs(previousCombat, activeCombat);
    blockCombatAnimation(settleMs);

    if (displayedSwapTimeoutRef.current !== null) {
      window.clearTimeout(displayedSwapTimeoutRef.current);
      displayedSwapTimeoutRef.current = null;
    }
    const nextDisplayed = activeCombat.currentUnitId ?? null;
    if (settleMs <= 0 || previousCombat.currentUnitId === activeCombat.currentUnitId) {
      window.setTimeout(() => setDisplayedCurrentUnitId(nextDisplayed), 0);
    } else {
      displayedSwapTimeoutRef.current = window.setTimeout(() => {
        setDisplayedCurrentUnitId(useGameStore.getState().activeCombat?.currentUnitId ?? null);
        displayedSwapTimeoutRef.current = null;
      }, settleMs);
    }
  }, [activeCombat, blockCombatAnimation]);

  useEffect(() => {
    return () => {
      if (combatAnimationTimeoutRef.current !== null) window.clearTimeout(combatAnimationTimeoutRef.current);
      if (displayedSwapTimeoutRef.current !== null) window.clearTimeout(displayedSwapTimeoutRef.current);
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
  // Lag the displayed "active unit" behind the canonical state so panels,
  // queue, and gating only swap once the previous action finishes animating.
  const effectiveCurrentUnitId = displayedCurrentUnitId ?? activeCombat.currentUnitId ?? null;
  const currentUnit = units.find((unit) => unit.id === effectiveCurrentUnitId);
  const inspectedUnit = units.find((unit) => unit.id === inspectedUnitId) ?? null;
  const currentPlayerId = getCurrentCombatPlayerId(activeCombat.boardState, effectiveCurrentUnitId, activeCombat.currentPlayerId);
  const isMyAction = Boolean(myPlayer && currentPlayerId === myPlayer.id);
  const canSubmitAction = isMyAction && activeCombat.status === "ACTIVE" && Boolean(currentUnit) && !isSubmittingAction && !combatAnimationBlocked;
  const displayedCombat = effectiveCurrentUnitId === activeCombat.currentUnitId
    ? activeCombat
    : { ...activeCombat, currentUnitId: effectiveCurrentUnitId };

  const submitAction = async (action: Record<string, unknown>) => {
    if (!canSubmitAction || isSubmittingActionRef.current) return false;

    const submissionToken = ++actionSubmissionTokenRef.current;
    isSubmittingActionRef.current = true;
    setIsSubmittingAction(true);
    try {
      const actionDevInfiniteManaHeroId = typeof action.devInfiniteManaHeroId === "string"
        ? action.devInfiniteManaHeroId
        : null;
      const response = await fetchWithSupabaseAuth(`/api/games/${activeCombat.gameId}/combats/${activeCombat.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...action,
          ...(devGodMode && selectedHeroId ? { devGodModeHeroId: selectedHeroId } : {}),
          ...(devInfiniteMana && (actionDevInfiniteManaHeroId || selectedHeroId)
            ? { devInfiniteManaHeroId: actionDevInfiniteManaHeroId ?? selectedHeroId }
            : {}),
          expectedCurrentUnitId: activeCombat.currentUnitId,
          expectedRound: activeCombat.round,
          expectedActionLogLength: activeCombat.actionLog.length,
        }),
      });
      const data = await response.json();
      if (!response.ok && !data.combat) {
        const message = typeof data?.error === "string" ? data.error : "Action impossible.";
        console.warn("[combat action]", response.status, message, action);
        setCombatMessage(message);
        return false;
      }
      const combatPayload = data.combat ?? data;
      if (!combatPayload) return false;
      const mapped = mapCombat(combatPayload);
      if (mapped.status === "RESOLVED" || data.result) {
        await settleResolvedCombat(activeCombat, { ...mapped, result: mapped.result ?? data.result });
      } else {
        setActiveCombat(mapped);
      }
      return true;
    } finally {
      releaseSubmissionLock(submissionToken);
    }
  };

  const combatHero = myPlayer?.heroes.find((hero) =>
    hero.id === activeCombat.attackerHeroId || hero.id === activeCombat.defenderHeroId
  ) ?? null;
  const combatHeroHasCastSpell = Boolean(
    combatHero && activeCombat.boardState.spellCastsByRound?.[getCombatSpellRoundKey(activeCombat.round)]?.includes(combatHero.id)
  );
  const canCastHeroSpell = canSubmitAction && !combatHeroHasCastSpell;
  const canRetreat = canSubmitAction && !(activeCombat.round <= 1 && combatHeroHasCastSpell);
  const canSurrender = canSubmitAction && Boolean(activeCombat.defenderHeroId && activeCombat.defenderPlayerId);
  const surrenderCost = combatHero && myPlayer
    ? computeSurrenderCostForSide(activeCombat, myPlayer.id, combatHero.skills ?? {})
    : 0;
  const spellBookHero = combatHero && devInfiniteMana ? { ...combatHero, mana: getHeroMaxMana(combatHero) } : combatHero;
  const castCombatSpell = async (spell: SpellDefinition, targetUnitId?: string) => {
    if (!combatHero) throw new Error("Heros indisponible.");
    if (combatHeroHasCastSpell) {
      setPendingTargetSpell(null);
      setCombatMessage("Ce heros a deja lance un sort ce round.");
      return;
    }
    if (spellRequiresCombatTarget(spell) && !targetUnitId) {
      setPendingTargetSpell(spell);
      setSpellBookOpen(false);
      setCombatMessage(`${spell.label} : choisissez une cible ennemie.`);
      return;
    }
    const cast = await submitAction({
      type: "CAST_COMBAT_SPELL",
      heroId: combatHero.id,
      spellId: spell.id,
      targetUnitId,
      ...(devInfiniteMana ? { devInfiniteManaHeroId: combatHero.id } : {}),
    });
    if (cast) setPendingTargetSpell(null);
  };

  const castPendingCombatSpell = async (targetUnitId: string) => {
    if (!pendingTargetSpell) return;
    await castCombatSpell(pendingTargetSpell, targetUnitId);
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
          {pendingTargetSpell && (
            <button
              type="button"
              onClick={() => setPendingTargetSpell(null)}
              className="rounded-md border border-violet-400/60 bg-violet-950/80 px-3 py-1 text-sm font-black text-violet-100 transition hover:border-violet-200"
            >
              Cible: {pendingTargetSpell.label}
            </button>
          )}
          {combatHero && <SpellBookButton onClick={() => setSpellBookOpen(true)} label="Livre de sorts combat" />}
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
        {combatMessage && (
          <div className="pointer-events-auto absolute left-1/2 top-4 z-40 flex max-w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-md border border-amber-500/50 bg-stone-950/92 px-4 py-2 text-sm font-bold text-amber-100 shadow-xl">
            <span>{combatMessage}</span>
            <button type="button" onClick={() => setCombatMessage(null)} className="text-amber-300/70 hover:text-amber-100">x</button>
          </div>
        )}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div className="absolute left-1/2 top-3 z-30 w-[min(760px,calc(100%-7rem))] -translate-x-1/2">
            <InitiativeQueue combat={displayedCombat} gameState={gameState} inspectedUnitId={inspectedUnitId} onInspectUnit={setInspectedUnitId} />
          </div>
          <IsoBattlefield
            combat={activeCombat}
            displayedCurrentUnitId={effectiveCurrentUnitId}
            gameState={gameState}
            inspectedUnitId={inspectedUnitId}
            isMyAction={canSubmitAction}
            onAction={submitAction}
            onInspectUnit={setInspectedUnitId}
            pendingSpellTarget={Boolean(pendingTargetSpell)}
            onSpellTarget={(unitId) => void castPendingCombatSpell(unitId)}
          />
        </main>
        <aside className="mobile-combat-aside pointer-events-auto absolute bottom-0 right-0 top-0 z-20 flex w-80 max-w-[calc(100%-1rem)] flex-col gap-4 overflow-y-auto p-4 pr-3">
          <CombatFloatingPanel title={inspectedUnit ? "Creature inspectee" : "Unite active"} className={ornateFrame} bodyClassName="px-3 pb-3 pt-2">
            <div className="text-sm text-stone-200">
              {(inspectedUnit ?? currentUnit) ? (
                <UnitDetails unit={(inspectedUnit ?? currentUnit)!} combat={activeCombat} gameState={gameState} />
              ) : (
                <div className="py-4 text-center text-stone-400">Aucune</div>
              )}
            </div>
          </CombatFloatingPanel>

          {Boolean((activeCombat.boardState as { tacticsPhase?: { side: string } }).tacticsPhase) && myPlayer && (
            (((activeCombat.boardState as { tacticsPhase?: { side: string } }).tacticsPhase?.side === "attacker" && activeCombat.attackerPlayerId === myPlayer.id) ||
             ((activeCombat.boardState as { tacticsPhase?: { side: string } }).tacticsPhase?.side === "defender" && activeCombat.defenderPlayerId === myPlayer.id))
          ) && (
            <CombatFloatingPanel title="Phase de tactique" className={ornateFramePolished} bodyClassName="px-3 pb-3 pt-2">
              <div className="text-xs text-amber-200/80 mb-2">Repositionnez vos unités, puis terminez la phase.</div>
              <button
                type="button"
                onClick={() => submitAction({ type: "TACTICS_END" })}
                className="w-full rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-700 to-amber-900 px-3 py-2 font-bold text-amber-50 hover:from-amber-600 hover:to-amber-800"
              >
                Terminer la phase de tactique
              </button>
            </CombatFloatingPanel>
          )}

          {combatHero && (combatHero.skills && Object.keys(combatHero.skills).length > 0) && (
            <CombatFloatingPanel title="Compétences" className={ornateFramePolished} bodyClassName="px-3 pb-3 pt-2">
              <div className="flex flex-wrap gap-1">
                {Object.entries(combatHero.skills).map(([id, level]) => (
                  <span key={id} className="rounded-full border border-amber-600/50 bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    {id.replace(/_/g, " ")} · {level}
                  </span>
                ))}
              </div>
            </CombatFloatingPanel>
          )}

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
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canRetreat}
                onClick={() => submitAction({ type: "RETREAT_COMBAT" })}
                className="rounded-md border border-red-400/60 bg-gradient-to-b from-red-900 to-red-950 px-3 py-2 font-bold text-red-100 shadow-[0_0_0_1px_rgba(252,165,165,0.18)_inset] transition hover:from-red-800 hover:to-red-900 disabled:opacity-40"
              >
                Fuir
              </button>
              <button
                type="button"
                disabled={!canSurrender || (myPlayer?.resources.gold ?? 0) < surrenderCost}
                onClick={() => submitAction({ type: "SURRENDER_COMBAT" })}
                className="rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-900 to-emerald-950 px-3 py-2 font-bold text-emerald-100 shadow-[0_0_0_1px_rgba(167,243,208,0.18)_inset] transition hover:from-emerald-800 hover:to-emerald-900 disabled:opacity-40"
              >
                Se rendre
              </button>
            </div>
            {canSurrender && <div className="mt-1 text-center text-xs font-bold text-amber-200/70">Rancon : {surrenderCost} or</div>}
            {Boolean((activeCombat.boardState as { siegeEffects?: { escapeTunnel?: boolean } }).siegeEffects?.escapeTunnel) && myPlayer && activeCombat.defenderPlayerId === myPlayer.id && (
              <button
                type="button"
                disabled={!canSubmitAction}
                onClick={() => submitAction({ type: "FLEE_COMBAT" })}
                className="mt-2 w-full rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-900 to-emerald-950 px-3 py-2 font-bold text-emerald-100 shadow-[0_0_0_1px_rgba(167,243,208,0.18)_inset] transition hover:from-emerald-800 hover:to-emerald-900 disabled:opacity-40"
              >
                Fuir par le Tunnel d&apos;évasion
              </button>
            )}
          </CombatFloatingPanel>

          <CombatFloatingPanel title="Journal" className={`min-h-0 flex flex-col ${ornateFramePolished}`} expandedClassName="min-h-64 flex-1" bodyClassName="min-h-0 flex flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 text-sm text-stone-300">
              {activeCombat.actionLog.slice(-20).map((line, index) => (
                <div key={index} className="border-b border-amber-900/20 pb-1 last:border-b-0">{line}</div>
              ))}
            </div>
          </CombatFloatingPanel>
        </aside>
      </div>
      {spellBookOpen && spellBookHero && (
        <SpellBookModal
          hero={spellBookHero}
          context="combat"
          title="Livre de sorts - Combat"
          targetLabel={pendingTargetSpell ? `${pendingTargetSpell.label} : choisissez une cible` : null}
          canCast={canCastHeroSpell}
          ignoreManaCost={devInfiniteMana}
          onClose={() => setSpellBookOpen(false)}
          onCast={(spell) => castCombatSpell(spell)}
        />
      )}
    </div>
  );
}
