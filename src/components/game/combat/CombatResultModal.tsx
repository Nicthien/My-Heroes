"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { playDefeatStinger, playVictoryFanfare } from "@/lib/audio/soundEffects";
import { CreatureBankReward } from "@/lib/game/creature-banks";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";
import { getUnitRule } from "@/lib/game/units";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedUnitLabel } from "@/lib/i18n/gameLabels";
import { resourceLabel } from "@/lib/game/economy";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export default function CombatResultModal() {
  const { data: session } = useSession();
  const { t, locale } = useI18n();
  const result = useGameStore((state) => state.lastCombatResult);
  const gameState = useGameStore((state) => state.gameState);
  const setCombatResult = useGameStore((state) => state.setCombatResult);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const setGameState = useGameStore((state) => state.setGameState);

  // Play a victory/defeat stinger once per resolved combat. Kept above the early
  // return so the hook order stays stable; outcome is recomputed here from the
  // result because the derived booleans below are after the guard.
  const playedResultRef = useRef<string | null>(null);
  useEffect(() => {
    if (!result) {
      playedResultRef.current = null;
      return;
    }
    const resultKey = `${result.winnerPlayerId ?? result.winnerId ?? ""}:${result.log.length}`;
    if (playedResultRef.current === resultKey) return;
    playedResultRef.current = resultKey;
    const me = gameState?.players.find((p) => p.userId === session?.user?.id);
    const won = Boolean(me && result.winnerPlayerId === me.id);
    if (won) playVictoryFanfare();
    else if (me) playDefeatStinger();
  }, [result, gameState, session?.user?.id]);

  if (!result) return null;

  const myPlayer = gameState?.players.find((p) => p.userId === session?.user?.id);
  const iWon = Boolean(myPlayer && result.winnerPlayerId === myPlayer.id);
  const heroDied = Boolean(result.attackerDied && myPlayer && result.winnerPlayerId !== myPlayer.id);
  // The result modal is only shown to combat participants, so "did not win" is a
  // defeat. Keep the neutral fallback only for the rare uninvolved/spectator case.
  const iLost = Boolean(myPlayer) && !iWon;
  const defeat = heroDied || iLost;
  const bankReward = iWon ? result.creatureBankReward : null;

  const borderColor = defeat ? "border-red-700" : iWon ? "border-green-600" : "border-yellow-600";
  const tagColor = defeat ? "text-red-400" : iWon ? "text-green-400" : "text-yellow-500";
  const titleColor = defeat ? "text-red-100" : iWon ? "text-green-100" : "text-yellow-100";
  const title = heroDied ? t("combat.heroDied") : iWon ? t("gameover.victory") : iLost ? t("gameover.defeat") : t("combat.finished");
  const tag = t("combat.resultTag");
  const buttonColor = defeat ? "bg-red-800 hover:bg-red-700" : iWon ? "bg-green-800 hover:bg-green-700" : "bg-yellow-700 hover:bg-yellow-600";

  const winnerName = getWinnerPlayerName(result, gameState, t);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 pointer-events-auto">
      <div className={`w-[min(92vw,38rem)] rounded-xl border ${borderColor} bg-stone-950 p-6 text-white shadow-2xl`}>
        <div className={`text-xs uppercase tracking-[0.3em] ${tagColor}`}>{tag}</div>
        <h2 className={`mt-2 text-2xl font-bold ${titleColor}`}>{title}</h2>
        <div className="mt-4 rounded bg-black/40 p-3 text-sm text-stone-300">
          {t("gameover.winner")} <span className="font-bold text-green-300">{winnerName}</span>
          {iWon && result.experienceGained > 0 && <span> | XP +{result.experienceGained}</span>}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Losses title={t("combat.attackerLosses")} losses={aggregateLosses(result.attackerLosses)} t={t} locale={locale} />
          <Losses title={t("combat.defenderLosses")} losses={aggregateLosses(result.defenderLosses)} t={t} locale={locale} />
        </div>
        {bankReward && gameState && (
          <CreatureBankRewardPanel
            key={bankReward.bankId}
            gameId={gameState.id}
            userId={session?.user?.id}
            bankReward={bankReward}
            t={t}
            locale={locale}
            onClaimed={(refreshed) => {
              if (refreshed) setGameState(refreshed);
              setActiveCombat(null);
              setCombatResult(null);
            }}
          />
        )}
        {result.log.length > 0 && (
          <div className="mt-5 max-h-36 overflow-y-auto rounded bg-black/40 p-3 text-sm text-stone-300">
            {result.log.slice(-8).map((line, index) => <div key={index}>{line}</div>)}
          </div>
        )}
        <button
          className={`mt-6 rounded px-5 py-2 font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-700 ${buttonColor}`}
          disabled={Boolean(bankReward)}
          onClick={() => {
            setActiveCombat(null);
            setCombatResult(null);
          }}
        >
          {bankReward ? t("combat.rewardToClaim") : t("combat.backToMap")}
        </button>
      </div>
    </div>
  );
}

