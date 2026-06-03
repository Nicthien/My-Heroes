"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { useSession } from "@/lib/auth/client";
import { RESOURCE_BUILDING_RULES, formatResourceProduction } from "@/lib/game/economy";
import { normalizeMapLevel, SURFACE_LEVEL, UNDERGROUND_LEVEL } from "@/lib/game/map-levels";
import type { MapLevelId } from "@/lib/game/types";
import { MAP_SPRITES } from "@/lib/rendering/phaser/assets";
import { useGameStore } from "@/lib/stores/gameStore";
import { ActiveCombatsList } from "../combat/ActiveCombatsPanel";
import CollapsiblePanel from "./CollapsiblePanel";
import MiniMap from "./MiniMap";
import { EmptyState, MiniMovementGauge, Row } from "./SidePanel";
import { PlayersListPanel } from "./PlayersListPanel";
import { PlayerJournalPanel } from "./PlayerJournalPanel";
import { getKnownActionLogEntries } from "./actionLogDisplay";
import { HeroIcon, MineIcon, PortraitSeal, TowerIcon, ornateFrame } from "./theme";
import { useDraggableWindow, type HudWindowPosition } from "./useDraggableWindow";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedLabelFromId } from "@/lib/i18n/gameLabels";

type OverviewTab = "heroes" | "towns" | "mines" | "combats" | "journal";

const WINDOW_STORAGE_PREFIX = "my-heroes:hud-window-position:v3";
const RIGHT_COLUMN_TOP = 112;
const RIGHT_COLUMN_GAP = 12;
const MAP_WINDOW_ESTIMATED_HEIGHT = 242;
const PLAYERS_WINDOW_ESTIMATED_HEIGHT = 122;
const PLAYERS_WINDOW_TOP = RIGHT_COLUMN_TOP + MAP_WINDOW_ESTIMATED_HEIGHT + RIGHT_COLUMN_GAP;
const OVERVIEW_WINDOW_TOP = PLAYERS_WINDOW_TOP + PLAYERS_WINDOW_ESTIMATED_HEIGHT + RIGHT_COLUMN_GAP;

function scopeKey(gameId: string, playerId: string | undefined, windowId: string) {
  return `${WINDOW_STORAGE_PREFIX}:${gameId}:${playerId ?? "viewer"}:${windowId}`;
}

function rightOfViewport(width: number, offset = 12) {
  return Math.max(12, window.innerWidth - width - offset);
}

function rightColumnDefault(y: number) {
  return (size: { width: number; height: number }): HudWindowPosition => ({ x: rightOfViewport(size.width), y });
}

