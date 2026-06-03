"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { useSession } from "@/lib/auth/client";
import { TerrainType, type GameState, type MapObject, type Player, type Position } from "@/lib/game/types";
import { computeVisibleTiles, getPlayerVisionCenters } from "@/lib/game/engine";
import { normalizeExploredTileKey, normalizeMapLevel, withActiveMapLayer } from "@/lib/game/map-levels";
import { useGameStore } from "@/lib/stores/gameStore";
import { useI18n } from "@/lib/i18n/I18nProvider";

const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.GRASS]: "#3f7f3b",
  [TerrainType.WATER]: "#1f5f8f",
  [TerrainType.MOUNTAIN]: "#68635b",
  [TerrainType.FOREST]: "#245d34",
  [TerrainType.DIRT]: "#8a623c",
  [TerrainType.SAND]: "#b89b55",
  [TerrainType.SNOW]: "#d7e2e4",
  [TerrainType.SWAMP]: "#496737",
  [TerrainType.LAVA]: "#8d2f1e",
};

const FULL_ZONE_CONTROL_OPACITY = 0.9;
const PARTIAL_ZONE_CONTROL_OPACITY = 0.8;
const EXTERNAL_DWELLING_TYPE = "external_dwelling";

type MiniMapVisibility = { visible: Set<string>; explored: Set<string> };

type ControlSite = {
  id: string;
  ownerId: string | null;
  position: Position;
  zoneId: number;
};

type ControlTile = {
  key: string;
  x: number;
  y: number;
  color: string;
  opacity: number;
};

