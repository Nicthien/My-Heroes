import { mapApiToGameState } from "./api";

export async function refreshGameState(gameId: string, userId?: string) {
  const res = await fetch(`/api/games/${gameId}`);
  if (!res.ok) return null;
  const data = await res.json();
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

  return mapApiToGameState(data, userId);
}
