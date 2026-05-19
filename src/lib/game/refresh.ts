import { getCachedStaticGameMap, mapApiToGameState, mergeGameDynamicState } from "./api";
import { writeCachedGameState } from "./local-cache";
import { fetchWithSupabaseAuth } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";

export async function refreshGameState(
  gameId: string,
  userId?: string,
  options: { revealMap?: boolean } = {}
) {
  const baseGameState = useGameStore.getState().gameState;
  const canUseIncrementalSync = baseGameState?.id === gameId && Boolean(getCachedStaticGameMap(gameId));
  let usedIncrementalSync = canUseIncrementalSync;
  let endpoint = usedIncrementalSync ? `/api/games/${gameId}/sync` : `/api/games/${gameId}`;

  let res = await fetchWithSupabaseAuth(endpoint, { cache: "no-store" });
  if (!res.ok && usedIncrementalSync) {
    usedIncrementalSync = false;
    endpoint = `/api/games/${gameId}`;
    res = await fetchWithSupabaseAuth(endpoint, { cache: "no-store" });
  }
  if (!res.ok) return null;
  const data = await res.json();

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

    const nextGameState = mapApiToGameState(data, userId, options);
    writeCachedGameState(nextGameState, userId, getCachedStaticGameMap(gameId), options);
    return nextGameState;
  }

  if (!baseGameState || baseGameState.id !== gameId) {
    return null;
  }

  const nextGameState = mergeGameDynamicState(baseGameState, data, userId, options);
  writeCachedGameState(nextGameState, userId, getCachedStaticGameMap(gameId), options);
  return nextGameState;
}
