"use client";

import { useMemo, type MouseEvent } from "react";
import { useSession } from "@/lib/auth/client";
import { TerrainType, type GameState, type Player, type Position } from "@/lib/game/types";
import { computeVisibleTiles, getPlayerVisionCenters } from "@/lib/game/engine";
import { useGameStore } from "@/lib/stores/gameStore";

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

export default function MiniMap() {
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const selectedTownId = useGameStore((state) => state.selectedTownId);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const hasActiveCombat = useGameStore((state) => Boolean(state.activeCombat));
  const focusTile = useGameStore((state) => state.focusTile);
  const zoomMap = useGameStore((state) => state.zoomMap);

  const currentPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);
  const visibility = useMemo(
    () => (gameState && currentPlayer ? getMiniMapVisibility(gameState, currentPlayer, devRevealMap || hasActiveCombat) : null),
    [gameState, currentPlayer, devRevealMap, hasActiveCombat]
  );

  if (!gameState?.map || !currentPlayer || !visibility) return null;

  const { map } = gameState;
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

  return (
    <div className="relative z-10 p-2">
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
        {getKnownBuildings(gameState, visibility).map((position) => (
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
            .filter((town) => isKnownPosition(town.position, player, currentPlayer, visibility))
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
            .filter((hero) => isKnownPosition(hero.position, player, currentPlayer, visibility))
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
      <div className="mt-1 flex items-center justify-between gap-2 px-0.5">
        <span
          className="min-w-0 text-[10px] font-bold uppercase tracking-wider text-amber-200/55"
          title={`${visibility.explored.size}/${totalTiles} cases explorées`}
        >
          Exploration : {explorationPercent}%
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

function getMiniMapVisibility(gameState: GameState, currentPlayer: Player, revealAll: boolean) {
  const visible = new Set<string>();
  const explored = new Set<string>(currentPlayer.exploredTiles);

  if (revealAll) {
    for (let y = 0; y < gameState.map.height; y++) {
      for (let x = 0; x < gameState.map.width; x++) {
        const key = `${x},${y}`;
        visible.add(key);
        explored.add(key);
      }
    }
    return { visible, explored };
  }

  for (const key of computeVisibleTiles(gameState.map, getPlayerVisionCenters(currentPlayer), 5)) {
    visible.add(key);
    explored.add(key);
  }

  return { visible, explored };
}

function isKnownPosition(
  position: Position,
  owner: Player,
  currentPlayer: Player,
  visibility: { visible: Set<string>; explored: Set<string> }
) {
  const key = `${position.x},${position.y}`;
  return owner.id === currentPlayer.id || visibility.visible.has(key) || visibility.explored.has(key);
}

function getKnownBuildings(gameState: GameState, visibility: { visible: Set<string>; explored: Set<string> }) {
  const positions: Position[] = [];
  for (const player of gameState.players) {
    for (const building of player.resourceBuildings) {
      const key = `${building.position.x},${building.position.y}`;
      if (visibility.visible.has(key) || visibility.explored.has(key)) positions.push(building.position);
    }
  }
  return positions;
}
