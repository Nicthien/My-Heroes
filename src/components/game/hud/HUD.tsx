"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/stores/gameStore";
import { Resources, Faction, BuildingType, UnitType } from "@/lib/game/types";
import { refreshGameState } from "@/lib/game/refresh";
import {
  BUILDING_RULES,
  DWELLING_TIERS,
  FACTION_UNITS,
  UNIT_RULES,
  canAfford,
  formatCost,
  subtractCost,
} from "@/lib/game/economy";
import SidePanel from "./SidePanel";
import {
  CornerOrnaments,
  FleurDeLis,
  HourglassIcon,
  OrnateHeader,
  ParchmentBackground,
  goldDivider,
  goldText,
  ornateFrame,
  ornateFramePolished,
} from "./theme";

const RESOURCE_ITEMS = [
  { key: "gold", label: "Or", short: "Or", src: "/assets/sprites/resources/gold.svg", text: "text-yellow-200", ring: "ring-yellow-300/50", glow: "shadow-yellow-500/25", bg: "from-yellow-300 to-amber-600" },
  { key: "wood", label: "Bois", short: "Bois", src: "/assets/sprites/resources/wood.svg", text: "text-orange-200", ring: "ring-orange-300/40", glow: "shadow-orange-700/25", bg: "from-amber-700 to-orange-950" },
  { key: "ore", label: "Minerai", short: "Min.", src: "/assets/sprites/resources/ore.svg", text: "text-slate-200", ring: "ring-slate-300/40", glow: "shadow-slate-400/20", bg: "from-slate-300 to-slate-700" },
  { key: "mercury", label: "Mercure", short: "Merc.", src: "/assets/sprites/resources/mercury.svg", text: "text-violet-200", ring: "ring-violet-300/40", glow: "shadow-violet-500/25", bg: "from-violet-300 to-fuchsia-700" },
  { key: "crystals", label: "Cristaux", short: "Crist.", src: "/assets/sprites/resources/crystals.svg", text: "text-cyan-100", ring: "ring-cyan-300/50", glow: "shadow-cyan-400/30", bg: "from-cyan-200 to-sky-700" },
  { key: "sulfur", label: "Soufre", short: "Soufre", src: "/assets/sprites/resources/sulfur.svg", text: "text-amber-100", ring: "ring-amber-300/40", glow: "shadow-amber-500/25", bg: "from-orange-300 to-yellow-700" },
] as const;

const NOTIFICATION_PROMPT_DISMISSED_KEY = "my-heroes:notifications:prompt-dismissed";

type ResourceItem = (typeof RESOURCE_ITEMS)[number];

function getNotificationPromptDismissed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NOTIFICATION_PROMPT_DISMISSED_KEY) === "true";
}

function factionLabel(f: Faction): string {
  const labels: Record<string, string> = {
    castle: "Château",
    rampart: "Rempart",
    tower: "Tour",
    inferno: "Hadès",
    necropolis: "Nécropole",
    dungeon: "Donjon",
    stronghold: "Bastion",
    fortress: "Forteresse",
  };
  return labels[f] || f;
}

function unitTypeLabel(u: string): string {
  return UNIT_RULES[u as UnitType]?.label ?? u;
}

function buildingTypeLabel(building: string): string {
  const labels: Record<string, string> = {
    castle: "Château",
    tavern: "Taverne",
    market: "Marché",
    barracks: "Caserne",
    mage_guild: "Guilde des mages",
    resource_silo: "Silo de ressources",
    dwelling_1: "Corps de garde",
    dwelling_2: "Champ de tir",
    dwelling_3: "Tour des griffons",
    dwelling_4: "Bâtiment de niveau 4",
    dwelling_5: "Bâtiment de niveau 5",
    dwelling_6: "Bâtiment de niveau 6",
    dwelling_7: "Bâtiment de niveau 7",
  };
  return labels[building] || building;
}

