"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { Player, ResourceBuilding } from "@/lib/game/types";
import type { GameActionLogEntry } from "@/lib/game/server/action-log";
import { useGameStore } from "@/lib/stores/gameStore";
import { useDraggableWindow } from "../hud/useDraggableWindow";
import { categoryLabel, formatActionLogTooltip, formatActor, formatLogTime, playerName, sortActionLogNewestFirst } from "../hud/actionLogDisplay";

const FACTION_LABELS: Record<string, string> = {
  castle: "Chateau",
  rampart: "Rempart",
  tower: "Tour",
  inferno: "Hades",
  necropolis: "Necropole",
  dungeon: "Donjon",
  stronghold: "Bastion",
  fortress: "Forteresse",
};

const RESOURCE_BUILDING_LABELS: Record<string, string> = {
  gold_mine: "Mine d'or",
  sawmill: "Scierie",
  ore_pit: "Mine de minerai",
  alchemist_lab: "Laboratoire",
  crystal_cavern: "Caverne de cristaux",
  gem_pond: "Gisement de gemmes",
  sulfur_dune: "Carriere de soufre",
};

function coords(position: { x: number; y: number }) {
  return `${position.x}, ${position.y}`;
}

function factionLabel(faction: string) {
  return FACTION_LABELS[faction] ?? faction;
}

function resourceBuildingLabel(building: ResourceBuilding) {
  return RESOURCE_BUILDING_LABELS[building.type] ?? building.type;
}

function resourcesLabel(player: Player) {
  const resources = player.resources;
  return [
    ["Or", resources.gold],
    ["Bois", resources.wood],
    ["Minerai", resources.ore],
    ["Mercure", resources.mercury],
    ["Cristaux", resources.crystals],
    ["Gemmes", resources.gems],
    ["Soufre", resources.sulfur],
  ].map(([label, value]) => `${label} ${value}`).join(" - ");
}

function turnStatus(player: Player, currentTurnPlayerId: string) {
  if (player.isAlive === false) return "Defait";
  if (player.hasEndedTurn) return "Tour termine";
  if (currentTurnPlayerId === player.id) return "Doit jouer";
  return "En attente";
}

