import { computeGrailHintFromCounts, countVisitedObelisks, getGrailLocation, getObeliskIds, type GrailHint } from "@/lib/game/grail";
import type { GameMap } from "@/lib/game/types";

/**
 * Server-side, per-viewer Grail hint. The exact buried tile is only included
 * once the viewer has earned the reveal (or the game/map is fully revealed) — it
 * is computed here so the raw location never leaves the server (see
 * {@link stripGrailFromGameConfig}).
 */
export function buildViewerGrailHint(
  game: { gameConfig?: unknown; mapData?: unknown; mapState?: unknown; mapWidth?: unknown; mapHeight?: unknown },
  viewerPlayerId: string | undefined,
  reveal = false,
): GrailHint | null {
  const grail = getGrailLocation(game.gameConfig);
  if (!grail) return null;
  const mapState = (game.mapState as Record<string, unknown> | undefined) ?? {};
  const dug = Boolean(mapState.grailFound);
  if (reveal) {
    return { obelisksTotal: 0, obelisksVisited: 0, revealed: true, dug, mapLevel: grail.mapLevel, tile: { x: grail.x, y: grail.y } };
  }

  // Works without the full map: prefer the obelisk total stored in game_config
  // (the sync payload omits map_data). Fall back to counting from the map only
  // when it happens to be present (full GET / legacy games).
  const config = (game.gameConfig as Record<string, unknown> | undefined) ?? {};
  const map = game.mapData as GameMap | undefined;
  const obelisksTotal = typeof config.obelisksTotal === "number"
    ? config.obelisksTotal
    : map?.tiles ? getObeliskIds(map).length : 0;
  const visits = viewerPlayerId
    ? (mapState.playerAdventureVisits as Record<string, string[]> | undefined)?.[viewerPlayerId] ?? []
    : [];
  return computeGrailHintFromCounts({
    grail,
    obelisksTotal,
    obelisksVisited: countVisitedObelisks(visits),
    mapWidth: Number(game.mapWidth ?? map?.width ?? 0),
    mapHeight: Number(game.mapHeight ?? map?.height ?? 0),
    dug,
  });
}

/** Remove the secret buried-Grail location from the game_config sent to clients. */
export function stripGrailFromGameConfig(gameConfig: unknown): unknown {
  if (!gameConfig || typeof gameConfig !== "object") return gameConfig;
  const { grail: _grail, ...rest } = gameConfig as Record<string, unknown>;
  void _grail;
  return rest;
}

export function computeTurnProgressRatio(
  player: {
    heroes?: Array<Record<string, unknown>>;
    towns?: Array<Record<string, unknown>>;
  },
  turnNumber: number,
): number {
  const heroes = (player.heroes ?? []).map((hero) => ({
    movement: Number(hero.movement ?? 0),
    maxMovement: Number(hero.maxMovement ?? 0),
  }));
  const movableHeroes = heroes.filter((hero) => hero.maxMovement > 0);
  const heroTotal = movableHeroes.length;
  const heroRemaining = movableHeroes.reduce(
    (total, hero) => total + Math.max(0, Math.min(1, hero.movement / hero.maxMovement)),
    0,
  );
  const towns = player.towns ?? [];
  const townTotal = towns.length;
  const townRemaining = towns.filter(
    (town) => (town as { lastBuiltTurn?: number | null }).lastBuiltTurn !== turnNumber,
  ).length;
  const baseTotal = heroTotal + townTotal;
  if (baseTotal === 0) return 0;
  return Math.max(0, Math.min(1, (heroRemaining + townRemaining) / baseTotal));
}

export function sanitizePlayerForViewer<T extends {
  id: string;
  heroes?: Array<Record<string, unknown>>;
  towns?: Array<Record<string, unknown>>;
}>(player: T, viewerPlayerId?: string) {
  if (player.id === viewerPlayerId) return player;

  return {
    ...player,
    heroes: (player.heroes ?? []).map((hero) => ({
      ...hero,
      movement: 0,
      maxMovement: 0,
      attack: 0,
      defense: 0,
      spellPower: 0,
      knowledge: 0,
      luck: 0,
      artifacts: { inventory: [], equipment: {} },
      armies: [],
    })),
    towns: (player.towns ?? []).map((town) => ({
      ...town,
      buildings: [],
      garrison: [],
      availableRecruits: {},
      tavernOffer: [],
    })),
  };
}

export function sanitizeCombatForViewer(combat: Record<string, unknown>, viewerPlayerId?: string, isSpectator = false) {
  if (!viewerPlayerId) return summarizeCombat(combat);
  if (isSpectator || combatInvolvesPlayer(combat, viewerPlayerId)) {
    return { ...combat, visibility: "full" };
  }
  return summarizeCombat(combat);
}

export function getAllTileKeys(width: number, height: number) {
  const keys: string[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      keys.push(`${x},${y}`);
    }
  }
  return keys;
}

function summarizeCombat(combat: Record<string, unknown>) {
  return {
    ...combat,
    visibility: "joinable_summary",
    boardState: { units: [] },
    turnQueue: [],
    actionLog: [],
    result: null,
  };
}

function combatInvolvesPlayer(combat: Record<string, unknown>, playerId: string) {
  const participants = Array.isArray(combat.participants) ? combat.participants : [];
  return (
    combat.attackerPlayerId === playerId ||
    combat.defenderPlayerId === playerId ||
    participants.some((participant) => (participant as { playerId?: string }).playerId === playerId)
  );
}
