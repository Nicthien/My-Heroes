"use client";

import Image from "next/image";
import { BuildingType, type Faction, type GameState, type Player, type Town } from "@/lib/game/types";
import { canAfford, formatCost } from "@/lib/game/economy";
import { type TownBuildingRule } from "@/lib/game/town-buildings";
import { hasShipyardBuilding, hasTownBuilding, isShipyardBuilding } from "@/lib/game/town-buildings";
import { getTownBuildingSprite } from "@/lib/game/town-building-sprites";
import { isTownCoastalForBoats } from "@/lib/game/engine/town-coast";
import { buildingTypeLabel } from "./helpers";

export function TownBuildTab({
  selectedTown,
  selectedTownFaction,
  displayedBuildRules,
  hideMissingBuildRequirements,
  setHideMissingBuildRequirements,
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
  hideMissingBuildRequirements: boolean;
  setHideMissingBuildRequirements: (next: boolean) => void;
  gameState: GameState;
  myPlayer: Player | undefined;
  hasPlayerCapitol: boolean;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  onBuild: (building: BuildingType) => void;
  onBuildBoat?: () => void;
}) {
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
      <label className="flex items-center gap-2 rounded-md border border-amber-700/30 bg-black/35 px-3 py-2 text-xs font-bold text-amber-100">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-amber-500"
          checked={hideMissingBuildRequirements}
          onChange={(event) => setHideMissingBuildRequirements(event.currentTarget.checked)}
        />
        <span>Masquer les prérequis manquants</span>
      </label>
      {displayedBuildRules.map((rule) => {
        if (isShipyardBuilding(selectedTownFaction, rule.type) && !isCoastal) return null;
        const alreadyBuilt = selectedTown.buildings.includes(rule.type);
        const missingRequirement = rule.requires?.find((requirement) => !hasTownBuilding(selectedTown.buildings, requirement));
        const blockedByCapitolLimit =
          rule.type === BuildingType.CAPITOL &&
          hasPlayerCapitol &&
          !selectedTown.buildings.includes(BuildingType.CAPITOL);
        const disabled =
          alreadyBuilt ||
          selectedTown.lastBuiltTurn === gameState.turnNumber ||
          Boolean(missingRequirement) ||
          blockedByCapitolLimit ||
          !myPlayer ||
          !canAfford(myPlayer.resources, rule.cost) ||
          !canAct ||
          !isMyTown ||
          isPending;
        const buildingSprite = getTownBuildingSprite(rule, selectedTownFaction);

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
                      unoptimized
                      aria-hidden="true"
                    />
                  </div>
                )}
                <div className="min-w-0">
                <div className="text-sm font-bold text-amber-100">{rule.label}</div>
                <div className="text-xs text-amber-200/60">{rule.description}</div>
                <div className="mt-1 text-xs text-amber-300">{formatCost(rule.cost)}</div>
                {missingRequirement && (
                  <div className="mt-1 text-xs text-red-300">Prérequis manquant : {buildingTypeLabel(missingRequirement, selectedTownFaction)}</div>
                )}
                {blockedByCapitolLimit && (
                  <div className="mt-1 text-xs text-red-300">Limite atteinte : un seul Capitole par joueur.</div>
                )}
                </div>
              </div>
              <button
                type="button"
                aria-label={alreadyBuilt ? "Construit" : "Construire"}
                className={`group relative grid h-10 w-10 shrink-0 place-items-center rounded-md border transition focus-visible:ring-2 focus-visible:ring-amber-200/70 ${
                  disabled
                    ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                    : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] hover:from-amber-500 hover:to-amber-700"
                }`}
                disabled={disabled}
                onClick={() => onBuild(rule.type)}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {alreadyBuilt ? (
                    <>
                      <path d="M20 6 9 17l-5-5" />
                    </>
                  ) : (
                    <>
                      <path d="M3 21h18" />
                      <path d="M5 21V8l7-5 7 5v13" />
                      <path d="M9 21v-6h6v6" />
                      <path d="M12 8v4" />
                      <path d="M10 10h4" />
                    </>
                  )}
                </svg>
                <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md border border-amber-600/60 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-amber-100 opacity-0 shadow-lg shadow-black/50 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  {alreadyBuilt ? "Construit" : "Construire"}
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
              <div className="text-sm font-bold text-sky-100">Bateau</div>
              <div className="text-xs text-sky-200/65">Construire un bateau sur une case d&apos;eau côtière proche.</div>
              <div className="mt-1 text-xs text-sky-200">1000 Or, 10 Bois</div>
              {!isCoastal && <div className="mt-1 text-xs text-red-300">Ville non côtière : aucune eau proche.</div>}
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
              Construire
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
