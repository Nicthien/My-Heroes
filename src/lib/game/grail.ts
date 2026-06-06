import { AdventureBuildingType, Faction, type GameMap, type MapObject, type MapTile } from "./types";
import { hashSeed, makeRng, shuffle } from "./engine/rng";
import { getFactionBuildingRules } from "./economy";

/**
 * The Grail mechanic — fully outside the normal town build tree.
 *
 * Flow (HOMM3-style):
 *  1. A single buried Grail tile is chosen at game creation and stored in
 *     `games.game_config.grail` (see {@link normalizeGrailLocation}).
 *  2. Visiting Obelisks reveals the puzzle map; once a player has visited
 *     {@link OBELISK_REVEAL_THRESHOLD} of the map's obelisks, the exact tile is
 *     shown (before that, the probable zone tightens progressively).
 *  3. A hero standing on the tile uses the "Dig" action (consumes all movement)
 *     and obtains the {@link GRAIL_ARTIFACT_ID} artifact.
 *  4. Entering an allied town with the Grail lets the player erect that town's
 *     faction Grail structure (only one Grail building per map).
 */

/** Inventory artifact id for the carried Grail. */
export const GRAIL_ARTIFACT_ID = "grail";

/** Fraction of a map's obelisks a player must visit to reveal the exact tile. */
export const OBELISK_REVEAL_THRESHOLD = 0.75;

/** A map carries between 2× and 3× the player count in Obelisks. */
export const OBELISK_MIN_PER_PLAYER = 2;
export const OBELISK_MAX_PER_PLAYER = 3;

export interface GrailLocation {
  x: number;
  y: number;
  mapLevel: string;
}

/**
 * Coerce an untyped `game_config.grail` blob into a GrailLocation, or null when
 * absent/invalid (legacy games created before the Grail feature).
 */
export function normalizeGrailLocation(raw: unknown): GrailLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const x = Number(source.x);
  const y = Number(source.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    mapLevel: typeof source.mapLevel === "string" ? source.mapLevel : "surface",
  };
}

/** Read the buried Grail location out of a (possibly legacy) game_config blob. */
export function getGrailLocation(gameConfig: unknown): GrailLocation | null {
  if (!gameConfig || typeof gameConfig !== "object") return null;
  return normalizeGrailLocation((gameConfig as Record<string, unknown>).grail);
}

/** A tile is Grail-buriable if a hero can stand on it and it is plain ground. */
function isGrailBuriableTile(tile: MapTile | undefined): boolean {
  return Boolean(
    tile &&
    tile.isPassable &&
    tile.terrain !== "water" &&
    !tile.object &&
    !tile.road &&
    !tile.decor?.blocking &&
    !tile.worldEdge,
  );
}

/** Walkable-for-reachability: any non-blocking land tile (objects passable). */
function isWalkableForReach(tile: MapTile | undefined): boolean {
  return Boolean(
    tile &&
    tile.isPassable &&
    tile.terrain !== "water" &&
    !tile.decor?.blocking &&
    !tile.worldEdge &&
    tile.object?.type !== "wall" &&
    tile.object?.type !== "town_footprint",
  );
}

/**
 * All surface land tiles reachable on foot from any town — i.e. tiles a hero can
 * actually walk to (an "invisible route" exists). Flood fill over 8 directions.
 */
export function computeReachableLandTiles(map: GameMap): Set<string> {
  const reached = new Set<string>();
  const queue: Array<{ x: number; y: number }> = [];
  const seed = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (reached.has(key) || !isWalkableForReach(map.tiles[y]?.[x])) return;
    reached.add(key);
    queue.push({ x, y });
  };
  // Seed from the walkable ring around each town (the town centre is wrapped in
  // impassable footprint tiles, so flood from its walkable neighbours instead).
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.object?.type !== "town") continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          seed(tile.x + dx, tile.y + dy);
        }
      }
    }
  }
  // Orthogonal (4-dir) flood: a strict subset of real hero movement (which is
  // 8-dir but forbids diagonal corner-cutting), so any tile reached here is
  // guaranteed walkable by a hero — no "looks reachable but isn't" pockets.
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      const key = `${nx},${ny}`;
      if (reached.has(key)) continue;
      if (!isWalkableForReach(map.tiles[ny]?.[nx])) continue;
      reached.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return reached;
}

/**
 * Pick the single buried Grail tile for a map. Prefers a remote ground tile far
 * from every town, but only among tiles a hero can actually walk to, so the dig
 * site is always reachable. Deterministic for a given seed; null if none fits.
 */
