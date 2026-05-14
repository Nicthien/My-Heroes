import { GameMap, Position } from "@/lib/game/types";

export interface MapObjectData {
  type: "hero" | "town" | "combat" | "building" | "adventure_building";
  id: string;
  playerId: string | null;
  x: number;
  y: number;
  faction: string;
  color: string;
  name: string;
  onWater?: boolean;
  inTown?: boolean;
  buildingType?: string;
  guardianPower?: number;
}

export interface MapRenderer {
  init(container: HTMLDivElement): Promise<void>;
  isReady(): boolean;
  renderMap(map: GameMap): void;
  setObjects(objects: MapObjectData[]): void;
  setFog(visibleTiles: Set<string>, exploredTiles: Set<string>): void;
  highlightPath(path: Position[]): void;
  highlightPartialPath(reachable: Position[], unreachable: Position[], turnsLabel?: string): void;
  highlightTiles(tiles: Position[], color?: number, alpha?: number): void;
  highlightTile(x: number, y: number, color?: number): void;
  clearHighlights(): void;
  clearReachable(): void;
  centerOnTile(x: number, y: number): void;
  panCamera(dx: number, dy: number): void;
  zoomCamera(direction: number, screenX?: number, screenY?: number): void;
  getTileAtScreen(screenX: number, screenY: number): Position | null;
  getObjectsAtScreen(screenX: number, screenY: number): MapObjectData[];
  destroy(): void;
}
