"use client";

import type { Faction, GameState, Hero, Player, Town } from "@/lib/game/types";
import { canAfford } from "@/lib/game/economy";
import { hasShipyardBuilding } from "@/lib/game/town-buildings";
import { isTownCoastalForBoats } from "@/lib/game/engine/town-coast";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { TownBallistaTab } from "./TownBallistaTab";

/**
 * Town "Boutique" tab: gathers every purchasable item — the war machines (Stronghold
 * ballista yard) and the boat (coastal shipyard) — in a single shop, instead of having
 * them scattered across the build/ballista tabs.
 */
export function TownShopTab({
  selectedTown,
  selectedTownFaction,
  myPlayer,
  canAct,
  isPending,
  isMyTown,
  heroesAtSelectedTown,
  hasBlacksmith,
  gameState,
  onBuyMachine,
  onBuildBoat,
}: {
  selectedTown: Town;
  selectedTownFaction: Faction;
  myPlayer: Player | undefined;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  heroesAtSelectedTown: Hero[];
  hasBlacksmith: boolean;
  gameState: GameState;
  onBuyMachine: (townId: string, heroId: string, machine: "ballista" | "firstAid" | "ammoCart") => Promise<void>;
  onBuildBoat?: () => void;
}) {
  const { t } = useI18n();
  const isCoastal = isTownCoastalForBoats(gameState.map, selectedTown.position);
  const hasShipyard = hasShipyardBuilding(selectedTownFaction, selectedTown.buildings);
  const canBuildBoat = Boolean(
    onBuildBoat &&
    hasShipyard &&
    myPlayer &&
    isCoastal &&
    canAfford(myPlayer.resources, { gold: 1000, wood: 10 }) &&
    canAct &&
    isMyTown &&
    !isPending
  );

  if (!hasBlacksmith && !hasShipyard) {
    return (
      <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">
        {t("shop.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasBlacksmith && (
        <TownBallistaTab
          selectedTown={selectedTown}
          selectedTownFaction={selectedTownFaction}
          myPlayer={myPlayer}
          canAct={canAct}
          isPending={isPending}
          isMyTown={isMyTown}
          heroesAtSelectedTown={heroesAtSelectedTown}
          onBuyMachine={onBuyMachine}
        />
      )}
      {hasShipyard && (
        <div className="rounded-lg border border-sky-700/40 bg-gradient-to-b from-sky-950/70 to-black/60 p-3 shadow-inner shadow-black/40">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-sky-100">{t("build.boat")}</div>
              <div className="text-xs text-sky-200/65">{t("build.boatDesc")}</div>
              <div className="mt-1 text-xs text-sky-200">{t("build.boatCost")}</div>
              {!isCoastal && <div className="mt-1 text-xs text-red-300">{t("build.notCoastal")}</div>}
            </div>
            <button
              type="button"
              disabled={!canBuildBoat}
              onClick={onBuildBoat}
              className={`rounded-md border px-3 py-2 text-sm font-black transition ${
                canBuildBoat
                  ? "border-sky-300/70 bg-sky-800/75 text-sky-50 hover:bg-sky-700"
                  : "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
              }`}
            >
              {t("build.build")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