export default function MiniMap() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [showControlZones, setShowControlZones] = useState(true);
  const gameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const selectedTownId = useGameStore((state) => state.selectedTownId);
  const activeMapLevel = useGameStore((state) => state.activeMapLevel);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const adminObserverMode = useGameStore((state) => state.adminObserverMode);
  const hasActiveCombat = useGameStore((state) => Boolean(state.activeCombat));
  const focusTile = useGameStore((state) => state.focusTile);
  const zoomMap = useGameStore((state) => state.zoomMap);

  const currentPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);
  const activeMap = useMemo(
    () => gameState ? withActiveMapLayer(gameState.map, activeMapLevel) : null,
    [activeMapLevel, gameState],
  );
  const revealAll = devRevealMap || hasActiveCombat || adminObserverMode;
  const visibility = useMemo(
    () => (gameState && activeMap && (currentPlayer || revealAll) ? getMiniMapVisibility(activeMap, activeMapLevel, currentPlayer, revealAll) : null),
    [activeMap, activeMapLevel, gameState, currentPlayer, revealAll]
  );
  const controlTiles = useMemo(
    () => (gameState && activeMap && visibility ? getMiniMapControlTiles(gameState, activeMap, activeMapLevel, visibility) : []),
    [activeMap, activeMapLevel, gameState, visibility]
  );

  if (!gameState?.map || !activeMap || !visibility) return null;

  const map = activeMap;
  const totalTiles = map.width * map.height;
  const explorationPercent = totalTiles > 0
    ? Math.round((visibility.explored.size / totalTiles) * 100)
    : 0;

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(map.width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * map.width)));
    const y = Math.max(0, Math.min(map.height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * map.height)));
    focusTile(x, y);
  };

  const controlToggleLabel = showControlZones ? "Masquer les zones de controle" : "Afficher les zones de controle";

  return (
    <div className="relative z-10 p-2">
      <div className="relative">
        <svg
          role="img"
          aria-label="Mini carte"
          viewBox={`0 0 ${map.width} ${map.height}`}
          preserveAspectRatio="none"
          className="block h-36 w-full cursor-crosshair overflow-hidden rounded-md border border-amber-800/70 bg-black shadow-[inset_0_0_0_1px_rgba(252,211,77,0.12)]"
          onClick={handleClick}
        >
          {map.tiles.map((row, y) =>
            row.map((tile, x) => {
              const key = `${x},${y}`;
              const explored = visibility.explored.has(key);
              const visible = visibility.visible.has(key);
              return (
                <rect
                  key={key}
                  x={x}
                  y={y}
                  width={1}
                  height={1}
                  fill={explored ? TERRAIN_COLORS[tile.terrain] : "#090704"}
                  opacity={visible ? 1 : explored ? 0.45 : 1}
                />
              );
            })
          )}
          {showControlZones && controlTiles.map((tile) => (
            <rect
              key={`control-${tile.key}`}
              data-testid="minimap-control-overlay"
              x={tile.x}
              y={tile.y}
              width={1}
              height={1}
              fill={tile.color}
              opacity={tile.opacity}
            />
          ))}
          {getKnownBuildings(gameState, activeMapLevel, visibility).map((position) => (
            <rect
              key={`building-${position.x}-${position.y}`}
              x={position.x + 0.18}
              y={position.y + 0.18}
              width={0.64}
              height={0.64}
              fill="#f59e0b"
              opacity={0.88}
            />
          ))}
          {gameState.players.flatMap((player) =>
            player.towns
              .filter((town) => normalizeMapLevel(town.position.level) === activeMapLevel && isKnownPosition(town.position, player, currentPlayer, visibility))
              .map((town) => (
                <rect
                  key={`town-${town.id}`}
                  x={town.position.x - 0.15}
                  y={town.position.y - 0.15}
                  width={1.3}
                  height={1.3}
                  fill={player.color}
                  stroke={town.id === selectedTownId ? "#fde68a" : "#140b05"}
                  strokeWidth={0.25}
                />
              ))
          )}
          {gameState.players.flatMap((player) =>
            player.heroes
              .filter((hero) => normalizeMapLevel(hero.position.level) === activeMapLevel && isKnownPosition(hero.position, player, currentPlayer, visibility))
              .map((hero) => (
                <circle
                  key={`hero-${hero.id}`}
                  cx={hero.position.x + 0.5}
                  cy={hero.position.y + 0.5}
                  r={hero.id === selectedHeroId ? 0.68 : 0.48}
                  fill={player.color}
                  stroke={hero.id === selectedHeroId ? "#fde68a" : "#020617"}
                  strokeWidth={0.22}
                />
              ))
          )}
        </svg>
        <button
          type="button"
          aria-label={controlToggleLabel}
          title={controlToggleLabel}
          data-testid="minimap-control-toggle"
          aria-pressed={showControlZones}
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md border border-amber-800/70 bg-black/70 text-amber-100 shadow transition hover:bg-amber-900/70 hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          onClick={() => setShowControlZones((value) => !value)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
            <path
              d="M4 7.5 10 4l6 3.5 4-2v11l-6 3.5-6-3.5-4 2v-11Z"
              fill="none"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path d="M10 4v13M16 7.5v12.5" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 px-0.5">
        <span
          className="min-w-0 text-[10px] font-bold uppercase tracking-wider text-amber-200/55"
          title={t("minimap.explored", { n: visibility.explored.size, total: totalTiles })}
        >
          {t("minimap.exploration", { pct: explorationPercent })}
        </span>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-amber-800/70 bg-black/35">
          <button
            type="button"
            aria-label="Dezoomer"
            title="Dezoomer"
            className="grid h-7 w-8 place-items-center border-r border-amber-800/60 text-base font-black leading-none text-amber-100 transition hover:bg-amber-900/50 hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
            onClick={() => zoomMap(-1)}
          >
            -
          </button>
          <button
            type="button"
            aria-label="Zoomer"
            title="Zoomer"
            className="grid h-7 w-8 place-items-center text-base font-black leading-none text-amber-100 transition hover:bg-amber-900/50 hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
            onClick={() => zoomMap(1)}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function getMiniMapVisibility(
  activeMap: GameState["map"],
  activeMapLevel: Position["level"],
  currentPlayer: Player | undefined,
  revealAll: boolean,
): MiniMapVisibility {
  const visible = new Set<string>();
  const explored = new Set<string>(
    (currentPlayer?.exploredTiles ?? [])
      .map(normalizeExploredTileKey)
      .filter((key) => key.startsWith(`${normalizeMapLevel(activeMapLevel)}:`))
      .map((key) => key.slice(key.indexOf(":") + 1))
  );

  if (revealAll) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const key = `${x},${y}`;
        visible.add(key);
        explored.add(key);
      }
    }
    return { visible, explored };
  }

  if (!currentPlayer) return { visible, explored };

  const currentLayerPlayer = {
    ...currentPlayer,
    heroes: currentPlayer.heroes.filter((hero) => normalizeMapLevel(hero.position.level) === normalizeMapLevel(activeMapLevel)),
    towns: currentPlayer.towns.filter((town) => normalizeMapLevel(town.position.level) === normalizeMapLevel(activeMapLevel)),
  };

  for (const key of computeVisibleTiles(activeMap, getPlayerVisionCenters(currentLayerPlayer), 5)) {
    visible.add(key);
    explored.add(key);
  }

  return { visible, explored };
}

function isKnownPosition(
  position: Position,
  owner: Player,
  currentPlayer: Player | undefined,
  visibility: MiniMapVisibility
) {
  const key = `${position.x},${position.y}`;
  return owner.id === currentPlayer?.id || visibility.visible.has(key) || visibility.explored.has(key);
}

function getKnownBuildings(gameState: GameState, activeMapLevel: Position["level"], visibility: MiniMapVisibility) {
  const positions: Position[] = [];
  for (const player of gameState.players) {
    for (const building of player.resourceBuildings) {
      if (normalizeMapLevel(building.position.level) !== normalizeMapLevel(activeMapLevel)) continue;
      const key = `${building.position.x},${building.position.y}`;
      if (visibility.visible.has(key) || visibility.explored.has(key)) positions.push(building.position);
    }
  }
  return positions;
}