function RewardSummary({ reward, t, locale }: { reward: CreatureBankReward; t: TFn; locale: Locale }) {
  const entries: string[] = [];
  if (reward.gold) entries.push(t("combat.rewardGold", { n: reward.gold }));
  if (reward.experience) entries.push(`${reward.experience} XP`);
  for (const [resource, amount] of Object.entries(reward.resources ?? {})) {
    if (amount) entries.push(`${amount} ${resourceLabel(resource, locale)}`);
  }
  if (reward.artifactTokens?.length) entries.push(t("combat.artifactTokens", { n: reward.artifactTokens.length }));

  return (
    <div className="mt-2 rounded bg-black/30 px-3 py-2 text-sm text-emerald-100/85">
      {entries.length > 0 ? entries.join(" | ") : t("combat.creaturesOnly")}
    </div>
  );
}

function CreatureBankRewardPanel({
  gameId,
  userId,
  bankReward,
  onClaimed,
  t,
  locale,
}: {
  gameId: string;
  userId: string | undefined;
  bankReward: NonNullable<NonNullable<ReturnType<typeof useGameStore.getState>["lastCombatResult"]>["creatureBankReward"]>;
  onClaimed: (refreshed: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]> | null) => void;
  t: TFn;
  locale: Locale;
}) {
  const [creatureSelection, setCreatureSelection] = useState<Record<string, number>>(
    Object.fromEntries((bankReward.reward.creatures ?? []).map((entry) => [entry.unitType, entry.count]))
  );
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const claimCreatureBankReward = async () => {
    setClaiming(true);
    setClaimError(null);
    const response = await fetchWithSupabaseAuth(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CLAIM_CREATURE_BANK_REWARD",
        bankId: bankReward.bankId,
        heroId: bankReward.heroId,
        creatures: creatureSelection,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setClaimError(data?.error ?? t("combat.claimFailed"));
      setClaiming(false);
      return;
    }
    onClaimed(await refreshGameState(gameId, userId));
  };

  return (
    <div className="mt-5 rounded border border-emerald-700/70 bg-emerald-950/30 p-4">
      <div className="text-sm font-bold text-emerald-100">{t("combat.rewardLabel", { label: bankReward.label })}</div>
      <RewardSummary reward={bankReward.reward} t={t} locale={locale} />
      {(bankReward.reward.creatures ?? []).length > 0 && (
        <div className="mt-3 space-y-2">
          {bankReward.reward.creatures?.map((entry) => {
            const selected = creatureSelection[entry.unitType] ?? entry.count;
            return (
              <label key={entry.unitType} className="grid gap-1 rounded border border-emerald-700/35 bg-black/35 px-3 py-2 text-sm">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-bold text-emerald-100">{localizedUnitLabel(entry.unitType, getUnitRule(entry.unitType).label, locale)}</span>
                  <span className="text-emerald-200">{selected}/{entry.count}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={entry.count}
                  value={selected}
                  onChange={(event) => setCreatureSelection((current) => ({
                    ...current,
                    [entry.unitType]: Number(event.currentTarget.value),
                  }))}
                />
              </label>
            );
          })}
        </div>
      )}
      {claimError && <div className="mt-3 text-sm font-bold text-red-300">{claimError}</div>}
      <button
        className="mt-4 rounded bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-700"
        disabled={claiming}
        onClick={claimCreatureBankReward}
      >
        {claiming ? t("combat.claiming") : t("combat.claimReward")}
      </button>
    </div>
  );
}

function getWinnerPlayerName(result: NonNullable<ReturnType<typeof useGameStore.getState>["lastCombatResult"]>, gameState: ReturnType<typeof useGameStore.getState>["gameState"], t: TFn) {
  const winnerPlayer = gameState?.players.find((player) => player.id === result.winnerPlayerId);
  if (winnerPlayer) return winnerPlayer.name;

  const owner = gameState?.players.find((player) => player.id === result.winnerId || player.heroes.some((hero) => hero.id === result.winnerId));
  if (owner) return owner.name;

  if (result.winnerId === "attacker") return t("combat.campAttacker");
  if (result.winnerId === "defender") return t("combat.campDefender");
  for (const player of gameState?.players ?? []) {
    if (player.id === result.winnerId) return player.name;
  }

  return t("combat.wanderingMonsters");
}

function aggregateLosses(losses: { unitType: string; lost: number }[]) {
  const totals = new Map<string, number>();
  for (const loss of losses) {
    totals.set(loss.unitType, (totals.get(loss.unitType) ?? 0) + loss.lost);
  }

  return Array.from(totals, ([unitType, lost]) => ({ unitType, lost })).filter((loss) => loss.lost > 0);
}

function Losses({ title, losses, t, locale }: { title: string; losses: { unitType: string; lost: number }[]; t: TFn; locale: Locale }) {
  return (
    <div className="rounded border border-stone-700 bg-stone-900/80 p-3">
      <div className="font-bold text-stone-100">{title}</div>
      <div className="mt-2 space-y-1 text-sm text-stone-300">
        {losses.length === 0 ? <div>{t("combat.noLosses")}</div> : losses.map((loss) => (
          <div key={loss.unitType} className="flex justify-between">
            <span>{localizedUnitLabel(loss.unitType, getUnitRule(loss.unitType).label, locale)}</span>
            <span className="font-bold text-red-300">-{loss.lost}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
