import { getCachedStaticGameMap, mapApiToGameState, mergeGameDynamicState } from "./api";
import { fetchWithSupabaseAuth } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";

export async function refreshGameState(
  gameId: string,
  userId?: string,
  options: { revealMap?: boolean } = {}
) {
  const baseGameState = useGameStore.getState().gameState;
  const canUseIncrementalSync = baseGameState?.id === gameId && Boolean(getCachedStaticGameMap(gameId));
  const endpoint = canUseIncrementalSync ? `/api/games/${gameId}/sync` : `/api/games/${gameId}`;

  const res = await fetchWithSupabaseAuth(endpoint, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();

  if (!canUseIncrementalSync) {
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

    return mapApiToGameState(data, userId, options);
  }

  if (!baseGameState || baseGameState.id !== gameId) {
    return null;
  }

  return mergeGameDynamicState(baseGameState, data, userId, options);
}
