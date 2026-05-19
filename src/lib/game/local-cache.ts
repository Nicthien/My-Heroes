import type { GameMap, GameState } from "./types";

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5;
const CACHE_PREFIX = "my-heroes:game-state-cache";
const CACHE_INDEX_KEY = `${CACHE_PREFIX}:index:v${CACHE_VERSION}`;

interface CachedGameEntry {
  key: string;
  gameId: string;
  userId: string;
  revealMap: boolean;
  savedAt: number;
}

interface CachedGamePayload extends CachedGameEntry {
  version: number;
  gameState: GameState;
  staticMap: GameMap;
}

interface CachedGameStateOptions {
  revealMap?: boolean;
}

export function readCachedGameState(
  gameId: string,
  userId: string | undefined,
  options: CachedGameStateOptions = {}
) {
  if (!userId || !canUseLocalStorage()) return null;

  const key = getCacheKey(gameId, userId, Boolean(options.revealMap));
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const payload = JSON.parse(raw) as CachedGamePayload;
    if (!isValidPayload(payload, gameId, userId, Boolean(options.revealMap))) {
      window.localStorage.removeItem(key);
      return null;
    }

    if (Date.now() - payload.savedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      pruneCacheIndex();
      return null;
    }

    touchCacheEntry(payload);
    return {
      gameState: payload.gameState,
      staticMap: payload.staticMap,
      savedAt: payload.savedAt,
    };
  } catch {
    window.localStorage.removeItem(key);
    pruneCacheIndex();
    return null;
  }
}

export function writeCachedGameState(
  gameState: GameState,
  userId: string | undefined,
  staticMap: GameMap | null | undefined,
  options: CachedGameStateOptions = {}
) {
  if (!userId || !staticMap || !canUseLocalStorage()) return;

  const revealMap = Boolean(options.revealMap);
  const entry: CachedGameEntry = {
    key: getCacheKey(gameState.id, userId, revealMap),
    gameId: gameState.id,
    userId,
    revealMap,
    savedAt: Date.now(),
  };
  const payload: CachedGamePayload = {
    ...entry,
    version: CACHE_VERSION,
    gameState,
    staticMap,
  };

  try {
    window.localStorage.setItem(entry.key, JSON.stringify(payload));
    touchCacheEntry(entry);
  } catch {
    pruneCacheIndex(1);
    try {
      window.localStorage.setItem(entry.key, JSON.stringify(payload));
      touchCacheEntry(entry);
    } catch {
      window.localStorage.removeItem(entry.key);
    }
  }
}

function canUseLocalStorage() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function getCacheKey(gameId: string, userId: string, revealMap: boolean) {
  return `${CACHE_PREFIX}:v${CACHE_VERSION}:${encodeURIComponent(userId)}:${encodeURIComponent(gameId)}:${revealMap ? "reveal" : "normal"}`;
}

function isValidPayload(
  payload: CachedGamePayload | null | undefined,
  gameId: string,
  userId: string,
  revealMap: boolean
) {
  return Boolean(
    payload &&
      payload.version === CACHE_VERSION &&
      payload.gameId === gameId &&
      payload.userId === userId &&
      payload.revealMap === revealMap &&
      payload.gameState?.id === gameId &&
      payload.staticMap?.tiles &&
      Number.isFinite(payload.savedAt)
  );
}

function touchCacheEntry(entry: CachedGameEntry) {
  const index = readCacheIndex()
    .filter((item) => item.key !== entry.key)
    .concat({ ...entry, savedAt: Date.now() })
    .sort((a, b) => b.savedAt - a.savedAt);

  writeCacheIndex(index);
  pruneCacheIndex();
}

function pruneCacheIndex(extraEntriesToRemove = 0) {
  const now = Date.now();
  const index = readCacheIndex().sort((a, b) => b.savedAt - a.savedAt);
  const kept: CachedGameEntry[] = [];
  const removed: CachedGameEntry[] = [];
  const maxEntries = Math.max(0, MAX_CACHE_ENTRIES - extraEntriesToRemove);

  for (const entry of index) {
    const isExpired = now - entry.savedAt > CACHE_TTL_MS;
    if (isExpired || kept.length >= maxEntries) {
      removed.push(entry);
    } else {
      kept.push(entry);
    }
  }

  for (const entry of removed) {
    window.localStorage.removeItem(entry.key);
  }
  writeCacheIndex(kept);
}

function readCacheIndex() {
  try {
    const raw = window.localStorage.getItem(CACHE_INDEX_KEY);
    return raw ? (JSON.parse(raw) as CachedGameEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCacheIndex(index: CachedGameEntry[]) {
  try {
    window.localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {
    window.localStorage.removeItem(CACHE_INDEX_KEY);
  }
}
