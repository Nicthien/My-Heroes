"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { fetchWithSupabaseAuth } from "@/lib/auth/client";
import { playBattleStart } from "@/lib/audio/soundEffects";
import { calculateArmyPower } from "@/lib/game/combat/autoResolve";
import { createCreatureBankGuardStacks, isCreatureBankType } from "@/lib/game/creature-banks";
import { createNeutralArmyStacksForTile } from "@/lib/game/neutral-armies";
import { getAdventurePathCost, getUsableAdventureMovement } from "@/lib/game/engine";
import { GameMap, GameState, Hero, MapObject, MapTile, UnitStack, type MapLevelId } from "@/lib/game/types";
import { getUnitRule } from "@/lib/game/units";
import { useGameStore } from "@/lib/stores/gameStore";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedUnitLabel } from "@/lib/i18n/gameLabels";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export default function CombatChoiceModal() {
  const { t, locale } = useI18n();
  const gameState = useGameStore((state) => state.gameState);
  const pendingCombat = useGameStore((state) => state.pendingCombat);
  const setPendingCombat = useGameStore((state) => state.setPendingCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const setCombatResult = useGameStore((state) => state.setCombatResult);
  const setGameState = useGameStore((state) => state.setGameState);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const devGodMode = useGameStore((state) => state.devGodMode);
  const encounterInfo = useMemo(
    () => gameState && pendingCombat ? getEncounterInfo(gameState, pendingCombat, t, locale) : null,
    [gameState, pendingCombat, t, locale]
  );

  // War horn when the engagement screen opens, once per pending encounter.
  const battleStartKeyRef = useRef<string | null>(null);
  const pendingKey = pendingCombat
    ? `${pendingCombat.attackerHeroId}:${pendingCombat.targetType}:${pendingCombat.targetId ?? ""}`
    : null;
  useEffect(() => {
    if (!pendingKey) {
      battleStartKeyRef.current = null;
      return;
    }
    if (battleStartKeyRef.current === pendingKey) return;
    battleStartKeyRef.current = pendingKey;
    playBattleStart();
  }, [pendingKey]);

  const startCombat = useCallback(async (mode: "AUTO" | "MANUAL") => {
    if (!gameState || !pendingCombat) return;

    // Optimistic hero movement to combat destination
    if (pendingCombat.destination && pendingCombat.path) {
      const { destination, path } = pendingCombat;
      const usedMovement = getAdventurePathCost(gameState.map, path);
      setGameState({
        ...gameState,
        players: gameState.players.map((player) => ({
          ...player,
          heroes: player.heroes.map((hero) =>
            hero.id === pendingCombat.attackerHeroId
              ? { ...hero, position: destination, movement: getUsableAdventureMovement(gameState.map, destination, (hero.movement ?? 0) - usedMovement) }
              : hero
          ),
        })),
      });
    }

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/combats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        attackerHeroId: pendingCombat.attackerHeroId,
        targetId: pendingCombat.targetId,
        targetType: pendingCombat.targetType,
        destination: pendingCombat.destination,
        targetPosition: pendingCombat.targetPosition,
        path: pendingCombat.path,
        ...(devGodMode && selectedHeroId === pendingCombat.attackerHeroId ? { devGodModeHeroId: selectedHeroId } : {}),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setCombatMessage(localizedServerMessage(data?.error, locale) ?? t("combat.impossible"));
      setPendingCombat(null);
      return;
    }

    const data = await response.json();
    setPendingCombat(null);
    const combatPayload = data.combat ?? data;
    if (data.result) setCombatResult(data.result);
    if (mode === "MANUAL" && combatPayload) setActiveCombat(mapCombat(combatPayload));
    // On an AUTO win, optimistically strip the defeated guardian/monster from the
    // local map so it disappears immediately instead of lingering until the
    // realtime round-trip re-syncs the map. Read the freshest state because the
    // optimistic hero move above already produced a new gameState.
    if (mode === "AUTO" && data.result?.winnerId === pendingCombat.attackerHeroId) {
      const current = useGameStore.getState().gameState;
      if (current) {
        const cleared = withDefeatedTargetCleared(current, pendingCombat);
        if (cleared !== current) setGameState(cleared);
      }
    }
    // No refreshGameState — the heroes table update triggers realtime → loadGame handles full sync
  }, [devGodMode, gameState, pendingCombat, selectedHeroId, setActiveCombat, setCombatMessage, setCombatResult, setGameState, setPendingCombat, t, locale]);

  if (!gameState || !pendingCombat || !encounterInfo) return null;

  if (pendingCombat.targetType === "hero") {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-auto">
        <div className="w-[min(92vw,34rem)] rounded-xl border border-red-700 bg-stone-950 p-6 text-white shadow-2xl">
          <div className="text-xs uppercase tracking-[0.28em] text-red-400">{t("combat.opponentHero")}</div>
          <h2 className="mt-2 text-2xl font-bold text-red-100">{t("combat.engage")}</h2>
          <p className="mt-3 text-sm text-stone-300">
            {t("combat.heroCrosses")}
          </p>
          <section className="mt-5 rounded-lg border border-red-700/50 bg-black/30 p-4 shadow-[0_0_0_1px_rgba(248,113,113,0.08)_inset]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-red-400/80">{t("combat.forcesSeen")}</div>
                <div className="mt-1 text-sm text-stone-300">{encounterInfo.sourceLabel}</div>
              </div>
              <div className={`rounded-md border px-3 py-1 text-sm font-bold ${encounterInfo.difficulty.className}`}>
                {encounterInfo.difficulty.label}
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {encounterInfo.units.length > 0 ? encounterInfo.units.map((unit) => (
                <div key={`${unit.unitType}-${unit.position}`} className="rounded-md border border-stone-700/70 bg-stone-900/70 px-3 py-2">
                  <div className="text-sm font-bold text-red-100">{unit.label}</div>
                  <div className="mt-0.5 text-xs text-stone-400">{unit.range}</div>
                </div>
              )) : (
                <div className="rounded-md border border-stone-700/70 bg-stone-900/70 px-3 py-2 text-sm text-stone-300">
                  {t("combat.defenseUnknown")}
                </div>
              )}
            </div>
          </section>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button className="rounded-lg border border-red-500 bg-red-950/80 p-4 text-left hover:bg-red-900" onClick={() => startCombat("MANUAL")}>
              <div className="font-bold text-red-100">{t("combat.attack")}</div>
              <div className="mt-1 text-sm text-red-200/80">{t("combat.attackHeroDesc")}</div>
            </button>
            <button className="rounded-lg border border-stone-600 bg-stone-900/80 p-4 text-left hover:bg-stone-800" onClick={() => setPendingCombat(null)}>
              <div className="font-bold text-stone-100">{t("combat.flee")}</div>
              <div className="mt-1 text-sm text-stone-300/80">{t("combat.fleeDesc")}</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isBuilding = pendingCombat.targetType === "building";
  const isGate = pendingCombat.targetType === "gate";

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-auto">
      <div className="w-[min(92vw,58rem)] rounded-xl border border-yellow-700 bg-stone-950 p-6 shadow-2xl shadow-black text-white">
        <div className="text-xs uppercase tracking-[0.28em] text-yellow-500">
          {isGate ? t("combat.gateGuards") : isBuilding ? t("combat.buildingGuards") : t("combat.engagement")}
        </div>
        <h2 className="mt-2 text-2xl font-bold text-yellow-100">{t("combat.chooseResolution")}</h2>
        <p className="mt-3 text-sm text-stone-300">
          {isGate
            ? t("combat.gateDesc")
            : isBuilding
            ? t("combat.buildingDesc")
            : t("combat.engagementDesc")}
        </p>
        <section className="mt-5 rounded-lg border border-yellow-700/50 bg-black/30 p-4 shadow-[0_0_0_1px_rgba(250,204,21,0.08)_inset]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-yellow-500/80">{t("combat.forcesSeen")}</div>
              <div className="mt-1 text-sm text-stone-300">{encounterInfo.sourceLabel}</div>
            </div>
            <div className={`rounded-md border px-3 py-1 text-sm font-bold ${encounterInfo.difficulty.className}`}>
              {encounterInfo.difficulty.label}
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {encounterInfo.units.length > 0 ? encounterInfo.units.map((unit) => (
              <div key={`${unit.unitType}-${unit.position}`} className="rounded-md border border-stone-700/70 bg-stone-900/70 px-3 py-2">
                <div className="text-sm font-bold text-yellow-100">{unit.label}</div>
                <div className="mt-0.5 text-xs text-stone-400">{unit.range}</div>
              </div>
            )) : (
              <div className="rounded-md border border-stone-700/70 bg-stone-900/70 px-3 py-2 text-sm text-stone-300">
                {t("combat.defenseUnknown")}
              </div>
            )}
          </div>
        </section>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button className="rounded-lg border border-blue-500 bg-blue-950/80 p-4 text-left hover:bg-blue-900" onClick={() => startCombat("AUTO")}>
            <div className="font-bold text-blue-100">{t("combat.auto")}</div>
            <div className="mt-1 text-sm text-blue-200/80">{t("combat.autoDesc")}</div>
          </button>
          <button className="rounded-lg border border-red-500 bg-red-950/80 p-4 text-left hover:bg-red-900" onClick={() => startCombat("MANUAL")}>
            <div className="font-bold text-red-100">{t("combat.manual")}</div>
            <div className="mt-1 text-sm text-red-200/80">{t("combat.manualDesc")}</div>
          </button>
          <button className="rounded-lg border border-stone-600 bg-stone-900/80 p-4 text-left hover:bg-stone-800" onClick={() => setPendingCombat(null)}>
            <div className="font-bold text-stone-100">{t("combat.flee")}</div>
            <div className="mt-1 text-sm text-stone-300/80">{t("combat.fleeDesc")}</div>
          </button>
        </div>
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
    gateId: combat.gateId as string | null,
    currentPlayerId: combat.currentPlayerId as string | null,
    currentUnitId: combat.currentUnitId as string | null,
    round: combat.round as number,
    position: { x: combat.x as number, y: combat.y as number },
    boardState: combat.boardState as never,
    turnQueue: combat.turnQueue as string[],
    actionLog: combat.actionLog as string[],
    participants: (combat.participants as never[]) ?? [],
    result: combat.result as never,
    visibility: (combat.visibility as "full" | "joinable_summary" | undefined) ?? "full",
  };
}

