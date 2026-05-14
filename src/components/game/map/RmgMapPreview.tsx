"use client";

import { useEffect, useRef, useState } from "react";
import { GameMap, MapObject, RoadType, TerrainType } from "@/lib/game/types";

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
  adventure: "#a78bfa",
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
          drawPreviewRoad(ctx, map, tile.x, tile.y, tile.road, tile.terrain === TerrainType.WATER, cell);
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
  if (type === "adventure") return 0.26;
  if (type === "monster") return 0.25;
  return 0.2;
}

function drawPreviewRoad(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  x: number,
  y: number,
  road: RoadType,
  isBridge: boolean,
  cell: number
) {
  const cx = x * cell + cell / 2;
  const cy = y * cell + cell / 2;
  const seed = ((x + 17) * 374761393) ^ ((y + 31) * 668265263);
  const palette = isBridge
    ? { edge: "#4a2f18", fill: "#b8793d", highlight: "rgba(255,224,176,0.55)", grit: "rgba(54,32,17,0.45)" }
    : road === "paved"
      ? { edge: "#4d4237", fill: "#d8c9ae", highlight: "rgba(255,248,226,0.5)", grit: "rgba(72,62,51,0.45)" }
      : { edge: "#4f351d", fill: "#b9823e", highlight: "rgba(255,218,145,0.45)", grit: "rgba(61,40,21,0.5)" };
  const sides = [
    { dx: 0, dy: -1, tx: 0, ty: -0.5 },
    { dx: 1, dy: 0, tx: 0.5, ty: 0 },
    { dx: 0, dy: 1, tx: 0, ty: 0.5 },
    { dx: -1, dy: 0, tx: -0.5, ty: 0 },
  ].filter((side) => map.tiles[y + side.dy]?.[x + side.dx]?.road);
  const connections = sides.length > 0 ? sides : [{ dx: 0, dy: 1, tx: 0, ty: 0.5 }];

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const side of connections) {
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = Math.max(1.6, cell * 0.24);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + side.tx * cell, cy + side.ty * cell);
    ctx.stroke();

    ctx.strokeStyle = palette.fill;
    ctx.lineWidth = Math.max(1, cell * 0.14);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + side.tx * cell, cy + side.ty * cell);
    ctx.stroke();

    if (!isBridge) {
      drawPreviewGravel(ctx, cx, cy, cx + side.tx * cell, cy + side.ty * cell, palette.grit, palette.highlight, seed + indexHash(side.dx, side.dy), cell);
    }
  }

  if (!isBridge) {
    drawPreviewJunctionGravel(ctx, cx, cy, palette.grit, palette.highlight, seed + 97, cell);
  } else {
    ctx.fillStyle = palette.edge;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.1, cell * 0.13), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.fill;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.8, cell * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPreviewGravel(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  grit: string,
  highlight: string,
  seed: number,
  cell: number
) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const size = Math.max(0.85, cell * 0.06);

  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.18 + previewRandom(seed, i) * 0.08;
    const offset = (previewRandom(seed + 13, i) - 0.5) * cell * 0.36;
    const gx = fromX + dx * t + nx * offset;
    const gy = fromY + dy * t + ny * offset;
    ctx.fillStyle = previewRandom(seed + 29, i) > 0.62 ? highlight : grit;
    ctx.fillRect(gx - size / 2, gy - size / 2, size, size);
  }
}

function drawPreviewJunctionGravel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  grit: string,
  highlight: string,
  seed: number,
  cell: number
) {
  const size = Math.max(0.8, cell * 0.055);
  for (let i = 0; i < 6; i++) {
    const angle = previewRandom(seed + 19, i) * Math.PI * 2;
    const distance = cell * (0.08 + previewRandom(seed + 37, i) * 0.22);
    const gx = cx + Math.cos(angle) * distance;
    const gy = cy + Math.sin(angle) * distance * 0.65;
    ctx.fillStyle = previewRandom(seed + 61, i) > 0.68 ? highlight : grit;
    ctx.fillRect(gx - size / 2, gy - size / 2, size, size);
  }
}

function previewRandom(seed: number, index: number): number {
  const value = Math.sin((seed + index * 12.9898) * 43758.5453);
  return value - Math.floor(value);
}

function indexHash(dx: number, dy: number): number {
  return (dx + 2) * 31 + (dy + 2) * 53;
}
