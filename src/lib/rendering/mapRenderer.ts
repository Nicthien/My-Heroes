import { GameMap, Position } from "@/lib/game/types";
import type { Locale } from "@/lib/i18n/types";

export interface MapObjectData {
  type: "hero" | "boat" | "town" | "combat" | "building" | "adventure_building" | "gate";
  id: string;
  playerId: string | null;
  x: number;
  y: number;
  faction: string;
  color: string;
  name: string;
  onWater?: boolean;
  inTown?: boolean;
  renderOffsetX?: number;
  renderOffsetY?: number;
  buildingType?: string;
  dwellingUnitType?: string;
  guardianPower?: number;
  description?: string;
  visited?: boolean;
}

export interface SpellRevealHint {
  x: number;
  y: number;
  kind: "resource" | "building" | "artifact" | "hero" | "town";
  subtype?: string;
}

export type RendererLoadingProgress = (progress: number, message?: string) => void;
export type FogTheme = "surface" | "underground";

// Surfaced to the UI when the renderer detects a degraded GPU path (notably
// Edge falling back to software WebGL). Lets us show an actionable hint rather
// than leaving players to wonder why the map crawls.
export interface RenderPerformanceNotice {
  isSoftwareRendering: boolean;
  renderer: string;
}

export interface MapRenderer {
  init(container: HTMLDivElement, onLoadingProgress?: RendererLoadingProgress): Promise<void>;
  isReady(): boolean;
  renderMap(map: GameMap): void;
  setLocale(locale: Locale): void;
  setObjects(objects: MapObjectData[]): void;
  setFog(visibleTiles: Set<string>, exploredTiles: Set<string>, theme?: FogTheme): void;
  animateHeroMovement(heroId: string, path: Position[]): Promise<void>;
  highlightPath(path: Position[]): void;
  highlightPartialPath(reachable: Position[], unreachable: Position[], turnsLabel?: string): void;
  highlightTiles(tiles: Position[], color?: number, alpha?: number): void;
  highlightTile(x: number, y: number, color?: number): void;
  clearHighlights(): void;
  setSpellRevealHighlights(tiles: Position[], color?: number, alpha?: number, hints?: SpellRevealHint[]): void;
  clearSpellRevealHighlights(): void;
  clearReachable(): void;
  followHero(heroId: string | null): void;
  centerOnTile(x: number, y: number): void;
  panCamera(dx: number, dy: number): void;
  zoomCamera(direction: number, screenX?: number, screenY?: number): void;
  getTileAtScreen(screenX: number, screenY: number): Position | null;
  getObjectsAtScreen(screenX: number, screenY: number): MapObjectData[];
  /** Fades a night-time darkening overlay in (true) or out (false). */
  setNightMode(enabled: boolean): void;
  /** Performance notice (e.g. software-rendering fallback), or null if healthy. */
  getPerformanceNotice(): RenderPerformanceNotice | null;
  destroy(): void;
}