function getMiniMapControlTiles(
  gameState: GameState,
  activeMap: GameState["map"],
  activeMapLevel: Position["level"],
  visibility: MiniMapVisibility,
): ControlTile[] {
  const sitesByZone = collectControlSitesByZone(gameState, activeMap, activeMapLevel, visibility);
  const playerColorById = new Map(gameState.players.map((player) => [player.id, player.color]));
  const fullyExploredZoneIds = getFullyExploredZoneIds(activeMap, visibility);
  const zoneOwnerById = new Map<number, string>();

  for (const [zoneId, sites] of sitesByZone) {
    if (!fullyExploredZoneIds.has(zoneId)) continue;
    const ownerIds = new Set(sites.map((site) => site.ownerId).filter((ownerId): ownerId is string => Boolean(ownerId)));
    if (ownerIds.size !== 1 || sites.some((site) => !site.ownerId)) continue;
    zoneOwnerById.set(zoneId, [...ownerIds][0]);
  }

  const controlTiles: ControlTile[] = [];
  for (let y = 0; y < activeMap.height; y++) {
    for (let x = 0; x < activeMap.width; x++) {
      const tile = activeMap.tiles[y]?.[x];
      const zoneId = tile?.zoneId;
      const key = `${x},${y}`;
      if (typeof zoneId !== "number" || !visibility.explored.has(key)) continue;

      const fullZoneOwnerId = zoneOwnerById.get(zoneId);
      if (fullZoneOwnerId) {
        const color = playerColorById.get(fullZoneOwnerId);
        if (color) controlTiles.push({ key, x, y, color, opacity: FULL_ZONE_CONTROL_OPACITY });
        continue;
      }

      const nearestSite = getNearestControlSite({ x, y }, sitesByZone.get(zoneId) ?? []);
      if (!nearestSite?.ownerId) continue;
      const color = playerColorById.get(nearestSite.ownerId);
      if (color) controlTiles.push({ key, x, y, color, opacity: PARTIAL_ZONE_CONTROL_OPACITY });
    }
  }

  return controlTiles;
}

function collectControlSitesByZone(
  gameState: GameState,
  activeMap: GameState["map"],
  activeMapLevel: Position["level"],
  visibility: MiniMapVisibility,
) {
  const sitesByZone = new Map<number, ControlSite[]>();
  const pushSite = (site: Omit<ControlSite, "zoneId">) => {
    if (normalizeMapLevel(site.position.level) !== normalizeMapLevel(activeMapLevel)) return;
    const key = `${site.position.x},${site.position.y}`;
    const zoneId = activeMap.tiles[site.position.y]?.[site.position.x]?.zoneId;
    if (typeof zoneId !== "number" || !visibility.explored.has(key)) return;
    const sites = sitesByZone.get(zoneId) ?? [];
    sites.push({ ...site, zoneId });
    sitesByZone.set(zoneId, sites);
  };

  for (const player of gameState.players) {
    for (const building of player.resourceBuildings) {
      pushSite({ id: `building-${building.id}`, ownerId: building.ownerId, position: building.position });
    }
    for (const town of player.towns) {
      pushSite({ id: `town-${town.id}`, ownerId: town.isNeutral ? null : player.id, position: town.position });
    }
  }

  for (const gate of gameState.gates ?? []) {
    pushSite({ id: `gate-${gate.id}`, ownerId: gate.ownerId, position: gate.position });
  }

  for (const row of activeMap.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (!isExternalDwellingObject(object)) continue;
      pushSite({ id: `external-dwelling-${object.id}`, ownerId: object.ownerId ?? null, position: { x: tile.x, y: tile.y, level: normalizeMapLevel(activeMapLevel) } });
    }
  }

  return sitesByZone;
}

function getFullyExploredZoneIds(activeMap: GameState["map"], visibility: MiniMapVisibility) {
  const zoneTileCounts = new Map<number, number>();
  const exploredZoneTileCounts = new Map<number, number>();

  for (const row of activeMap.tiles) {
    for (const tile of row) {
      if (typeof tile.zoneId !== "number") continue;
      const key = `${tile.x},${tile.y}`;
      zoneTileCounts.set(tile.zoneId, (zoneTileCounts.get(tile.zoneId) ?? 0) + 1);
      if (visibility.explored.has(key)) {
        exploredZoneTileCounts.set(tile.zoneId, (exploredZoneTileCounts.get(tile.zoneId) ?? 0) + 1);
      }
    }
  }

  const fullyExploredZoneIds = new Set<number>();
  for (const [zoneId, total] of zoneTileCounts) {
    if (total > 0 && exploredZoneTileCounts.get(zoneId) === total) fullyExploredZoneIds.add(zoneId);
  }
  return fullyExploredZoneIds;
}

function getNearestControlSite(position: Position, sites: ControlSite[]) {
  let nearest: { site: ControlSite; distance: number } | null = null;
  for (const site of sites) {
    const dx = position.x - site.position.x;
    const dy = position.y - site.position.y;
    const distance = dx * dx + dy * dy;
    if (!nearest || distance < nearest.distance) nearest = { site, distance };
  }
  return nearest?.site ?? null;
}

function isExternalDwellingObject(object: MapObject | undefined): object is MapObject & { type: "adventure_building"; subtype: typeof EXTERNAL_DWELLING_TYPE } {
  return object?.type === "adventure_building" && object.subtype === EXTERNAL_DWELLING_TYPE;
}