export function pickGrailLocation(mapData: GameMap): GrailLocation | null {
  const towns: Array<{ x: number; y: number }> = [];
  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "town") towns.push({ x: tile.x, y: tile.y });
    }
  }
  const reachable = computeReachableLandTiles(mapData);
  const buriable: MapTile[] = [];
  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (isGrailBuriableTile(tile) && reachable.has(`${tile.x},${tile.y}`)) buriable.push(tile);
    }
  }
  // Fallback: if reachability filtered everything out, accept any buriable tile.
  const eligible = buriable.length > 0
    ? buriable
    : mapData.tiles.flat().filter(isGrailBuriableTile);
  if (eligible.length === 0) return null;

  const distToNearestTown = (tile: MapTile) => {
    if (towns.length === 0) return Number.POSITIVE_INFINITY;
    let best = Number.POSITIVE_INFINITY;
    for (const town of towns) {
      const d = Math.max(Math.abs(tile.x - town.x), Math.abs(tile.y - town.y));
      if (d < best) best = d;
    }
    return best;
  };

  // Rank by remoteness, then take a deterministic pick from the remote quartile
  // so the spot is hidden but not always the exact same corner across seeds.
  const ranked = eligible
    .map((tile) => ({ tile, remote: distToNearestTown(tile) }))
    .sort((a, b) => b.remote - a.remote);
  const poolSize = Math.max(1, Math.floor(ranked.length * 0.25));
  const pool = ranked.slice(0, poolSize);
  const index = hashSeed(`${mapData.seed ?? "grail"}:grail`) % pool.length;
  const chosen = pool[index].tile;
  return { x: chosen.x, y: chosen.y, mapLevel: "surface" };
}

/** A tile suitable to host a freshly-added Obelisk (off-road plain ground). */
function isObeliskPlaceable(tile: MapTile | undefined): boolean {
  return isGrailBuriableTile(tile);
}

/** True when an adjacent (8-dir) tile carries a road, so the tile borders a path. */
function hasRoadNeighbor(map: GameMap, tile: MapTile): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (map.tiles[tile.y + dy]?.[tile.x + dx]?.road) return true;
    }
  }
  return false;
}

/**
 * Force the surface Obelisk count into [2×, 3×] the player count. Removes the
 * surplus or seeds extra Obelisks on reachable, well-spread ground tiles.
 * Mutates `mapData`; deterministic for a given seed. Returns the final count.
 */
export function normalizeObeliskCount(mapData: GameMap, playerCount: number): number {
  const players = Math.max(1, Math.floor(playerCount));
  const min = OBELISK_MIN_PER_PLAYER * players;
  const max = OBELISK_MAX_PER_PLAYER * players;
  const seed = mapData.seed ?? "grail";
  const reachable = computeReachableLandTiles(mapData);
  const hasReachableNeighbor = (tile: MapTile) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (reachable.has(`${tile.x + dx},${tile.y + dy}`)) return true;
      }
    }
    return false;
  };

  // 1) Keep only Obelisks that a hero can walk up to AND that border a visible
  //    road (so every Obelisk sits beside a path). Others are removed and later
  //    re-seeded on road-bordering ground. NB: this intentionally overrides the
  //    usual "adventure buildings away from roads" rule, for Obelisks only.
  let obeliskTiles: MapTile[] = [];
  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "adventure_building" && tile.object.subtype === AdventureBuildingType.OBELISK) {
        if (hasReachableNeighbor(tile) && hasRoadNeighbor(mapData, tile)) obeliskTiles.push(tile);
        else tile.object = undefined;
      }
    }
  }

  // 2) Trim any surplus above the cap (deterministic).
  if (obeliskTiles.length > max) {
    const ordered = [...obeliskTiles].sort(
      (a, b) => hashSeed(`${seed}:ob:${b.x}:${b.y}`) - hashSeed(`${seed}:ob:${a.x}:${a.y}`),
    );
    for (const tile of ordered.slice(0, obeliskTiles.length - max)) tile.object = undefined;
    obeliskTiles = ordered.slice(obeliskTiles.length - max);
    return max;
  }

  // 3) Seed extra Obelisks on reachable, well-spread ground tiles up to the min.
  //    Prefer tiles that border a visible road (never ON a road), so each new
  //    Obelisk sits beside a path rather than at the end of an invisible trek.
  if (obeliskTiles.length < min) {
    const taken = new Set(obeliskTiles.map((tile) => `${tile.x},${tile.y}`));
    const placeable = mapData.tiles
      .flat()
      .filter((tile) => isObeliskPlaceable(tile) && reachable.has(`${tile.x},${tile.y}`));
    const roadAdjacent = placeable.filter((tile) => hasRoadNeighbor(mapData, tile));
    // Road-bordering tiles first, then the rest as a fallback.
    const ordered = [
      ...shuffle(makeRng(`${seed}:obelisk-road`), roadAdjacent),
      ...shuffle(makeRng(`${seed}:obelisk-fill`), placeable.filter((tile) => !hasRoadNeighbor(mapData, tile))),
    ];

    const tooCloseToExisting = (tile: MapTile) =>
      [...taken].some((key) => {
        const [kx, ky] = key.split(",").map(Number);
        return Math.max(Math.abs(tile.x - kx), Math.abs(tile.y - ky)) < 3;
      });

    let added = obeliskTiles.length;
    for (const tile of ordered) {
      if (added >= min) break;
      const key = `${tile.x},${tile.y}`;
      if (taken.has(key) || tooCloseToExisting(tile)) continue;
      const obelisk: MapObject = {
        type: "adventure_building",
        id: `adv-obelisk-${tile.x}-${tile.y}`,
        subtype: AdventureBuildingType.OBELISK,
        name: "Obélisque",
      };
      tile.object = obelisk;
      taken.add(key);
      added += 1;
    }
    return added;
  }

  return obeliskTiles.length;
}

