"use client";

import { useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { useDevPanel } from "./useDevPanel";
import { useTurnNotifications } from "./useTurnNotifications";
import { HeroPanel } from "./HeroPanel";
import { PlayersListPanel } from "./PlayersListPanel";
import { CountDialog } from "./townDialogs";
import { TownSummaryTab } from "./TownSummaryTab";
import { TownBuildTab } from "./TownBuildTab";
import { TownBuildTreeModal } from "./TownBuildTreeModal";
import { TownRecruitTab } from "./TownRecruitTab";
import { TownTavernTab } from "./TownTavernTab";
import { TownGarrisonTab } from "./TownGarrisonTab";
import { TownMarketTab } from "./TownMarketTab";
import { TownArtifactsTab } from "./TownArtifactsTab";
import { TownMercenaryTab } from "./TownMercenaryTab";
import { TownCastleGateTab } from "./TownCastleGateTab";
import { TownMageUniversityTab } from "./TownMageUniversityTab";
import { TownBallistaTab } from "./TownBallistaTab";
import {
  TownTabButton,
  TownTabIcon,
  type TownTab,
} from "./icons";
import { ResourceBar, combatInvolvesPlayer } from "./topBar";
import {
  factionLabel,
  getApiErrorMessage,
} from "./helpers";
import {
  addUnitsToLocalStackList,
  getMaxRecruitCount,
  getUpgradeCost,
  multiplyCost,
  removeUnitsFromLocalStackList,
} from "./recruitHelpers";
import { useRouter } from "next/navigation";
import { findActiveCombatTruce } from "@/lib/game/combat/truce";
import { useGameStore } from "@/lib/stores/gameStore";
import { useResponsiveGameLayout } from "@/lib/ui/useResponsiveGameLayout";
import { Faction, BuildingType, UnitType, type Hero } from "@/lib/game/types";
import { HERO_RECRUIT_COST_GOLD, MAX_HEROES_PER_PLAYER } from "@/lib/game/heroes";
import { refreshGameState } from "@/lib/game/refresh";
import {
  UNIT_RULES,
  canAfford,
  formatCost,
  getFactionBuildingRule,
  getFactionBuildingRules,
  getGrowthForBuiltTownBuilding,
  getRecruitableUnitsForFaction,
  subtractCost,
} from "@/lib/game/economy";
import { getTownCenterLevel, hasTownBuilding } from "@/lib/game/town-buildings";
import SidePanel from "./SidePanel";
import CollapsiblePanel from "./CollapsiblePanel";
import MiniMap from "./MiniMap";
import AdventureMusicControl from "./AdventureMusicControl";
import {
  CornerOrnaments,
  FleurDeLis,
  HourglassIcon,
  ParchmentBackground,
  goldText,
  ornateFrame,
  ornateFramePolished,
} from "./theme";

export default function HUD() {
  const gameState = useGameStore((state) => state.gameState);

  if (!gameState) return null;

  return <HUDContent />;
}

function HUDContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const layout = useResponsiveGameLayout();
  const [mobileDrawer, setMobileDrawer] = useState<"heroes" | "towns" | "map" | "players" | "actions" | null>(null);
  const [townTabState, setTownTabState] = useState<{ townId: string | null; tab: TownTab }>({
    townId: null,
    tab: "summary",
  });
  const [hideMissingBuildRequirements, setHideMissingBuildRequirements] = useState(true);
  const [hideBuiltBuildings, setHideBuiltBuildings] = useState(true);
  const [buildTreeTownId, setBuildTreeTownId] = useState<string | null>(null);
  const [hideMissingRecruitRequirements, setHideMissingRecruitRequirements] = useState(true);
  const [garrisonTargetHeroId, setGarrisonTargetHeroId] = useState<string | null>(null);
  const [recruitDialog, setRecruitDialog] = useState<{ townId: string; unitType: UnitType; count: number } | null>(null);
  const [upgradeDialog, setUpgradeDialog] = useState<{ townId: string; heroId?: string; unitType: UnitType; count: number } | null>(null);
  const [transferDialog, setTransferDialog] = useState<{ townId: string; heroId: string; unitType: UnitType; count: number } | null>(null);
  const [returnDialog, setReturnDialog] = useState<{ townId: string; heroId: string; unitType: UnitType; count: number } | null>(null);
  const nullableGameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const selectedTownId = useGameStore((state) => state.selectedTownId);
  const combatMessage = useGameStore((state) => state.combatMessage);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const setGameState = useGameStore((state) => state.setGameState);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const gameState = nullableGameState!;
  const devPanel = useDevPanel(gameState?.id);

  const myPlayer = gameState.players.find(
    (player) => player.userId === session?.user?.id
  );
  const isPending = gameState.status === "PENDING";
  const hasActiveCombats = (gameState.activeCombats ?? []).some((combat) =>
    myPlayer
      ? combatInvolvesPlayer(combat, myPlayer.id) && !findActiveCombatTruce(combat.truces, gameState.turnNumber)
      : false
  );
  const canAct = Boolean(
    myPlayer && gameState.status === "ACTIVE" && myPlayer.isAlive && !myPlayer.hasEndedTurn
  );
  const isWaitingForPlayers = Boolean(
    myPlayer && gameState.status === "ACTIVE" && myPlayer.hasEndedTurn
  );
  const turnNotificationKey = `${gameState.id}:${gameState.turnNumber}:${myPlayer?.hasEndedTurn ? "done" : "ready"}`;

  const allTowns = gameState.players.flatMap((p) => p.towns);

  const selectedHero = myPlayer?.heroes.find((h) => h.id === selectedHeroId);

  const selectedTown = myPlayer?.towns.find((t) => t.id === selectedTownId);

  const selectedTownOwner = gameState.players.find((p) =>
    p.towns.some((town) => town.id === selectedTownId)
  );

  const isMyTown = Boolean(
    selectedTownOwner && myPlayer && selectedTownOwner.id === myPlayer.id
  );
  const heroesAtSelectedTown = selectedTown && myPlayer
    ? myPlayer.heroes.filter((hero) =>
        hero.position.x === selectedTown.position.x &&
        hero.position.y === selectedTown.position.y
      )
    : [];
  const selectedGarrisonTargetHero = heroesAtSelectedTown.find((hero) => hero.id === garrisonTargetHeroId);
  const garrisonTargetHero = selectedGarrisonTargetHero ?? heroesAtSelectedTown[0];
  const townAtSelectedHero = selectedHero
    ? allTowns.find((town) =>
        town.position.x === selectedHero.position.x &&
        town.position.y === selectedHero.position.y
      )
    : undefined;

  const handleLeaveGame = async () => {
    if (!myPlayer || !gameState) return;

    if (myPlayer.turnOrder === 0 || gameState.status !== "PENDING") {
      useGameStore.getState().resetGame();
      router.push("/dashboard");
      return;
    }

    if (!window.confirm("Voulez-vous vraiment quitter cette partie ?")) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/leave`, { method: "POST" });
    if (response.ok) {
      useGameStore.getState().resetGame();
      router.push("/dashboard");
    }
  };

  const handleEndTurn = async () => {
    if (!canAct) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "END_TURN" }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Impossible de finir le tour."));
      return;
    }

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) useGameStore.getState().setGameState(refreshedState);
  };

  const handleCancelEndTurn = async () => {
    if (!isWaitingForPlayers) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CANCEL_END_TURN" }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Impossible d'annuler la fin du tour."));
      return;
    }

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) useGameStore.getState().setGameState(refreshedState);
  };

  const handleStartGame = async () => {
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/start`, {
      method: "POST",
    });

    if (!response.ok) {
      const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
      if (refreshedState && refreshedState.status !== "PENDING") {
        useGameStore.getState().setGameState(refreshedState);
        return;
      }
      setCombatMessage(await getApiErrorMessage(response, "Impossible de demarrer la partie."));
      return;
    }

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) useGameStore.getState().setGameState(refreshedState);
  };

  const handleBuild = async (building: BuildingType) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;

    const townFaction = (((selectedTown as { townType?: string }).townType ?? selectedTown.faction ?? Faction.CASTLE) as Faction);
    const rule = getFactionBuildingRule(townFaction, building);
    if (!rule || !canAfford(myPlayer.resources, rule.cost)) return;
    if (
      building === BuildingType.CAPITOL &&
      myPlayer.towns.some((town) => town.id !== selectedTown.id && town.buildings.includes(BuildingType.CAPITOL))
    ) {
      setCombatMessage("Un seul Capitole est autorisé par joueur.");
      return;
    }

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
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
                  level: getTownCenterLevel([...town.buildings, building]),
                  availableRecruits: addImmediateDwellingGrowth(
                    town.availableRecruits,
                    building,
                    ((town as { townType?: string }).townType ?? town.faction ?? Faction.CASTLE) as Faction
                  ),
                  lastBuiltTurn: gameState.turnNumber,
                }
              : town
          ),
        };
      }),
    });
  };

  const handleBuildBoat = async () => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;
    if (myPlayer.resources.gold < 1000 || myPlayer.resources.wood < 10) {
      setCombatMessage("Ressources insuffisantes pour construire un bateau.");
      return;
    }

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "BUILD_BOAT", townId: selectedTown.id }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Construction du bateau impossible."));
      return;
    }

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
    setCombatMessage("Bateau construit.");
  };

  const handleRecruitHero = async (templateId: string) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;
    if (myPlayer.resources.gold < HERO_RECRUIT_COST_GOLD) {
      setCombatMessage("Or insuffisant pour engager un héros.");
      return;
    }
    if (myPlayer.heroes.length >= MAX_HEROES_PER_PLAYER) {
      setCombatMessage(`Maximum ${MAX_HEROES_PER_PLAYER} héros atteint.`);
      return;
    }
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "RECRUIT_HERO",
        townId: selectedTown.id,
        ...(templateId.startsWith("hero:")
          ? { heroId: templateId.slice("hero:".length) }
          : { templateId }),
      }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Recrutement de héros impossible."));
      return;
    }
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleExchange = async (townId: string, from: keyof import("@/lib/game/types").Resources, to: keyof import("@/lib/game/types").Resources, amount: number) => {
    if (!myPlayer || !canAct || !isMyTown) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "EXCHANGE_RESOURCES", townId, from, to, amount }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Échange impossible."));
      return;
    }
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleBuyArtifact = async (townId: string, heroId: string, artifactId: string) => {
    if (!canAct || !isMyTown) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "BUY_TOWN_ARTIFACT", townId, heroId, artifactId }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Achat d'artefact impossible."));
      return;
    }
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleSellCreatures = async (townId: string, unitType: UnitType, count: number) => {
    if (!canAct || !isMyTown) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SELL_CREATURES", townId, unitType, count }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Vente impossible."));
      return;
    }
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleLearnMagicSchool = async (townId: string, heroId: string, school: "fire_magic" | "water_magic" | "earth_magic" | "air_magic") => {
    if (!canAct || !isMyTown) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "LEARN_MAGIC_SCHOOL", townId, heroId, school }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Apprentissage impossible."));
      return;
    }
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleBuyMachine = async (townId: string, heroId: string, machine: "ballista" | "firstAid" | "ammoCart") => {
    if (!canAct || !isMyTown) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "BUY_WAR_MACHINE", townId, heroId, machine }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Achat impossible."));
      return;
    }
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleCastleGateTransfer = async (fromTownId: string, toTownId: string, unitType: UnitType, count: number) => {
    if (!canAct || !isMyTown) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CASTLE_GATE_TRANSFER", fromTownId, toTownId, unitType, count }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Transfert impossible."));
      return;
    }
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleRecruit = async (unitType: UnitType, count = 1) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;

    const rule = UNIT_RULES[unitType];
    if (!rule) return;

    const available = selectedTown.availableRecruits[unitType] ?? 0;
    const recruitCount = Math.min(
      Math.max(1, Math.floor(count)),
      getMaxRecruitCount(myPlayer.resources, rule.cost, available)
    );
    if (recruitCount <= 0) {
      setCombatMessage("Ressources ou recrues insuffisantes.");
      return;
    }

    const totalCost = multiplyCost(rule.cost, recruitCount);
    if (!canAfford(myPlayer.resources, totalCost)) return;

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "RECRUIT_UNIT",
        townId: selectedTown.id,
        unitType,
        count: recruitCount,
      }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Recrutement impossible."));
      return;
    }

    const nextResources = subtractCost(myPlayer.resources, totalCost);
    setRecruitDialog(null);

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
                  garrison: addUnitsToLocalStackList(town.garrison, unitType, recruitCount, rule.health),
                  availableRecruits: {
                    ...town.availableRecruits,
                    [unitType]: Math.max(0, (town.availableRecruits[unitType] ?? 0) - recruitCount),
                  },
                }
              : town
          ),
        };
      }),
    });
  };

  const handleUpgradeTroops = async (unitType: UnitType, count = 1, sourceHeroId?: string) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;

    const baseEntry = selectedTownRecruitEntries.find((entry) => entry.rule.type === unitType && !entry.upgraded);
    const upgradedEntry = baseEntry
      ? selectedTownRecruitEntries.find((entry) => entry.tier === baseEntry.tier && entry.upgraded)
      : undefined;
    if (!baseEntry || !upgradedEntry || !selectedTown.buildings.includes(upgradedEntry.dwelling)) return;

    const sourceHero = sourceHeroId ? heroesAtSelectedTown.find((hero) => hero.id === sourceHeroId) : undefined;
    const source = sourceHero
      ? sourceHero.armies.find((unit) => unit.unitType === unitType)
      : selectedTown.garrison.find((unit) => unit.unitType === unitType);
    const upgradeCost = getUpgradeCost(baseEntry.rule.cost, upgradedEntry.rule.cost);
    const upgradeCount = Math.min(
      Math.max(1, Math.floor(count)),
      getMaxRecruitCount(myPlayer.resources, upgradeCost, source?.count ?? 0)
    );
    if (upgradeCount <= 0) {
      setCombatMessage("Ressources ou troupes insuffisantes.");
      return;
    }

    const totalCost = multiplyCost(upgradeCost, upgradeCount);
    if (!canAfford(myPlayer.resources, totalCost)) return;

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "UPGRADE_TROOPS",
        townId: selectedTown.id,
        heroId: sourceHeroId,
        unitType,
        count: upgradeCount,
      }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Amelioration impossible."));
      return;
    }

    const nextResources = subtractCost(myPlayer.resources, totalCost);
    setUpgradeDialog(null);

    setGameState({
      ...gameState,
      players: gameState.players.map((player) => {
        if (player.id !== myPlayer.id) return player;
        return {
          ...player,
          resources: nextResources,
          towns: sourceHeroId ? player.towns : player.towns.map((town) =>
            town.id === selectedTown.id
              ? {
                  ...town,
                  garrison: addUnitsToLocalStackList(
                    removeUnitsFromLocalStackList(town.garrison, unitType, upgradeCount, baseEntry.rule.health),
                    upgradedEntry.rule.type,
                    upgradeCount,
                    upgradedEntry.rule.health
                  ),
                }
              : town
          ),
          heroes: sourceHeroId
            ? player.heroes.map((hero) =>
                hero.id === sourceHeroId
                  ? {
                      ...hero,
                      armies: addUnitsToLocalStackList(
                        removeUnitsFromLocalStackList(hero.armies, unitType, upgradeCount, baseEntry.rule.health),
                        upgradedEntry.rule.type,
                        upgradeCount,
                        upgradedEntry.rule.health
                      ),
                    }
                  : hero
              )
            : player.heroes,
        };
      }),
    });
  };

  const handleTransferGarrisonToHero = async (unitType: UnitType, count = 1, targetHero: Hero | undefined = garrisonTargetHero) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown || !targetHero) return;

    const rule = UNIT_RULES[unitType];
    if (!rule) return;
    const source = selectedTown.garrison.find((unit) => unit.unitType === unitType);
    const transferCount = Math.min(Math.max(1, Math.floor(count)), source?.count ?? 0);
    if (transferCount <= 0) return;

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "TRANSFER_GARRISON_TO_HERO",
        townId: selectedTown.id,
        heroId: targetHero.id,
        unitType,
        count: transferCount,
      }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Transfert impossible."));
      return;
    }

    const targetHeroId = targetHero.id;
    setTransferDialog(null);
    setGameState({
      ...gameState,
      players: gameState.players.map((player) => {
        if (player.id !== myPlayer.id) return player;
        return {
          ...player,
          towns: player.towns.map((town) =>
            town.id === selectedTown.id
              ? {
                  ...town,
                  garrison: removeUnitsFromLocalStackList(town.garrison, unitType, transferCount, rule.health),
                }
              : town
          ),
          heroes: player.heroes.map((hero) =>
            hero.id === targetHeroId
              ? {
                  ...hero,
                  armies: addUnitsToLocalStackList(hero.armies, unitType, transferCount, rule.health),
                }
              : hero
          ),
        };
      }),
    });
  };

  const handleTransferHeroToGarrison = async (unitType: UnitType, count = 1, sourceHero: Hero | undefined = garrisonTargetHero) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown || !sourceHero) return;

    const rule = UNIT_RULES[unitType];
    if (!rule) return;
    const source = sourceHero.armies.find((unit) => unit.unitType === unitType);
    const transferCount = Math.min(Math.max(1, Math.floor(count)), source?.count ?? 0);
    if (transferCount <= 0) return;

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "TRANSFER_HERO_TO_GARRISON",
        townId: selectedTown.id,
        heroId: sourceHero.id,
        unitType,
        count: transferCount,
      }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Transfert impossible."));
      return;
    }

    const sourceHeroId = sourceHero.id;
    setReturnDialog(null);
    setGameState({
      ...gameState,
      players: gameState.players.map((player) => {
        if (player.id !== myPlayer.id) return player;
        return {
          ...player,
          towns: player.towns.map((town) =>
            town.id === selectedTown.id
              ? {
                  ...town,
                  garrison: addUnitsToLocalStackList(town.garrison, unitType, transferCount, rule.health),
                }
              : town
          ),
          heroes: player.heroes.map((hero) =>
            hero.id === sourceHeroId
              ? {
                  ...hero,
                  armies: removeUnitsFromLocalStackList(hero.armies, unitType, transferCount, rule.health),
                }
              : hero
          ),
        };
      }),
    });
  };

  const addImmediateDwellingGrowth = (
    stock: Partial<Record<UnitType, number>>,
    building: BuildingType,
    townFaction: Faction
  ) => {
    const growth = getGrowthForBuiltTownBuilding(townFaction, building);
    if (Object.keys(growth).length === 0) return stock;
    const next = { ...stock };
    for (const [unitType, amount] of Object.entries(growth)) {
      next[unitType as UnitType] = (next[unitType as UnitType] ?? 0) + (amount ?? 0);
    }
    return next;
  };

  const turnNotifications = useTurnNotifications({ canAct, isPending, turnNotificationKey });

  const selectedTownFaction = selectedTown
    ? (((selectedTown as { townType?: string }).townType ?? selectedTown.faction ?? "castle") as Faction)
    : Faction.CASTLE;
  const selectedTownBuildingRules = getFactionBuildingRules(selectedTownFaction);
  const selectedTownRecruitEntries = getRecruitableUnitsForFaction(selectedTownFaction);
  const hasPlayerCapitol = Boolean(
    myPlayer?.towns.some((town) => town.buildings.includes(BuildingType.CAPITOL))
  );
  const buildableBuildings = selectedTown
    ? selectedTownBuildingRules.filter((rule) => {
        const alreadyBuilt = selectedTown.buildings.includes(rule.type);
        const missingRequirement = rule.requires?.some(
          (requirement) => !hasTownBuilding(selectedTown.buildings, requirement)
        );
        const blockedByCapitolLimit =
          rule.type === BuildingType.CAPITOL &&
          hasPlayerCapitol &&
          !selectedTown.buildings.includes(BuildingType.CAPITOL);
        return (
          !alreadyBuilt &&
          !missingRequirement &&
          !blockedByCapitolLimit &&
          selectedTown.lastBuiltTurn !== gameState.turnNumber &&
          Boolean(myPlayer && canAfford(myPlayer.resources, rule.cost))
        );
      }).length
    : 0;
  const recruitableUnits = selectedTown
    ? selectedTownRecruitEntries.filter(({ rule, dwelling }) => {
        const hasDwelling = selectedTown.buildings.includes(dwelling);
        const available = selectedTown.availableRecruits[rule.type] ?? 0;
        return hasDwelling && available > 0 && Boolean(myPlayer && canAfford(myPlayer.resources, rule.cost));
      }).length
    : 0;
  const selectedTownFactionForTabs = selectedTown
    ? ((selectedTown.townType ?? selectedTown.faction ?? Faction.CASTLE) as Faction)
    : Faction.CASTLE;
  const artifactMerchantBuildingForFaction =
    selectedTownFactionForTabs === Faction.TOWER
      ? BuildingType.UNIQUE_4
      : selectedTownFactionForTabs === Faction.DUNGEON || selectedTownFactionForTabs === Faction.CONFLUX
      ? BuildingType.UNIQUE_3
      : null;
  const hasArtifactMerchant = Boolean(
    artifactMerchantBuildingForFaction && selectedTown?.buildings.includes(artifactMerchantBuildingForFaction)
  );
  const hasMercenaryGuild =
    selectedTownFactionForTabs === Faction.STRONGHOLD &&
    Boolean(selectedTown?.buildings.includes(BuildingType.UNIQUE_2));
  const hasCastleGate =
    selectedTownFactionForTabs === Faction.INFERNO &&
    Boolean(selectedTown?.buildings.includes(BuildingType.UNIQUE_1));
  const hasMageUniversity =
    selectedTownFactionForTabs === Faction.CONFLUX &&
    Boolean(selectedTown?.buildings.includes(BuildingType.UNIQUE_1));
  const hasBallistaYard =
    selectedTownFactionForTabs === Faction.STRONGHOLD &&
    Boolean(selectedTown?.buildings.includes(BuildingType.UNIQUE_3));

  const townTabs: { id: TownTab; label: string; badge?: number }[] = [
    { id: "summary", label: "Résumé" },
    { id: "build", label: "Construire", badge: buildableBuildings },
    { id: "recruit", label: "Recruter", badge: recruitableUnits },
    { id: "garrison", label: "Garnison", badge: selectedTown?.garrison.length },
    ...(selectedTown?.buildings.includes(BuildingType.TAVERN)
      ? [{ id: "tavern" as const, label: "Taverne", badge: selectedTown.tavernOffer?.length ?? 0 }]
      : []),
    ...(selectedTown?.buildings.includes(BuildingType.MARKET)
      ? [{ id: "market" as const, label: "Marché" }]
      : []),
    ...(hasArtifactMerchant
      ? [{ id: "artifacts" as const, label: "Artefacts", badge: selectedTown?.artifactOffer?.length ?? 0 }]
      : []),
    ...(hasMercenaryGuild
      ? [{ id: "mercenary" as const, label: "Francs-tireurs" }]
      : []),
    ...(hasCastleGate
      ? [{ id: "gate" as const, label: "Porte du château" }]
      : []),
    ...(hasMageUniversity
      ? [{ id: "university" as const, label: "Université de magie" }]
      : []),
    ...(hasBallistaYard
      ? [{ id: "ballista" as const, label: "Cour des balistes" }]
      : []),
  ];
  const activeTownTab = townTabState.townId === selectedTownId ? townTabState.tab : "summary";
  const displayedTownTab = townTabs.some((tab) => tab.id === activeTownTab)
    ? activeTownTab
    : "summary";
  const displayedBuildRules = selectedTown
    ? selectedTownBuildingRules.filter((rule) => {
        if (hideMissingBuildRequirements && rule.requires?.some((requirement) => !hasTownBuilding(selectedTown.buildings, requirement))) {
          return false;
        }
        if (hideBuiltBuildings && selectedTown.buildings.includes(rule.type)) {
          return false;
        }
        return true;
      })
    : selectedTownBuildingRules;
  const displayedRecruitEntries = selectedTown && hideMissingRecruitRequirements
    ? selectedTownRecruitEntries.filter(({ dwelling }) =>
        selectedTown.buildings.includes(dwelling)
      )
    : selectedTownRecruitEntries;
  const getUpgradeOption = (unitType: UnitType, available: number) => {
    if (!selectedTown || !myPlayer) return null;
    const baseEntry = selectedTownRecruitEntries.find((entry) => entry.rule.type === unitType && !entry.upgraded);
    const upgradedEntry = baseEntry
      ? selectedTownRecruitEntries.find((entry) => entry.tier === baseEntry.tier && entry.upgraded)
      : undefined;
    if (!baseEntry || !upgradedEntry || !selectedTown.buildings.includes(upgradedEntry.dwelling)) return null;
    const upgradeCost = getUpgradeCost(baseEntry.rule.cost, upgradedEntry.rule.cost);
    return {
      label: upgradedEntry.rule.label,
      max: getMaxRecruitCount(myPlayer.resources, upgradeCost, available),
    };
  };
  const activeRecruitEntry = selectedTown && displayedTownTab === "recruit" && recruitDialog?.townId === selectedTown.id
    ? selectedTownRecruitEntries.find(({ rule }) => rule.type === recruitDialog.unitType)
    : undefined;
  const activeRecruitAvailable = selectedTown && activeRecruitEntry
    ? selectedTown.availableRecruits[activeRecruitEntry.rule.type] ?? 0
    : 0;
  const activeRecruitMax = myPlayer && activeRecruitEntry
    ? getMaxRecruitCount(myPlayer.resources, activeRecruitEntry.rule.cost, activeRecruitAvailable)
    : 0;
  const activeRecruitCount = Math.min(Math.max(1, recruitDialog?.count ?? 1), Math.max(1, activeRecruitMax));
  const activeUpgradeBaseEntry = selectedTown && upgradeDialog?.townId === selectedTown.id
    ? selectedTownRecruitEntries.find((entry) => entry.rule.type === upgradeDialog.unitType && !entry.upgraded)
    : undefined;
  const activeUpgradeEntry = activeUpgradeBaseEntry
    ? selectedTownRecruitEntries.find((entry) => entry.tier === activeUpgradeBaseEntry.tier && entry.upgraded)
    : undefined;
  const activeUpgradeHero = upgradeDialog?.heroId
    ? heroesAtSelectedTown.find((hero) => hero.id === upgradeDialog.heroId)
    : undefined;
  const activeUpgradeSource = activeUpgradeBaseEntry
    ? activeUpgradeHero
      ? activeUpgradeHero.armies.find((unit) => unit.unitType === activeUpgradeBaseEntry.rule.type)
      : selectedTown?.garrison.find((unit) => unit.unitType === activeUpgradeBaseEntry.rule.type)
    : undefined;
  const activeUpgradeCost = activeUpgradeBaseEntry && activeUpgradeEntry
    ? getUpgradeCost(activeUpgradeBaseEntry.rule.cost, activeUpgradeEntry.rule.cost)
    : {};
  const activeUpgradeMax = myPlayer && activeUpgradeSource
    ? getMaxRecruitCount(myPlayer.resources, activeUpgradeCost, activeUpgradeSource.count)
    : 0;
  const activeUpgradeCount = Math.min(Math.max(1, upgradeDialog?.count ?? 1), Math.max(1, activeUpgradeMax));
  const activeTransferStack = selectedTown && displayedTownTab === "garrison" && transferDialog?.townId === selectedTown.id
    ? selectedTown.garrison.find((unit) => unit.unitType === transferDialog.unitType)
    : undefined;
  const activeTransferHero = activeTransferStack
    ? heroesAtSelectedTown.find((hero) => hero.id === transferDialog?.heroId)
    : undefined;
  const activeTransferMax = activeTransferStack?.count ?? 0;
  const activeTransferCount = Math.min(Math.max(1, transferDialog?.count ?? 1), Math.max(1, activeTransferMax));
  const activeReturnHero = selectedTown && displayedTownTab === "garrison" && returnDialog?.townId === selectedTown.id
    ? heroesAtSelectedTown.find((hero) => hero.id === returnDialog.heroId)
    : undefined;
  const activeReturnStack = activeReturnHero
    ? activeReturnHero.armies.find((unit) => unit.unitType === returnDialog?.unitType)
    : undefined;
  const activeReturnMax = activeReturnStack?.count ?? 0;
  const activeReturnCount = Math.min(Math.max(1, returnDialog?.count ?? 1), Math.max(1, activeReturnMax));
  const isCompactHud = layout.isCompactHud;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="mobile-game-topbar pointer-events-auto absolute left-0 right-0 top-0 border-b-2 border-amber-700/60 bg-gradient-to-b from-[#1a1208] via-[#0e0904] to-[#1a1208] px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.7),inset_0_-1px_0_rgba(252,211,77,0.15)]">
        <div className="relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:gap-3">
          <div className="flex min-w-0 items-center gap-3 justify-self-start text-left">
            <button
              type="button"
              aria-label="Mode DEV"
              className="grid h-7 w-7 shrink-0 place-items-center text-amber-400 drop-shadow outline-none transition hover:text-amber-300 focus-visible:ring-2 focus-visible:ring-amber-300/70"
              onDoubleClick={devPanel.openPassword}
            >
              <FleurDeLis className="h-6 w-6" />
            </button>
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
            <div className="desktop-only">
              <AdventureMusicControl />
            </div>
          </div>

          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 text-center md:block">
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
                  myPlayer?.isAlive === false
                    ? "border-stone-400/50 bg-gradient-to-b from-stone-700/70 to-stone-950 text-stone-100"
                    : canAct
                    ? "border-emerald-300/60 bg-gradient-to-b from-emerald-700/70 to-emerald-950 text-emerald-50"
                    : "border-red-400/40 bg-gradient-to-b from-red-900/60 to-red-950 text-red-100"
                }`}
              >
                {myPlayer?.isAlive === false ? "Défaite" : canAct ? "À vous de jouer" : isWaitingForPlayers ? "Tour terminé" : "Observation"}
              </span>
            )}
          </div>

          <div className="flex min-w-0 items-stretch justify-end gap-2 justify-self-end md:gap-3">
            {myPlayer && <ResourceBar resources={myPlayer.resources} />}
            <button
              className="touch-target flex shrink-0 flex-col items-center justify-center rounded-lg border border-amber-700/50 bg-stone-950/80 px-2 text-amber-200/90 shadow-inner shadow-black/40 transition hover:border-red-400/60 hover:bg-red-950/40 hover:text-red-200 md:px-3"
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
      <div className="desktop-only pointer-events-none absolute right-3 top-[7rem] bottom-3 flex w-64 flex-col gap-3 overflow-hidden">
        <CollapsiblePanel
          title="Carte"
          className={`${ornateFrame} pointer-events-auto shrink-0`}
          bodyClassName=""
        >
          <MiniMap />
        </CollapsiblePanel>
        <PlayersListPanel gameState={gameState} myPlayer={myPlayer} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
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

      {devPanel.overlay}
      {turnNotifications.promptUI}

      {isCompactHud && mobileDrawer && (
        <div className="mobile-hud-drawer pointer-events-auto rounded-xl">
          <div className="flex items-center justify-between border-b border-amber-700/40 px-3 py-2">
            <div className={`text-xs font-black uppercase tracking-[0.18em] ${goldText}`}>
              {mobileDrawer === "heroes" ? "Heros" : mobileDrawer === "towns" ? "Chateaux" : mobileDrawer === "map" ? "Carte" : mobileDrawer === "players" ? "Joueurs" : "Actions"}
            </div>
            <button
              type="button"
              className="touch-target rounded-md border border-amber-700/50 px-3 text-sm font-black text-amber-100"
              onClick={() => setMobileDrawer(null)}
              aria-label="Fermer"
            >
              x
            </button>
          </div>
          <div className="max-h-[calc(min(58dvh,28rem)-3rem)] overflow-y-auto overscroll-contain p-2">
            {mobileDrawer === "map" && <MiniMap />}
            {mobileDrawer === "players" && <PlayersListPanel gameState={gameState} myPlayer={myPlayer} />}
            {mobileDrawer === "actions" && <SidePanel />}
            {(mobileDrawer === "heroes" || mobileDrawer === "towns") && <SidePanel />}
          </div>
        </div>
      )}

      {/* Hero panel */}
      {selectedHero && <HeroPanel hero={selectedHero} townAtHero={townAtSelectedHero} />}

      {/* Town panel */}
      {selectedTown && (
        <CollapsiblePanel
          title={selectedTown.name}
          className={`${ornateFramePolished} mobile-bottom-sheet pointer-events-auto absolute left-4 top-[7rem] flex max-h-[calc(100vh-9rem)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden`}
          bodyClassName="flex min-h-0 flex-1 flex-col"
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
          <div className="border-b border-amber-700/30 px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-amber-200/60">
              {factionLabel(selectedTownFaction)} · Niveau {selectedTown.level}
            </div>
            {!isMyTown && (
              <div className="mt-2 rounded-md border border-red-500/50 bg-red-950/60 px-2 py-1 text-sm text-red-200">
                Ville ennemie ou non contrôlée.
              </div>
            )}
            {isMyTown && selectedTown.lastBuiltTurn === gameState.turnNumber && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-950/60 px-2 py-1 text-sm text-amber-200">
                Construction déjà réalisée aujourd&apos;hui dans ce château.
              </div>
            )}
          </div>

          <div className="mobile-town-tabs flex gap-1.5 overflow-visible border-b border-amber-700/30 px-3 py-2">
            {townTabs.map((tab) => (
              <TownTabButton
                key={tab.id}
                active={displayedTownTab === tab.id}
                badge={tab.badge}
                icon={<TownTabIcon tab={tab.id} />}
                label={tab.label}
                onClick={() => setTownTabState({ townId: selectedTownId, tab: tab.id })}
              />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {displayedTownTab === "summary" && (
              <TownSummaryTab
                selectedTown={selectedTown}
                selectedTownFaction={selectedTownFaction}
                buildableBuildings={buildableBuildings}
                recruitableUnits={recruitableUnits}
                heroesAtSelectedTown={heroesAtSelectedTown}
              />
            )}

            {displayedTownTab === "garrison" && (
              <TownGarrisonTab
                selectedTown={selectedTown}
                isMyTown={isMyTown}
                canAct={canAct}
                isPending={isPending}
                heroesAtSelectedTown={heroesAtSelectedTown}
                garrisonTargetHero={garrisonTargetHero}
                setGarrisonTargetHeroId={setGarrisonTargetHeroId}
                transferDialog={transferDialog}
                setTransferDialog={setTransferDialog}
                returnDialog={returnDialog}
                setReturnDialog={setReturnDialog}
                upgradeDialog={upgradeDialog}
                setUpgradeDialog={setUpgradeDialog}
                getUpgradeOption={getUpgradeOption}
              />
            )}

            {displayedTownTab === "build" && (
              <TownBuildTab
                selectedTown={selectedTown}
                selectedTownFaction={selectedTownFaction}
                displayedBuildRules={displayedBuildRules}
                onOpenBuildTree={() => setBuildTreeTownId(selectedTown.id)}
                hideMissingBuildRequirements={hideMissingBuildRequirements}
                setHideMissingBuildRequirements={setHideMissingBuildRequirements}
                hideBuiltBuildings={hideBuiltBuildings}
                setHideBuiltBuildings={setHideBuiltBuildings}
                gameState={gameState}
                myPlayer={myPlayer}
                hasPlayerCapitol={hasPlayerCapitol}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                onBuild={handleBuild}
                onBuildBoat={handleBuildBoat}
              />
            )}

            {displayedTownTab === "recruit" && (
              <TownRecruitTab
                selectedTown={selectedTown}
                selectedTownFaction={selectedTownFaction}
                displayedRecruitEntries={displayedRecruitEntries}
                hideMissingRecruitRequirements={hideMissingRecruitRequirements}
                setHideMissingRecruitRequirements={setHideMissingRecruitRequirements}
                myPlayer={myPlayer}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                recruitDialog={recruitDialog}
                setRecruitDialog={setRecruitDialog}
              />
            )}

            {displayedTownTab === "tavern" && (
              <TownTavernTab
                selectedTown={selectedTown}
                myPlayer={myPlayer}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                onRecruitHero={handleRecruitHero}
              />
            )}

            {displayedTownTab === "market" && (
              <TownMarketTab
                selectedTown={selectedTown}
                myPlayer={myPlayer}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                onExchange={handleExchange}
              />
            )}

            {displayedTownTab === "artifacts" && (
              <TownArtifactsTab
                selectedTown={selectedTown}
                myPlayer={myPlayer}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                heroesAtSelectedTown={heroesAtSelectedTown}
                onBuyArtifact={handleBuyArtifact}
              />
            )}

            {displayedTownTab === "mercenary" && (
              <TownMercenaryTab
                selectedTown={selectedTown}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                onSellCreatures={handleSellCreatures}
              />
            )}

            {displayedTownTab === "gate" && (
              <TownCastleGateTab
                selectedTown={selectedTown}
                myPlayer={myPlayer}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                onTransferGate={handleCastleGateTransfer}
              />
            )}

            {displayedTownTab === "university" && (
              <TownMageUniversityTab
                selectedTown={selectedTown}
                myPlayer={myPlayer}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                heroesAtSelectedTown={heroesAtSelectedTown}
                onLearnSchool={handleLearnMagicSchool}
              />
            )}

            {displayedTownTab === "ballista" && (
              <TownBallistaTab
                selectedTown={selectedTown}
                myPlayer={myPlayer}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                heroesAtSelectedTown={heroesAtSelectedTown}
                onBuyMachine={handleBuyMachine}
              />
            )}
          </div>
        </CollapsiblePanel>
      )}

      {selectedTown && activeRecruitEntry && recruitDialog?.townId === selectedTown.id && activeRecruitMax > 0 && (
        <CountDialog
          tone="emerald"
          max={activeRecruitMax}
          count={activeRecruitCount}
          onCountChange={(next) => setRecruitDialog({ townId: selectedTown.id, unitType: activeRecruitEntry.rule.type, count: next })}
          onSubmit={() => void handleRecruit(activeRecruitEntry.rule.type, activeRecruitCount)}
          onClose={() => setRecruitDialog(null)}
          footer={<>Total : {formatCost(multiplyCost(activeRecruitEntry.rule.cost, activeRecruitCount))}</>}
          submitLabel="Recruter"
        />
      )}

      {selectedTown && buildTreeTownId === selectedTown.id && (
        <TownBuildTreeModal
          selectedTown={selectedTown}
          selectedTownFaction={selectedTownFaction}
          rules={selectedTownBuildingRules}
          myPlayer={myPlayer}
          gameState={gameState}
          hasPlayerCapitol={hasPlayerCapitol}
          canAct={canAct}
          isPending={isPending}
          isMyTown={isMyTown}
          onBuild={handleBuild}
          onClose={() => setBuildTreeTownId(null)}
        />
      )}

      {selectedTown && activeUpgradeBaseEntry && activeUpgradeEntry && upgradeDialog?.townId === selectedTown.id && activeUpgradeMax > 0 && (
        <CountDialog
          tone="sky"
          max={activeUpgradeMax}
          count={activeUpgradeCount}
          onCountChange={(next) => setUpgradeDialog({ townId: selectedTown.id, heroId: upgradeDialog?.heroId, unitType: activeUpgradeBaseEntry.rule.type, count: next })}
          onSubmit={() => void handleUpgradeTroops(activeUpgradeBaseEntry.rule.type, activeUpgradeCount, upgradeDialog?.heroId)}
          onClose={() => setUpgradeDialog(null)}
          footer={<>Vers : {activeUpgradeEntry.rule.label} | Total : {formatCost(multiplyCost(activeUpgradeCost, activeUpgradeCount)) || "gratuit"}</>}
          submitLabel="Ameliorer"
        />
      )}

      {selectedTown && activeTransferStack && activeTransferHero && transferDialog?.townId === selectedTown.id && activeTransferMax > 0 && (
        <CountDialog
          tone="sky"
          max={activeTransferMax}
          count={activeTransferCount}
          onCountChange={(next) => setTransferDialog({ townId: selectedTown.id, heroId: activeTransferHero.id, unitType: activeTransferStack.unitType, count: next })}
          onSubmit={() => void handleTransferGarrisonToHero(activeTransferStack.unitType, activeTransferCount, activeTransferHero)}
          onClose={() => setTransferDialog(null)}
          footer={<>Vers : {activeTransferHero.name}</>}
          submitLabel="Envoyer"
        />
      )}

      {selectedTown && activeReturnStack && activeReturnHero && returnDialog?.townId === selectedTown.id && activeReturnMax > 0 && (
        <CountDialog
          tone="amber"
          max={activeReturnMax}
          count={activeReturnCount}
          onCountChange={(next) => setReturnDialog({ townId: selectedTown.id, heroId: activeReturnHero.id, unitType: activeReturnStack.unitType, count: next })}
          onSubmit={() => void handleTransferHeroToGarrison(activeReturnStack.unitType, activeReturnCount, activeReturnHero)}
          onClose={() => setReturnDialog(null)}
          footer="Vers : garnison"
          submitLabel="Déposer"
        />
      )}

      {/* Bouton de fin de tour */}
      <div className="desktop-only pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2">
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
                  {p.isAi && <span className="rounded border border-cyan-400/50 px-1 text-[10px] font-black text-cyan-200">IA</span>}
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
              isWaitingForPlayers
                ? "border-stone-400 bg-gradient-to-b from-stone-500 via-stone-700 to-stone-950 text-stone-100 shadow-[0_0_24px_rgba(120,113,108,0.4),inset_0_0_0_2px_rgba(214,211,209,0.24)] hover:-translate-y-0.5 hover:from-stone-400"
                : canAct && !hasActiveCombats
                  ? "border-amber-300 bg-gradient-to-b from-red-600 via-red-800 to-red-950 text-amber-50 shadow-[0_0_30px_rgba(220,38,38,0.5),inset_0_0_0_2px_rgba(252,211,77,0.4)] hover:-translate-y-0.5 hover:from-red-500"
                : "cursor-not-allowed border-stone-700 bg-stone-900 text-stone-500"
            }`}
            disabled={(!canAct && !isWaitingForPlayers) || hasActiveCombats}
            onClick={isWaitingForPlayers ? handleCancelEndTurn : handleEndTurn}
            data-testid="end-turn"
            title={isWaitingForPlayers ? "Annuler la fin du tour" : "Fin du tour"}
          >
            <HourglassIcon className="mx-auto h-9 w-9 drop-shadow" />
            <span className="mt-1 block text-[10px] font-black uppercase tracking-widest">
              {isWaitingForPlayers ? "Annuler" : "Fin tour"}
            </span>
          </button>
          </div>
        )}
      </div>
      <div className="mobile-flex mobile-bottom-nav pointer-events-auto absolute z-30 hidden items-center gap-2 rounded-xl border border-amber-700/55 bg-stone-950/92 p-2 shadow-2xl shadow-black/70 backdrop-blur">
        {(["heroes", "towns", "map", "players", "actions"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`touch-target min-w-0 flex-1 rounded-md border px-1 text-[10px] font-black uppercase tracking-wide ${
              mobileDrawer === item
                ? "border-amber-300 bg-amber-700/30 text-amber-50"
                : "border-amber-800/55 bg-black/35 text-amber-200"
            }`}
            onClick={() => setMobileDrawer((current) => current === item ? null : item)}
          >
            {item === "heroes" ? "Heros" : item === "towns" ? "Villes" : item === "map" ? "Carte" : item === "players" ? "Joueurs" : "Actions"}
          </button>
        ))}
        {!isPending && (
          <button
            className={`touch-target min-w-[4.5rem] rounded-full border-2 px-2 text-[10px] font-black uppercase tracking-wide ${
              isWaitingForPlayers
                ? "border-stone-400 bg-stone-800 text-stone-100"
                : canAct && !hasActiveCombats
                  ? "border-amber-300 bg-red-800 text-amber-50"
                  : "cursor-not-allowed border-stone-700 bg-stone-900 text-stone-500"
            }`}
            disabled={(!canAct && !isWaitingForPlayers) || hasActiveCombats}
            onClick={isWaitingForPlayers ? handleCancelEndTurn : handleEndTurn}
            data-testid="end-turn-mobile"
            title={isWaitingForPlayers ? "Annuler la fin du tour" : "Fin du tour"}
          >
            {isWaitingForPlayers ? "Annuler" : "Fin tour"}
          </button>
        )}
      </div>
    </div>
  );
}