type PendingCombat = NonNullable<ReturnType<typeof useGameStore.getState>["pendingCombat"]>;

// Mirrors the server-side map cleanup (api.ts: a defeated monster's tile object
// is removed, a beaten guardian's power drops to 0) but applies it optimistically
// on the client so the threat vanishes the instant an AUTO combat is won.
function withDefeatedTargetCleared(gameState: GameState, pending: PendingCombat): GameState {
  const pos = pending.targetPosition ?? pending.destination ?? null;
  const matches = (object: MapObject, x: number, y: number): boolean => {
    const atPos = pos ? x === pos.x && y === pos.y : false;
    switch (pending.targetType) {
      case "monster":
        return object.type === "monster" && object.id === pending.targetId;
      case "creature_bank":
        return object.type === "adventure_building" && object.id === pending.targetId;
      case "artifact":
        return object.type === "artifact" && (object.id === pending.targetId || atPos);
      case "gate":
        return object.type === "gate" && (object.id === pending.targetId || atPos);
      case "building":
        return object.type === "building" && (object.id === pending.targetId || atPos);
      default:
        return false;
    }
  };

  let changed = false;
  const clearTiles = (tiles: MapTile[][]): MapTile[][] => {
    let outerChanged = false;
    const next = tiles.map((row) => {
      let rowChanged = false;
      const nextRow = row.map((tile) => {
        if (!tile.object || !matches(tile.object, tile.x, tile.y)) return tile;
        rowChanged = true;
        changed = true;
        // A monster sprite is removed entirely; a guarded building/gate/artifact
        // stays but loses its (now defeated) garrison threat indicator.
        if (pending.targetType === "monster") {
          const { object: _removed, ...rest } = tile;
          void _removed;
          return rest as MapTile;
        }
        return { ...tile, object: { ...tile.object, guardianPower: 0 } };
      });
      if (rowChanged) outerChanged = true;
      return rowChanged ? nextRow : row;
    });
    return outerChanged ? next : tiles;
  };

  const nextTiles = clearTiles(gameState.map.tiles);
  let nextLevels = gameState.map.levels;
  if (gameState.map.levels) {
    let levelsChanged = false;
    const updated: NonNullable<GameMap["levels"]> = { ...gameState.map.levels };
    for (const [levelId, layer] of Object.entries(gameState.map.levels)) {
      if (!layer) continue;
      const layerTiles = clearTiles(layer.tiles);
      if (layerTiles !== layer.tiles) {
        updated[levelId as MapLevelId] = { ...layer, tiles: layerTiles };
        levelsChanged = true;
      }
    }
    if (levelsChanged) nextLevels = updated;
  }

  if (!changed) return gameState;

  // Flag the neutral army defeated so any re-attack guard / preview no longer
  // treats it as an active target before the realtime sync lands.
  const neutralArmies = pending.targetType === "monster" && gameState.neutralArmies
    ? gameState.neutralArmies.map((army) =>
        army.id === pending.targetId ? { ...army, status: "DEFEATED" } : army
      )
    : gameState.neutralArmies;

  return {
    ...gameState,
    map: { ...gameState.map, tiles: nextTiles, levels: nextLevels },
    neutralArmies,
  };
}

