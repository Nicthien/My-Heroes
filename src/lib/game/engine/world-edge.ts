import { MapTile, TerrainType } from "../types";
import { makeRng, randInt } from "./rng";

const EDGE_POCKET_SIZE = 4;

export function applyWorldEdge(
  tiles: MapTile[][],
  width: number,
  height: number,
  seed: string
): void {
  if (width < 3 || height < 3) return;

  const rng = makeRng(`${seed}:world-edge`);
  const pocketKinds = buildEdgePockets(width, height, rng);
  // rimHeight varies smoothly: each rock pocket picks 1-3, but consecutive
  // rock pockets only differ by ±1 from the previous one. This gives a wavy
  // rim with visible variation but no large vertical steps between neighbours.
  const pocketRimHeights: number[] = [];
  let currentRim = 0;
  for (let index = 0; index < pocketKinds.length; index++) {
    const kind = pocketKinds[index];
    if (kind === "water") {
      pocketRimHeights.push(0);
      continue;
    }
    const noise = edgeNoise(seed, index, 0, 31);
    if (pocketKinds[index - 1] !== "rock") {
      currentRim = 1 + Math.floor(noise * 3);
    } else {
      const delta = Math.floor(noise * 3) - 1; // -1, 0 or +1
      currentRim = Math.min(3, Math.max(1, currentRim + delta));
    }
    pocketRimHeights.push(currentRim);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isOuterEdge(x, y, width, height)) continue;

      const tile = tiles[y]?.[x];
      if (!tile) continue;

      const pocketIndex = getEdgePocketIndex(x, y, width, height);
      const kind = pocketKinds[pocketIndex] ?? "rock";
      const variant = Math.floor(edgeNoise(seed, x, y, 17) * 1000);
      const rimHeight = pocketRimHeights[pocketIndex] ?? 0;
      const dropDepth =
        kind === "water"
          ? 15 + Math.floor(edgeNoise(seed, x, y, 47) * 11)
          : 5 + Math.floor(edgeNoise(seed, x, y, 47) * 6);

      tile.terrain = kind === "rock" ? TerrainType.MOUNTAIN : TerrainType.WATER;
      tile.elevation = kind === "water" ? 0 : rimHeight;
      tile.isPassable = false;
      tile.movementCost = 999;
      tile.object = undefined;
      tile.decor = undefined;
      tile.road = undefined;
      tile.worldEdge = {
        kind,
        rimHeight,
        dropDepth,
        variant,
        retainsWater: kind === "rock" && touchesWaterPocket(pocketKinds, pocketIndex),
      };
    }
  }
}

function buildEdgePockets(width: number, height: number, rng: () => number): Array<"rock" | "water"> {
  const perimeter = width * 2 + Math.max(0, height - 2) * 2;
  const pocketCount = Math.max(1, Math.ceil(perimeter / EDGE_POCKET_SIZE));
  const pockets: Array<"rock" | "water"> = [];

  for (let index = 0; index < pocketCount; index++) {
    const previous = pockets[index - 1];
    const continues = previous && rng() < 0.58;
    let kind: "rock" | "water" = continues ? previous : rng() < 0.56 ? "water" : "rock";

    if (index === 0 || index === pocketCount - 1) kind = "rock";
    if (index > 1 && pockets[index - 1] === "water" && pockets[index - 2] === "water" && rng() < 0.34) {
      kind = "rock";
    }

    pockets.push(kind);
  }

  for (let i = 0; i < Math.max(2, Math.floor(pocketCount / 9)); i++) {
    pockets[randInt(rng, 0, pocketCount - 1)] = "rock";
  }

  return pockets;
}

function isOuterEdge(x: number, y: number, width: number, height: number) {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

function getEdgePocketIndex(x: number, y: number, width: number, height: number) {
  let perimeterIndex: number;
  if (y === 0) perimeterIndex = x;
  else if (x === width - 1) perimeterIndex = width + y - 1;
  else if (y === height - 1) perimeterIndex = width + height - 2 + (width - 1 - x);
  else perimeterIndex = width * 2 + height - 3 + (height - 1 - y);

  return Math.floor(perimeterIndex / EDGE_POCKET_SIZE);
}

function touchesWaterPocket(pockets: Array<"rock" | "water">, index: number) {
  return pockets[index - 1] === "water" || pockets[index + 1] === "water";
}

function edgeNoise(seed: string, x: number, y: number, salt: number) {
  let value = 2166136261;
  const input = `${seed}:${x}:${y}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}
