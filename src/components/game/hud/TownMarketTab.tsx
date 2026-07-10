"use client";

import { useState } from "react";
import type { Player, Resources, Town } from "@/lib/game/types";
import { computeExchangeAmount, getMarketRate, getMarketplaceCount } from "@/lib/game/market";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";

type ResKey = keyof Resources;

const ALL_RESOURCES: ResKey[] = ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"];
const RES_LABEL_KEY: Record<ResKey, TranslationKey> = {
  gold: "res.gold",
  wood: "res.wood",
  ore: "res.ore",
  mercury: "res.mercury",
  crystals: "res.crystals",
  gems: "res.gems",
  sulfur: "res.sulfur",
};

export function TownMarketTab({
  selectedTown,
  myPlayer,
  canAct,
  isPending,
  isMyTown,
  onExchange,
}: {
  selectedTown: Town;
  myPlayer: Player | undefined;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  onExchange: (townId: string, from: ResKey, to: ResKey, amount: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const label = (r: ResKey) => t(RES_LABEL_KEY[r]);
  const [from, setFrom] = useState<ResKey>("wood");
  const [to, setTo] = useState<ResKey>("gold");
  const [amount, setAmount] = useState<number>(1);

  const marketplaceCount = myPlayer ? getMarketplaceCount(myPlayer) : 1;
  const owned = myPlayer ? Number(myPlayer.resources[from] ?? 0) : 0;
  const safeAmount = Math.max(0, Math.min(amount, owned));
  const rate = getMarketRate(from, to, marketplaceCount);
  const gain = computeExchangeAmount(from, to, safeAmount, marketplaceCount);
  const disabled = !canAct || !isMyTown || isPending || safeAmount <= 0 || gain <= 0 || !rate.supported;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/70">
        {t("market.owned", { n: marketplaceCount, maxNote: marketplaceCount >= 9 ? t("market.maxRate") : "" })}
      </div>

      <div className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-amber-300/80">{t("market.give")}</label>
            <select
              className="mt-1 w-full rounded-md border border-amber-700/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
              value={from}
              onChange={(e) => setFrom(e.target.value as ResKey)}
            >
              {ALL_RESOURCES.map((r) => (
                <option key={r} value={r}>{label(r)}</option>
              ))}
            </select>
            <div className="mt-1 text-[10px] text-amber-200/60">{t("market.owned2", { n: owned })}</div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-amber-300/80">{t("market.receive")}</label>
            <select
              className="mt-1 w-full rounded-md border border-amber-700/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
              value={to}
              onChange={(e) => setTo(e.target.value as ResKey)}
            >
              {ALL_RESOURCES.map((r) => (
                <option key={r} value={r}>{label(r)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-md border border-amber-700/20 bg-black/30 px-3 py-2 text-xs text-amber-200/70">
          {rate.supported
            ? <>{t("market.rateLabel")} <span className="font-bold text-amber-100">{rate.give} {label(from)} → {rate.receive} {label(to)}</span></>
            : <span className="text-red-300">{t("market.conversionUnsupported")}</span>}
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-amber-300/80">{t("market.quantityGiven")}</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={owned}
              value={safeAmount}
              onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value || 0))))}
              className="w-24 rounded-md border border-amber-700/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
            />
            <button
              type="button"
              className="rounded-md border border-amber-700/50 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/40"
              onClick={() => setAmount(owned)}
            >{t("market.max")}</button>
          </div>
        </div>

        <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-sm text-amber-100">
          {safeAmount > 0 && gain > 0
            ? <>{t("market.youReceive")} <span className="font-bold text-amber-300">{gain} {label(to)}</span></>
            : <span className="text-amber-200/60">{t("market.chooseValidQty", { n: rate.give || "—" })}</span>}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => void onExchange(selectedTown.id, from, to, safeAmount)}
          className={`w-full rounded-md border px-3 py-2 text-sm font-black uppercase tracking-wider transition ${
            disabled
              ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
              : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 hover:from-amber-500 hover:to-amber-700"
          }`}
        >
          {t("market.exchange")}
        </button>
      </div>
    </div>
  );
}
