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
  UNIT_RULES,
  canAfford,
  formatCost,
  subtractCost,
  RESOURCE_BUILDING_RULES,
} from "@/lib/game/economy";

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
    inferno: "Enfer",
    necropolis: "Nécropole",
    dungeon: "Donjon",
    stronghold: "Bastion",
    fortress: "Forteresse",
  };
  return labels[f] || f;
}

function unitTypeLabel(u: string): string {
  const labels: Record<string, string> = {
    pikeman: "Piquier",
    halberdier: "Hallebardier",
    archer: "Archer",
    marksman: "Tireur d'élite",
    griffin: "Griffon",
    royal_griffin: "Griffon royal",
    swordsman: "Épéiste",
    crusader: "Croisé",
    monk: "Moine",
    zealot: "Zélote",
    cavalier: "Cavalier",
    champion: "Champion",
    angel: "Ange",
    archangel: "Archange",
  };
  return labels[u] || u;
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
    <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3 xl:text-sm">
      {RESOURCE_ITEMS.map((item) => (
        <span
          key={item.key}
          title={`${item.label} : ${resources[item.key]}`}
          className={`group flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/70 px-2 py-1 ${item.text} shadow-lg ${item.glow} backdrop-blur transition hover:-translate-y-0.5 hover:border-white/25 xl:px-2.5`}
        >
          <ResourceIcon item={item} />
          <span className="font-extrabold tabular-nums text-white">{resources[item.key]}</span>
          <span className="truncate font-semibold text-current/90">{item.short}</span>
        </span>
      ))}
    </div>
  );
}

