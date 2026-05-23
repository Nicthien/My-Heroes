"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { fetchWithSupabaseAuth } from "@/lib/auth/client";
import { calculateArmyPower } from "@/lib/game/combat/autoResolve";
import { createCreatureBankGuardStacks, isCreatureBankType } from "@/lib/game/creature-banks";
import { getAdventurePathCost, getUsableAdventureMovement } from "@/lib/game/engine";
import { GameState, Hero, UnitStack, UnitType } from "@/lib/game/types";
import { getUnitRule } from "@/lib/game/units";
import { useGameStore } from "@/lib/stores/gameStore";

export default function CombatChoiceModal() {
  const gameState = useGameStore((state) => state.gameState);
  const pendingCombat = useGameStore((state) => state.pendingCombat);
  const setPendingCombat = useGameStore((state) => state.setPendingCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const setCombatResult = useGameStore((state) => state.setCombatResult);
  const setGameState = useGameStore((state) => state.setGameState);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const devGodMode = useGameStore((state) => state.devGodMode);
  const autoStartedRef = useRef<string | null>(null);
  const pendingKey = pendingCombat ? `${pendingCombat.attackerHeroId}:${pendingCombat.targetId}:${pendingCombat.targetType}` : null;
  const encounterInfo = useMemo(
    () => gameState && pendingCombat ? getEncounterInfo(gameState, pendingCombat) : null,
    [gameState, pendingCombat]
  );
  const targetHeroOwner = useMemo(
    () => gameState && pendingCombat?.targetType === "hero"
      ? gameState.players.find((player) => player.heroes.some((hero) => hero.id === pendingCombat.targetId))
      : undefined,
    [gameState, pendingCombat]
  );
  const isAiHeroTarget = Boolean(targetHeroOwner?.isAi);

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
      setCombatMessage(data?.error ?? "Combat impossible.");
      setPendingCombat(null);
      return;
    }

    const data = await response.json();
    setPendingCombat(null);
    const combatPayload = data.combat ?? data;
    if (data.result) setCombatResult(data.result);
    if (mode === "MANUAL" && combatPayload) setActiveCombat(mapCombat(combatPayload));
    // No refreshGameState — the heroes table update triggers realtime → loadGame handles full sync
  }, [devGodMode, gameState, pendingCombat, selectedHeroId, setActiveCombat, setCombatMessage, setCombatResult, setGameState, setPendingCombat]);

  useEffect(() => {
    if (!pendingCombat || !pendingKey) return;
    if (pendingCombat.targetType !== "hero") return;
    if (isAiHeroTarget) return;
    if (autoStartedRef.current === pendingKey) return;
    autoStartedRef.current = pendingKey;
    void startCombat("MANUAL");
  }, [isAiHeroTarget, pendingCombat, pendingKey, startCombat]);

  if (!gameState || !pendingCombat || !encounterInfo) return null;

  if (pendingCombat.targetType === "hero" && !isAiHeroTarget) {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-auto">
        <div className="rounded-xl border border-red-700 bg-stone-950 p-6 text-white shadow-2xl">
          <div className="text-xs uppercase tracking-[0.28em] text-red-400">Combat joueur contre joueur</div>
          <div className="mt-2 text-xl font-bold text-red-100">Ouverture du combat manuel...</div>
          <div className="mt-2 text-sm text-stone-300">Les combats entre joueurs ne peuvent pas être résolus automatiquement.</div>
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
          {isGate ? "Gardiens de la porte" : isBuilding ? "Gardiens du bâtiment" : "Engagement"}
        </div>
        <h2 className="mt-2 text-2xl font-bold text-yellow-100">Choisir la résolution du combat</h2>
        <p className="mt-3 text-sm text-stone-300">
          {isGate
            ? "Cette porte est defendue par une garnison. Battez-la pour controler le passage."
            : isBuilding
            ? "Ce bâtiment est défendu par des gardiens. Battez-les pour en prendre le contrôle."
            : "Le combat sera visible sur la carte générale. En mode manuel, les deux joueurs rejoignent le plateau tactique synchrone."}
        </p>
        <section className="mt-5 rounded-lg border border-yellow-700/50 bg-black/30 p-4 shadow-[0_0_0_1px_rgba(250,204,21,0.08)_inset]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-yellow-500/80">Forces aperçues</div>
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
                Défense inconnue
              </div>
            )}
          </div>
        </section>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button className="rounded-lg border border-blue-500 bg-blue-950/80 p-4 text-left hover:bg-blue-900" onClick={() => startCombat("AUTO")}>
            <div className="font-bold text-blue-100">Automatique</div>
            <div className="mt-1 text-sm text-blue-200/80">Résolution immédiate selon les puissances, pertes et héros.</div>
          </button>
          <button className="rounded-lg border border-red-500 bg-red-950/80 p-4 text-left hover:bg-red-900" onClick={() => startCombat("MANUAL")}>
            <div className="font-bold text-red-100">Manuel</div>
            <div className="mt-1 text-sm text-red-200/80">Plateau hexagonal, tours par vitesse, attaques et ripostes.</div>
          </button>
          <button className="rounded-lg border border-stone-600 bg-stone-900/80 p-4 text-left hover:bg-stone-800" onClick={() => setPendingCombat(null)}>
            <div className="font-bold text-stone-100">Fuir</div>
            <div className="mt-1 text-sm text-stone-300/80">Annuler l&apos;engagement et revenir sur la carte.</div>
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