export default function DesktopHudWindows({ gameId, playerId }: { gameId: string; playerId?: string }) {
  const { data: session } = useSession();
  const { t } = useI18n();
  const gameState = useGameStore((state) => state.gameState);
  const activeMapLevel = useGameStore((state) => state.activeMapLevel);
  const setActiveMapLevel = useGameStore((state) => state.setActiveMapLevel);
  const [activeTab, setActiveTab] = useState<OverviewTab>("heroes");

  if (!gameState) return null;
  const me = gameState.players.find((player) => player.userId === session?.user?.id);
  const playersById = new Map(gameState.players.map((player) => [player.id, player]));
  const knownJournalCount = me ? getKnownActionLogEntries(gameState.actionLog, me.id).length : 0;
  const hasUnderground = Boolean(gameState.map.levels?.underground);

  const tabs: Array<{ id: OverviewTab; label: string; count: number; icon: ReactNode }> = [
    { id: "heroes", label: t("hud.navHeroes"), count: me?.heroes.length ?? 0, icon: <HeroIcon className="h-4 w-4" /> },
    { id: "towns", label: t("hud.tabTowns"), count: me?.towns.length ?? 0, icon: <TowerIcon className="h-4 w-4" /> },
    { id: "mines", label: t("hud.tabMines"), count: me?.resourceBuildings.length ?? 0, icon: <MineIcon className="h-4 w-4" /> },
    { id: "combats", label: t("hud.tabCombats"), count: gameState.activeCombats?.length ?? 0, icon: <span className="text-sm font-black">!</span> },
    { id: "journal", label: t("hud.tabJournal"), count: knownJournalCount, icon: <span className="text-sm font-black">J</span> },
  ];

  return (
    <div className="desktop-only pointer-events-none absolute inset-0 z-30">
      <HudWindow
        title="Carte"
        storageKey={scopeKey(gameId, playerId, "map")}
        defaultPosition={rightColumnDefault(RIGHT_COLUMN_TOP)}
        className="w-72"
        fallbackSize={{ width: 288, height: 210 }}
        beforeReset={
          hasUnderground ? (
            <MapLevelHeaderToggle activeMapLevel={activeMapLevel} onChange={setActiveMapLevel} />
          ) : undefined
        }
      >
        <MiniMap />
      </HudWindow>

      <HudWindow
        title="Joueurs"
        storageKey={scopeKey(gameId, playerId, "players")}
        defaultPosition={rightColumnDefault(PLAYERS_WINDOW_TOP)}
        className="w-72"
        bodyClassName="max-h-44 overflow-y-auto overscroll-contain px-2 py-2 text-sm"
        fallbackSize={{ width: 288, height: 210 }}
      >
        <PlayersListPanel gameState={gameState} myPlayer={me} embedded />
      </HudWindow>

      {me && (
        <HudWindow
          title="Suivi"
          storageKey={scopeKey(gameId, playerId, "main")}
          defaultPosition={rightColumnDefault(OVERVIEW_WINDOW_TOP)}
          className="w-72"
          bodyClassName="flex min-h-0 flex-col"
          fallbackSize={{ width: 288, height: 140 }}
          testId="hud-overview-window"
        >
          <div className="grid grid-cols-5 gap-1 border-b border-amber-700/30 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`flex min-w-0 items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                  activeTab === tab.id
                    ? "border-amber-300 bg-amber-500 text-stone-950"
                    : "border-amber-800/55 bg-black/30 text-amber-200 hover:border-amber-500/70 hover:bg-amber-950/50"
                }`}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
                aria-label={`${tab.label} (${tab.count})`}
                title={`${tab.label} (${tab.count})`}
              >
                {tab.icon}
                <span className="min-w-4 rounded bg-black/25 px-1 text-center text-[10px] tabular-nums">{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="max-h-[min(20rem,calc(100vh-12rem))] space-y-1 overflow-y-auto overscroll-contain px-2 py-2">
            {activeTab === "heroes" && <HeroesList playerId={me.id} />}
            {activeTab === "towns" && <TownsList playerId={me.id} />}
            {activeTab === "mines" && <MinesList playerId={me.id} />}
            {activeTab === "combats" && <ActiveCombatsList />}
            {activeTab === "journal" && <PlayerJournalPanel entries={gameState.actionLog} player={me} playersById={playersById} />}
          </div>
        </HudWindow>
      )}
    </div>
  );
}

export function HudWindow({
  title,
  storageKey,
  defaultPosition,
  children,
  className = "",
  bodyClassName,
  fallbackSize,
  testId,
  beforeReset,
}: {
  title: ReactNode;
  storageKey: string;
  defaultPosition: HudWindowPosition | ((size: { width: number; height: number }) => HudWindowPosition);
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  fallbackSize?: { width: number; height: number };
  testId?: string;
  beforeReset?: ReactNode;
}) {
  const draggable = useDraggableWindow({ storageKey, defaultPosition, fallbackSize });

  return (
    <CollapsiblePanel
      title={title}
      className={`${ornateFrame} pointer-events-auto absolute flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden ${className}`}
      bodyClassName={bodyClassName}
      dragHandleProps={draggable.isEnabled ? draggable.dragHandleProps : undefined}
      onResetPosition={draggable.isEnabled ? draggable.resetPosition : undefined}
      beforeReset={beforeReset}
      rootRef={draggable.ref}
      style={draggable.style}
      testId={testId}
    >
      {children}
    </CollapsiblePanel>
  );
}

function MapLevelHeaderToggle({
  activeMapLevel,
  onChange,
}: {
  activeMapLevel: MapLevelId;
  onChange: (level: MapLevelId) => void;
}) {
  return (
    <div className="flex h-7 rounded-md border border-amber-700/50 bg-black/25 p-0.5" aria-label="Niveau de carte">
      {[
        { id: SURFACE_LEVEL, label: "S", title: "Surface" },
        { id: UNDERGROUND_LEVEL, label: "U", title: "Souterrain" },
      ].map((item) => (
        <button
          key={item.id}
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onChange(item.id);
          }}
          aria-pressed={activeMapLevel === item.id}
          aria-label={item.title}
          title={item.title}
          className={`grid h-6 w-6 place-items-center rounded text-[10px] font-black uppercase transition ${
            activeMapLevel === item.id
              ? "bg-amber-500/30 text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.25)]"
              : "text-amber-200/55 hover:bg-amber-950/45 hover:text-amber-100"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function HeroesList({ playerId }: { playerId: string }) {
  const { t } = useI18n();
  const gameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  if (!gameState) return null;
  const player = gameState.players.find((item) => item.id === playerId);
  if (!player) return null;
  const focusTile = useGameStore.getState().focusTile;
  const selectHero = useGameStore.getState().selectHero;
  const selectTown = useGameStore.getState().selectTown;

  if (player.heroes.length === 0) return <EmptyState>{t("side.noHeroes")}</EmptyState>;
  return (
    <>
      {player.heroes.map((hero) => {
        const active = hero.id === selectedHeroId;
        const townAtHero = player.towns.find((town) =>
          town.position.x === hero.position.x &&
          town.position.y === hero.position.y &&
          normalizeMapLevel(town.position.level) === normalizeMapLevel(hero.position.level)
        );
        return (
          <Row
            key={hero.id}
            active={active}
            onClick={() => {
              selectHero(hero.id);
              focusTile(hero.position.x, hero.position.y);
            }}
            left={<PortraitSeal color={player.color} label={hero.name.slice(0, 2)} active={active} size={40} />}
            title={hero.name}
            subtitle={townAtHero ? t("side.levelAtTown", { level: hero.level }) : t("side.level", { level: hero.level })}
            meta={
              <div className="flex items-center gap-2 text-[10px] text-amber-200/80">
                {townAtHero && (
                  <button
                    type="button"
                    className="grid h-5 w-5 place-items-center rounded border border-sky-500/40 bg-sky-950/50 text-sky-200 transition hover:border-sky-300/70 hover:bg-sky-900/60 hover:text-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
                    title={t("side.atTownTitle", { name: townAtHero.name })}
                    aria-label={t("side.selectTown", { name: townAtHero.name })}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectTown(townAtHero.id);
                      focusTile(townAtHero.position.x, townAtHero.position.y);
                    }}
                  >
                    <TowerIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                <MiniMovementGauge movement={hero.movement} maxMovement={hero.maxMovement} />
              </div>
            }
          />
        );
      })}
    </>
  );
}

function TownsList({ playerId }: { playerId: string }) {
  const { t } = useI18n();
  const gameState = useGameStore((state) => state.gameState);
  const selectedTownId = useGameStore((state) => state.selectedTownId);
  if (!gameState) return null;
  const player = gameState.players.find((item) => item.id === playerId);
  if (!player) return null;
  const focusTile = useGameStore.getState().focusTile;
  const selectTown = useGameStore.getState().selectTown;

  if (player.towns.length === 0) return <EmptyState>{t("side.noTowns")}</EmptyState>;
  return (
    <>
      {player.towns.map((town) => {
        const active = town.id === selectedTownId;
        const factionKey = (town.townType ?? town.faction) as string;
        const sprite = MAP_SPRITES.towns[factionKey] ?? MAP_SPRITES.town;
        return (
          <Row
            key={town.id}
            active={active}
            onClick={() => {
              selectTown(town.id);
              focusTile(town.position.x, town.position.y);
            }}
            left={
              <div className={`grid h-10 w-10 place-items-center overflow-hidden rounded-lg border ${active ? "border-amber-300 bg-amber-700/40" : "border-amber-700/60 bg-stone-900/80"}`}>
                <Image src={sprite} alt={town.name} width={40} height={40} className="h-auto w-full object-contain" style={{ imageRendering: "pixelated" }} draggable={false} />
              </div>
            }
            title={town.name}
            subtitle={t("side.level", { level: town.level })}
          />
        );
      })}
    </>
  );
}

function MinesList({ playerId }: { playerId: string }) {
  const { t, locale } = useI18n();
  const gameState = useGameStore((state) => state.gameState);
  if (!gameState) return null;
  const player = gameState.players.find((item) => item.id === playerId);
  if (!player) return null;
  const focusTile = useGameStore.getState().focusTile;

  if (player.resourceBuildings.length === 0) return <EmptyState>{t("side.noMines")}</EmptyState>;
  return (
    <>
      {player.resourceBuildings.map((mine) => {
        const rule = RESOURCE_BUILDING_RULES.find((item) => item.type === mine.type);
        const label = localizedLabelFromId(mine.type, rule?.label ?? mine.type, locale);
        const sprite = MAP_SPRITES.buildings[mine.type];
        return (
          <Row
            key={mine.id}
            onClick={() => focusTile(mine.position.x, mine.position.y)}
            left={
              <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-amber-700/60 bg-stone-900/80">
                {sprite ? (
                  <Image src={sprite} alt={label} width={40} height={40} className="h-auto w-full object-contain" style={{ imageRendering: "pixelated" }} draggable={false} />
                ) : (
                  <span className="text-lg font-black text-amber-300">?</span>
                )}
              </div>
            }
            title={label}
            subtitle={rule ? formatResourceProduction(rule.production) : ""}
          />
        );
      })}
    </>
  );
}
