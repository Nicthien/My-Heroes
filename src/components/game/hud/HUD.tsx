"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/stores/gameStore";
import { Resources, Faction, BuildingType, UnitStack, UnitType, type CombatBoardUnit, type Hero } from "@/lib/game/types";
import { HERO_RECRUIT_COST_GOLD, MAX_HEROES_PER_PLAYER } from "@/lib/game/heroes";
import { refreshGameState } from "@/lib/game/refresh";
import { UNIT_RULES as COMBAT_UNIT_RULES } from "@/lib/game/units";
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
import {
  UnitSilhouette,
  getUnitModel,
  getUnitPalette,
} from "@/components/game/combat/CombatScreen";
import SidePanel from "./SidePanel";
import CollapsiblePanel from "./CollapsiblePanel";
import MiniMap from "./MiniMap";
import {
  CornerOrnaments,
  FleurDeLis,
  HourglassIcon,
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
  { key: "gems", label: "Gemmes", short: "Gem.", src: "/assets/sprites/resources/gems.svg", text: "text-pink-100", ring: "ring-pink-300/50", glow: "shadow-pink-400/30", bg: "from-pink-200 to-rose-700" },
  { key: "sulfur", label: "Soufre", short: "Soufre", src: "/assets/sprites/resources/sulfur.svg", text: "text-amber-100", ring: "ring-amber-300/40", glow: "shadow-amber-500/25", bg: "from-orange-300 to-yellow-700" },
] as const;

const NOTIFICATION_PROMPT_DISMISSED_KEY = "my-heroes:notifications:prompt-dismissed";

type ResourceItem = (typeof RESOURCE_ITEMS)[number];
type TownTab = "summary" | "build" | "recruit" | "garrison" | "tavern";

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
    conflux: "Conflux",
  };
  return labels[f] || f;
}

function unitTypeLabel(u: string): string {
  return UNIT_RULES[u as UnitType]?.label ?? u;
}

