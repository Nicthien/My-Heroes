"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
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
} from "@/lib/game/economy";

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
    <div className="flex gap-3 text-sm">
      <span title="Or" className="text-yellow-400">{resources.gold} Or</span>
      <span title="Bois" className="text-amber-600">{resources.wood} Bois</span>
      <span title="Minerai" className="text-gray-400">{resources.ore} Min.</span>
      <span title="Mercure" className="text-purple-400">{resources.mercury} Merc.</span>
      <span title="Cristaux" className="text-cyan-400">{resources.crystals} Crist.</span>
      <span title="Soufre" className="text-yellow-600">{resources.sulfur} Soufre</span>
    </div>
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

    if (!response.ok) return;

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id);
    if (refreshedState) useGameStore.getState().setGameState(refreshedState);
  };

  const handleStartGame = async () => {
    const response = await fetch(`/api/games/${gameState.id}/start`, {
      method: "POST",
    });

    if (!response.ok) return;

    const updatedGame = await response.json();
    useGameStore.getState().setGameState({
      ...gameState,
      status: "ACTIVE",
      currentTurnPlayerId: updatedGame.currentTurnPlayerId,
    });
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

    if (!response.ok) return;

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

    if (!response.ok) return;

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
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

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
      <div className="absolute top-0 left-0 right-0 bg-black/70 p-2 pointer-events-auto">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <span className="text-white font-bold text-lg">My Heroes</span>
            <span className="text-gray-300">
              Année {gameState.calendar.yearNumber}, Mois {gameState.calendar.monthOfYear}, Semaine {gameState.calendar.weekOfMonth}, Jour {gameState.calendar.dayOfWeek}
            </span>
            {isPending && (
              <span className="px-2 py-0.5 rounded text-sm font-bold bg-yellow-800 text-yellow-200">
                En attente de joueurs
              </span>
            )}
            {!isPending && (
              <span
                className={`px-2 py-0.5 rounded text-sm font-bold ${
                  canAct
                    ? "bg-green-700 text-green-200"
                    : "bg-red-900 text-red-300"
                }`}
              >
                {canAct ? "À vous de jouer" : isWaitingForPlayers ? "En attente des autres joueurs" : "Observation"}
              </span>
            )}
          </div>
          {myPlayer && <ResourceBar resources={myPlayer.resources} />}
          <button
            className="text-gray-300 hover:text-red-400 text-sm font-bold px-2 py-1 rounded hover:bg-white/10 transition"
            onClick={handleLeaveGame}
            title={myPlayer?.turnOrder !== 0 && isPending ? "Quitter la partie" : "Retour au dashboard"}
          >
            {myPlayer?.turnOrder !== 0 && isPending ? "Quitter" : "Retour"}
          </button>
        </div>
      </div>

      {/* Player list */}
      <div className="absolute top-12 right-2 pointer-events-auto">
        <div className="bg-black/70 rounded-lg p-2 space-y-1 text-sm min-w-48">
          {[...gameState.players]
            .sort((a, b) => {
              if (a.id === myPlayer?.id) return -1;
              if (b.id === myPlayer?.id) return 1;
              return a.turnOrder - b.turnOrder;
            })
            .map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2 py-1 rounded ${
                   p.id === myPlayer?.id ? "bg-white/10" : ""
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full border border-white/20"
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
      </div>

      {combatMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-auto rounded-lg border border-yellow-700/70 bg-black/85 px-5 py-3 text-center shadow-xl">
          <div className="text-yellow-200 font-bold">{combatMessage}</div>
          <button
            className="mt-2 text-sm text-gray-300 hover:text-white"
            onClick={() => setCombatMessage(null)}
          >
            Fermer
          </button>
        </div>
      )}

      {canAct && !isPending && notificationPermission === "default" && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-auto rounded-lg border border-green-500/70 bg-green-950/90 px-6 py-3 text-center shadow-xl shadow-green-900/40">
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
        <div className="absolute bottom-16 left-4 bg-black/80 rounded-lg p-4 pointer-events-auto min-w-64 border border-yellow-700/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-bold text-lg">{selectedHero.name}</h3>
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
            <div className={`px-2 py-0.5 rounded ${
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
            <div className="mt-2 border-t border-gray-700 pt-2">
              <div className="text-gray-400 text-xs mb-1">Armée</div>
              <div className="grid grid-cols-2 gap-1">
                {selectedHero.armies.map((unit) => (
                  <div key={unit.id} className="text-white text-sm bg-gray-800/50 px-1.5 py-0.5 rounded">
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
        <div className="absolute bottom-16 right-4 bg-black/80 rounded-lg p-4 pointer-events-auto w-[28rem] max-h-[70vh] overflow-y-auto border border-yellow-700/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-bold text-lg">{selectedTown.name}</h3>
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
          <div className="mt-4 border-t border-gray-700 pt-3">
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
                  <div key={rule.type} className="bg-gray-900/80 rounded p-2">
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

          <div className="mt-4 border-t border-gray-700 pt-3">
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
                  <div key={rule.type} className="bg-gray-900/80 rounded p-2">
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
          <div className="bg-black/80 border border-yellow-700/60 rounded-lg p-4 text-center min-w-80">
            <div className="text-yellow-200 font-bold">Partie en attente</div>
            <div className="text-gray-300 text-sm mt-1">
              {gameState.players.length} joueur(s). Tu peux démarrer pour tester en solo.
            </div>
            <button
              className="mt-3 bg-green-700 hover:bg-green-600 text-white px-6 py-2 rounded font-bold"
              onClick={handleStartGame}
            >
              Démarrer la partie
            </button>
          </div>
        ) : (
          <div className="text-center">
          {hasActiveCombats && canAct && (
            <div className="mb-2 rounded bg-yellow-950/90 px-3 py-1 text-sm font-bold text-yellow-200">
              Terminez les combats en cours avant de finir le tour.
            </div>
          )}
          <button
            className={`px-8 py-3 rounded-lg font-bold text-lg transition ${
              canAct && !hasActiveCombats
                ? "bg-red-700 hover:bg-red-600 text-white shadow-lg shadow-red-900/50"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
            disabled={!canAct || hasActiveCombats}
            onClick={handleEndTurn}
          >
            {isWaitingForPlayers ? "Tour terminé" : "Fin du tour"}
          </button>
          </div>
        )}
      </div>
    </div>
  );
}