function getEncounterInfo(gameState: GameState, pendingCombat: PendingCombat, t: TFn, locale: Locale) {
  const attacker = findHero(gameState, pendingCombat.attackerHeroId);
  const defenderStacks = getDefenderStacks(gameState, pendingCombat);
  const attackerPower = attacker ? calculateArmyPower({
    id: attacker.id,
    attack: attacker.stats.attack,
    defense: attacker.stats.defense,
    morale: attacker.stats.morale,
    armies: attacker.armies,
  }) : 1;
  const defenderPower = Math.max(1, getStacksPower(defenderStacks));

  return {
    sourceLabel: getSourceLabel(pendingCombat.targetType, t),
    difficulty: getDifficulty(defenderPower / Math.max(1, attackerPower), t),
    units: defenderStacks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((stack) => ({
        unitType: stack.unitType,
        position: stack.position,
        label: localizedUnitLabel(stack.unitType, getUnitRule(stack.unitType).label, locale),
        range: formatCountRange(stack.count, t),
      })),
  };
}

function getDefenderStacks(gameState: GameState, pendingCombat: PendingCombat): UnitStack[] {
  if (pendingCombat.targetType === "monster") {
    return gameState.neutralArmies?.find((army) => army.id === pendingCombat.targetId && army.status === "ACTIVE")?.stacks ?? [];
  }

  if (pendingCombat.targetType === "town") {
    const destination = pendingCombat.targetPosition ?? pendingCombat.destination;
    return gameState.players
      .flatMap((player) => player.towns)
      .find((town) =>
        town.id === pendingCombat.targetId ||
        Boolean(destination && town.position.x === destination.x && town.position.y === destination.y)
      )?.neutralGarrison ?? [];
  }

  if (pendingCombat.targetType === "building") {
    // A neutral mine lives only as a map tile object (not in any player's
    // resourceBuildings), so read the guard data from the building's own tile —
    // targetPosition, not destination (which is the hero's adjacent approach tile).
    const buildingPos = pendingCombat.targetPosition ?? pendingCombat.destination;
    const tile = buildingPos ? gameState.map.tiles[buildingPos.y]?.[buildingPos.x] : undefined;
    const ownedBuilding = gameState.players
      .flatMap((player) => player.resourceBuildings)
      .find((item) =>
        item.id === pendingCombat.targetId ||
        Boolean(buildingPos && item.position.x === buildingPos.x && item.position.y === buildingPos.y)
      );
    const guardianPower = Math.max(0, ownedBuilding?.guardianPower ?? Number(tile?.object?.guardianPower ?? 0));
    if (!buildingPos || !tile || guardianPower <= 0) return [];
    // Mirror the server-side guard generation exactly (combats/route.ts: getDefender
    // "building" branch / getBuildingDefender) so the preview matches the actual
    // combat. createNeutralArmyStacksForTile is deterministic (seeded by
    // armyId/x/y/terrain/budget), and the server seeds with the building's id —
    // which is exactly the tile object id we sent as targetId.
    return createNeutralArmyStacksForTile(
      { x: buildingPos.x, y: buildingPos.y, terrain: tile.terrain },
      guardianPower,
      pendingCombat.targetId,
    ).map((stack) => ({
      ...stack,
      id: `${pendingCombat.targetId}-stack-${stack.position}`,
    }));
  }

  if (pendingCombat.targetType === "gate") {
    const destination = pendingCombat.targetPosition ?? pendingCombat.destination;
    return gameState.gates?.find((gate) =>
      gate.id === pendingCombat.targetId ||
      Boolean(destination && gate.position.x === destination.x && gate.position.y === destination.y)
    )?.garrison ?? [];
  }

  if (pendingCombat.targetType === "creature_bank") {
    const tile = gameState.map.tiles.flatMap((row) => row)
      .find((item) => item.object?.id === pendingCombat.targetId);
    const bankType = tile?.object?.subtype;
    return isCreatureBankType(bankType) ? createCreatureBankGuardStacks(bankType, pendingCombat.targetId) : [];
  }

  if (pendingCombat.targetType === "artifact") {
    const destination = pendingCombat.targetPosition ?? pendingCombat.destination;
    const tile = destination ? gameState.map.tiles[destination.y]?.[destination.x] : undefined;
    const guardianPower = Number(tile?.object?.guardianPower ?? 0);
    return tile && guardianPower > 0
      ? createNeutralArmyStacksForTile(tile, guardianPower, pendingCombat.targetId).map((stack) => ({
        ...stack,
        id: `${pendingCombat.targetId}-guards-preview-${stack.position}`,
      }))
      : [];
  }

  const defenderHero = findHero(gameState, pendingCombat.targetId);
  return defenderHero?.armies ?? [];
}

