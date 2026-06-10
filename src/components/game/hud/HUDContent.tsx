"use client";

import { useEffect, useState } from "react";
import { DISPLAY_PREFERENCE_EVENT, getSavedFpsDisplay } from "@/lib/settings/displayPreferences";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { version as APP_VERSION } from "../../../../package.json";
import { ReportBugModal } from "@/components/ReportBugModal";
import { useDevPanel } from "./useDevPanel";
import { useTurnNotifications } from "./useTurnNotifications";
import { useTurnTimer, formatTurnRemaining } from "./useTurnTimer";
import { HeroPanel } from "./HeroPanel";
import { GameOverScreen } from "./GameOverScreen";
import { GameRulesPopup } from "./GameRulesPopup";
import { HudTutorial } from "./HudTutorial";
import { PlayersListPanel } from "./PlayersListPanel";
import { PuzzleMapModal } from "./PuzzleMapModal";
import { PlayerJournalPanel } from "./PlayerJournalPanel";
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
import { TownShopTab } from "./TownShopTab";
import {
  TownTabButton,
  TownTabIcon,
  type TownTab,
} from "./icons";
import { ResourceBar, TURN_SKY_WIDTH, TurnSkyArc, combatInvolvesPlayer } from "./topBar";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedUnitLabel } from "@/lib/i18n/gameLabels";
import {
  buildingTypeLabel,
  factionLabel,
  getApiErrorMessage,
  getGameRulesSeen,
  getTutorialSeen,
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
import { Faction, BuildingType, UnitType, type Hero } from "@/lib/game/types";
import { HERO_RECRUIT_COST_GOLD, MAX_HEROES_PER_PLAYER } from "@/lib/game/heroes";
import { refreshGameState } from "@/lib/game/refresh";
import { normalizeMapLevel } from "@/lib/game/map-levels";
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
import { getTownCenterLevel, hasShipyardBuilding, hasTownBuilding } from "@/lib/game/town-buildings";
import { GRAIL_ARTIFACT_ID, normalizeArtifactBag } from "@/lib/game/artifacts";
import SidePanel from "./SidePanel";
import CollapsiblePanel from "./CollapsiblePanel";
import { KingHealthGauge } from "./gauges";
import MiniMap from "./MiniMap";
import DesktopHudWindows from "./DesktopHudWindows";
import { ActiveCombatsList } from "../combat/ActiveCombatsPanel";
import { useDraggableWindow } from "./useDraggableWindow";
import AdventureMusicControl from "./AdventureMusicControl";
import GameMenuButton, { type GameMenuItem } from "../menu/GameMenuButton";
import OptionsDialog from "../menu/OptionsDialog";
import ConfirmDialog from "../menu/ConfirmDialog";
import {
  CornerOrnaments,
  FleurDeLis,
  HourglassIcon,
  ParchmentBackground,
  goldText,
  ornateFramePolished,
} from "./theme";

export function HUDContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const { t, locale } = useI18n();
  const [mobileDrawer, setMobileDrawer] = useState<"heroes" | "towns" | "map" | "players" | "actions" | null>(null);
  const [mobileActionsTab, setMobileActionsTab] = useState<"mines" | "combats" | "journal">("mines");
  const [townTabState, setTownTabState] = useState<{ townId: string | null; tab: TownTab }>({
    townId: null,
    tab: "summary",
  });
  const [grailPromptDismissedTownId, setGrailPromptDismissedTownId] = useState<string | null>(null);
  const [showBuildableBuildings, setShowBuildableBuildings] = useState(true);
  const [showMissingBuildRequirements, setShowMissingBuildRequirements] = useState(false);
  const [showBuiltBuildings, setShowBuiltBuildings] = useState(false);
  const [buildTreeTownId, setBuildTreeTownId] = useState<string | null>(null);
  const [hideMissingRecruitRequirements, setHideMissingRecruitRequirements] = useState(true);
  const [garrisonTargetHeroId, setGarrisonTargetHeroId] = useState<string | null>(null);
  const [recruitDialog, setRecruitDialog] = useState<{ townId: string; unitType: UnitType; count: number } | null>(null);
  const [upgradeDialog, setUpgradeDialog] = useState<{ townId: string; heroId?: string; unitType: UnitType; count: number } | null>(null);
  const [transferDialog, setTransferDialog] = useState<{ townId: string; heroId: string; unitType: UnitType; count: number } | null>(null);
  const [returnDialog, setReturnDialog] = useState<{ townId: string; heroId: string; unitType: UnitType; count: number } | null>(null);
  // Admin observers can dismiss the end-of-game review to inspect the final board.
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  // One-time welcome popup explaining the game type's rules when the game starts.
  const [rulesDismissed, setRulesDismissed] = useState(false);
  // Guided HUD tutorial: auto-launches once after the rules popup, and can be
  // reopened on demand via the top-bar help button.
  const [tutorialClosed, setTutorialClosed] = useState(false);
  const [tutorialManuallyOpen, setTutorialManuallyOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showFps, setShowFps] = useState(getSavedFpsDisplay);
  const [reportOpen, setReportOpen] = useState(false);

  // Keep the FPS overlay toggle in sync with the Options dialog (and other tabs).
  useEffect(() => {
    const sync = () => setShowFps(getSavedFpsDisplay());
    window.addEventListener(DISPLAY_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISPLAY_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const [confirmQuitOpen, setConfirmQuitOpen] = useState(false);
  const nullableGameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const selectedTownId = useGameStore((state) => state.selectedTownId);
  const combatMessage = useGameStore((state) => state.combatMessage);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const grailPuzzleOpen = useGameStore((state) => state.grailPuzzleOpen);
  const setGrailPuzzleOpen = useGameStore((state) => state.setGrailPuzzleOpen);
  const setGameState = useGameStore((state) => state.setGameState);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const adminObserverMode = useGameStore((state) => state.adminObserverMode);
  const gameState = nullableGameState!;
  const devPanel = useDevPanel(gameState?.id);

  const myPlayer = gameState.players.find(
    (player) => player.userId === session?.user?.id
  );
  const hudStoragePlayerId = myPlayer?.id ?? session?.user?.id;
  const townDraggable = useDraggableWindow({
    storageKey: `my-heroes:hud-window-position:v3:${gameState.id}:${hudStoragePlayerId ?? "viewer"}:selected-town`,
    defaultPosition: { x: 16, y: 112 },
    fallbackSize: { width: 352, height: 520 },
  });
  const isPending = gameState.status === "PENDING";
  const canStartPendingGame = Boolean(myPlayer?.turnOrder === 0 || adminObserverMode);
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

  // One-time rules popup: shown once a seated player reaches an ACTIVE game and
  // hasn't already dismissed it for this seat. Derived at render time (HUDContent
  // only mounts client-side, so the localStorage read is safe and catches the
  // PENDING → ACTIVE transition without a setState-in-effect).
  const showRules = Boolean(
    !rulesDismissed &&
      !adminObserverMode &&
      gameState.status === "ACTIVE" &&
      myPlayer &&
      !getGameRulesSeen(gameState.id, myPlayer.id)
  );

  // The guided tour auto-starts once the rules popup is gone (or already seen),
  // for a seated player who hasn't completed it; the help button forces it open.
  const canShowTutorial = Boolean(!adminObserverMode && gameState.status === "ACTIVE" && myPlayer);
  const autoTutorial = canShowTutorial && !showRules && !tutorialClosed && !getTutorialSeen();
  const showTutorial = canShowTutorial && (tutorialManuallyOpen || autoTutorial);
  const closeTutorial = () => {
    setTutorialManuallyOpen(false);
    setTutorialClosed(true);
  };

  const allTowns = gameState.players.flatMap((p) => p.towns);
  const playersById = new Map(gameState.players.map((player) => [player.id, player]));

  const selectedHero = (adminObserverMode ? gameState.players.flatMap((player) => player.heroes) : myPlayer?.heroes ?? [])
    .find((h) => h.id === selectedHeroId);

  const selectedTown = (adminObserverMode ? allTowns : myPlayer?.towns ?? [])
    .find((t) => t.id === selectedTownId);

  const selectedTownOwner = gameState.players.find((p) =>
    p.towns.some((town) => town.id === selectedTownId)
  );

  const isMyTown = Boolean(
    selectedTownOwner && myPlayer && selectedTownOwner.id === myPlayer.id
  );
  const heroesAtSelectedTown = selectedTown && myPlayer
    ? myPlayer.heroes.filter((hero) =>
        hero.position.x === selectedTown.position.x &&
        hero.position.y === selectedTown.position.y &&
        normalizeMapLevel(hero.position.level) === normalizeMapLevel(selectedTown.position.level)
      )
    : [];
  const selectedGarrisonTargetHero = heroesAtSelectedTown.find((hero) => hero.id === garrisonTargetHeroId);
  const garrisonTargetHero = selectedGarrisonTargetHero ?? heroesAtSelectedTown[0];

  // Grail: a faction Grail structure can be erected only while a hero carrying
  // the dug-up Grail stands in the town, and only once per map.
  const grailAlreadyBuilt = gameState.players.some((player) =>
    player.towns.some((town) => {
      const faction = ((town.townType ?? town.faction ?? Faction.CASTLE) as Faction);
      const rules = getFactionBuildingRules(faction);
      return town.buildings.some((b) => rules.find((r) => r.type === b)?.grail);
    }),
  );
  const grailCarrierAtTown = heroesAtSelectedTown.some((hero) =>
    normalizeArtifactBag(hero.artifacts).inventory.includes(GRAIL_ARTIFACT_ID),
  );
  const grailBuildable = !grailAlreadyBuilt && grailCarrierAtTown;

  // Auto-propose erecting the Grail when a carrier stands in any owned town.
  const grailPromptTown = !grailAlreadyBuilt && myPlayer
    ? myPlayer.towns.find((town) =>
        myPlayer.heroes.some((hero) =>
          hero.position.x === town.position.x &&
          hero.position.y === town.position.y &&
          normalizeMapLevel(hero.position.level) === normalizeMapLevel(town.position.level) &&
          normalizeArtifactBag(hero.artifacts).inventory.includes(GRAIL_ARTIFACT_ID),
        ),
      )
    : undefined;
  const grailPromptFaction = grailPromptTown
    ? ((grailPromptTown.townType ?? grailPromptTown.faction ?? Faction.CASTLE) as Faction)
    : null;
  const grailPromptBuilding = grailPromptFaction
    ? getFactionBuildingRules(grailPromptFaction).find((rule) => rule.grail)?.type ?? null
    : null;
  const showGrailPrompt = Boolean(
    grailPromptTown && grailPromptBuilding && canAct &&
    grailPromptTown.id !== grailPromptDismissedTownId,
  );

  const confirmGrailBuild = async () => {
    if (!gameState || !grailPromptTown || !grailPromptBuilding) return;
    setGrailPromptDismissedTownId(grailPromptTown.id);
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "BUILD", townId: grailPromptTown.id, building: grailPromptBuilding }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, t("hud.buildFailed"), locale));
      return;
    }
    const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshed) setGameState(refreshed);
  };
  const townAtSelectedHero = selectedHero
    ? allTowns.find((town) =>
        town.position.x === selectedHero.position.x &&
        town.position.y === selectedHero.position.y &&
        normalizeMapLevel(town.position.level) === normalizeMapLevel(selectedHero.position.level)
      )
    : undefined;

  const handleLeaveGame = async () => {
    if (!gameState) return;
    const goToDashboard = () => {
      useGameStore.getState().resetGame();
      router.push("/dashboard");
    };

    if (adminObserverMode || !myPlayer) {
      goToDashboard();
      return;
    }

    // Finished games are deleted server-side once every human has left, so we
    // notify the server on the way out (best-effort) before returning.
    if (gameState.status === "COMPLETED" || gameState.status === "ABANDONED") {
      await fetchWithSupabaseAuth(`/api/games/${gameState.id}/leave`, { method: "POST" });
      goToDashboard();
      return;
    }

    if (myPlayer.turnOrder === 0 || gameState.status !== "PENDING") {
      goToDashboard();
      return;
    }

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/leave`, { method: "POST" });
    if (response.ok) goToDashboard();
  };

  const handleEndTurn = async () => {
    if (!canAct) return;
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "END_TURN" }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, t("hud.endTurnFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.cancelEndTurnFailed"), locale));
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
      const refreshedState = await refreshGameState(gameState.id, session?.user?.id, {
        revealMap: devRevealMap || adminObserverMode,
        adminObserver: adminObserverMode,
      });
      if (refreshedState && refreshedState.status !== "PENDING") {
        useGameStore.getState().setGameState(refreshedState);
        return;
      }
      setCombatMessage(await getApiErrorMessage(response, t("hud.startGameFailed"), locale));
      return;
    }

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, {
      revealMap: devRevealMap || adminObserverMode,
      adminObserver: adminObserverMode,
    });
    if (refreshedState) useGameStore.getState().setGameState(refreshedState);
  };

  const handleBuild = async (building: BuildingType) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;

    const townFaction = (((selectedTown as { townType?: string }).townType ?? selectedTown.faction ?? Faction.CASTLE) as Faction);
    const rule = getFactionBuildingRule(townFaction, building);
    if (!rule || !canAfford(myPlayer.resources, rule.cost)) return;
    if (rule.grail && !grailBuildable) {
      setCombatMessage(grailAlreadyBuilt ? t("hud.grailAlreadyBuilt") : t("hud.grailNeeded"));
      return;
    }
    if (
      building === BuildingType.CAPITOL &&
      myPlayer.towns.some((town) => town.id !== selectedTown.id && town.buildings.includes(BuildingType.CAPITOL))
    ) {
      setCombatMessage(t("hud.oneCapitol"));
      return;
    }

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "BUILD", townId: selectedTown.id, building }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, t("hud.buildFailed"), locale));
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

    // The server may generate state the client can't replicate optimistically
    // (tavern hero offer, mage guild spells, artifact merchant offers). Reconcile
    // so freshly-built structures like the Tavern show their content immediately.
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleBuildBoat = async () => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;
    if (myPlayer.resources.gold < 1000 || myPlayer.resources.wood < 10) {
      setCombatMessage(t("hud.boatResourcesInsufficient"));
      return;
    }

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "BUILD_BOAT", townId: selectedTown.id }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, t("hud.boatBuildFailed"), locale));
      return;
    }

    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
    setCombatMessage(t("hud.boatBuilt"));
  };

  const handleRecruitHero = async (templateId: string) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;
    if (myPlayer.resources.gold < HERO_RECRUIT_COST_GOLD) {
      setCombatMessage(t("hud.goldInsufficientHero"));
      return;
    }
    if (myPlayer.heroes.length >= MAX_HEROES_PER_PLAYER) {
      setCombatMessage(t("hud.maxHeroes", { n: MAX_HEROES_PER_PLAYER }));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.heroRecruitFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.exchangeFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.artifactBuyFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.sellFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.learnFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.buyFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.transferFailed"), locale));
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
      setCombatMessage(t("hud.resourcesOrRecruitsInsufficient"));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.recruitFailed"), locale));
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
      setCombatMessage(t("hud.resourcesOrTroopsInsufficient"));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.upgradeFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.transferFailed"), locale));
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
      setCombatMessage(await getApiErrorMessage(response, t("hud.transferFailed"), locale));
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
    const next = { ...stock };
    // Base and upgraded dwellings keep separate, independently-growing recruit
    // pools — building the upgrade just adds its own pool, no migration.
    if (Object.keys(growth).length === 0) return next;
    for (const [unitType, amount] of Object.entries(growth)) {
      next[unitType as UnitType] = (next[unitType as UnitType] ?? 0) + (amount ?? 0);
    }
    return next;
  };

  const turnNotifications = useTurnNotifications({ canAct, isPending, turnNotificationKey });
  // While it's my active turn, the live clock is the game's current-turn start.
  // Once I've ended my turn (waiting), anchor to my own turn's recorded start so
  // the countdown keeps running during the wait instead of disappearing.
  const myTurnStartedAt = canAct ? gameState.currentTurnStartedAt : (myPlayer?.turnStartedAt ?? null);
  const { remainingMs: turnTimerRemainingMs, fraction: turnTimerFraction, hasTimer: hasTurnTimer } = useTurnTimer({
    startedAt: myTurnStartedAt,
    limitSeconds: gameState.turnTimeLimit ?? null,
    active: gameState.status === "ACTIVE" && (canAct || isWaitingForPlayers),
    // Don't auto-end while a combat is active — ending the turn is blocked then.
    canAct: canAct && !hasActiveCombats,
    turnKey: `${gameState.id}:${gameState.turnNumber}:${gameState.currentTurnPlayerId}`,
    onExpire: handleEndTurn,
  });
  const turnTimerUrgent = turnTimerRemainingMs !== null && turnTimerRemainingMs <= 30000;
  const showTurnTimerRing = hasTurnTimer && turnTimerFraction !== null;

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
  // Every faction's Blacksmith forges its own war machine, so any town with a
  // Blacksmith can equip a hero (not just Stronghold).
  const hasBlacksmith = Boolean(selectedTown?.buildings.includes(BuildingType.BLACKSMITH));
  const hasShipyard = Boolean(selectedTown && hasShipyardBuilding(selectedTownFaction, selectedTown.buildings));

  const townTabs: { id: TownTab; label: string; badge?: number }[] = [
    { id: "summary", label: t("town.tabSummary") },
    { id: "build", label: t("build.build"), badge: buildableBuildings },
    { id: "recruit", label: t("recruit.recruit"), badge: recruitableUnits },
    { id: "garrison", label: t("town.tabGarrison"), badge: selectedTown?.garrison.length },
    ...(selectedTown?.buildings.includes(BuildingType.TAVERN)
      ? [{ id: "tavern" as const, label: t("town.tabTavern"), badge: (selectedTown.tavernOffer?.length ?? 0) + (myPlayer?.tavernHeroes?.length ?? 0) }]
      : []),
    ...(selectedTown?.buildings.includes(BuildingType.MARKET)
      ? [{ id: "market" as const, label: t("town.tabMarket") }]
      : []),
    ...(hasArtifactMerchant
      ? [{ id: "artifacts" as const, label: t("hero.tabArtifacts"), badge: selectedTown?.artifactOffer?.length ?? 0 }]
      : []),
    ...(hasMercenaryGuild
      ? [{ id: "mercenary" as const, label: t("town.tabMercenary") }]
      : []),
    ...(hasCastleGate
      ? [{ id: "gate" as const, label: t("town.tabGate") }]
      : []),
    ...(hasMageUniversity
      ? [{ id: "university" as const, label: t("town.tabUniversity") }]
      : []),
    ...(hasBlacksmith || hasShipyard
      ? [{ id: "shop" as const, label: t("town.tabShop") }]
      : []),
  ];
  const activeTownTab = townTabState.townId === selectedTownId ? townTabState.tab : "summary";
  const displayedTownTab = townTabs.some((tab) => tab.id === activeTownTab)
    ? activeTownTab
    : "summary";
  const displayedBuildRules = selectedTown
    ? selectedTownBuildingRules.filter((rule) => {
        const alreadyBuilt = selectedTown.buildings.includes(rule.type);
        // The Grail structure is erected only through the dedicated Grail flow — a
        // hero carrying the dug-up Grail must stand in this town. Keep it out of the
        // normal build list until then (but still show it once built), so it never
        // appears as a buildable option without the Grail.
        if (rule.grail && !grailBuildable && !alreadyBuilt) return false;
        const missingRequirement = rule.requires?.some(
          (requirement) => !hasTownBuilding(selectedTown.buildings, requirement)
        );
        const blockedByCapitolLimit =
          rule.type === BuildingType.CAPITOL &&
          hasPlayerCapitol &&
          !selectedTown.buildings.includes(BuildingType.CAPITOL);
        const isBuildable =
          !alreadyBuilt &&
          !missingRequirement &&
          !blockedByCapitolLimit &&
          selectedTown.lastBuiltTurn !== gameState.turnNumber &&
          Boolean(myPlayer && canAfford(myPlayer.resources, rule.cost));

        if (isBuildable) return showBuildableBuildings;
        if (missingRequirement) return showMissingBuildRequirements;
        if (alreadyBuilt) return showBuiltBuildings;
        return false;
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
      label: localizedUnitLabel(upgradedEntry.rule.type, upgradedEntry.rule.label, locale),
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

  // A finished game replaces the whole HUD with the end-of-game review screen:
  // no more top bar, panels or windows, so heroes/towns/mines can't be selected.
  // Admin observers also get the review (winner + ranking) but can dismiss it
  // to keep inspecting the final board.
  if (gameState.status === "COMPLETED" && (!adminObserverMode || !gameOverDismissed)) {
    return (
      <div className="absolute inset-0 pointer-events-auto">
        <GameOverScreen
          gameState={gameState}
          myPlayer={myPlayer}
          onLeave={handleLeaveGame}
          onDismiss={adminObserverMode ? () => setGameOverDismissed(true) : undefined}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="mobile-game-topbar pointer-events-auto absolute left-0 right-0 top-0 border-b-2 border-amber-700/60 bg-gradient-to-b from-[#1a1208] via-[#0e0904] to-[#1a1208] px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.7),inset_0_-1px_0_rgba(252,211,77,0.15)]">
        <div className="relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:gap-3">
          <div className="flex min-w-0 items-center gap-3 justify-self-start text-left">
            <div className="grid h-7 w-7 shrink-0 place-items-center text-amber-400 drop-shadow">
              <FleurDeLis className="h-6 w-6" />
            </div>
            <div>
              <div className={`whitespace-nowrap text-xl font-black tracking-[0.15em] md:text-2xl ${goldText}`}>
                MY HEROES
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/70 md:text-xs">
                <span>{t("hud.calYear", { n: gameState.calendar.yearNumber })} · {t("hud.calMonth", { n: gameState.calendar.monthOfYear })}</span>
                <span className="mx-1 text-amber-700">◆</span>
                <span>{t("hud.calWeek", { n: gameState.calendar.weekOfMonth })} · {t("hud.calDay", { n: gameState.calendar.dayOfWeek })}</span>
              </div>
            </div>
            {/* Headless: keeps the adventure music engine running; the audio
                controls now live in the Options dialog. */}
            <AdventureMusicControl
              faction={(myPlayer?.faction ?? null) as Faction | null}
              night={isWaitingForPlayers}
              showControl={false}
            />
          </div>

          <div data-tutorial="turn-status" className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0 text-center md:flex">
            {isPending && (
              <span className="inline-flex max-w-[18rem] items-center gap-2 rounded-full border border-amber-400/50 bg-gradient-to-b from-amber-900/60 to-stone-950/80 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.2)]">
                <FleurDeLis className="h-3 w-3 text-amber-300" />
                {t("hud.waiting")}
                <FleurDeLis className="h-3 w-3 text-amber-300" />
              </span>
            )}
            {!isPending && !adminObserverMode && (
              <>
                {gameState.status === "ACTIVE" && (
                  <TurnSkyArc gameState={gameState} faction={(myPlayer?.faction ?? null) as Faction | null} />
                )}
                <span
                  style={gameState.status === "ACTIVE" ? { width: TURN_SKY_WIDTH } : undefined}
                  className={`relative inline-flex items-center justify-center whitespace-nowrap border text-xs font-black uppercase tracking-[0.14em] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_6px_rgba(0,0,0,0.55)] ${
                    gameState.status === "ACTIVE"
                      ? "-mt-px rounded-b-2xl rounded-t-none border-t-0 px-2 py-1.5"
                      : "max-w-[19rem] rounded-full px-4 py-1.5"
                  } ${
                    myPlayer?.isAlive === false
                      ? "border-stone-400/50 bg-gradient-to-b from-stone-600 to-stone-900 text-stone-100"
                      : canAct
                      ? "border-emerald-300/55 bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-800 text-white"
                      : isWaitingForPlayers
                      ? "border-indigo-300/45 bg-gradient-to-b from-indigo-500 via-indigo-600 to-indigo-900 text-indigo-50"
                      : "border-amber-300/45 bg-gradient-to-b from-amber-600 to-amber-900 text-amber-50"
                  }`}
                >
                  {myPlayer?.isAlive === false ? t("gameover.defeat") : canAct ? t("hud.statusYourTurn") : isWaitingForPlayers ? t("hud.turnEnded") : t("hud.statusObservation")}
                </span>
              </>
            )}
          </div>

          <div className="flex min-w-0 items-stretch justify-end gap-2 justify-self-end md:gap-3">
            {adminObserverMode ? (
              <>
                <div
                  className="rounded-lg border border-cyan-400/45 bg-cyan-950/45 px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.18em] text-cyan-100"
                  aria-label={`${t("hud.fps")}: ${devPanel.fpsText}`}
                  title={t("hud.fps")}
                >
                  {devPanel.fpsText}
                </div>
                {gameState.status === "COMPLETED" ? (
                  <button
                    onClick={() => setGameOverDismissed(false)}
                    className="rounded-lg border border-amber-400/55 bg-amber-950/50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-900/50"
                    title={t("hud.viewGameOver")}
                  >
                    {t("hud.gameFinished")}
                  </button>
                ) : (
                  <div className="rounded-lg border border-cyan-400/45 bg-cyan-950/45 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-100">
                    {t("hud.statusObservation")}
                  </div>
                )}
              </>
            ) : myPlayer ? (
              <ResourceBar player={myPlayer} />
            ) : null}
            {showFps && !adminObserverMode && (
              <div
                className="self-center rounded-lg border border-amber-400/45 bg-amber-950/45 px-2.5 py-2 font-mono text-xs font-black uppercase tracking-[0.18em] text-amber-100"
                aria-label={`${t("hud.fps")}: ${devPanel.fpsText}`}
                title={t("hud.fps")}
              >
                {devPanel.fpsText}
              </div>
            )}
            <GameMenuButton
              dataTutorial="menu"
              items={[
                {
                  key: "options",
                  label: t("menu.options"),
                  onClick: () => setOptionsOpen(true),
                  dataTestId: "menu-options",
                },
                ...(!isPending && !adminObserverMode && myPlayer
                  ? [
                      {
                        key: "help",
                        label: t("menu.help"),
                        onClick: () => setTutorialManuallyOpen(true),
                        dataTestId: "hud-help-button",
                      } satisfies GameMenuItem,
                    ]
                  : []),
                {
                  key: "report",
                  label: t("dashboard.report.button"),
                  onClick: () => setReportOpen(true),
                  dataTestId: "menu-report",
                },
                {
                  key: "quit",
                  label: t("menu.quit"),
                  tone: "danger",
                  onClick: () => setConfirmQuitOpen(true),
                  dataTestId: "menu-quit",
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Desktop floating windows: map, players, and tabbed overview */}
      <DesktopHudWindows gameId={gameState.id} playerId={hudStoragePlayerId} />

      {combatMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-auto rounded-2xl border border-yellow-400/40 bg-[#080714]/90 px-6 py-4 text-center shadow-2xl shadow-yellow-950/40 backdrop-blur-xl">
          <div className="text-yellow-200 font-bold">{combatMessage}</div>
          <button
            className="mt-2 text-sm text-gray-300 hover:text-white"
            onClick={() => setCombatMessage(null)}
          >
            {t("common.close")}
          </button>
        </div>
      )}

      {devPanel.overlay}
      {turnNotifications.promptUI}

      {showRules && myPlayer && (
        <GameRulesPopup gameState={gameState} myPlayer={myPlayer} onDismiss={() => setRulesDismissed(true)} />
      )}

      {grailPuzzleOpen && gameState.grailHint && !gameState.grailHint.dug && (
        <PuzzleMapModal
          hint={gameState.grailHint}
          map={gameState.map}
          onClose={() => setGrailPuzzleOpen(false)}
        />
      )}

      <OptionsDialog open={optionsOpen} onClose={() => setOptionsOpen(false)} />

      {reportOpen && (
        <ReportBugModal
          onClose={() => setReportOpen(false)}
          fetchWithAuth={fetchWithSupabaseAuth}
          t={t}
          locale={locale}
          appVersion={APP_VERSION}
          extraContext={{
            Partie: gameState.id,
            Tour: String(gameState.turnNumber),
            Statut: gameState.status,
            Faction: myPlayer?.faction ?? "—",
            Joueurs: String(gameState.players.length),
            Carte: `${gameState.map.width}x${gameState.map.height}`,
          }}
        />
      )}

      <ConfirmDialog
        open={confirmQuitOpen}
        eyebrow={t("hud.menu")}
        title={t("menu.quitTitle")}
        description={t("menu.confirmQuit")}
        confirmLabel={t("menu.quit")}
        onConfirm={() => {
          setConfirmQuitOpen(false);
          void handleLeaveGame();
        }}
        onCancel={() => setConfirmQuitOpen(false)}
      />

      {showTutorial && (
        <HudTutorial
          heroId={myPlayer?.heroes[0]?.id}
          townId={myPlayer?.towns[0]?.id}
          onClose={closeTutorial}
        />
      )}

      {mobileDrawer && (
        <div className="mobile-hud-drawer pointer-events-auto rounded-xl" data-testid="mobile-hud-drawer">
          <div className="flex items-center justify-between border-b border-amber-700/40 px-3 py-2">
            <div className={`text-xs font-black uppercase tracking-[0.18em] ${goldText}`}>
              {mobileDrawer === "heroes" ? t("hud.navHeroes") : mobileDrawer === "towns" ? t("hud.navTowns") : mobileDrawer === "map" ? t("hud.navMap") : mobileDrawer === "players" ? t("hud.navPlayers") : t("hud.navTracking")}
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
            {mobileDrawer === "heroes" && <SidePanel mode="heroes" />}
            {mobileDrawer === "towns" && <SidePanel mode="towns" />}
            {mobileDrawer === "actions" && myPlayer && (
              <div className="flex min-h-0 flex-col">
                <div className="mb-2 grid grid-cols-3 gap-1">
                  {([
                    ["mines", "Mines"],
                    ["combats", "Combats"],
                    ["journal", "Journal"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`touch-target rounded-md border px-2 text-[10px] font-black uppercase tracking-wide ${
                        mobileActionsTab === id
                          ? "border-amber-300 bg-amber-500 text-stone-950"
                          : "border-amber-800/55 bg-black/30 text-amber-200"
                      }`}
                      onClick={() => setMobileActionsTab(id)}
                      aria-pressed={mobileActionsTab === id}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {mobileActionsTab === "mines" && <SidePanel mode="mines" />}
                {mobileActionsTab === "combats" && <ActiveCombatsList />}
                {mobileActionsTab === "journal" && <PlayerJournalPanel entries={gameState.actionLog} player={myPlayer} playersById={playersById} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero panel */}
      {selectedHero && <HeroPanel hero={selectedHero} townAtHero={townAtSelectedHero} readOnly={adminObserverMode} storagePlayerId={hudStoragePlayerId} />}

      {/* Town panel */}
      {selectedTown && (
        <CollapsiblePanel
          title={selectedTown.name}
          testId="hud-town-panel"
          className={`${ornateFramePolished} mobile-bottom-sheet pointer-events-auto absolute left-4 top-[7rem] flex max-h-[calc(100vh-9rem)] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden`}
          bodyClassName="flex min-h-0 flex-1 flex-col"
          dragHandleProps={townDraggable.isEnabled ? townDraggable.dragHandleProps : undefined}
          onResetPosition={townDraggable.isEnabled ? townDraggable.resetPosition : undefined}
          rootRef={townDraggable.ref}
          style={townDraggable.style}
          right={
              <button
                className="rounded text-amber-300/60 transition hover:text-amber-100"
                onClick={() => useGameStore.getState().selectTown(null)}
                aria-label={t("common.close")}
              >
                ✕
              </button>
            }
        >
          <div className="border-b border-amber-700/30 px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-amber-200/60">
              {t("hud.townHeader", { faction: factionLabel(selectedTownFaction, locale), level: selectedTown.level })}
            </div>
            {(() => {
              const kingStack = selectedTown.garrison.find((stack) => stack.unitType === UnitType.KING);
              return kingStack ? (
                <div className="mt-2">
                  <KingHealthGauge health={kingStack.health} maxHealth={kingStack.maxHealth} />
                </div>
              ) : null;
            })()}
            {!isMyTown && (
              <div className="mt-2 rounded-md border border-red-500/50 bg-red-950/60 px-2 py-1 text-sm text-red-200">
                {t("hud.enemyTown")}
              </div>
            )}
            {isMyTown && selectedTown.lastBuiltTurn === gameState.turnNumber && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-950/60 px-2 py-1 text-sm text-amber-200">
                {t("hud.alreadyBuiltToday")}
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
                showBuildableBuildings={showBuildableBuildings}
                setShowBuildableBuildings={setShowBuildableBuildings}
                showMissingBuildRequirements={showMissingBuildRequirements}
                setShowMissingBuildRequirements={setShowMissingBuildRequirements}
                showBuiltBuildings={showBuiltBuildings}
                setShowBuiltBuildings={setShowBuiltBuildings}
                gameState={gameState}
                myPlayer={myPlayer}
                hasPlayerCapitol={hasPlayerCapitol}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                onBuild={handleBuild}
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

            {displayedTownTab === "shop" && (
              <TownShopTab
                selectedTown={selectedTown}
                selectedTownFaction={selectedTownFaction}
                myPlayer={myPlayer}
                canAct={canAct}
                isPending={isPending}
                isMyTown={isMyTown}
                heroesAtSelectedTown={heroesAtSelectedTown}
                hasBlacksmith={hasBlacksmith}
                gameState={gameState}
                onBuyMachine={handleBuyMachine}
                onBuildBoat={handleBuildBoat}
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
          footer={<>{t("hud.total", { cost: formatCost(multiplyCost(activeRecruitEntry.rule.cost, activeRecruitCount)) })}</>}
          submitLabel={t("recruit.recruit")}
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
          grailBuildable={grailBuildable}
          onBuild={handleBuild}
          onClose={() => setBuildTreeTownId(null)}
        />
      )}

      {showGrailPrompt && grailPromptTown && grailPromptBuilding && grailPromptFaction && (
        <div className="pointer-events-auto fixed inset-0 z-[1000] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className={`${ornateFramePolished} w-[min(28rem,calc(100vw-2rem))] p-5 text-amber-50`}>
            <h2 className={`text-lg font-black ${goldText}`}>{t("grail.buildPromptTitle")}</h2>
            <p className="mt-3 text-sm leading-snug text-amber-100/90">
              {t("grail.buildPromptBody", {
                building: buildingTypeLabel(grailPromptBuilding, grailPromptFaction, locale),
                town: grailPromptTown.name,
              })}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void confirmGrailBuild()}
                className="flex-1 rounded-md border border-emerald-300/70 bg-gradient-to-b from-emerald-600 to-emerald-800 px-3 py-2 text-sm font-black text-emerald-50 transition hover:from-emerald-500 hover:to-emerald-700"
              >
                {t("grail.buildConfirm")}
              </button>
              <button
                type="button"
                onClick={() => setGrailPromptDismissedTownId(grailPromptTown.id)}
                className="flex-1 rounded-md border border-amber-700/50 bg-black/35 px-3 py-2 text-sm font-bold text-amber-100 transition hover:border-amber-300"
              >
                {t("grail.buildLater")}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTown && activeUpgradeBaseEntry && activeUpgradeEntry && upgradeDialog?.townId === selectedTown.id && activeUpgradeMax > 0 && (
        <CountDialog
          tone="sky"
          max={activeUpgradeMax}
          count={activeUpgradeCount}
          onCountChange={(next) => setUpgradeDialog({ townId: selectedTown.id, heroId: upgradeDialog?.heroId, unitType: activeUpgradeBaseEntry.rule.type, count: next })}
          onSubmit={() => void handleUpgradeTroops(activeUpgradeBaseEntry.rule.type, activeUpgradeCount, upgradeDialog?.heroId)}
          onClose={() => setUpgradeDialog(null)}
          footer={<>{t("hud.upgradeFooter", { name: localizedUnitLabel(activeUpgradeEntry.rule.type, activeUpgradeEntry.rule.label, locale), cost: formatCost(multiplyCost(activeUpgradeCost, activeUpgradeCount)) || t("hud.free") })}</>}
          submitLabel={t("hud.upgrade")}
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
          footer={<>{t("hud.toward", { name: activeTransferHero.name })}</>}
          submitLabel={t("hud.send")}
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
          footer={t("hud.towardGarrison")}
          submitLabel={t("hud.deposit")}
        />
      )}

      {/* Bouton de fin de tour */}
      <div className={
        isPending
          ? "pointer-events-auto absolute left-1/2 top-1/2 z-30 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2"
          : "desktop-only pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2"
      }>
        {isPending ? (
          <div className={`${ornateFramePolished} relative w-full p-5 text-center`} data-testid="pending-lobby-panel">
            <CornerOrnaments />
            <ParchmentBackground />
            <div className={`text-sm font-black uppercase tracking-[0.2em] ${goldText}`}>{t("hud.waitingRoom")}</div>
            <div className="mt-2 flex flex-col gap-1">
              {gameState.players.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-gray-200 font-medium">{p.name || t("common.player")}</span>
                  {p.isAi && <span className="rounded border border-cyan-400/50 px-1 text-[10px] font-black text-cyan-200">{t("common.ai")}</span>}
                  {p.turnOrder === 0 && <span className="text-xs text-yellow-400">{t("hud.host")}</span>}
                </div>
              ))}
              {gameState.players.length < (gameState.maxPlayers ?? 8) && (
                <div className="text-gray-500 text-xs mt-1">
                  {t("hud.freeSlots", { n: (gameState.maxPlayers ?? 8) - gameState.players.length })}
                </div>
              )}
            </div>
            {canStartPendingGame ? (
              <>
                <div className="mt-3 text-xs text-amber-200/60">{t("hud.startGameHint")}</div>
                <button
                  className="mt-3 rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 px-6 py-2 font-black uppercase tracking-widest text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] hover:from-emerald-500 hover:to-emerald-700"
                  onClick={handleStartGame}
                  data-testid="start-game"
                >
                  {t("hud.startGame")}
                </button>
              </>
            ) : (
              <div className="mt-4 text-sm text-amber-200/60">{t("hud.waitingForHost")}</div>
            )}
          </div>
        ) : !adminObserverMode ? (
          <div className="text-center">
          {hasActiveCombats && canAct && (
            <div className="mb-2 rounded-md border border-amber-500/50 bg-amber-950/80 px-3 py-1 text-sm font-bold text-amber-200">
              {t("hud.finishCombatsFirst")}
            </div>
          )}
          <button
            className={`group relative h-24 w-24 rounded-full border-4 transition ${
              isWaitingForPlayers
                ? "border-stone-400 bg-gradient-to-b from-stone-500 via-stone-700 to-stone-950 text-stone-100 shadow-[0_0_24px_rgba(120,113,108,0.4),inset_0_0_0_2px_rgba(214,211,209,0.24)] hover:-translate-y-0.5 hover:from-stone-400"
                : canAct && !hasActiveCombats
                  ? "border-amber-300 bg-gradient-to-b from-red-600 via-red-800 to-red-950 text-amber-50 shadow-[0_0_30px_rgba(220,38,38,0.5),inset_0_0_0_2px_rgba(252,211,77,0.4)] hover:-translate-y-0.5 hover:from-red-500"
                : "cursor-not-allowed border-stone-700 bg-stone-900 text-stone-500"
            } ${showTurnTimerRing ? "!border-2 !border-black/45 shadow-[0_0_28px_rgba(0,0,0,0.45)]" : ""}`}
            disabled={(!canAct && !isWaitingForPlayers) || hasActiveCombats}
            onClick={isWaitingForPlayers ? handleCancelEndTurn : handleEndTurn}
            data-testid="end-turn"
            data-tutorial="end-turn"
            title={isWaitingForPlayers ? t("hud.cancelEndTurn") : t("hud.endTurn")}
          >
            {/* Glossy top-light sheen for a polished, three-dimensional bead. */}
            <span className="pointer-events-none absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.32),rgba(255,255,255,0.05)_42%,transparent_62%)]" />
            {showTurnTimerRing && (
              <svg
                aria-hidden
                viewBox="0 0 100 100"
                className="pointer-events-none absolute -inset-[5px] h-[calc(100%+10px)] w-[calc(100%+10px)] -rotate-90"
              >
                <defs>
                  <linearGradient id="turnRingGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={turnTimerUrgent ? "#fee2e2" : "#fef3c7"} />
                    <stop offset="48%" stopColor={turnTimerUrgent ? "#f87171" : "#fbbf24"} />
                    <stop offset="100%" stopColor={turnTimerUrgent ? "#dc2626" : "#d97706"} />
                  </linearGradient>
                  <filter id="turnRingGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* Depleted track. */}
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="5.5" />
                {/* Remaining-time arc. */}
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="url(#turnRingGrad)"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 44}
                  strokeDashoffset={2 * Math.PI * 44 * (1 - (turnTimerFraction ?? 0))}
                  filter="url(#turnRingGlow)"
                  className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${turnTimerUrgent ? "animate-pulse" : ""}`}
                />
              </svg>
            )}
            {hasTurnTimer && turnTimerRemainingMs !== null ? (
              <span
                title={t("hud.turnTimeRemaining", { time: formatTurnRemaining(turnTimerRemainingMs) })}
                className={`relative block font-mono text-lg font-black tabular-nums leading-none tracking-tight [text-shadow:_0_1px_4px_rgba(0,0,0,0.65)] ${turnTimerUrgent ? "animate-pulse text-red-100" : "text-amber-50"}`}
              >
                {formatTurnRemaining(turnTimerRemainingMs)}
              </span>
            ) : (
              <HourglassIcon className="relative mx-auto h-9 w-9 drop-shadow" />
            )}
            <span className="relative mt-1 block text-[10px] font-black uppercase tracking-[0.18em] [text-shadow:_0_1px_2px_rgba(0,0,0,0.6)]">
              {isWaitingForPlayers ? t("common.cancel") : t("hud.endTurnShort")}
            </span>
          </button>
          </div>
        ) : null}
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
            data-testid={`mobile-nav-${item}`}
          >
            {item === "heroes" ? t("hud.navHeroes") : item === "towns" ? t("hud.navTowns") : item === "map" ? t("hud.navMap") : item === "players" ? t("hud.navPlayers") : t("hud.navTracking")}
          </button>
        ))}
        {!isPending && !adminObserverMode && (
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
            title={isWaitingForPlayers ? t("hud.cancelEndTurn") : t("hud.endTurn")}
          >
            {isWaitingForPlayers ? t("common.cancel") : t("hud.endTurnShort")}
          </button>
        )}
      </div>
    </div>
  );
}
