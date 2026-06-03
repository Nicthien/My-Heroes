"use client";

import Image from "next/image";
import { BuildingType, type Faction, type GameState, type Player, type Town } from "@/lib/game/types";
import { canAfford, formatCost } from "@/lib/game/economy";
import { type TownBuildingRule } from "@/lib/game/town-buildings";
import { hasShipyardBuilding, hasTownBuilding, isShipyardBuilding } from "@/lib/game/town-buildings";
import { getTownBuildingSprite } from "@/lib/game/town-building-sprites";
import { isTownCoastalForBoats } from "@/lib/game/engine/town-coast";
import { BuildIcon, BuiltIcon, MissingResourcesIcon } from "./icons";
import { buildingTypeLabel } from "./helpers";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedLabelFromId } from "@/lib/i18n/gameLabels";
import { localizedBuildingDescription } from "@/lib/game/buildings-i18n";

export function TownBuildTab({
  selectedTown,
  selectedTownFaction,
  displayedBuildRules,
  onOpenBuildTree,
  showBuildableBuildings,
  setShowBuildableBuildings,
  showMissingBuildRequirements,
  setShowMissingBuildRequirements,
  showBuiltBuildings,
  setShowBuiltBuildings,
  gameState,
  myPlayer,
  hasPlayerCapitol,
  canAct,
  isPending,
  isMyTown,
  onBuild,
  onBuildBoat,
}: {
  selectedTown: Town;
  selectedTownFaction: Faction;
  displayedBuildRules: TownBuildingRule[];
  onOpenBuildTree: () => void;
  showBuildableBuildings: boolean;
  setShowBuildableBuildings: (next: boolean) => void;
  showMissingBuildRequirements: boolean;
  setShowMissingBuildRequirements: (next: boolean) => void;
  showBuiltBuildings: boolean;
  setShowBuiltBuildings: (next: boolean) => void;
  gameState: GameState;
  myPlayer: Player | undefined;
  hasPlayerCapitol: boolean;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  onBuild: (building: BuildingType) => void;
  onBuildBoat?: () => void;
}) {
  const { t, locale } = useI18n();
  const isCoastal = isTownCoastal(gameState, selectedTown);
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
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onOpenBuildTree}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-amber-500/50 bg-amber-950/45 px-3 py-2 text-[10px] font-black uppercase leading-tight tracking-wide text-amber-100 shadow-inner shadow-black/35 transition hover:border-amber-300/70 hover:bg-amber-900/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
      >
        <BuildTreeIcon className="h-4 w-4" />
        {t("town.buildTree")}
      </button>
      <div className="grid grid-cols-3 gap-1.5" aria-label={t("town.buildFilters")}>
        <BuildFilterToggle
          pressed={showBuildableBuildings}
          onPressedChange={setShowBuildableBuildings}
          label={t("town.filterBuyable")}
        />
        <BuildFilterToggle
          pressed={showMissingBuildRequirements}
          onPressedChange={setShowMissingBuildRequirements}
          label={t("town.filterRequires")}
        />
        <BuildFilterToggle
          pressed={showBuiltBuildings}
          onPressedChange={setShowBuiltBuildings}
          label={t("town.filterBuilt")}
        />
      </div>
      {displayedBuildRules.map((rule) => {
        if (isShipyardBuilding(selectedTownFaction, rule.type) && !isCoastal) return null;
        const alreadyBuilt = selectedTown.buildings.includes(rule.type);
        const missingRequirement = rule.requires?.find((requirement) => !hasTownBuilding(selectedTown.buildings, requirement));
        const blockedByCapitolLimit =
          rule.type === BuildingType.CAPITOL &&
          hasPlayerCapitol &&
          !selectedTown.buildings.includes(BuildingType.CAPITOL);
        const lacksResources = Boolean(!alreadyBuilt && myPlayer && !canAfford(myPlayer.resources, rule.cost));
        const disabled =
          alreadyBuilt ||
          selectedTown.lastBuiltTurn === gameState.turnNumber ||
          Boolean(missingRequirement) ||
          blockedByCapitolLimit ||
          !myPlayer ||
          lacksResources ||
          !canAct ||
          !isMyTown ||
          isPending;
        const buildingSprite = getTownBuildingSprite(rule, selectedTownFaction);
        const buildActionLabel = alreadyBuilt
          ? t("build.built")
          : lacksResources
            ? t("build.insufficientResources")
            : t("build.build");

        return (
          <div key={rule.type} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {buildingSprite && (
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md border border-amber-700/35 bg-stone-950/70 shadow-inner shadow-black/50">
                    <Image
                      src={buildingSprite}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 object-contain"
                      style={{ height: "auto" }}
                      unoptimized
                      aria-hidden="true"
                    />
                  </div>
                )}
                <div className="min-w-0">
                <div className="text-sm font-bold text-amber-100">{localizedLabelFromId(rule.type, rule.label, locale)}</div>
                <div className="text-xs text-amber-200/60">{localizedBuildingDescription(rule.description, locale)}</div>
                <div className="mt-1 text-xs text-amber-300">{formatCost(rule.cost)}</div>
                {missingRequirement && (
                  <div className="mt-1 text-xs text-red-300">{t("build.missingRequirement", { name: buildingTypeLabel(missingRequirement, selectedTownFaction, locale) })}</div>
                )}
                {blockedByCapitolLimit && (
                  <div className="mt-1 text-xs text-red-300">{t("build.capitolLimit")}</div>
                )}
                </div>
              </div>
              <button
                type="button"
                aria-label={buildActionLabel}
                className={`group relative grid h-10 w-10 shrink-0 place-items-center rounded-md border transition focus-visible:ring-2 focus-visible:ring-amber-200/70 ${
                  lacksResources
                    ? "cursor-not-allowed border-red-800/70 bg-red-950/45 text-red-200"
                    : disabled
                    ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                    : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] hover:from-amber-500 hover:to-amber-700"
                }`}
                disabled={disabled}
                onClick={() => onBuild(rule.type)}
              >
                {alreadyBuilt ? (
                  <BuiltIcon className="h-5 w-5" />
                ) : lacksResources ? (
                  <MissingResourcesIcon className="h-6 w-6" />
                ) : (
                  <BuildIcon className="h-5 w-5" />
                )}
                <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md border border-amber-600/60 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-amber-100 opacity-0 shadow-lg shadow-black/50 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  {buildActionLabel}
                </span>
              </button>
            </div>
          </div>
        );
      })}
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

function isTownCoastal(gameState: GameState, town: Town) {
  return isTownCoastalForBoats(gameState.map, town.position);
}

function BuildFilterToggle({
  pressed,
  onPressedChange,
  label,
}: {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={`min-h-9 rounded-md border px-2 py-2 text-[10px] font-black uppercase leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 ${
        pressed
          ? "border-amber-300/75 bg-gradient-to-b from-amber-500 to-amber-800 text-amber-50 shadow-[inset_0_0_0_1px_rgba(254,243,199,0.25)]"
          : "border-amber-700/30 bg-black/35 text-amber-100/55 hover:border-amber-500/50 hover:text-amber-100"
      }`}
    >
      {label}
    </button>
  );
}

function BuildTreeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v5" />
      <path d="M6 13v3" />
      <path d="M18 13v3" />
      <path d="M12 8H6v5" />
      <path d="M12 8h6v5" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
    </svg>
  );
}
