"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { PersistentCombat, Resources } from "@/lib/game/types";
import { findActiveCombatTruce, hasPlayerUsedTruce } from "@/lib/game/combat/truce";
import { getHeroMaxMana, spellRequiresCombatTarget, type SpellDefinition } from "@/lib/game/spells";
import { getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import { getCombatSpellRoundKey } from "@/lib/game/combat/spells";
import { useGameStore } from "@/lib/stores/gameStore";
import { refreshGameState } from "@/lib/game/refresh";
import { createClient, isUsingSupabaseProxy } from "@/lib/supabase/browser";
import CombatAudioControl from "./CombatAudioControl";
import GameMenuButton from "../menu/GameMenuButton";
import OptionsDialog from "../menu/OptionsDialog";
import ConfirmDialog from "../menu/ConfirmDialog";
import { useRouter } from "next/navigation";
import { goldText, ornateFrame, ornateFramePolished } from "@/components/game/hud/theme";
import { TurnTimerBadge } from "@/components/game/hud/TurnTimerBadge";
import { useDevPerformanceStats } from "@/components/game/hud/DevPerformancePanel";
import { DISPLAY_PREFERENCE_EVENT, getSavedFpsDisplay } from "@/lib/settings/displayPreferences";
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
import {
  RESOURCE_KEYS,
  combatHasPlayerHeroesOnBothSides,
  computeSurrenderCostForSide,
} from "./combatNegotiation";

import { IsoBattlefield } from "./IsoBattlefield";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import type { TranslationKey } from "@/lib/i18n/translate";

const RES_LABEL_KEY: Record<keyof Resources, TranslationKey> = {
  gold: "res.gold",
  wood: "res.wood",
  ore: "res.ore",
  mercury: "res.mercury",
  crystals: "res.crystals",
  gems: "res.gems",
  sulfur: "res.sulfur",
};

export default function CombatScreen() {
  const { data: session } = useSession();
  const router = useRouter();
  const { t, locale } = useI18n();
  const resLabel = (key: keyof Resources) => t(RES_LABEL_KEY[key]);
  const activeCombat = useGameStore((state) => state.activeCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const combatMessage = useGameStore((state) => state.combatMessage);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const setCombatResult = useGameStore((state) => state.setCombatResult);
  const setGameState = useGameStore((state) => state.setGameState);
  const gameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  // Combat immortality is a runtime cheat toggle, not the profile dev-access flag.
  const devGodMode = useGameStore((state) => state.devGodMode);
  const devInfiniteMana = useGameStore((state) => state.devInfiniteMana);
  const minimizeCombat = useGameStore((state) => state.minimizeCombat);
  const focusTile = useGameStore((state) => state.focusTile);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [combatAnimationBlocked, setCombatAnimationBlocked] = useState(false);
  const [displayedCurrentUnitId, setDisplayedCurrentUnitId] = useState<string | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [spellBookOpen, setSpellBookOpen] = useState(false);
  const [surrenderOfferOpen, setSurrenderOfferOpen] = useState(false);
  const [surrenderOffer, setSurrenderOffer] = useState<Resources | null>(null);
  const [truceConfirmOpen, setTruceConfirmOpen] = useState(false);
  const [retreatConfirmOpen, setRetreatConfirmOpen] = useState(false);
  const [pendingTargetSpell, setPendingTargetSpell] = useState<SpellDefinition | null>(null);
  const [tacticsSelectedUnitId, setTacticsSelectedUnitId] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirmQuitOpen, setConfirmQuitOpen] = useState(false);
  const [showFps, setShowFps] = useState(getSavedFpsDisplay);
  const performanceStats = useDevPerformanceStats(showFps);

  // Keep the FPS overlay toggle in sync with the Options dialog (and other tabs).
  useEffect(() => {
    const sync = () => setShowFps(getSavedFpsDisplay());
    window.addEventListener(DISPLAY_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISPLAY_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
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
    // Realtime is notification-only: the `combats` table is no longer streamed
    // (it would leak enemy board state). We listen to the game's `game_events`
    // bump instead and re-fetch the sanitized combat endpoint. See migration
    // 20260609000200_realtime_notify_only.sql.
    const gameId = useGameStore.getState().activeCombat?.gameId;
    const channel = isUsingSupabaseProxy() || !gameId
      ? null
      : supabase
          .channel(`combat:${activeCombatId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "game_events", filter: `game_id=eq.${gameId}` },
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
    const activeTacticsPhase = (activeCombat?.boardState as { tacticsPhase?: unknown } | undefined)?.tacticsPhase;
    if (activeTacticsPhase) return;
    const timeout = window.setTimeout(() => setTacticsSelectedUnitId(null), 0);
    return () => window.clearTimeout(timeout);
  }, [activeCombat?.id, activeCombat?.boardState]);

  useEffect(() => {
    if (!activeCombat || !gameState || activeCombat.status !== "ACTIVE") return;
    if (combatAnimationBlocked) return;

    const currentActor = activeCombat.boardState.units.find((unit) => unit.id === activeCombat.currentUnitId);
    const currentActorPlayer = currentActor?.ownerPlayerId
      ? gameState.players.find((player) => player.id === currentActor.ownerPlayerId)
      : null;
    const isAutomatedActor = Boolean(currentActor && (currentActor.ownerPlayerId === null || currentActorPlayer?.isAi));
    if (!isAutomatedActor) return;
    if (findActiveCombatTruce(activeCombat.truces, gameState.turnNumber)) return;

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
  const tacticsPhase = (activeCombat.boardState as { tacticsPhase?: { side: "attacker" | "defender"; maxColumn?: number; minColumn?: number } }).tacticsPhase;
  const isTacticsPhaseActive = Boolean(tacticsPhase);
  // Lag the displayed "active unit" behind the canonical state so panels,
  // queue, and gating only swap once the previous action finishes animating.
  const effectiveCurrentUnitId = isTacticsPhaseActive ? null : displayedCurrentUnitId ?? activeCombat.currentUnitId ?? null;
  const currentUnit = units.find((unit) => unit.id === effectiveCurrentUnitId);
  const inspectedUnit = units.find((unit) => unit.id === inspectedUnitId) ?? null;
  const tacticsSelectedUnit = isTacticsPhaseActive ? units.find((unit) => unit.id === tacticsSelectedUnitId) ?? null : null;
  const currentPlayerId = getCurrentCombatPlayerId(activeCombat.boardState, effectiveCurrentUnitId, activeCombat.currentPlayerId);
  const pendingSurrenderNegotiation = activeCombat.surrenderNegotiations?.find((negotiation) => negotiation.status === "PENDING") ?? null;
  const activeTruce = findActiveCombatTruce(activeCombat.truces, gameState.turnNumber);
  const truceNeedsAck = Boolean(activeTruce && myPlayer && !activeTruce.acknowledgedPlayerIds.includes(myPlayer.id));
  const isMyAction = Boolean(myPlayer && currentPlayerId === myPlayer.id);
  const isMyTacticsPhase = Boolean(
    myPlayer &&
    tacticsPhase &&
    ((tacticsPhase.side === "attacker" && activeCombat.attackerPlayerId === myPlayer.id) ||
      (tacticsPhase.side === "defender" && activeCombat.defenderPlayerId === myPlayer.id))
  );
  const actionBlockedByBusyState = isSubmittingAction || combatAnimationBlocked;
  const canSubmitAction = isMyAction && !isTacticsPhaseActive && activeCombat.status === "ACTIVE" && Boolean(currentUnit) && !pendingSurrenderNegotiation && !activeTruce && !actionBlockedByBusyState;
  const canSubmitTacticsAction = isMyTacticsPhase && activeCombat.status === "ACTIVE" && !pendingSurrenderNegotiation && !activeTruce && !actionBlockedByBusyState;
  const actionUnavailableReason = activeCombat.status !== "ACTIVE"
    ? t("combat.notActive")
    : pendingSurrenderNegotiation
      ? t("combat.surrenderNegotiationInProgress")
      : activeTruce
        ? t("combat.truceInProgress")
        : actionBlockedByBusyState
          ? t("combat.actionInProgress")
          : isTacticsPhaseActive
            ? t("combat.finishTacticsFirst")
          : !currentUnit
            ? t("combat.noUnitCanAct")
            : !isMyAction
              ? t("combat.notYourActionTurn")
              : null;
  const combatStatusLabel = activeTruce
    ? t("combat.statusTruce")
    : combatAnimationBlocked
      ? t("combat.statusActionInProgress")
      : isTacticsPhaseActive
        ? t("combat.statusTactics")
        : isMyAction
          ? t("combat.yourTurn")
          : t("combat.statusWaitingOpponent");
  const displayedCombat = effectiveCurrentUnitId === activeCombat.currentUnitId
    ? activeCombat
    : { ...activeCombat, currentUnitId: effectiveCurrentUnitId };

  const submitAction = async (action: Record<string, unknown>) => {
    const canBypassTurn = action.type === "ACCEPT_SURRENDER" || action.type === "REJECT_SURRENDER" || action.type === "ACK_TRUCE";
    const isTacticsAction = action.type === "TACTICS_MOVE" || action.type === "TACTICS_END";
    if (((isTacticsAction ? !canSubmitTacticsAction : !canSubmitAction) && !canBypassTurn) || isSubmittingActionRef.current) return false;

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
        const message = (typeof data?.error === "string" ? localizedServerMessage(data.error, locale) : null) ?? t("msg.actionImpossible");
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
        if (gameState.activeCombats?.some((combat) => combat.id === mapped.id)) {
          setGameState({
            ...gameState,
            activeCombats: gameState.activeCombats.map((combat) => combat.id === mapped.id ? mapped : combat),
          });
        }
      }
      return true;
    } finally {
      releaseSubmissionLock(submissionToken);
    }
  };

  const myActiveCombatUnit = myPlayer
    ? units.find((unit) => unit.ownerPlayerId === myPlayer.id && unit.heroId && unit.count > 0)
    : null;
  const myPrimaryCombatHeroId = myPlayer?.id === activeCombat.attackerPlayerId
    ? activeCombat.attackerHeroId
    : myPlayer?.id === activeCombat.defenderPlayerId
      ? activeCombat.defenderHeroId
      : null;
  const myParticipantHeroId = myPlayer
    ? activeCombat.participants?.find((participant) => participant.playerId === myPlayer.id)?.heroId
    : null;
  const combatHeroId = myActiveCombatUnit?.heroId ?? myPrimaryCombatHeroId ?? myParticipantHeroId ?? null;
  const combatHero = myPlayer?.heroes.find((hero) => hero.id === combatHeroId) ?? null;
  const combatHeroHasCastSpell = Boolean(
    combatHero && activeCombat.boardState.spellCastsByRound?.[getCombatSpellRoundKey(activeCombat.round)]?.includes(combatHero.id)
  );
  const canCastHeroSpell = canSubmitAction && !combatHeroHasCastSpell;
  const canRetreat = canSubmitAction && !(activeCombat.round <= 1 && combatHeroHasCastSpell);
  const canSurrender = canSubmitAction && combatHasPlayerHeroesOnBothSides(activeCombat);
  const isPrimaryPlayer = Boolean(myPlayer && (activeCombat.attackerPlayerId === myPlayer.id || activeCombat.defenderPlayerId === myPlayer.id));
  const hasUsedTruce = hasPlayerUsedTruce(activeCombat.truces, myPlayer?.id);
  const canRequestTruce = Boolean(isPrimaryPlayer && canSubmitAction && !hasUsedTruce && !activeTruce && !pendingSurrenderNegotiation);
  const surrenderDisabledReason = actionUnavailableReason
    ?? (!combatHasPlayerHeroesOnBothSides(activeCombat)
      ? t("combat.surrenderNeedsBothHeroes")
      : null);
  const truceDisabledReason = activeTruce
    ? t("combat.truceInProgress")
    : hasUsedTruce
      ? t("combat.truceAlreadyUsed")
      : pendingSurrenderNegotiation
        ? t("combat.surrenderNegotiationInProgress")
        : actionUnavailableReason;
  const surrenderCost = combatHero && myPlayer
    ? computeSurrenderCostForSide(activeCombat, myPlayer.id, combatHero.skills ?? {})
    : 0;
  const openSurrenderOffer = () => {
    if (!myPlayer) return;
    setSurrenderOffer({
      gold: Math.min(myPlayer.resources.gold, surrenderCost),
      wood: 0,
      ore: 0,
      mercury: 0,
      crystals: 0,
      gems: 0,
      sulfur: 0,
    });
    setSurrenderOfferOpen(true);
  };
  const submitSurrenderOffer = async () => {
    if (!surrenderOffer) return;
    const submitted = await submitAction({ type: "PROPOSE_SURRENDER", offer: surrenderOffer });
    if (submitted) {
      setSurrenderOfferOpen(false);
      setCombatMessage(t("combat.surrenderSent"));
    }
  };
  const submitTruceRequest = async () => {
    const submitted = await submitAction({ type: "REQUEST_TRUCE" });
    if (submitted) {
      setTruceConfirmOpen(false);
      setCombatMessage(t("combat.truceAcceptedMsg"));
    }
  };
  const submitRetreat = async () => {
    const submitted = await submitAction({ type: "RETREAT_COMBAT" });
    if (submitted) {
      setRetreatConfirmOpen(false);
    }
  };
  const acknowledgeTruce = async () => {
    if (!activeTruce) return;
    const submitted = await submitAction({ type: "ACK_TRUCE", truceId: activeTruce.id });
    if (submitted) {
      setActiveCombat(null);
    }
  };
  const spellBookHero = combatHero && devInfiniteMana ? { ...combatHero, mana: getHeroMaxMana(combatHero) } : combatHero;
  const castCombatSpell = async (spell: SpellDefinition, targetUnitId?: string) => {
    if (!combatHero) throw new Error(t("combat.heroUnavailable"));
    if (combatHeroHasCastSpell) {
      setPendingTargetSpell(null);
      setCombatMessage(t("combat.heroAlreadyCast"));
      return;
    }
    if (spellRequiresCombatTarget(spell) && !targetUnitId) {
      setPendingTargetSpell(spell);
      setSpellBookOpen(false);
      setCombatMessage(t("combat.spellPickEnemyTarget", { label: spell.label }));
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

  // Leave the whole game from the combat menu (distinct from in-combat retreat
  // or surrender, which stay in the action panel).
  const performQuitFromCombat = () => {
    useGameStore.getState().resetGame();
    router.push("/dashboard");
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
        <div className={`rounded-md border px-3 py-1 text-sm font-black shadow-[0_0_0_1px_rgba(0,0,0,0.4)_inset] ${isMyAction || isMyTacticsPhase ? "border-emerald-400/60 bg-emerald-950/80 text-emerald-100" : "border-red-500/50 bg-red-950/75 text-red-100"}`}>
          {combatStatusLabel}
        </div>
        <div className="flex items-center gap-3">
          {showFps && (
            <div
              className="rounded-lg border border-amber-400/45 bg-amber-950/45 px-2.5 py-1.5 font-mono text-xs font-black uppercase tracking-[0.18em] text-amber-100"
              aria-label={`${t("hud.fps")}: ${performanceStats.hasFrameSample ? `${Math.round(performanceStats.fps)} FPS` : "-- FPS"}`}
              title={t("hud.fps")}
            >
              {performanceStats.hasFrameSample ? `${Math.round(performanceStats.fps)} FPS` : "-- FPS"}
            </div>
          )}
          <TurnTimerBadge gameState={gameState} myPlayer={myPlayer} />
          {pendingTargetSpell && (
            <button
              type="button"
              onClick={() => setPendingTargetSpell(null)}
              className="rounded-md border border-violet-400/60 bg-violet-950/80 px-3 py-1 text-sm font-black text-violet-100 transition hover:border-violet-200"
            >
              Cible: {pendingTargetSpell.label}
            </button>
          )}
          {combatHero && <SpellBookButton onClick={() => setSpellBookOpen(true)} label={t("combat.spellBookLabel")} disabled={isTacticsPhaseActive} />}
          {/* Headless: keeps the combat music engine running; the audio controls
              now live in the Options dialog. */}
          <CombatAudioControl showControl={false} />
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-amber-700/50 bg-stone-950/80 text-amber-200/90 shadow-inner shadow-black/40 transition hover:border-amber-400/70 hover:bg-amber-950/40 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
            onClick={() => minimizeCombat(activeCombat.id)}
            title={t("menu.reduce")}
            aria-label={t("menu.reduce")}
            data-testid="combat-minimize"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M5 18h14" />
            </svg>
          </button>
          <GameMenuButton
            compact
            items={[
              {
                key: "options",
                label: t("menu.options"),
                onClick: () => setOptionsOpen(true),
                dataTestId: "menu-options",
              },
              {
                key: "quit",
                label: t("menu.quit"),
                tone: "danger",
                onClick: () => setConfirmQuitOpen(true),
                dataTestId: "menu-quit",
              },
            ]}
          />
        </div>
      </header>
      <OptionsDialog open={optionsOpen} onClose={() => setOptionsOpen(false)} />
      <ConfirmDialog
        open={confirmQuitOpen}
        eyebrow={t("hud.menu")}
        title={t("menu.quitTitle")}
        description={t("menu.confirmQuit")}
        confirmLabel={t("menu.quit")}
        onConfirm={() => {
          setConfirmQuitOpen(false);
          performQuitFromCombat();
        }}
        onCancel={() => setConfirmQuitOpen(false)}
      />
      <div className="relative z-10 flex min-h-0 flex-1">
        {combatMessage && (
          <div className="pointer-events-auto absolute left-1/2 top-4 z-40 flex max-w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-md border border-amber-500/50 bg-stone-950/92 px-4 py-2 text-sm font-bold text-amber-100 shadow-xl">
            <span>{combatMessage}</span>
            <button type="button" onClick={() => setCombatMessage(null)} className="text-amber-300/70 hover:text-amber-100">x</button>
          </div>
        )}
        {pendingSurrenderNegotiation && (
          <div className="pointer-events-auto absolute left-1/2 top-16 z-40 max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded-md border border-emerald-400/50 bg-stone-950/94 px-4 py-2 text-sm font-bold text-emerald-100 shadow-xl">
            {t("combat.negotiationBanner")}
          </div>
        )}
        {activeTruce && (
          <div className="pointer-events-auto absolute left-1/2 top-16 z-40 max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded-md border border-sky-400/50 bg-stone-950/94 px-4 py-2 text-sm font-bold text-sky-100 shadow-xl">
            {t("combat.truceResume", { turn: activeTruce.pauseUntilTurn })}
          </div>
        )}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div className="absolute left-1/2 top-3 z-30 w-[min(760px,calc(100%-7rem))] -translate-x-1/2">
            {isTacticsPhaseActive ? (
              <div className="mx-auto w-fit rounded-md border border-amber-700/50 bg-black/55 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.24em] text-amber-200 shadow-[0_10px_26px_rgba(0,0,0,0.5),0_0_0_1px_rgba(252,211,77,0.12)_inset] backdrop-blur-sm">
                {t("combat.statusTactics")}
              </div>
            ) : (
              <InitiativeQueue combat={displayedCombat} gameState={gameState} inspectedUnitId={inspectedUnitId} onInspectUnit={setInspectedUnitId} />
            )}
          </div>
          <IsoBattlefield
            combat={activeCombat}
            displayedCurrentUnitId={effectiveCurrentUnitId}
            gameState={gameState}
            inspectedUnitId={inspectedUnitId}
            isMyAction={canSubmitAction || canSubmitTacticsAction}
            onAction={submitAction}
            onInspectUnit={setInspectedUnitId}
            tacticsSelectedUnitId={tacticsSelectedUnitId}
            onTacticsSelectedUnitChange={setTacticsSelectedUnitId}
            pendingSpellTarget={Boolean(pendingTargetSpell)}
            onSpellTarget={(unitId) => void castPendingCombatSpell(unitId)}
          />
        </main>
        <aside className="mobile-combat-aside pointer-events-auto absolute bottom-0 right-0 top-0 z-20 flex w-80 max-w-[calc(100%-1rem)] flex-col gap-4 overflow-y-auto p-4 pr-3">
          <CombatFloatingPanel title={inspectedUnit ? t("combat.inspectedCreature") : isTacticsPhaseActive ? t("combat.selectedUnit") : t("combat.activeUnit")} className={ornateFrame} bodyClassName="px-3 pb-3 pt-2">
            <div className="text-sm text-stone-200">
              {(inspectedUnit ?? tacticsSelectedUnit ?? currentUnit) ? (
                <UnitDetails unit={(inspectedUnit ?? tacticsSelectedUnit ?? currentUnit)!} combat={activeCombat} gameState={gameState} />
              ) : (
                <div className="py-4 text-center text-stone-400">{isTacticsPhaseActive ? t("combat.noUnitSelected") : t("combat.none")}</div>
              )}
            </div>
          </CombatFloatingPanel>

          {isMyTacticsPhase && (
            <CombatFloatingPanel title={t("combat.statusTactics")} className={ornateFramePolished} bodyClassName="px-3 pb-3 pt-2">
              <div className="text-xs text-amber-200/80 mb-2">{t("combat.tacticsReposition")}</div>
              <button
                type="button"
                disabled={!canSubmitTacticsAction}
                onClick={() => submitAction({ type: "TACTICS_END" })}
                className="w-full rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-700 to-amber-900 px-3 py-2 font-bold text-amber-50 hover:from-amber-600 hover:to-amber-800 disabled:opacity-40"
              >
                {t("combat.endTactics")}
              </button>
            </CombatFloatingPanel>
          )}

          <CombatFloatingPanel title={t("combat.actions")} className={ornateFramePolished} bodyClassName="px-3 pb-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canSubmitAction}
                onClick={() => submitAction({ type: "WAIT" })}
                className="rounded-md border border-amber-600/50 bg-gradient-to-b from-stone-800 to-stone-950 px-3 py-2 font-bold text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset] transition hover:from-stone-700 hover:to-stone-900 disabled:opacity-40"
              >
                {t("combat.wait")}
              </button>
              <button
                type="button"
                disabled={!canSubmitAction}
                onClick={() => submitAction({ type: "DEFEND" })}
                className="rounded-md border border-sky-400/60 bg-gradient-to-b from-sky-900 to-sky-950 px-3 py-2 font-bold text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.18)_inset] transition hover:from-sky-800 hover:to-sky-900 disabled:opacity-40"
              >
                {t("combat.defend")}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canRetreat}
                onClick={() => setRetreatConfirmOpen(true)}
                className="rounded-md border border-red-400/60 bg-gradient-to-b from-red-900 to-red-950 px-3 py-2 font-bold text-red-100 shadow-[0_0_0_1px_rgba(252,165,165,0.18)_inset] transition hover:from-red-800 hover:to-red-900 disabled:opacity-40"
              >
                {t("combat.flee")}
              </button>
              <span className="block" title={surrenderDisabledReason ?? t("combat.proposeSurrender")}>
                <button
                  type="button"
                  disabled={!canSurrender}
                  onClick={openSurrenderOffer}
                  className="w-full rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-900 to-emerald-950 px-3 py-2 font-bold text-emerald-100 shadow-[0_0_0_1px_rgba(167,243,208,0.18)_inset] transition hover:from-emerald-800 hover:to-emerald-900 disabled:opacity-40"
                >
                  {t("combat.surrender2")}
                </button>
              </span>
            </div>
            {canSurrender && <div className="mt-1 text-center text-xs font-bold text-amber-200/70">{t("combat.ransom", { n: surrenderCost })}</div>}
            {isPrimaryPlayer && (
              <span className="mt-2 block" title={truceDisabledReason ?? t("combat.requestTruce")}>
                <button
                  type="button"
                  disabled={!canRequestTruce}
                  onClick={() => setTruceConfirmOpen(true)}
                  className="w-full rounded-md border border-sky-400/60 bg-gradient-to-b from-sky-900 to-sky-950 px-3 py-2 font-bold text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.18)_inset] transition hover:from-sky-800 hover:to-sky-900 disabled:opacity-40"
                >
                  {t("combat.truce")}
                </button>
              </span>
            )}
            {Boolean((activeCombat.boardState as { siegeEffects?: { escapeTunnel?: boolean } }).siegeEffects?.escapeTunnel) && myPlayer && activeCombat.defenderPlayerId === myPlayer.id && (
              <button
                type="button"
                disabled={!canSubmitAction}
                onClick={() => submitAction({ type: "FLEE_COMBAT" })}
                className="mt-2 w-full rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-900 to-emerald-950 px-3 py-2 font-bold text-emerald-100 shadow-[0_0_0_1px_rgba(167,243,208,0.18)_inset] transition hover:from-emerald-800 hover:to-emerald-900 disabled:opacity-40"
              >
                {t("combat.fleeEscapeTunnel")}
              </button>
            )}
          </CombatFloatingPanel>

          <CombatFloatingPanel title={t("combat.journal")} className={`min-h-0 flex flex-col ${ornateFramePolished}`} expandedClassName="min-h-64 flex-1" bodyClassName="min-h-0 flex flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
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
          title={t("combat.spellBookCombat")}
          targetLabel={pendingTargetSpell ? t("combat.spellTargetLabel", { label: pendingTargetSpell.label }) : null}
          canCast={canCastHeroSpell}
          ignoreManaCost={devInfiniteMana}
          grantAllSpells={devInfiniteMana}
          onClose={() => setSpellBookOpen(false)}
          onCast={(spell) => castCombatSpell(spell)}
        />
      )}
      {truceConfirmOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 pointer-events-auto">
          <div className="w-[min(92vw,32rem)] rounded-xl border border-sky-700 bg-stone-950 p-6 text-white shadow-2xl">
            <div className="text-xs uppercase tracking-[0.28em] text-sky-400">{t("combat.truce")}</div>
            <h2 className="mt-2 text-2xl font-bold text-sky-100">{t("combat.suspendCombat")}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              {t("combat.truceModalDesc")}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="rounded-md border border-stone-600 px-4 py-2 font-bold text-stone-200 hover:bg-stone-800" onClick={() => setTruceConfirmOpen(false)}>{t("common.cancel")}</button>
              <button type="button" className="rounded-md border border-sky-400 bg-sky-900 px-4 py-2 font-bold text-sky-50 hover:bg-sky-800" onClick={() => void submitTruceRequest()}>{t("combat.accept")}</button>
            </div>
          </div>
        </div>
      )}
      {retreatConfirmOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 pointer-events-auto">
          <div className="w-[min(92vw,32rem)] rounded-xl border border-red-700 bg-stone-950 p-6 text-white shadow-2xl">
            <div className="text-xs uppercase tracking-[0.28em] text-red-400">{t("combat.fleeTitle")}</div>
            <h2 className="mt-2 text-2xl font-bold text-red-100">{t("combat.leaveCombat")}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              {t("combat.retreatDesc")}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="rounded-md border border-stone-600 px-4 py-2 text-sm font-bold text-stone-200 hover:bg-stone-800" onClick={() => setRetreatConfirmOpen(false)}>{t("common.cancel")}</button>
              <button type="button" className="rounded-md border border-red-400 bg-red-900 px-5 py-2 font-bold text-red-50 hover:bg-red-800" onClick={() => void submitRetreat()}>{t("combat.confirmFlee")}</button>
            </div>
          </div>
        </div>
      )}
      {activeTruce && truceNeedsAck && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 pointer-events-auto">
          <div className="w-[min(92vw,32rem)] rounded-xl border border-sky-700 bg-stone-950 p-6 text-white shadow-2xl">
            <div className="text-xs uppercase tracking-[0.28em] text-sky-400">{t("combat.truce")}</div>
            <h2 className="mt-2 text-2xl font-bold text-sky-100">{t("combat.combatPaused")}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              {t("combat.truceDeclaredDesc")}
            </p>
            <div className="mt-6 flex justify-end">
              <button type="button" className="rounded-md border border-sky-400 bg-sky-900 px-5 py-2 font-bold text-sky-50 hover:bg-sky-800" onClick={() => void acknowledgeTruce()}>OK</button>
            </div>
          </div>
        </div>
      )}
      {surrenderOfferOpen && myPlayer && surrenderOffer && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 pointer-events-auto">
          <div className="w-[min(92vw,34rem)] rounded-xl border border-emerald-700 bg-stone-950 p-6 text-white shadow-2xl">
            <div className="text-xs uppercase tracking-[0.28em] text-emerald-400">{t("combat.surrenderTitle")}</div>
            <h2 className="mt-2 text-2xl font-bold text-emerald-100">{t("combat.proposeRansom")}</h2>
            <p className="mt-2 text-sm text-stone-300">{t("combat.ransomBase", { n: surrenderCost })}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {RESOURCE_KEYS.map((key) => (
                <label key={key} className="text-sm font-bold text-stone-200">
                  {resLabel(key)}
                  <input
                    type="number"
                    min={0}
                    max={myPlayer.resources[key]}
                    value={surrenderOffer[key]}
                    onChange={(event) => {
                      const value = Math.max(0, Math.min(myPlayer.resources[key], Math.floor(Number(event.target.value) || 0)));
                      setSurrenderOffer({ ...surrenderOffer, [key]: value });
                    }}
                    className="mt-1 w-full rounded-md border border-emerald-700/60 bg-black/40 px-3 py-2 text-emerald-50 outline-none focus:border-emerald-300"
                  />
                  <span className="mt-0.5 block text-[11px] font-normal text-stone-500">{t("combat.available", { n: myPlayer.resources[key] })}</span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="rounded-md border border-stone-600 px-4 py-2 font-bold text-stone-200 hover:bg-stone-800" onClick={() => setSurrenderOfferOpen(false)}>{t("common.cancel")}</button>
              <button type="button" className="rounded-md border border-emerald-400 bg-emerald-900 px-4 py-2 font-bold text-emerald-50 hover:bg-emerald-800" onClick={() => void submitSurrenderOffer()}>{t("combat.propose")}</button>
            </div>
          </div>
        </div>
      )}
      {pendingSurrenderNegotiation && myPlayer?.id === pendingSurrenderNegotiation.targetPlayerId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 pointer-events-auto">
          <div className="w-[min(92vw,34rem)] rounded-xl border border-amber-700 bg-stone-950 p-6 text-white shadow-2xl">
            <div className="text-xs uppercase tracking-[0.28em] text-amber-400">{t("combat.negotiation")}</div>
            <h2 className="mt-2 text-2xl font-bold text-amber-100">{t("combat.acceptSurrender")}</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {RESOURCE_KEYS.filter((key) => pendingSurrenderNegotiation.offer[key] > 0).map((key) => (
                <div key={key} className="rounded-md border border-amber-800/60 bg-black/30 px-3 py-2">
                  <div className="text-stone-400">{resLabel(key)}</div>
                  <div className="font-black text-amber-100">{pendingSurrenderNegotiation.offer[key]}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-stone-300">{t("combat.refusalsLeft", { n: Math.max(0, 3 - pendingSurrenderNegotiation.refusalCount) })}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" className="rounded-md border border-emerald-400 bg-emerald-900 px-4 py-3 font-bold text-emerald-50 hover:bg-emerald-800" onClick={() => void submitAction({ type: "ACCEPT_SURRENDER", negotiationId: pendingSurrenderNegotiation.id })}>{t("combat.accept")}</button>
              <button type="button" className="rounded-md border border-red-400 bg-red-950 px-4 py-3 font-bold text-red-100 hover:bg-red-900" onClick={() => void submitAction({ type: "REJECT_SURRENDER", negotiationId: pendingSurrenderNegotiation.id })}>{t("combat.reject")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
