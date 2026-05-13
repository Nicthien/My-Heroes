"use client";

import { useEffect, useRef, useState } from "react";
import { GameMap, MapObject, TerrainType } from "@/lib/game/types";

export const TERRAIN_COLOR: Record<TerrainType, string> = {
  grass: "#4f9a45",
  water: "#1c5f8f",
  mountain: "#8c8f88",
  forest: "#235f2d",
  dirt: "#9a7a3b",
  sand: "#d8b36a",
  snow: "#e7edf1",
  swamp: "#53613d",
  lava: "#b63a2a",
};

export const OBJECT_COLOR: Record<MapObject["type"], string> = {
  town: "#d8d1bd",
  hero: "#60a5fa",
  resource: "#facc15",
  artifact: "#a78bfa",
  monster: "#dc2626",
  building: "#f59e0b",
  combat: "#fb923c",
  wall: "#111827",
  gate: "#78350f",
};

interface RmgMapPreviewProps {
  map: GameMap;
  className?: string;
  minSize?: number;
  maxSize?: number;
  cellScale?: number;
  heightOffset?: number;
}

export function RmgMapPreview({
  map,
  className = "",
  minSize = 320,
  maxSize = 1120,
  cellScale = 8,
  heightOffset = 18,
}: RmgMapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState(minSize);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateSize = () => {
      const rect = frame.getBoundingClientRect();
      const framedHeight = rect.height > heightOffset * 2 ? rect.height - heightOffset : Number.POSITIVE_INFINITY;
      const windowHeight = Math.max(minSize, window.innerHeight - rect.top - heightOffset);
      const availableHeight = Math.max(minSize, Math.min(framedHeight, windowHeight));
      const availableWidth = Math.max(minSize, rect.width - heightOffset);
      const preferredSize = Math.max(minSize, Math.min(maxSize, map.width * cellScale));
      setViewportSize(Math.floor(Math.min(preferredSize, availableWidth, availableHeight)));
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(frame);
    window.addEventListener("resize", updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [cellScale, heightOffset, map.width, maxSize, minSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = viewportSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cell = size / Math.max(map.width, map.height);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        ctx.fillStyle = TERRAIN_COLOR[tile.terrain] ?? "#111827";
        ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));

        if (tile.elevation > 0 && tile.terrain !== TerrainType.WATER) {
          ctx.fillStyle = `rgba(255,255,255,${Math.min(0.26, tile.elevation * 0.055)})`;
          ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }

    for (const row of map.tiles) {
      for (const tile of row) {
        const cx = tile.x * cell + cell / 2;
        const cy = tile.y * cell + cell / 2;
        if (tile.road) {
          ctx.fillStyle = tile.terrain === TerrainType.WATER ? "#8b5a2b" : tile.road === "paved" ? "#b8aa92" : "#7a5c38";
          ctx.fillRect(tile.x * cell + cell * 0.28, tile.y * cell + cell * 0.28, cell * 0.44, cell * 0.44);
        }
        if (tile.decor) {
          ctx.fillStyle = tile.decor.blocking ? "rgba(20,20,20,0.5)" : "rgba(255,255,255,0.28)";
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1.2, cell * 0.13), 0, Math.PI * 2);
          ctx.fill();
        }
        if (tile.object) {
          ctx.fillStyle = OBJECT_COLOR[tile.object.type] ?? "#ffffff";
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2, cell * objectRadius(tile.object.type)), 0, Math.PI * 2);
          ctx.fill();
          if (tile.object.type === "wall") {
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.fillRect(tile.x * cell, tile.y * cell, Math.ceil(cell), Math.ceil(cell));
          }
        }
      }
    }
  }, [map, viewportSize]);

  return (
    <div
      ref={frameRef}
      className={`flex min-h-0 min-w-0 items-start justify-center overflow-hidden border border-stone-800 bg-stone-900 p-2 ${className}`}
    >
      <canvas ref={canvasRef} className="block max-w-full rounded-sm" />
    </div>
  );
}

function objectRadius(type: MapObject["type"]): number {
  if (type === "town") return 0.34;
  if (type === "building") return 0.28;
  if (type === "monster") return 0.25;
  return 0.2;
}