function ResourceBar({ resources }: { resources: Resources }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 text-xs xl:text-sm">
      {RESOURCE_ITEMS.map((item) => (
        <span
          key={item.key}
          title={`${item.label} : ${resources[item.key]}`}
          className="group flex min-w-[5rem] items-center justify-between gap-2 rounded-lg border border-amber-700/50 bg-gradient-to-b from-stone-900 to-black px-2.5 py-1 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.12)] transition hover:-translate-y-0.5 hover:border-amber-400/70 xl:min-w-[5.5rem] xl:px-3"
        >
          <ResourceIcon item={item} />
          <span className="font-black tabular-nums text-amber-100 drop-shadow">{resources[item.key]}</span>
        </span>
      ))}
    </div>
  );
}

function ResourceIcon({ item }: { item: ResourceItem }) {
  return (
    <span
      className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br ${item.bg} ring-1 ${item.ring} shadow-inner`}
      aria-hidden="true"
    >
      <Image
        src={item.src}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]"
      />
    </span>
  );
}

export default function HUD() {
  const gameState = useGameStore((state) => state.gameState);

  if (!gameState) return null;

  return <HUDContent />;
}

function HUDContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === "undefined" ? "denied" : Notification.permission
  );
  const [notificationPromptDismissed, setNotificationPromptDismissed] = useState(
    getNotificationPromptDismissed
  );
  const lastNotifiedTurnRef = useRef<string | null>(null);
  const {
    gameState: nullableGameState,
    selectedHeroId,
    selectedTownId,
    combatMessage,
    setCombatMessage,
    setGameState,
  } = useGameStore();
  const gameState = nullableGameState!;

  const myPlayer = gameState.players.find(
    (player) => player.userId === session?.user?.id
  );
  const isPending = gameState.status === "PENDING";
  const hasActiveCombats = (gameState.activeCombats?.length ?? 0) > 0;
  const canAct = Boolean(
    myPlayer && gameState.status === "ACTIVE" && myPlayer.isAlive && !myPlayer.hasEndedTurn
  );
  const isWaitingForPlayers = Boolean(
    myPlayer && gameState.status === "ACTIVE" && myPlayer.hasEndedTurn
  );
  const turnNotificationKey = `${gameState.id}:${gameState.turnNumber}:${myPlayer?.hasEndedTurn ? "done" : "ready"}`;

  const selectedHero = gameState.players
    .flatMap((p) => p.heroes)
    .find((h) => h.id === selectedHeroId);

  const selectedTown = gameState.players
    .flatMap((p) => p.towns)
    .find((t) => t.id === selectedTownId);

  const selectedTownOwner = gameState.players.find((p) =>
    p.towns.some((town) => town.id === selectedTownId)
  );

  const isMyTown = Boolean(
    selectedTownOwner && myPlayer && selectedTownOwner.id === myPlayer.id
  );

  const handleLeaveGame = async () => {
    if (!myPlayer || !gameState) return;

    if (myPlayer.turnOrder === 0 || gameState.status !== "PENDING") {
      useGameStore.getState().resetGame();
      router.push("/dashboard");
      return;
    }

    if (!window.confirm("Voulez-vous vraiment quitter cette partie ?")) return;
    const response = await fetch(`/api/games/${gameState.id}/leave`, { method: "POST" });
    if (response.ok) {
      useGameStore.getState().resetGame();
      router.push("/dashboard");
    }
  };

  const handleEndTurn = async () => {
    if (!canAct) return;
    const response = await fetch(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "END_TURN" }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Impossible de finir le tour."));
      return;
    }

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id);
    if (refreshedState) useGameStore.getState().setGameState(refreshedState);
  };

  const handleStartGame = async () => {
    const response = await fetch(`/api/games/${gameState.id}/start`, {
      method: "POST",
    });

    if (!response.ok) {
      const refreshedState = await refreshGameState(gameState.id, session?.user?.id);
      if (refreshedState && refreshedState.status !== "PENDING") {
        useGameStore.getState().setGameState(refreshedState);
        return;
      }
      setCombatMessage(await getApiErrorMessage(response, "Impossible de demarrer la partie."));
      return;
    }

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id);
    if (refreshedState) useGameStore.getState().setGameState(refreshedState);
  };

  const handleBuild = async (building: BuildingType) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;

    const rule = BUILDING_RULES.find((item) => item.type === building);
    if (!rule || !canAfford(myPlayer.resources, rule.cost)) return;

    const response = await fetch(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "BUILD", townId: selectedTown.id, building }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Construction impossible."));
      return;
    }

    const nextResources = subtractCost(myPlayer.resources, rule.cost);
    setGameState({
      ...gameState,
      players: gameState.players.map((player) => {
        if (player.id !== myPlayer.id) return player;
        return {
          ...player,
          resources: nextResources,
          towns: player.towns.map((town) =>
            town.id === selectedTown.id
              ? {
                  ...town,
                  buildings: [...town.buildings, building],
                  availableRecruits: addImmediateDwellingGrowth(
                    town.availableRecruits,
                    building,
                    ((town as { townType?: string }).townType ?? town.faction ?? "castle") as Faction
                  ),
                  lastBuiltTurn: gameState.turnNumber,
                }
              : town
          ),
        };
      }),
    });
  };

  const handleRecruit = async (unitType: UnitType) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;

    const rule = UNIT_RULES[unitType];
    if (!rule || !canAfford(myPlayer.resources, rule.cost)) return;

    const response = await fetch(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "RECRUIT_UNIT",
        townId: selectedTown.id,
        unitType,
        count: 1,
      }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Recrutement impossible."));
      return;
    }

    const firstHero = myPlayer.heroes[0];
    const nextResources = subtractCost(myPlayer.resources, rule.cost);

    setGameState({
      ...gameState,
      players: gameState.players.map((player) => {
        if (player.id !== myPlayer.id || !firstHero) return player;
        return {
          ...player,
          resources: nextResources,
          towns: player.towns.map((town) =>
            town.id === selectedTown.id
              ? {
                  ...town,
                  availableRecruits: {
                    ...town.availableRecruits,
                    [unitType]: Math.max(0, (town.availableRecruits[unitType] ?? 0) - 1),
                  },
                }
              : town
          ),
          heroes: player.heroes.map((hero) => {
            if (hero.id !== firstHero.id) return hero;
            const existingStack = hero.armies.find(
              (army) => army.unitType === unitType
            );

            if (existingStack) {
              return {
                ...hero,
                armies: hero.armies.map((army) =>
                  army.id === existingStack.id
                    ? {
                        ...army,
                        count: army.count + 1,
                        health: army.health + rule.health,
                      }
                    : army
                ),
              };
            }

            return {
              ...hero,
              armies: [
                ...hero.armies,
                {
                  id: `local-${Date.now()}`,
                  unitType,
                  count: 1,
                  health: rule.health,
                  maxHealth: rule.health,
                  position: hero.armies.length,
                },
              ],
            };
          }),
        };
      }),
    });
  };

  const addImmediateDwellingGrowth = (
    stock: Partial<Record<UnitType, number>>,
    building: BuildingType,
    townFaction: Faction
  ) => {
    const tier = DWELLING_TIERS.indexOf(building);
    if (tier < 0) return stock;
    const factionTiers = FACTION_UNITS[townFaction] ?? FACTION_UNITS[Faction.CASTLE];
    const unitType = factionTiers[tier];
    const unitRule = UNIT_RULES[unitType];
    if (!unitRule) return stock;
    return {
      ...stock,
      [unitType]: (stock[unitType] ?? 0) + unitRule.growth,
    };
  };

  const requestNotifications = async () => {
    setNotificationPromptDismissed(true);
    window.localStorage.setItem(NOTIFICATION_PROMPT_DISMISSED_KEY, "true");

    if (typeof Notification === "undefined") {
      setNotificationPermission("denied");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  useEffect(() => {
    if (typeof Notification === "undefined") return;

    const syncPermission = () => {
      setNotificationPermission(Notification.permission);
    };

    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);

    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, []);

  useEffect(() => {
    if (isPending) {
      document.title = "My Heroes";
      return;
    }

    document.title = canAct
      ? "À vous de jouer - My Heroes"
      : "My Heroes";
  }, [canAct, isPending]);

  useEffect(() => {
    if (!canAct || isPending) return;
    if (lastNotifiedTurnRef.current === turnNotificationKey) return;

    lastNotifiedTurnRef.current = turnNotificationKey;

    if (notificationPermission === "granted" && typeof Notification !== "undefined") {
      new Notification("My Heroes", {
        body: "C'est à vous de jouer.",
      });
    }
  }, [canAct, isPending, notificationPermission, turnNotificationKey]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="pointer-events-auto absolute left-0 right-0 top-0 border-b-2 border-amber-700/60 bg-gradient-to-b from-[#1a1208] via-[#0e0904] to-[#1a1208] px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.7),inset_0_-1px_0_rgba(252,211,77,0.15)]">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="flex min-w-0 items-center gap-3 justify-self-start text-left">
            <FleurDeLis className="h-6 w-6 shrink-0 text-amber-400 drop-shadow" />
            <div>
              <div className={`whitespace-nowrap text-xl font-black tracking-[0.15em] md:text-2xl ${goldText}`}>
                MY HEROES
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/70 md:text-xs">
                <span>An {gameState.calendar.yearNumber} · Mois {gameState.calendar.monthOfYear}</span>
                <span className="mx-1 text-amber-700">◆</span>
                <span>Sem. {gameState.calendar.weekOfMonth} · Jour {gameState.calendar.dayOfWeek}</span>
              </div>
            </div>
          </div>

          <div className="justify-self-center text-center">
            {isPending && (
              <span className="inline-flex max-w-[18rem] items-center gap-2 rounded-full border border-amber-400/50 bg-gradient-to-b from-amber-900/60 to-stone-950/80 px-5 py-2 text-sm font-black uppercase tracking-widest text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.2)]">
                <FleurDeLis className="h-3 w-3 text-amber-300" />
                En attente
                <FleurDeLis className="h-3 w-3 text-amber-300" />
              </span>
            )}
            {!isPending && (
              <span
                className={`inline-flex max-w-[19rem] items-center gap-2 rounded-full border px-5 py-2 text-sm font-black uppercase tracking-widest shadow-[inset_0_0_0_1px_rgba(0,0,0,0.4)] ${
                  canAct
                    ? "border-emerald-300/60 bg-gradient-to-b from-emerald-700/70 to-emerald-950 text-emerald-50"
                    : "border-red-400/40 bg-gradient-to-b from-red-900/60 to-red-950 text-red-100"
                }`}
              >
                {canAct ? "À vous de jouer" : isWaitingForPlayers ? "Tour terminé" : "Observation"}
              </span>
            )}
          </div>

          <div className="flex min-w-0 items-stretch justify-end gap-3 justify-self-end">
            {myPlayer && <ResourceBar resources={myPlayer.resources} />}
            <button
              className="flex shrink-0 flex-col items-center justify-center rounded-lg border border-amber-700/50 bg-stone-950/80 px-3 text-amber-200/90 shadow-inner shadow-black/40 transition hover:border-red-400/60 hover:bg-red-950/40 hover:text-red-200"
              onClick={handleLeaveGame}
              title={myPlayer?.turnOrder !== 0 && isPending ? "Quitter la partie" : "Retour au dashboard"}
            >
              <span className="text-sm font-black uppercase tracking-wider leading-none">
                {myPlayer?.turnOrder !== 0 && isPending ? "Quitter" : "Retour"}
              </span>
              <span className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] leading-none text-amber-600/80">menu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right column: players + side shortcuts */}
      <div className="pointer-events-none absolute right-3 top-[7rem] bottom-24 flex w-64 flex-col gap-3 overflow-hidden">
        <div className={`relative ${ornateFrame} pointer-events-auto shrink-0`}>
          <CornerOrnaments />
          <ParchmentBackground />
          <OrnateHeader>Joueurs</OrnateHeader>
          <div className="space-y-0.5 px-2 py-2 text-sm">
            {[...gameState.players]
              .sort((a, b) => {
                if (a.id === myPlayer?.id) return -1;
                if (b.id === myPlayer?.id) return 1;
                return a.turnOrder - b.turnOrder;
              })
              .map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 transition ${
                    p.id === myPlayer?.id
                      ? "bg-amber-700/15 ring-1 ring-amber-500/40"
                      : "hover:bg-amber-900/15"
                  }`}
                >
                  <div
                    className="h-3 w-3 rounded-full ring-1 ring-amber-200/60 shadow"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className={p.isAlive ? "truncate text-amber-100" : "truncate text-stone-600 line-through"}>
                    {p.name}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-amber-300/70">
                    {p.hasEndedTurn ? "✓" : "…"} {p.heroes.length}H · {p.towns.length}T
                  </span>
                </div>
              ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <SidePanel />
        </div>
      </div>

      {combatMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-auto rounded-2xl border border-yellow-400/40 bg-[#080714]/90 px-6 py-4 text-center shadow-2xl shadow-yellow-950/40 backdrop-blur-xl">
          <div className="text-yellow-200 font-bold">{combatMessage}</div>
          <button
            className="mt-2 text-sm text-gray-300 hover:text-white"
            onClick={() => setCombatMessage(null)}
          >
            Fermer
          </button>
        </div>
      )}

      {canAct && !isPending && notificationPermission === "default" && !notificationPromptDismissed && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-auto rounded-2xl border border-green-400/50 bg-green-950/90 px-6 py-3 text-center shadow-2xl shadow-green-900/40 backdrop-blur-xl">
          <button
            className="rounded bg-green-700 px-3 py-1 text-sm font-bold text-white hover:bg-green-600"
            onClick={requestNotifications}
          >
            Activer les notifications
          </button>
        </div>
      )}

      {/* Hero panel */}
      {selectedHero && (
        <div className={`${ornateFramePolished} pointer-events-auto absolute bottom-20 left-4 min-w-80`}>
          <CornerOrnaments />
          <ParchmentBackground />
          <OrnateHeader
            right={
              <button
                className="rounded text-amber-300/60 transition hover:text-amber-100"
                onClick={() => useGameStore.getState().selectHero(null)}
                aria-label="Fermer"
              >
                ✕
              </button>
            }
          >
            Héros
          </OrnateHeader>
          <div className="space-y-3 p-4">
            <div>
              <h3 className={`text-xl font-black drop-shadow ${goldText}`}>{selectedHero.name}</h3>
              <div className="text-xs uppercase tracking-wider text-amber-200/60">
                Niveau {selectedHero.level} · XP {selectedHero.experience}
              </div>
            </div>
            <div className={goldDivider} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Attaque" value={selectedHero.stats.attack} color="text-red-300" />
              <Stat label="Défense" value={selectedHero.stats.defense} color="text-blue-300" />
              <Stat label="Pouvoir" value={selectedHero.stats.spellPower} color="text-violet-300" />
              <Stat label="Savoir" value={selectedHero.stats.knowledge} color="text-cyan-300" />
            </div>
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-bold ${
                selectedHero.movement > 5
                  ? "border-emerald-500/50 bg-emerald-950/60 text-emerald-200"
                  : selectedHero.movement > 0
                  ? "border-amber-500/50 bg-amber-950/60 text-amber-200"
                  : "border-red-500/50 bg-red-950/60 text-red-200"
              }`}
            >
              <HourglassIcon className="h-4 w-4" />
              Mouvement {selectedHero.movement}/{selectedHero.maxMovement}
            </div>
            {selectedHero.armies.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">Armée</div>
                <div className="grid grid-cols-2 gap-1">
                  {selectedHero.armies.map((unit) => (
                    <div
                      key={unit.id}
                      className="flex items-baseline justify-between rounded-md border border-amber-700/40 bg-black/50 px-2 py-1 text-sm"
                    >
                      <span className="truncate text-[11px] text-amber-200/70">{unitTypeLabel(unit.unitType)}</span>
                      <span className="font-black text-amber-100">{unit.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Town panel */}
      {selectedTown && (
        <div className={`${ornateFramePolished} pointer-events-auto absolute bottom-20 left-4 flex max-h-[calc(100vh-12rem)] w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden`}>
          <CornerOrnaments />
          <ParchmentBackground />
          <OrnateHeader
            right={
              <button
                className="rounded text-amber-300/60 transition hover:text-amber-100"
                onClick={() => useGameStore.getState().selectTown(null)}
                aria-label="Fermer"
              >
                ✕
              </button>
            }
          >
            Château
          </OrnateHeader>
          <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3">
            <h3 className={`text-xl font-black drop-shadow ${goldText}`}>{selectedTown.name}</h3>
            <div className="text-xs uppercase tracking-wider text-amber-200/60">
              {factionLabel(selectedTown.faction as Faction)} · Niveau {selectedTown.level}
            </div>
          </div>
          {!isMyTown && (
            <div className="mt-2 rounded-md border border-red-500/50 bg-red-950/60 px-2 py-1 text-sm text-red-200">
              Ville ennemie ou non contrôlée.
            </div>
          )}
          {selectedTown.buildings.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">Bâtiments</div>
              <div className="flex flex-wrap gap-1">
                {selectedTown.buildings.map((b, i) => (
                  <span key={i} className="rounded-md border border-amber-700/40 bg-black/50 px-2 py-0.5 text-[11px] text-amber-200/90">
                    {buildingTypeLabel(b)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {isMyTown && selectedTown.lastBuiltTurn === gameState.turnNumber && (
            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-950/60 px-2 py-1 text-sm text-amber-200">
              Construction déjà réalisée aujourd&apos;hui dans ce château.
            </div>
          )}
          <div className="mt-4 border-t border-amber-700/40 pt-3">
            <div className={`mb-2 text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>Construire</div>
            <div className="space-y-2">
              {BUILDING_RULES.map((rule) => {
                const alreadyBuilt = selectedTown.buildings.includes(rule.type);
                const missingRequirement = rule.requires?.find(
                  (requirement) => !selectedTown.buildings.includes(requirement)
                );
                const disabled =
                  alreadyBuilt ||
                  selectedTown.lastBuiltTurn === gameState.turnNumber ||
                  Boolean(missingRequirement) ||
                  !myPlayer ||
                  !canAfford(myPlayer.resources, rule.cost) ||
                  !canAct ||
                  !isMyTown ||
                  isPending;

                return (
                  <div key={rule.type} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-amber-100">{rule.label}</div>
                        <div className="text-xs text-amber-200/60">{rule.description}</div>
                        <div className="mt-1 text-xs text-amber-300">{formatCost(rule.cost)}</div>
                        {missingRequirement && (
                          <div className="mt-1 text-xs text-red-300">
                            Prérequis manquant : {buildingTypeLabel(missingRequirement)}
                          </div>
                        )}
                      </div>
                      <button
                        className={`rounded-md border px-3 py-1 text-sm font-black uppercase tracking-wider transition ${
                          disabled
                            ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                            : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] hover:from-amber-500 hover:to-amber-700"
                        }`}
                        disabled={disabled}
                        onClick={() => handleBuild(rule.type)}
                      >
                        {alreadyBuilt ? "Construit" : "Construire"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-amber-700/40 pt-3">
            <div className={`mb-2 text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>Recruter</div>
            <div className="space-y-2">
              {(() => {
                const townFaction = ((selectedTown as { townType?: string }).townType ?? selectedTown.faction ?? "castle") as Faction;
                const factionTiers = FACTION_UNITS[townFaction] ?? FACTION_UNITS[Faction.CASTLE];
                return factionTiers.map((unitType, tier) => ({
                  rule: UNIT_RULES[unitType],
                  tier,
                }));
              })().map(({ rule, tier }) => {
                const hasDwelling = selectedTown.buildings.includes(DWELLING_TIERS[tier]);
                const available = selectedTown.availableRecruits[rule.type] ?? 0;
                const disabled =
                  !hasDwelling ||
                  available <= 0 ||
                  !myPlayer ||
                  !canAfford(myPlayer.resources, rule.cost) ||
                  !canAct ||
                  !isMyTown ||
                  isPending;

                return (
                  <div key={rule.type} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-amber-100">{rule.label}</div>
                        <div className="text-xs text-amber-200/60">
                          PV {rule.health} · {formatCost(rule.cost)} / unité
                        </div>
                        {hasDwelling && (
                          <div className="mt-1 text-xs text-emerald-300">Disponible : {available}</div>
                        )}
                        {!hasDwelling && (
                          <div className="mt-1 text-xs text-red-300">
                            Prérequis : {buildingTypeLabel(DWELLING_TIERS[tier])}
                          </div>
                        )}
                      </div>
                      <button
                        className={`rounded-md border px-3 py-1 text-sm font-black transition ${
                          disabled
                            ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                            : "border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] hover:from-emerald-500 hover:to-emerald-700"
                        }`}
                        disabled={disabled}
                        onClick={() => handleRecruit(rule.type)}
                      >
                        +1
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Bouton de fin de tour */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2">
        {isPending ? (
          <div className={`${ornateFramePolished} min-w-80 p-5 text-center`}>
            <CornerOrnaments />
            <ParchmentBackground />
            <div className={`text-sm font-black uppercase tracking-[0.2em] ${goldText}`}>Salle d&apos;attente</div>
            <div className="mt-2 flex flex-col gap-1">
              {gameState.players.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-gray-200 font-medium">{p.name || "Joueur"}</span>
                  {p.turnOrder === 0 && <span className="text-xs text-yellow-400">(hôte)</span>}
                </div>
              ))}
              {gameState.players.length < (gameState.maxPlayers ?? 8) && (
                <div className="text-gray-500 text-xs mt-1">
                  {(gameState.maxPlayers ?? 8) - gameState.players.length} place(s) libre(s)
                </div>
              )}
            </div>
            {myPlayer?.turnOrder === 0 ? (
              <button
                className="mt-4 rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 px-6 py-2 font-black uppercase tracking-widest text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] hover:from-emerald-500 hover:to-emerald-700"
                onClick={handleStartGame}
                data-testid="start-game"
              >
                Démarrer
              </button>
            ) : (
              <div className="mt-4 text-sm text-amber-200/60">En attente que l&apos;hôte démarre la partie…</div>
            )}
          </div>
        ) : (
          <div className="text-center">
          {hasActiveCombats && canAct && (
            <div className="mb-2 rounded-md border border-amber-500/50 bg-amber-950/80 px-3 py-1 text-sm font-bold text-amber-200">
              Terminez les combats en cours avant de finir le tour.
            </div>
          )}
          <button
            className={`group relative h-24 w-24 rounded-full border-4 transition ${
              canAct && !hasActiveCombats
                ? "border-amber-300 bg-gradient-to-b from-red-600 via-red-800 to-red-950 text-amber-50 shadow-[0_0_30px_rgba(220,38,38,0.5),inset_0_0_0_2px_rgba(252,211,77,0.4)] hover:-translate-y-0.5 hover:from-red-500"
                : "cursor-not-allowed border-stone-700 bg-stone-900 text-stone-500"
            }`}
            disabled={!canAct || hasActiveCombats}
            onClick={handleEndTurn}
            data-testid="end-turn"
            title={isWaitingForPlayers ? "Tour terminé" : "Fin du tour"}
          >
            <HourglassIcon className="mx-auto h-9 w-9 drop-shadow" />
            <span className="mt-1 block text-[10px] font-black uppercase tracking-widest">
              {isWaitingForPlayers ? "Terminé" : "Fin tour"}
            </span>
          </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-amber-700/30 bg-black/40 px-2 py-1">
      <span className="text-[11px] uppercase tracking-wider text-amber-200/60">{label}</span>
      <span className={`text-base font-black tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

async function getApiErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}
