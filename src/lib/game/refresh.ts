import { mapApiToGameState } from "./api";

export async function refreshGameState(gameId: string, userId?: string) {
  const res = await fetch(`/api/games/${gameId}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.mapData) {
    const { generateMap } = await import("./engine");
    data.mapData = generateMap(data.mapWidth, data.mapHeight);
  }
  return mapApiToGameState(data, userId);
}