function getEncounterInfo(gameState: GameState, pendingCombat: PendingCombat) {
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
    sourceLabel: getSourceLabel(pendingCombat.targetType),
    difficulty: getDifficulty(defenderPower / Math.max(1, attackerPower)),
    units: defenderStacks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((stack) => ({
        unitType: stack.unitType,
        position: stack.position,
        label: getUnitRule(stack.unitType).label,
        range: formatCountRange(stack.count),
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
    const destination = pendingCombat.targetPosition ?? pendingCombat.destination;
    const building = gameState.players
      .flatMap((player) => player.resourceBuildings)
      .find((item) =>
        item.id === pendingCombat.targetId ||
        Boolean(destination && item.position.x === destination.x && item.position.y === destination.y)
      );
    const tilePower = destination
      ? gameState.map.tiles[destination.y]?.[destination.x]?.object?.guardianPower
      : undefined;
    const guardianPower = Math.max(0, building?.guardianPower ?? tilePower ?? 0);
    const count = Math.max(5, Math.ceil(guardianPower / 12));
    return [{
      id: `${pendingCombat.targetId}-guards-preview`,
      unitType: UnitType.PIKEMAN,
      count,
      health: count * 12,
      maxHealth: 12,
      position: 0,
    }];
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

  const defenderHero = findHero(gameState, pendingCombat.targetId);
  return defenderHero?.armies ?? [];
}

function findHero(gameState: GameState, heroId: string): Hero | undefined {
  return gameState.players.flatMap((player) => player.heroes).find((hero) => hero.id === heroId);
}

function getStacksPower(stacks: UnitStack[]) {
  return stacks.reduce((total, stack) => total + getUnitRule(stack.unitType).power * stack.count, 0);
}

function getDifficulty(ratio: number) {
  if (ratio <= 0.35) return { label: "Facile", className: "border-emerald-400/60 bg-emerald-950 text-emerald-100" };
  if (ratio <= 0.7) return { label: "Moyen", className: "border-lime-400/60 bg-lime-950 text-lime-100" };
  if (ratio <= 1.05) return { label: "Difficile", className: "border-yellow-400/60 bg-yellow-950 text-yellow-100" };
  if (ratio <= 1.55) return { label: "Très difficile", className: "border-orange-400/60 bg-orange-950 text-orange-100" };
  return { label: "Suicidaire", className: "border-red-400/60 bg-red-950 text-red-100" };
}

function getSourceLabel(targetType: PendingCombat["targetType"]) {
  if (targetType === "building") return "Gardiens estimés du lieu.";
  if (targetType === "town") return "Garnison neutre repérée.";
  if (targetType === "gate") return "Garnison de porte reperee.";
  if (targetType === "creature_bank") return "Gardiens de banque de creatures.";
  if (targetType === "monster") return "Armée neutre observée.";
  return "Défense adverse repérée.";
}

function formatCountRange(count: number) {
  if (count <= 0) return "Aucun";
  if (count < 5) return "1-4 unités";
  if (count < 10) return "5-9 unités";
  if (count < 20) return "10-19 unités";
  if (count < 50) return "20-49 unités";
  if (count < 100) return "50-99 unités";
  if (count < 250) return "100-249 unités";
  return "250+ unités";
}