function findHero(gameState: GameState, heroId: string): Hero | undefined {
  return gameState.players.flatMap((player) => player.heroes).find((hero) => hero.id === heroId);
}

function getStacksPower(stacks: UnitStack[]) {
  return stacks.reduce((total, stack) => total + getUnitRule(stack.unitType).power * stack.count, 0);
}

function getDifficulty(ratio: number, t: TFn) {
  if (ratio <= 0.35) return { label: t("combat.diffEasy"), className: "border-emerald-400/60 bg-emerald-950 text-emerald-100" };
  if (ratio <= 0.7) return { label: t("combat.diffMedium"), className: "border-lime-400/60 bg-lime-950 text-lime-100" };
  if (ratio <= 1.05) return { label: t("combat.diffHard"), className: "border-yellow-400/60 bg-yellow-950 text-yellow-100" };
  if (ratio <= 1.55) return { label: t("combat.diffVeryHard"), className: "border-orange-400/60 bg-orange-950 text-orange-100" };
  return { label: t("combat.diffSuicidal"), className: "border-red-400/60 bg-red-950 text-red-100" };
}

function getSourceLabel(targetType: PendingCombat["targetType"], t: TFn) {
  if (targetType === "hero") return t("combat.srcHero");
  if (targetType === "building") return t("combat.srcBuilding");
  if (targetType === "town") return t("combat.srcTown");
  if (targetType === "gate") return t("combat.srcGate");
  if (targetType === "creature_bank") return t("combat.srcBank");
  if (targetType === "artifact") return t("combat.srcArtifact");
  if (targetType === "monster") return t("combat.srcMonster");
  return t("combat.srcDefault");
}

function formatCountRange(count: number, t: TFn) {
  if (count <= 0) return t("combat.countNone");
  if (count < 5) return t("combat.unitsRange", { range: "1-4" });
  if (count < 10) return t("combat.unitsRange", { range: "5-9" });
  if (count < 20) return t("combat.unitsRange", { range: "10-19" });
  if (count < 50) return t("combat.unitsRange", { range: "20-49" });
  if (count < 100) return t("combat.unitsRange", { range: "50-99" });
  if (count < 250) return t("combat.unitsRange", { range: "100-249" });
  return t("combat.unitsRange", { range: "250+" });
}