function ResourceIcon({ item }: { item: ResourceItem }) {
  return (
    <span
      className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br ${item.bg} ring-1 ${item.ring} shadow-inner`}
      aria-hidden="true"
    >
      <Image
        src={item.src}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]"
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
                  availableRecruits: addImmediateDwellingGrowth(town.availableRecruits, building),
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

    const rule = UNIT_RULES.find((item) => item.type === unitType);
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
    building: BuildingType
  ) => {
    const unitRule = UNIT_RULES.find((item) => item.dwelling === building);
    if (!unitRule) return stock;
    return {
      ...stock,
      [unitRule.type]: (stock[unitRule.type] ?? 0) + unitRule.growth,
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
      <div className="absolute top-0 left-0 right-0 border-b border-white/10 bg-[#070712]/85 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur-xl pointer-events-auto">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="min-w-0 justify-self-start text-left">
            <div className="whitespace-nowrap bg-gradient-to-r from-amber-200 via-white to-cyan-200 bg-clip-text text-xl font-black tracking-wide text-transparent drop-shadow md:text-2xl">
              My Heroes
            </div>
            <div className="text-xs font-medium leading-snug text-slate-300 md:text-sm">
              <div>Année {gameState.calendar.yearNumber}, Mois {gameState.calendar.monthOfYear}</div>
              <div>Semaine {gameState.calendar.weekOfMonth}, Jour {gameState.calendar.dayOfWeek}</div>
            </div>
          </div>

          <div className="justify-self-center text-center">
            {isPending && (
              <span className="inline-flex max-w-[18rem] rounded-full border border-yellow-400/30 bg-yellow-500/15 px-4 py-2 text-sm font-bold text-yellow-100 shadow-lg shadow-yellow-900/30">
                En attente de joueurs
              </span>
            )}
            {!isPending && (
              <span
                className={`inline-flex max-w-[19rem] rounded-full border px-4 py-2 text-sm font-bold leading-snug shadow-lg ${
                  canAct
                    ? "border-emerald-300/30 bg-emerald-500/20 text-emerald-100 shadow-emerald-900/30"
                    : "border-red-300/30 bg-red-500/15 text-red-200 shadow-red-950/30"
                }`}
              >
                {canAct ? "À vous de jouer" : isWaitingForPlayers ? "Tour terminé" : "Observation"}
              </span>
            )}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-3 justify-self-end">
            {myPlayer && <ResourceBar resources={myPlayer.resources} />}
            <button
              className="shrink-0 rounded-full border border-white/10 px-3 py-2 text-sm font-bold leading-tight text-slate-300 transition hover:border-red-300/40 hover:bg-red-500/10 hover:text-red-200"
              onClick={handleLeaveGame}
              title={myPlayer?.turnOrder !== 0 && isPending ? "Quitter la partie" : "Retour au dashboard"}
            >
              <span className="block">{myPlayer?.turnOrder !== 0 && isPending ? "Quitter" : "Retour"}</span>
              <span className="block text-[0.65rem] font-semibold text-slate-500">menu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Player list */}
      <div className="absolute top-24 right-3 pointer-events-auto">
        <div className="min-w-56 space-y-1 rounded-2xl border border-white/10 bg-[#070712]/80 p-2 text-sm shadow-2xl shadow-black/40 backdrop-blur-xl">
          {[...gameState.players]
            .sort((a, b) => {
              if (a.id === myPlayer?.id) return -1;
              if (b.id === myPlayer?.id) return 1;
              return a.turnOrder - b.turnOrder;
            })
            .map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 transition ${
                  p.id === myPlayer?.id ? "bg-white/10 shadow-inner shadow-white/5" : "hover:bg-white/5"
                }`}
              >
                <div
                  className="h-3 w-3 rounded-full border border-white/40 shadow-lg"
                  style={{ backgroundColor: p.color }}
                />
                <span className={p.isAlive ? "text-white" : "text-gray-500 line-through"}>
                  {p.name}
                </span>
                {p.id === myPlayer?.id && (
                  <span className="text-green-400 text-xs font-bold">(Vous)</span>
                )}
                <span className="text-gray-400 text-xs ml-auto">
                  {p.hasEndedTurn ? "Terminé" : "Actif"} | {p.heroes.length}H {p.towns.length}T
                </span>
              </div>
            ))}
        </div>
        {myPlayer && myPlayer.resourceBuildings.length > 0 && (
          <div className="mt-2 min-w-56 rounded-2xl border border-white/10 bg-[#070712]/80 p-2 text-sm shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="text-yellow-200 font-bold text-xs mb-1">Mines contrôlées</div>
            {myPlayer.resourceBuildings.map((b) => {
              const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === b.type);
              const label = rule ? rule.label : b.type;
              const prod = rule ? Object.entries(rule.production).map(([k, v]) => `+${v} ${k}`).join(", ") : "";
              return (
                <div key={b.id} className="flex items-center justify-between text-xs text-gray-300 py-0.5">
                  <span>{label}</span>
                  <span className="text-yellow-300">{prod}/sem.</span>
                </div>
              );
            })}
          </div>
        )}
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
        <div className="absolute bottom-16 left-4 min-w-72 rounded-2xl border border-amber-400/30 bg-[#070712]/85 p-5 pointer-events-auto shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-black text-white drop-shadow">{selectedHero.name}</h3>
            <button
              className="text-gray-400 hover:text-white text-sm"
              onClick={() => useGameStore.getState().selectHero(null)}
            >
              X
            </button>
          </div>
          <div className="text-gray-300 text-sm">
            Niveau {selectedHero.level} | XP : {selectedHero.experience}
          </div>
          <div className="grid grid-cols-2 gap-1 text-sm mt-2">
            <span className="text-red-400">ATT : {selectedHero.stats.attack}</span>
            <span className="text-blue-400">DÉF : {selectedHero.stats.defense}</span>
            <span className="text-purple-400">PUI : {selectedHero.stats.spellPower}</span>
            <span className="text-cyan-400">SAV : {selectedHero.stats.knowledge}</span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm">
            <div className={`rounded-lg px-3 py-1 font-bold shadow-lg ${
              selectedHero.movement > 5
                ? "bg-green-900 text-green-300"
                : selectedHero.movement > 0
                ? "bg-yellow-900 text-yellow-300"
                : "bg-red-900 text-red-300"
            }`}>
              MVT : {selectedHero.movement}/{selectedHero.maxMovement}
            </div>
          </div>
          {selectedHero.armies.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="text-gray-400 text-xs mb-1">Armée</div>
              <div className="grid grid-cols-2 gap-1">
                {selectedHero.armies.map((unit) => (
                  <div key={unit.id} className="rounded-lg border border-white/5 bg-slate-900/80 px-2 py-1 text-sm text-white shadow-inner shadow-white/5">
                    <span className="text-gray-400 text-xs">{unitTypeLabel(unit.unitType)}</span>
                    <span className="ml-1 font-bold">{unit.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Town panel */}
      {selectedTown && (
        <div className="absolute bottom-16 right-4 w-[28rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-2xl border border-amber-400/30 bg-[#070712]/85 p-5 pointer-events-auto shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-black text-white drop-shadow">{selectedTown.name}</h3>
            <button
              className="text-gray-400 hover:text-white text-sm"
              onClick={() => useGameStore.getState().selectTown(null)}
            >
              X
            </button>
          </div>
          <div className="text-gray-300 text-sm">
            {factionLabel(selectedTown.faction as Faction)} | Niveau {selectedTown.level}
          </div>
          {!isMyTown && (
            <div className="mt-2 rounded bg-red-950/70 px-2 py-1 text-sm text-red-200">
              Ville ennemie ou non contrôlée.
            </div>
          )}
          {selectedTown.buildings.length > 0 && (
            <div className="mt-2">
              <div className="text-gray-400 text-xs mb-1">Bâtiments</div>
              <div className="flex flex-wrap gap-1">
                {selectedTown.buildings.map((b, i) => (
                  <span key={i} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                    {buildingTypeLabel(b)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {isMyTown && selectedTown.lastBuiltTurn === gameState.turnNumber && (
            <div className="mt-2 rounded bg-yellow-950/70 px-2 py-1 text-sm text-yellow-200">
              Construction déjà réalisée aujourd&apos;hui dans ce château.
            </div>
          )}
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="text-yellow-200 font-bold mb-2">Construire</div>
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
                  <div key={rule.type} className="rounded-xl border border-white/5 bg-slate-950/70 p-3 shadow-inner shadow-white/5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-white text-sm font-bold">{rule.label}</div>
                        <div className="text-gray-400 text-xs">{rule.description}</div>
                        <div className="text-yellow-400 text-xs mt-1">
                          {formatCost(rule.cost)}
                        </div>
                        {missingRequirement && (
                          <div className="text-red-300 text-xs mt-1">
                            Prérequis manquant : {buildingTypeLabel(missingRequirement)}
                          </div>
                        )}
                      </div>
                      <button
                        className={`px-3 py-1 rounded text-sm font-bold ${
                          disabled
                            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                            : "bg-blue-700 hover:bg-blue-600 text-white"
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

          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="text-yellow-200 font-bold mb-2">Recruter</div>
            <div className="space-y-2">
              {UNIT_RULES.map((rule) => {
                const hasDwelling = selectedTown.buildings.includes(rule.dwelling);
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
                  <div key={rule.type} className="rounded-xl border border-white/5 bg-slate-950/70 p-3 shadow-inner shadow-white/5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-white text-sm font-bold">{rule.label}</div>
                        <div className="text-gray-400 text-xs">
                          PV {rule.health} | {formatCost(rule.cost)} / unité
                        </div>
                        {hasDwelling && (
                          <div className="text-green-300 text-xs mt-1">
                            Disponible cette semaine : {available}
                          </div>
                        )}
                        {!hasDwelling && (
                          <div className="text-red-300 text-xs mt-1">
                            Prérequis manquant : {buildingTypeLabel(rule.dwelling)}
                          </div>
                        )}
                      </div>
                      <button
                        className={`px-3 py-1 rounded text-sm font-bold ${
                          disabled
                            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                            : "bg-green-700 hover:bg-green-600 text-white"
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
      )}

      {/* Bouton de fin de tour */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
        {isPending ? (
          <div className="min-w-80 rounded-2xl border border-yellow-400/40 bg-[#070712]/85 p-5 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="text-yellow-200 font-bold">Salle d&apos;attente</div>
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
                className="mt-4 bg-green-700 hover:bg-green-600 text-white px-6 py-2 rounded font-bold"
                onClick={handleStartGame}
                data-testid="start-game"
              >
                Démarrer la partie
              </button>
            ) : (
              <div className="mt-4 text-gray-400 text-sm">En attente que l&apos;hôte démarre la partie…</div>
            )}
          </div>
        ) : (
          <div className="text-center">
          {hasActiveCombats && canAct && (
            <div className="mb-2 rounded bg-yellow-950/90 px-3 py-1 text-sm font-bold text-yellow-200">
              Terminez les combats en cours avant de finir le tour.
            </div>
          )}
          <button
            className={`rounded-2xl px-10 py-4 text-xl font-black transition ${
              canAct && !hasActiveCombats
                ? "bg-gradient-to-br from-red-500 to-red-800 text-white shadow-2xl shadow-red-900/60 hover:-translate-y-0.5 hover:from-red-400 hover:to-red-700"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
            disabled={!canAct || hasActiveCombats}
            onClick={handleEndTurn}
            data-testid="end-turn"
          >
            {isWaitingForPlayers ? "Tour terminé" : "Fin du tour"}
          </button>
          </div>
        )}
      </div>
    </div>
  );
}

async function getApiErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}