/** Every Obelisk id follows this convention (RMG and grail-fill alike). */
export const OBELISK_ID_PREFIX = "adv-obelisk-";

/** Ids of every Obelisk on the surface map (the puzzle-map pieces). */
export function getObeliskIds(map: GameMap): string[] {
  const ids: string[] = [];
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "adventure_building" && tile.object.subtype === AdventureBuildingType.OBELISK) {
        ids.push(tile.object.id);
      }
    }
  }
  return ids;
}

/** Count how many of a player's visited adventure-building ids are Obelisks. */
export function countVisitedObelisks(visitedBuildingIds: string[]): number {
  return visitedBuildingIds.filter((id) => id.startsWith(OBELISK_ID_PREFIX)).length;
}

/**
 * Per-player view of the buried Grail. Before the reveal threshold the exact
 * tile is withheld and only a shrinking probable {@link GrailHint.zone} is sent;
 * once enough obelisks are visited the exact {@link GrailHint.tile} is exposed.
 */
export interface GrailHint {
  obelisksTotal: number;
  obelisksVisited: number;
  revealed: boolean;
  /** True once the Grail has been dug up — the puzzle is solved/obsolete. */
  dug: boolean;
  mapLevel: string;
  tile?: { x: number; y: number };
  zone?: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Build the sanitized Grail hint for one player. `visitedBuildingIds` is that
 * player's list of visited adventure-building ids (from `playerAdventureVisits`).
 * Returns null when the map has no buried Grail (legacy games).
 */
/**
 * Core hint logic working purely from counts + map dimensions (no map tiles) —
 * so it can run on the lightweight sync path that doesn't ship the full map.
 */
export function computeGrailHintFromCounts(params: {
  grail: GrailLocation;
  obelisksTotal: number;
  obelisksVisited: number;
  mapWidth: number;
  mapHeight: number;
  dug?: boolean;
}): GrailHint {
  const { grail, obelisksTotal, obelisksVisited, mapWidth, mapHeight, dug = false } = params;

  // With no obelisks at all the tile is revealed so the Grail stays obtainable.
  if (obelisksTotal === 0) {
    return { obelisksTotal, obelisksVisited, revealed: true, dug, mapLevel: grail.mapLevel, tile: { x: grail.x, y: grail.y } };
  }

  // Until the player has visited at least one obelisk, nothing is shown — no
  // tile, no probable zone (the puzzle map stays blank).
  if (obelisksVisited <= 0) {
    return { obelisksTotal, obelisksVisited, revealed: false, dug, mapLevel: grail.mapLevel };
  }

  // The puzzle window is a FIXED fragment of the map around the Grail. Obelisks
  // progressively uncover its pieces (handled client-side); the exact tile is
  // only pinpointed once the threshold fraction of obelisks has been visited.
  const required = Math.max(1, Math.ceil(obelisksTotal * OBELISK_REVEAL_THRESHOLD));
  const revealed = obelisksVisited >= required;
  const half = Math.max(4, Math.round(Math.max(mapWidth, mapHeight) * 0.3));
  const zone = {
    minX: Math.max(0, grail.x - half),
    minY: Math.max(0, grail.y - half),
    maxX: Math.min(mapWidth - 1, grail.x + half),
    maxY: Math.min(mapHeight - 1, grail.y + half),
  };
  return {
    obelisksTotal,
    obelisksVisited,
    revealed,
    dug,
    mapLevel: grail.mapLevel,
    zone,
    ...(revealed ? { tile: { x: grail.x, y: grail.y } } : {}),
  };
}

export function computeGrailHint(
  map: GameMap,
  grail: GrailLocation | null,
  visitedBuildingIds: string[],
  dug = false,
): GrailHint | null {
  if (!grail) return null;
  return computeGrailHintFromCounts({
    grail,
    obelisksTotal: getObeliskIds(map).length,
    obelisksVisited: countVisitedObelisks(visitedBuildingIds),
    mapWidth: map.width,
    mapHeight: map.height,
    dug,
  });
}

export type GrailEffect =
  | { kind: "heroStat"; stat: "morale" | "luck" | "attack" | "defense" | "spellPower"; amount: number; scope: "ally" | "enemy" }
  | { kind: "revealMap" }
  | { kind: "allSpells" }
  | { kind: "necromancy"; percent: number };

/**
 * Per-faction monumental Grail effect, applied globally on top of the shared
 * +5000 gold/day and +50% creature growth granted by every Grail structure.
 */
export const GRAIL_EFFECTS: Record<Faction, GrailEffect> = {
  [Faction.CASTLE]: { kind: "heroStat", stat: "morale", amount: 2, scope: "ally" },
  [Faction.RAMPART]: { kind: "heroStat", stat: "luck", amount: 2, scope: "ally" },
  [Faction.TOWER]: { kind: "revealMap" },
  [Faction.INFERNO]: { kind: "heroStat", stat: "morale", amount: -1, scope: "enemy" },
  [Faction.NECROPOLIS]: { kind: "necromancy", percent: 15 },
  [Faction.DUNGEON]: { kind: "heroStat", stat: "spellPower", amount: 2, scope: "ally" },
  [Faction.STRONGHOLD]: { kind: "heroStat", stat: "attack", amount: 2, scope: "ally" },
  [Faction.FORTRESS]: { kind: "heroStat", stat: "defense", amount: 2, scope: "ally" },
  [Faction.CONFLUX]: { kind: "allSpells" },
};

export function getGrailEffect(faction: Faction): GrailEffect {
  return GRAIL_EFFECTS[faction];
}

interface GrailTownLike {
  townType?: string | Faction | null;
  faction?: string | Faction | null;
  buildings?: string[];
}
interface GrailPlayerLike {
  faction?: string | Faction | null;
  towns?: GrailTownLike[];
}

/** Every monumental Grail effect a player currently has erected. */
export function getPlayerGrailEffects(player: GrailPlayerLike): GrailEffect[] {
  const effects: GrailEffect[] = [];
  for (const town of player.towns ?? []) {
    const faction = (town.townType ?? town.faction ?? player.faction) as Faction | undefined;
    if (!faction) continue;
    const rules = getFactionBuildingRules(faction);
    for (const building of town.buildings ?? []) {
      if (rules.find((rule) => rule.type === building)?.grail) effects.push(getGrailEffect(faction));
    }
  }
  return effects;
}

export interface GrailAura {
  attack: number;
  defense: number;
  spellPower: number;
  morale: number;
  luck: number;
}

const ZERO_AURA: GrailAura = { attack: 0, defense: 0, spellPower: 0, morale: 0, luck: 0 };

/** Sum of the player's own (ally-scoped) Grail hero-stat bonuses. */
export function getAllyGrailAura(player: GrailPlayerLike): GrailAura {
  const aura: GrailAura = { ...ZERO_AURA };
  for (const effect of getPlayerGrailEffects(player)) {
    if (effect.kind === "heroStat" && effect.scope === "ally") aura[effect.stat] += effect.amount;
  }
  return aura;
}

/** Morale malus this player projects onto enemy heroes (e.g. Inferno terror). */
export function getEnemyGrailMoraleMalus(player: GrailPlayerLike): number {
  let malus = 0;
  for (const effect of getPlayerGrailEffects(player)) {
    if (effect.kind === "heroStat" && effect.scope === "enemy" && effect.stat === "morale") malus += effect.amount;
  }
  return malus;
}

/** Extra global necromancy percentage granted by the player's Grail. */
export function getGrailNecromancyPercent(player: GrailPlayerLike): number {
  let percent = 0;
  for (const effect of getPlayerGrailEffects(player)) {
    if (effect.kind === "necromancy") percent += effect.percent;
  }
  return percent;
}

/** Whether the player has erected a Grail granting the given effect kind. */
export function playerHasGrailEffect(player: GrailPlayerLike, kind: GrailEffect["kind"]): boolean {
  return getPlayerGrailEffects(player).some((effect) => effect.kind === kind);
}