function buildingTypeLabel(building: string, faction: Faction = Faction.CASTLE): string {
  const factionRule = getFactionBuildingRule(faction, building);
  if (factionRule) return factionRule.label;
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
    <div className="grid w-[clamp(21rem,34vw,27rem)] grid-cols-[1.15fr_repeat(3,1fr)] grid-rows-2 gap-1.5 text-xs xl:text-sm">
      {RESOURCE_ITEMS.map((item) => {
        const isGold = item.key === "gold";

        return (
          <span
            key={item.key}
            title={`${item.label} : ${resources[item.key]}`}
            className={`group flex items-center rounded-lg border border-amber-700/50 bg-gradient-to-b from-stone-900 to-black shadow-[inset_0_0_0_1px_rgba(252,211,77,0.12)] transition hover:-translate-y-0.5 hover:border-amber-400/70 ${
              isGold
                ? "row-span-2 flex-col justify-center gap-1.5 px-2 py-2"
                : "min-h-[2.35rem] justify-between gap-2 px-2 py-1 xl:px-2.5"
            }`}
          >
            <ResourceIcon item={item} size={isGold ? "lg" : "sm"} />
            <span className={`font-black tabular-nums text-amber-100 drop-shadow ${isGold ? "text-lg xl:text-xl" : ""}`}>
              {resources[item.key]}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ResourceIcon({ item, size = "sm" }: { item: ResourceItem; size?: "sm" | "lg" }) {
  const sizeClass = size === "lg" ? "h-8 w-8" : "h-6 w-6";
  const imageSize = size === "lg" ? 32 : 24;

  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${item.bg} ring-1 ${item.ring} shadow-inner ${sizeClass}`}
      aria-hidden="true"
    >
      <Image
        src={item.src}
        alt=""
        width={imageSize}
        height={imageSize}
        className={`${sizeClass} object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]`}
      />
    </span>
  );
}

function UnitSprite({ unitType, side = "attacker", size = "sm" }: { unitType: UnitType; side?: "attacker" | "defender"; size?: "xs" | "sm" }) {
  const rule = COMBAT_UNIT_RULES[unitType];
  const unit: CombatBoardUnit = {
    id: `preview-${unitType}`,
    unitType,
    count: 1,
    health: rule?.health ?? 1,
    maxHealth: rule?.health ?? 1,
    position: 0,
    side,
    ownerPlayerId: null,
    heroId: null,
    participantId: null,
    joinsRound: 1,
    q: 0,
    r: 0,
    speed: rule?.speed ?? 4,
    minDamage: rule?.minDamage ?? 1,
    maxDamage: rule?.maxDamage ?? 1,
    ranged: rule?.ranged ?? false,
    shots: rule?.shots ?? 0,
    hasRetaliated: false,
    defended: false,
    waited: false,
  };
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const frameSize = size === "xs" ? "h-10 w-10" : "h-12 w-12";
  const spriteSize = size === "xs" ? "h-[42px] w-[32px]" : "h-[52px] w-[40px]";

  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black shadow-inner shadow-black/50 ${frameSize}`}>
      <span
        className={`block drop-shadow-[0_5px_5px_rgba(0,0,0,0.55)] ${spriteSize}`}
        style={{ transform: side === "defender" ? "scaleX(-1)" : undefined }}
      >
        <UnitSilhouette kind={model} palette={palette} ranged={unit.ranged} />
      </span>
    </span>
  );
}

function TownTabButton({
  active,
  badge,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  badge?: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group relative flex h-9 w-12 shrink-0 items-center justify-center rounded-md border px-2 outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/70 ${
        active
          ? "border-amber-300/80 bg-gradient-to-b from-amber-700/45 to-amber-950/70 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.22)]"
          : "border-amber-800/50 bg-black/35 text-amber-300/75 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)] hover:border-amber-500/60 hover:bg-amber-950/35 hover:text-amber-100"
      }`}
    >
      <span className="grid h-5 w-5 place-items-center" aria-hidden="true">
        {icon}
      </span>
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-amber-500/60 bg-amber-950 px-1 text-[10px] font-black leading-none text-amber-100">
          {badge}
        </span>
      )}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-amber-600/60 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-amber-100 opacity-0 shadow-lg shadow-black/50 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

function TownTabIcon({ tab }: { tab: TownTab }) {
  const common = "h-5 w-5";
  switch (tab) {
    case "summary":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      );
    case "build":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <path d="M5 21V8l7-5 7 5v13" />
          <path d="M9 21v-6h6v6" />
          <path d="M10 10h4" />
        </svg>
      );
    case "recruit":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </svg>
      );
    case "garrison":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="M9 12l2 2 4-5" />
        </svg>
      );
    case "tavern":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 22h8" />
          <path d="M12 11v11" />
          <path d="M7 3h10l-1 8a4 4 0 0 1-8 0L7 3Z" />
        </svg>
      );
  }
}

function TransferToHeroIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h11" />
      <path d="m12 8 4 4-4 4" />
      <circle cx="7" cy="7" r="3" />
      <path d="M2.5 20a4.5 4.5 0 0 1 9 0" />
    </svg>
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
  const [showDevPassword, setShowDevPassword] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [devPassword, setDevPassword] = useState("");
  const [devPasswordError, setDevPasswordError] = useState<string | null>(null);
  const [townTabState, setTownTabState] = useState<{ townId: string | null; tab: TownTab }>({
    townId: null,
    tab: "summary",
  });
  const [hideMissingBuildRequirements, setHideMissingBuildRequirements] = useState(true);
  const [garrisonTargetHeroId, setGarrisonTargetHeroId] = useState<string | null>(null);
  const lastNotifiedTurnRef = useRef<string | null>(null);
  const {
    gameState: nullableGameState,
    selectedHeroId,
    selectedTownId,
    combatMessage,
    setCombatMessage,
    setGameState,
    devRevealMap,
    setDevRevealMap,
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

  const allHeroes = gameState.players.flatMap((p) => p.heroes);
  const allTowns = gameState.players.flatMap((p) => p.towns);

  const selectedHero = allHeroes.find((h) => h.id === selectedHeroId);

  const selectedTown = allTowns.find((t) => t.id === selectedTownId);

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
      body: JSON.stringify({ type: "RECRUIT_HERO", townId: selectedTown.id, templateId }),
    });
    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Recrutement de héros impossible."));
      return;
    }
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
    if (refreshedState) setGameState(refreshedState);
  };

  const handleRecruit = async (unitType: UnitType) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown) return;

    const rule = UNIT_RULES[unitType];
    if (!rule || !canAfford(myPlayer.resources, rule.cost)) return;

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
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
                  garrison: addUnitsToLocalStackList(town.garrison, unitType, 1, rule.health),
                  availableRecruits: {
                    ...town.availableRecruits,
                    [unitType]: Math.max(0, (town.availableRecruits[unitType] ?? 0) - 1),
                  },
                }
              : town
          ),
        };
      }),
    });
  };

  const handleTransferGarrisonToHero = async (unitType: UnitType, targetHero: Hero | undefined = garrisonTargetHero) => {
    if (!selectedTown || !myPlayer || !canAct || !isMyTown || !targetHero) return;

    const rule = UNIT_RULES[unitType];
    if (!rule) return;

    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "TRANSFER_GARRISON_TO_HERO",
        townId: selectedTown.id,
        heroId: targetHero.id,
        unitType,
        count: 1,
      }),
    });

    if (!response.ok) {
      setCombatMessage(await getApiErrorMessage(response, "Transfert impossible."));
      return;
    }

    const targetHeroId = targetHero.id;
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
                  garrison: removeUnitsFromLocalStackList(town.garrison, unitType, 1, rule.health),
                }
              : town
          ),
          heroes: player.heroes.map((hero) =>
            hero.id === targetHeroId
              ? {
                  ...hero,
                  armies: addUnitsToLocalStackList(hero.armies, unitType, 1, rule.health),
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

  const openDevPassword = () => {
    setDevPassword("");
    setDevPasswordError(null);
    setShowDevPassword(true);
  };

  const unlockDevPanel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (devPassword === "godmode") {
      setShowDevPassword(false);
      setShowDevPanel(true);
      setDevPassword("");
      setDevPasswordError(null);
      return;
    }
    setDevPasswordError("Mauvais mot de passe.");
  };

  const setDevReveal = async (reveal: boolean) => {
    setDevRevealMap(reveal);
    const refreshedState = await refreshGameState(gameState.id, session?.user?.id, { revealMap: reveal });
    if (refreshedState) setGameState(refreshedState);
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

  const selectedTownFaction = selectedTown
    ? (((selectedTown as { townType?: string }).townType ?? selectedTown.faction ?? "castle") as Faction)
    : Faction.CASTLE;
  const selectedTownBuildingRules = getFactionBuildingRules(selectedTownFaction);
  const selectedTownRecruitEntries = getRecruitableUnitsForFaction(selectedTownFaction);
  const buildableBuildings = selectedTown
    ? selectedTownBuildingRules.filter((rule) => {
        const alreadyBuilt = selectedTown.buildings.includes(rule.type);
        const missingRequirement = rule.requires?.some(
          (requirement) => !selectedTown.buildings.includes(requirement)
        );
        return (
          !alreadyBuilt &&
          !missingRequirement &&
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
  const townTabs: { id: TownTab; label: string; badge?: number }[] = [
    { id: "summary", label: "Résumé" },
    { id: "build", label: "Construire", badge: buildableBuildings },
    { id: "recruit", label: "Recruter", badge: recruitableUnits },
    { id: "garrison", label: "Garnison", badge: selectedTown?.garrison.length },
    ...(selectedTown?.buildings.includes(BuildingType.TAVERN)
      ? [{ id: "tavern" as const, label: "Taverne", badge: selectedTown.tavernOffer?.length ?? 0 }]
      : []),
  ];
  const activeTownTab = townTabState.townId === selectedTownId ? townTabState.tab : "summary";
  const displayedTownTab = townTabs.some((tab) => tab.id === activeTownTab)
    ? activeTownTab
    : "summary";
  const displayedBuildRules = selectedTown && hideMissingBuildRequirements
    ? selectedTownBuildingRules.filter((rule) =>
        !rule.requires?.some((requirement) => !selectedTown.buildings.includes(requirement))
      )
    : selectedTownBuildingRules;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="pointer-events-auto absolute left-0 right-0 top-0 border-b-2 border-amber-700/60 bg-gradient-to-b from-[#1a1208] via-[#0e0904] to-[#1a1208] px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.7),inset_0_-1px_0_rgba(252,211,77,0.15)]">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-3 justify-self-start text-left">
            <button
              type="button"
              aria-label="Mode DEV"
              className="grid h-7 w-7 shrink-0 place-items-center text-amber-400 drop-shadow outline-none transition hover:text-amber-300 focus-visible:ring-2 focus-visible:ring-amber-300/70"
              onDoubleClick={openDevPassword}
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
        <CollapsiblePanel
          title="Carte"
          className={`${ornateFrame} pointer-events-auto shrink-0`}
          bodyClassName=""
        >
          <MiniMap />
        </CollapsiblePanel>
        <CollapsiblePanel
          title="Joueurs"
          className={`${ornateFrame} pointer-events-auto shrink-0`}
          bodyClassName="space-y-0.5 px-2 py-2 text-sm"
        >
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
        </CollapsiblePanel>
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

      {showDevPassword && (
        <div className="pointer-events-auto absolute left-1/2 top-24 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-amber-500/60 bg-stone-950/95 p-4 text-amber-100 shadow-2xl shadow-black/70">
          <div className={`text-sm font-black uppercase tracking-[0.2em] ${goldText}`}>Mode dieu</div>
          <div className={goldDivider + " my-3"} />
          <form onSubmit={unlockDevPanel} className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-200/80">
              Mot de passe
              <input
                autoFocus
                type="password"
                value={devPassword}
                onChange={(event) => {
                  setDevPassword(event.target.value);
                  setDevPasswordError(null);
                }}
                className="mt-2 w-full rounded-md border border-amber-700/50 bg-black/70 px-3 py-2 text-sm text-amber-50 outline-none ring-0 transition focus:border-amber-300"
              />
            </label>
            {devPasswordError && <div className="text-xs font-bold text-red-300">{devPasswordError}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-stone-600 bg-stone-900 px-3 py-2 text-xs font-black uppercase tracking-wider text-stone-200 transition hover:border-stone-400"
                onClick={() => setShowDevPassword(false)}
              >
                Fermer
              </button>
              <button
                type="submit"
                className="rounded-md border border-amber-400/70 bg-amber-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-stone-950 transition hover:bg-amber-300"
              >
                Entrer
              </button>
            </div>
          </form>
        </div>
      )}

      {showDevPanel && (
        <div className="pointer-events-auto absolute left-3 top-24 z-50 w-72 rounded-xl border border-amber-500/60 bg-stone-950/95 p-4 text-amber-100 shadow-2xl shadow-black/70">
          <div className="flex items-center justify-between gap-3">
            <div className={`text-sm font-black uppercase tracking-[0.2em] ${goldText}`}>Mode DEV</div>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md border border-amber-700/50 text-sm font-black text-amber-200 transition hover:border-amber-300"
              onClick={() => setShowDevPanel(false)}
              aria-label="Fermer le mode DEV"
            >
              X
            </button>
          </div>
          <div className={goldDivider + " my-3"} />
          <div className="space-y-2">
            <button
              type="button"
              className="w-full rounded-md border border-amber-400/70 bg-amber-500 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-stone-950 transition hover:bg-amber-300 disabled:cursor-default disabled:border-emerald-400/50 disabled:bg-emerald-900/70 disabled:text-emerald-100"
              onClick={() => void setDevReveal(true)}
              disabled={devRevealMap}
            >
              {devRevealMap ? "Brouillard supprime" : "Supprimer le brouillard"}
            </button>
            <button
              type="button"
              className="w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-amber-100 transition hover:border-amber-300"
              onClick={() => void setDevReveal(false)}
            >
              Remettre le brouillard
            </button>
            <a
              href="/dev/sprites"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-md border border-amber-700/50 bg-stone-900 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-amber-100 transition hover:border-amber-300"
            >
              Galerie des sprites
            </a>
          </div>
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
        <CollapsiblePanel
          title={selectedHero.name}
          className={`${ornateFramePolished} pointer-events-auto absolute left-4 top-[7rem] w-80 max-w-[calc(100vw-2rem)]`}
          bodyClassName="space-y-3 p-4"
          right={
              <button
                className="rounded text-amber-300/60 transition hover:text-amber-100"
                onClick={(event) => {
                  event.stopPropagation();
                  useGameStore.getState().selectHero(null);
                }}
                aria-label="Fermer"
              >
                ✕
              </button>
            }
          >
            <div className="text-xs uppercase tracking-wider text-amber-200/60">
              Niveau {selectedHero.level} · XP {selectedHero.experience}
            </div>
            {townAtSelectedHero && (
              <button
                type="button"
                className="w-full rounded-md border border-sky-500/40 bg-sky-950/50 px-3 py-2 text-left text-sm text-sky-100 transition hover:border-sky-300/70 hover:bg-sky-900/60"
                onClick={() => useGameStore.getState().selectTown(townAtSelectedHero.id)}
              >
                Au château : <span className="font-black">{townAtSelectedHero.name}</span>
              </button>
            )}
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
                      className="flex items-center gap-2 rounded-md border border-amber-700/40 bg-black/50 px-2 py-1 text-sm"
                    >
                      <UnitSprite unitType={unit.unitType} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-amber-200/70">{unitTypeLabel(unit.unitType)}</span>
                      <span className="font-black text-amber-100">{unit.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </CollapsiblePanel>
      )}

      {/* Town panel */}
      {selectedTown && (
        <CollapsiblePanel
          title={selectedTown.name}
          className={`${ornateFramePolished} pointer-events-auto absolute left-4 top-[7rem] flex max-h-[calc(100vh-9rem)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden`}
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

          <div className="flex gap-1.5 overflow-visible border-b border-amber-700/30 px-3 py-2">
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
              <div className="space-y-4">
                <div>
                  <div className={`mb-2 text-xs font-black uppercase tracking-[0.2em] ${goldText}`}>Bâtiments</div>
                  {selectedTown.buildings.length === 0 ? (
                    <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">Aucun bâtiment.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {selectedTown.buildings.map((b, i) => (
                        <span key={i} className="rounded-md border border-amber-700/40 bg-black/50 px-2 py-0.5 text-[11px] text-amber-200/90">
                          {buildingTypeLabel(b, selectedTownFaction)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md border border-amber-700/30 bg-black/40 px-2 py-2">
                    <div className="text-lg font-black text-amber-100">{buildableBuildings}</div>
                    <div className="text-amber-200/60">constructible</div>
                  </div>
                  <div className="rounded-md border border-amber-700/30 bg-black/40 px-2 py-2">
                    <div className="text-lg font-black text-amber-100">{recruitableUnits}</div>
                    <div className="text-amber-200/60">recrutable</div>
                  </div>
                  <div className="rounded-md border border-amber-700/30 bg-black/40 px-2 py-2">
                    <div className="text-lg font-black text-amber-100">{selectedTown.garrison.length}</div>
                    <div className="text-amber-200/60">garnison</div>
                  </div>
                </div>
                {heroesAtSelectedTown.length > 0 && (
                  <div className="rounded-md border border-sky-500/40 bg-sky-950/50 px-3 py-2 text-sm text-sky-100">
                    <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-sky-200/70">
                      Héros au château
                    </div>
                    <div className="space-y-1">
                      {heroesAtSelectedTown.map((hero) => (
                        <button
                          key={hero.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-sky-400/20 bg-black/30 px-2 py-1 text-left transition hover:border-sky-300/60 hover:bg-sky-900/50"
                          onClick={() => useGameStore.getState().selectHero(hero.id)}
                        >
                          <span className="truncate font-black">{hero.name}</span>
                          <span className="shrink-0 text-xs text-sky-200/70">
                            {hero.armies.length} stack{hero.armies.length > 1 ? "s" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {displayedTownTab === "garrison" && (
              <div className="space-y-2">
                {isMyTown && heroesAtSelectedTown.length === 0 && (
                  <div className="rounded-md border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-200">
                    Aucun héros au château pour recevoir la garnison.
                  </div>
                )}
                {isMyTown && heroesAtSelectedTown.length > 0 && (
                  <div className="rounded-md border border-sky-500/30 bg-sky-950/40 px-3 py-2">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-sky-200/70">
                      Envoyer vers
                      <select
                        className="mt-2 w-full rounded-md border border-sky-500/40 bg-black/60 px-2 py-1.5 text-sm font-bold text-sky-50 outline-none transition focus:border-sky-300"
                        value={garrisonTargetHero?.id ?? ""}
                        onChange={(event) => setGarrisonTargetHeroId(event.target.value || null)}
                      >
                        {heroesAtSelectedTown.map((hero) => (
                          <option key={hero.id} value={hero.id}>
                            {hero.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {selectedTown.garrison.length === 0 ? (
                  <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">Aucune unité en garnison.</div>
                ) : (
                  selectedTown.garrison.map((unit) => {
                    const disabled = !canAct || !isMyTown || !garrisonTargetHero || isPending;
                    return (
                      <div key={unit.id} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <UnitSprite unitType={unit.unitType} side="defender" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-amber-100">{unitTypeLabel(unit.unitType)}</div>
                              <div className="text-xs text-amber-200/60">En garnison : {unit.count}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`group relative grid h-10 w-10 shrink-0 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-sky-200/80 ${
                              disabled
                                ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                                : "border-sky-400/60 bg-gradient-to-b from-sky-600 to-sky-800 text-sky-50 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.3)] hover:from-sky-500 hover:to-sky-700"
                            }`}
                            disabled={disabled}
                            onClick={() => handleTransferGarrisonToHero(unit.unitType)}
                            aria-label={`Envoyer vers ${garrisonTargetHero?.name ?? "héros"}`}
                            title={`Envoyer vers ${garrisonTargetHero?.name ?? "héros"}`}
                          >
                            <TransferToHeroIcon className="h-5 w-5" />
                            <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md border border-sky-400/50 bg-stone-950/95 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-sky-100 opacity-0 shadow-lg shadow-black/50 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                              Envoyer
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {displayedTownTab === "build" && (
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
                  const alreadyBuilt = selectedTown.buildings.includes(rule.type);
                  const missingRequirement = rule.requires?.find((requirement) => !selectedTown.buildings.includes(requirement));
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
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-amber-100">{rule.label}</div>
                          <div className="text-xs text-amber-200/60">{rule.description}</div>
                          <div className="mt-1 text-xs text-amber-300">{formatCost(rule.cost)}</div>
                          {missingRequirement && (
                            <div className="mt-1 text-xs text-red-300">Prérequis manquant : {buildingTypeLabel(missingRequirement, selectedTownFaction)}</div>
                          )}
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
                          onClick={() => handleBuild(rule.type)}
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
              </div>
            )}

            {displayedTownTab === "recruit" && (
              <div className="space-y-2">
                {selectedTownRecruitEntries.map(({ rule, tier, dwelling, upgraded }) => {
                  const hasDwelling = selectedTown.buildings.includes(dwelling);
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
                        <div className="flex min-w-0 items-center gap-3">
                          <UnitSprite unitType={rule.type} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-amber-100">{rule.label}</div>
                            <div className="text-xs text-amber-200/60">PV {rule.health} · {formatCost(rule.cost)} / unité</div>
                            {hasDwelling && <div className="mt-1 text-xs text-emerald-300">Disponible : {available}</div>}
                            {upgraded && <div className="mt-1 text-xs text-sky-300">Amélioration palier {tier + 1}</div>}
                            {!hasDwelling && <div className="mt-1 text-xs text-red-300">Prérequis : {buildingTypeLabel(dwelling, selectedTownFaction)}</div>}
                          </div>
                        </div>
                        <button
                          className={`shrink-0 rounded-md border px-3 py-1 text-sm font-black transition ${
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
            )}

            {displayedTownTab === "tavern" && (
              <div className="space-y-2">
                {(selectedTown.tavernOffer ?? []).length === 0 ? (
                  <div className="rounded-md border border-amber-700/30 bg-black/40 px-3 py-2 text-xs text-amber-200/60">Aucun héros disponible pour le moment.</div>
                ) : (
                  (selectedTown.tavernOffer ?? []).map((hero) => {
                    const atMax = myPlayer ? myPlayer.heroes.length >= MAX_HEROES_PER_PLAYER : true;
                    const tooPoor = !myPlayer || myPlayer.resources.gold < HERO_RECRUIT_COST_GOLD;
                    const disabled = !canAct || !isMyTown || isPending || atMax || tooPoor;
                    return (
                      <div key={hero.templateId} className="rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-3 shadow-inner shadow-black/40">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-amber-100">{hero.name}</div>
                            <div className="text-xs text-amber-200/60">{hero.class} · {factionLabel(hero.faction as Faction)}</div>
                            <div className="text-xs text-amber-300/80">Spécialité : {hero.specialty}</div>
                            <div className="mt-1 text-xs text-amber-300">{HERO_RECRUIT_COST_GOLD} or</div>
                            {atMax && <div className="mt-1 text-xs text-red-300">Maximum {MAX_HEROES_PER_PLAYER} héros</div>}
                          </div>
                          <button
                            className={`shrink-0 rounded-md border px-3 py-1 text-sm font-black uppercase tracking-wider transition ${
                              disabled
                                ? "cursor-not-allowed border-stone-700 bg-stone-800/60 text-stone-500"
                                : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] hover:from-amber-500 hover:to-amber-700"
                            }`}
                            disabled={disabled}
                            onClick={() => handleRecruitHero(hero.templateId)}
                          >
                            Engager
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </CollapsiblePanel>
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

function addUnitsToLocalStackList(
  stacks: UnitStack[],
  unitType: UnitType,
  count: number,
  maxHealth: number
) {
  const existing = stacks.find((unit) => unit.unitType === unitType);
  if (existing) {
    return stacks.map((unit) =>
      unit.id === existing.id
        ? { ...unit, count: unit.count + count, health: unit.health + maxHealth * count }
        : unit
    );
  }

  return [
    ...stacks,
    {
      id: `local-${Date.now()}`,
      unitType,
      count,
      health: maxHealth * count,
      maxHealth,
      position: stacks.length,
    },
  ];
}

function removeUnitsFromLocalStackList(
  stacks: UnitStack[],
  unitType: UnitType,
  count: number,
  maxHealth: number
) {
  return stacks
    .map((unit) =>
      unit.unitType === unitType
        ? { ...unit, count: unit.count - count, health: Math.max(0, unit.health - maxHealth * count) }
        : unit
    )
    .filter((unit) => unit.count > 0)
    .map((unit, position) => ({ ...unit, position }));
}

async function getApiErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}