export default function AdminObserverPanel() {
  const gameState = useGameStore((state) => state.gameState);
  const adminObserverMode = useGameStore((state) => state.adminObserverMode);
  const focusTile = useGameStore((state) => state.focusTile);
  const selectHero = useGameStore((state) => state.selectHero);
  const selectTown = useGameStore((state) => state.selectTown);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"players" | "journal">("players");
  const [collapsedPlayerIds, setCollapsedPlayerIds] = useState<Set<string>>(() => new Set());
  const [showJournalDetails, setShowJournalDetails] = useState(false);
  const {
    ref: adminWindowRef,
    style: adminWindowStyle,
    isEnabled: adminWindowEnabled,
    resetPosition: resetAdminWindowPosition,
    dragHandleProps: adminWindowDragHandleProps,
  } = useDraggableWindow({
    storageKey: `my-heroes:hud-window-position:v3:${gameState?.id ?? "dev"}:admin-observer`,
    defaultPosition: { x: 12, y: 80 },
    fallbackSize: { width: 416, height: 520 },
  });

  if (!adminObserverMode || !gameState) return null;

  const focus = (position: { x: number; y: number }) => {
    focusTile(position.x, position.y);
  };
  const sortedPlayers = gameState.players.slice().sort((a, b) => a.turnOrder - b.turnOrder);
  const playersById = new Map(sortedPlayers.map((player) => [player.id, player]));
  const actionLog = sortActionLogNewestFirst(gameState.actionLog ?? []);
  const togglePlayer = (playerId: string) => {
    setCollapsedPlayerIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  return (
    <div
      ref={adminWindowRef}
      data-testid="admin-observer-panel"
      className="pointer-events-auto absolute left-3 top-20 z-[95] flex max-h-[calc(100vh-6rem)] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-md border border-cyan-300/45 bg-slate-950/92 text-cyan-50 shadow-2xl shadow-black/55 backdrop-blur-sm"
      style={adminWindowStyle}
    >
      <div className="flex items-center justify-between gap-3 border-b border-cyan-400/20 px-3 py-2">
        <div
          {...(adminWindowEnabled ? adminWindowDragHandleProps : {})}
          className={`min-w-0 flex-1 ${adminWindowEnabled ? "cursor-move touch-none select-none" : ""}`}
        >
          <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100">Observation admin</div>
          <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-cyan-200/60">
            {gameState.players.length}/{gameState.maxPlayers} joueurs - Tour {gameState.turnNumber}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {adminWindowEnabled && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={resetAdminWindowPosition}
              className="grid h-8 w-8 place-items-center rounded border border-cyan-400/35 bg-cyan-950/55 text-cyan-100 transition hover:bg-cyan-900"
              aria-label="Reinitialiser la position du panneau admin"
              title="Position initiale"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed((value) => !value)}
            className="grid h-8 w-8 place-items-center rounded border border-cyan-400/35 bg-cyan-950/55 text-sm font-black text-cyan-100 transition hover:bg-cyan-900"
            aria-label={collapsed ? "Ouvrir le panneau admin" : "Reduire le panneau admin"}
          >
            {collapsed ? "+" : "-"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="grid grid-cols-2 border-b border-cyan-400/20 text-[11px] font-black uppercase tracking-wider">
            <AdminTabButton active={activeTab === "players"} onClick={() => setActiveTab("players")}>
              Joueurs
            </AdminTabButton>
            <AdminTabButton active={activeTab === "journal"} onClick={() => setActiveTab("journal")}>
              Journal
            </AdminTabButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {activeTab === "journal" ? (
              <AdminJournal
                entries={actionLog}
                playersById={playersById}
                showDetails={showJournalDetails}
                onToggleDetails={() => setShowJournalDetails((value) => !value)}
              />
            ) : gameState.players.length === 0 ? (
              <div className="rounded border border-cyan-400/25 bg-black/25 px-3 py-4 text-center text-xs italic text-cyan-100/60">
                Aucun joueur dans cette partie.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedPlayers.map((player) => {
                  const playerCollapsed = collapsedPlayerIds.has(player.id);
                  return (
                    <section key={player.id} className="rounded-md border border-cyan-400/25 bg-black/28">
                      <div className="flex items-start justify-between gap-3 border-b border-cyan-400/15 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-cyan-50">{playerName(player)}</div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-200/60">
                            {factionLabel(player.faction)} - {turnStatus(player, gameState.currentTurnPlayerId)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="h-4 w-4 rounded-full border border-white/35" style={{ backgroundColor: player.color }} />
                          <button
                            type="button"
                            onClick={() => togglePlayer(player.id)}
                            className="grid h-7 w-7 place-items-center rounded border border-cyan-400/25 bg-cyan-950/35 text-sm font-black text-cyan-100 transition hover:bg-cyan-900"
                            aria-label={playerCollapsed ? `Ouvrir ${playerName(player)}` : `Reduire ${playerName(player)}`}
                          >
                            {playerCollapsed ? "+" : "-"}
                          </button>
                        </div>
                      </div>

                      {!playerCollapsed && (
                        <div className="space-y-2 px-3 py-2 text-xs text-cyan-50/82">
                          <div className="font-semibold text-cyan-100/75">{resourcesLabel(player)}</div>

                          <AdminSection title={`Heros (${player.heroes.length})`}>
                            {player.heroes.map((hero) => (
                              <AdminPositionButton
                                key={hero.id}
                                label={`${hero.name} Niv. ${hero.level}`}
                                position={hero.position}
                                onFocus={(position) => {
                                  selectHero(hero.id);
                                  focus(position);
                                }}
                              />
                            ))}
                          </AdminSection>

                          <AdminSection title={`Chateaux (${player.towns.length})`}>
                            {player.towns.map((town) => (
                              <AdminPositionButton
                                key={town.id}
                                label={town.name}
                                position={town.position}
                                onFocus={(position) => {
                                  selectTown(town.id);
                                  focus(position);
                                }}
                              />
                            ))}
                          </AdminSection>

                          <AdminSection title={`Mines (${player.resourceBuildings.length})`}>
                            {player.resourceBuildings.map((building) => (
                              <AdminPositionButton key={building.id} label={resourceBuildingLabel(building)} position={building.position} onFocus={focus} />
                            ))}
                          </AdminSection>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AdminTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 transition ${
        active
          ? "bg-cyan-500/15 text-cyan-50"
          : "bg-slate-950/30 text-cyan-200/55 hover:bg-cyan-950/35 hover:text-cyan-100"
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function AdminJournal({
  entries,
  playersById,
  showDetails,
  onToggleDetails,
}: {
  entries: GameActionLogEntry[];
  playersById: Map<string, Player>;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="font-black uppercase tracking-wider text-cyan-200/60">Journal ({entries.length})</div>
        <button
          type="button"
          onClick={onToggleDetails}
          className="rounded border border-cyan-400/25 bg-cyan-950/35 px-2 py-1 font-bold text-cyan-100 transition hover:bg-cyan-900"
        >
          {showDetails ? "Masquer details" : "Details"}
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="rounded border border-cyan-400/25 bg-black/25 px-3 py-4 text-center italic text-cyan-100/60">
          Aucune action journalisee.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const player = entry.gamePlayerId ? playersById.get(entry.gamePlayerId) : undefined;
            return (
              <article
                key={entry.id}
                className="rounded border border-cyan-400/20 bg-slate-900/45 px-3 py-2 text-cyan-50/82"
                title={formatActionLogTooltip(entry, player)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-cyan-50">{entry.summary}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-cyan-200/50">
                      {formatActor(entry, player)} - Tour {entry.turnNumber} - {categoryLabel(entry.category)}
                    </div>
                  </div>
                  <time className="shrink-0 font-mono text-[10px] text-cyan-200/55">{formatLogTime(entry.createdAt)}</time>
                </div>
                {showDetails && (
                  <pre className="mt-2 max-h-48 overflow-auto rounded border border-cyan-400/15 bg-black/35 p-2 text-[10px] leading-relaxed text-cyan-100/70">
                    {JSON.stringify({ actionType: entry.actionType, playerId: entry.gamePlayerId, details: entry.details }, null, 2)}
                  </pre>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-cyan-200/55">{title}</div>
      <div className="grid gap-1">
        {children || <div className="text-cyan-100/35">Aucun</div>}
      </div>
    </div>
  );
}

function AdminPositionButton({
  label,
  position,
  onFocus,
}: {
  label: string;
  position: { x: number; y: number };
  onFocus: (position: { x: number; y: number }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onFocus(position)}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded border border-cyan-400/15 bg-slate-900/55 px-2 py-1 text-left transition hover:border-cyan-300/45 hover:bg-cyan-950/45"
    >
      <span className="truncate">{label}</span>
      <span className="font-mono text-cyan-200/75">{coords(position)}</span>
    </button>
  );
}
