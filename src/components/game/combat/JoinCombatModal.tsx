"use client";

import { useCallback, useEffect, useRef } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";

export default function JoinCombatModal() {
  const { t, locale } = useI18n();
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const pendingJoinCombat = useGameStore((state) => state.pendingJoinCombat);
  const setPendingJoinCombat = useGameStore((state) => state.setPendingJoinCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const setGameState = useGameStore((state) => state.setGameState);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const autoJoinRef = useRef<string | null>(null);

  const decideRequest = useCallback(async (requestId: string, decision: "accept" | "reject") => {
    if (!gameState) return;
    const combat = gameState.activeCombats?.find((item) =>
      item.reinforcementRequests?.some((request) => request.id === requestId)
    );
    if (!combat) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/combats/${combat.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, decision }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setCombatMessage(localizedServerMessage(data?.error, locale) ?? t("combat.reinforceFailed"));
      return;
    }
    const combatPayload = data?.combat ?? data;
    if (combatPayload) setActiveCombat(mapCombat(combatPayload));
    setCombatMessage(decision === "accept" ? t("combat.reinforceAccepted") : t("combat.reinforceRejected"));
    const refreshed = await refreshGameState(gameState.id, session?.user?.id);
    if (refreshed) setGameState(refreshed);
  }, [gameState, session?.user?.id, setActiveCombat, setCombatMessage, setGameState, t, locale]);

  const join = useCallback(async (side: "attacker" | "defender") => {
    if (!gameState || !pendingJoinCombat) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/combats/${pendingJoinCombat.combatId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heroId: pendingJoinCombat.heroId,
        side,
        path: pendingJoinCombat.path,
        destination: pendingJoinCombat.destination,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setCombatMessage(localizedServerMessage(data?.error, locale) ?? t("combat.joinFailed"));
      setPendingJoinCombat(null);
      return;
    }
    const data = await response.json();
    if (data.pending) {
      setCombatMessage(localizedServerMessage(data.message, locale) ?? t("combat.reinforceSent"));
      setPendingJoinCombat(null);
      const refreshed = await refreshGameState(gameState.id, session?.user?.id);
      if (refreshed) setGameState(refreshed);
      return;
    }
    const combatPayload = data.combat ?? data;
    if (combatPayload) setActiveCombat(mapCombat(combatPayload));
    setPendingJoinCombat(null);
    const refreshed = await refreshGameState(gameState.id, session?.user?.id);
    if (refreshed) setGameState(refreshed);
  }, [gameState, pendingJoinCombat, session?.user?.id, setActiveCombat, setCombatMessage, setGameState, setPendingJoinCombat, t, locale]);

  useEffect(() => {
    if (!pendingJoinCombat) return;
    if (!pendingJoinCombat.side) return;
    const key = `${pendingJoinCombat.combatId}:${pendingJoinCombat.heroId}:${pendingJoinCombat.side}`;
    if (autoJoinRef.current === key) return;
    autoJoinRef.current = key;
    void join(pendingJoinCombat.side);
  }, [pendingJoinCombat, join]);

  if (!gameState) return null;

  const myPlayer = gameState.players.find((player) => player.userId === session?.user?.id);
  const pendingApproval = myPlayer
    ? (gameState.activeCombats ?? [])
      .flatMap((combat) => (combat.reinforcementRequests ?? []).map((request) => ({ combat, request })))
      .find(({ request }) => request.targetPlayerId === myPlayer.id && request.status === "PENDING")
    : null;

  if (!pendingJoinCombat && pendingApproval) {
    const requesterPlayer = gameState.players.find((player) => player.id === pendingApproval.request.requesterPlayerId);
    const requesterHero = requesterPlayer?.heroes.find((hero) => hero.id === pendingApproval.request.requesterHeroId);
    const sideLabel = pendingApproval.request.side === "attacker" ? t("combat.sideAttacker") : t("combat.sideDefender");

    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-auto">
        <div className="w-[min(92vw,32rem)] rounded-xl border border-yellow-700 bg-stone-950 p-6 text-white shadow-2xl">
          <div className="text-xs uppercase tracking-[0.28em] text-yellow-500">{t("combat.reinforceRequest")}</div>
          <h2 className="mt-2 text-2xl font-bold text-yellow-100">{t("combat.acceptReinforce")}</h2>
          <p className="mt-3 text-sm text-stone-300">
            {t("combat.reinforceDesc", { player: requesterPlayer?.name ?? t("combat.aPlayer"), hero: requesterHero?.name ?? t("combat.aHero"), side: sideLabel })}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              className="rounded-lg border border-emerald-500 bg-emerald-950/80 p-4 font-bold text-emerald-100 hover:bg-emerald-900"
              onClick={() => void decideRequest(pendingApproval.request.id, "accept")}
            >
              {t("combat.accept")}
            </button>
            <button
              className="rounded-lg border border-red-500 bg-red-950/80 p-4 font-bold text-red-100 hover:bg-red-900"
              onClick={() => void decideRequest(pendingApproval.request.id, "reject")}
            >
              {t("combat.reject")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!pendingJoinCombat) return null;

  if (pendingJoinCombat.side) return null;

  const combat = gameState.activeCombats?.find((c) => c.id === pendingJoinCombat.combatId);
  const attackerPlayer = gameState.players.find((p) => p.id === combat?.attackerPlayerId);
  const defenderPlayer = combat?.defenderPlayerId
    ? gameState.players.find((p) => p.id === combat.defenderPlayerId)
    : null;
  const attackerLabel = attackerPlayer?.name ?? t("combat.attackerLabel");
  const defenderLabel = defenderPlayer?.name ?? (combat?.neutralArmyId ? t("combat.neutralArmy") : t("combat.defenderLabel"));

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-auto">
      <div className="w-[min(92vw,32rem)] rounded-xl border border-yellow-700 bg-stone-950 p-6 text-white shadow-2xl">
        <div className="text-xs uppercase tracking-[0.28em] text-yellow-500">{t("combat.reinforce")}</div>
        <h2 className="mt-2 text-2xl font-bold text-yellow-100">{t("combat.chooseSide")}</h2>
        <p className="mt-3 text-sm text-stone-300">{t("combat.reinforceJoinDesc")}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-lg border border-blue-500 bg-blue-950/80 p-4 font-bold hover:bg-blue-900"
            onClick={() => join("attacker")}
          >
            <div>{t("combat.supportAttacker")}</div>
            <div className="mt-1 text-xs font-normal text-blue-200/80">{attackerLabel}</div>
          </button>
          <button
            className="rounded-lg border border-red-500 bg-red-950/80 p-4 font-bold hover:bg-red-900"
            onClick={() => join("defender")}
          >
            <div>{t("combat.supportDefender")}</div>
            <div className="mt-1 text-xs font-normal text-red-200/80">{defenderLabel}</div>
          </button>
        </div>
        <button className="mt-5 text-sm text-stone-400 hover:text-white" onClick={() => setPendingJoinCombat(null)}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

function mapCombat(combat: Record<string, unknown>) {
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
    boardState: combat.boardState as never,
    turnQueue: combat.turnQueue as string[],
    actionLog: combat.actionLog as string[],
    participants: (combat.participants as never[]) ?? [],
    reinforcementRequests: (combat.reinforcementRequests as never[]) ?? [],
    surrenderNegotiations: (combat.surrenderNegotiations as never[]) ?? [],
    result: combat.result as never,
    visibility: (combat.visibility as "full" | "joinable_summary" | undefined) ?? "full",
  };
}
