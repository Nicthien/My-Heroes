import { getCachedStaticGameMap, mapApiToGameState, mergeGameDynamicState } from "./api";
import { writeCachedGameState } from "./local-cache";
import { fetchWithSupabaseAuth } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";

export async function refreshGameState(
  gameId: string,
  userId?: string,
  options: { revealMap?: boolean; adminObserver?: boolean; resumeAi?: boolean } = {}
) {
  const baseGameState = useGameStore.getState().gameState;
  const canUseIncrementalSync = baseGameState?.id === gameId && Boolean(getCachedStaticGameMap(gameId));
  let usedIncrementalSync = canUseIncrementalSync;
  const query = new URLSearchParams();
  if (options.adminObserver) query.set("admin", "1");
  if (options.adminObserver && options.resumeAi) query.set("resumeAi", "1");
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  let endpoint = usedIncrementalSync ? `/api/games/${gameId}/sync${suffix}` : `/api/games/${gameId}${suffix}`;

  let res = await fetchWithSupabaseAuth(endpoint, { cache: "no-store" });
  if (!res.ok && usedIncrementalSync) {
    if (options.adminObserver) return null;
    usedIncrementalSync = false;
    endpoint = `/api/games/${gameId}${suffix}`;
    res = await fetchWithSupabaseAuth(endpoint, { cache: "no-store" });
  }
  if (!res.ok) return null;
  const data = await res.json();
  const responseIsAdminObserver = data.viewerMode === "admin";
  const effectiveOptions = {
    ...options,
    revealMap: Boolean(options.revealMap || responseIsAdminObserver),
  };
  if (responseIsAdminObserver) {
    useGameStore.getState().setAdminObserverMode(true);
  }

  if (!usedIncrementalSync) {
    if (!data.mapData) {
      const { generateMap } = await import("./engine");
      data.mapData = generateMap(data.mapWidth, data.mapHeight);
    }

    const allBuildingRecords = (data.players as Array<{ resourceBuildings?: Array<{ id: string; buildingType: string; x: number; y: number; gamePlayerId: string | null; guardianPower: number }> }>)
      ?.flatMap((p) => p.resourceBuildings ?? []) ?? [];

    if (allBuildingRecords.length > 0 && data.mapData?.tiles) {
      const mapData = data.mapData as { tiles: Array<Array<{ x: number; y: number; terrain: string; object?: { type: string; id: string; subtype?: string; guardianPower?: number } }>> };
      for (const building of allBuildingRecords) {
        const tile = mapData.tiles[building.y]?.[building.x];
        if (tile) {
          tile.object = {
            type: "building",
            id: building.id,
            subtype: building.buildingType,
            guardianPower: building.guardianPower,
          };
        }
      }
    }

    const nextGameState = mapApiToGameState(data, userId, effectiveOptions);
    writeCachedGameState(nextGameState, userId, getCachedStaticGameMap(gameId), effectiveOptions);
    return nextGameState;
  }

  if (!baseGameState || baseGameState.id !== gameId) {
    return null;
  }

  const nextGameState = mergeGameDynamicState(baseGameState, data, userId, effectiveOptions);
  writeCachedGameState(nextGameState, userId, getCachedStaticGameMap(gameId), effectiveOptions);
  return nextGameState;
}
