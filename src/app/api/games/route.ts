import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCurrentUser } from "@/lib/auth";
import { createNeutralArmyStacksForTile, getDominantUnitType } from "@/lib/game/neutral-armies";
import { createNeutralTownGarrison } from "@/lib/game/neutral-towns";
import { isFaction, pickTownFactionForTerrain, pickTownName } from "@/lib/game/town-generation";
import { BuildingType, GameMap, MapObject, MapTile, TerrainType } from "@/lib/game/types";
import { normalizeRmgTuning } from "@/lib/game/engine/rmg-tuning";
import { isPlayableFaction, normalizePlayableFaction } from "@/lib/game/playable-factions";
import { normalizeVictoryCondition } from "@/lib/game/victory";
import { getObeliskIds, normalizeObeliskCount, pickGrailLocation } from "@/lib/game/grail";
import type { VictoryCondition } from "@/lib/game/types";
import { mapLevels, SURFACE_LEVEL } from "@/lib/game/map-levels";
import { createGamePlayerSetup } from "@/lib/game/server/player-setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameWithRelations, getProfileName, toGame } from "@/lib/supabase/game-db";

type DbRow = Record<string, unknown>;

function rows(value: unknown): DbRow[] {
  return Array.isArray(value) ? (value as DbRow[]) : [];
}

function object(value: unknown): DbRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : null;
}

function getPlayerStatus(player: DbRow, game: DbRow) {
  const gameStatus = String(game.status ?? "");
  if (gameStatus === "PENDING") return Boolean(player.is_ready) ? "Pret au lancement" : "Pas pret";
  if (gameStatus === "COMPLETED") return "Partie terminee";
  if (gameStatus !== "ACTIVE") return gameStatus || "-";

  const playerId = String(player.id ?? "");
  const turnNumber = Number(game.turn_number ?? 1);
  const completed = rows(game.turns).some((turn) =>
    turn.game_player_id === playerId &&
    Number(turn.turn_number) === turnNumber &&
    Boolean(turn.is_completed)
  );
  if (completed) return "A fini son tour";
  if (game.current_turn_player_id === playerId) return "Doit jouer maintenant";
  return "Attend son tour";
}

function toDashboardGame(row: DbRow, authUsersById: Map<string, { email: string | null; lastSignInAt: string | null }>) {
  const game = toGame(row);
  const rawPlayers = rows(row.game_players ?? row.players);
  return {
    ...game,
    players: (game.players ?? []).map((player: { id: unknown; userId?: unknown; user?: Record<string, unknown> }) => {
      const rawPlayer = rawPlayers.find((item) => item.id === player.id) ?? {};
      const profile = object(rawPlayer.profiles);
      const userId = typeof player.userId === "string" ? player.userId : typeof rawPlayer.user_id === "string" ? rawPlayer.user_id : null;
      const authUser = userId ? authUsersById.get(userId) : undefined;
      const isAi = Boolean(rawPlayer.is_ai);
      return {
        ...player,
        user: {
          ...(player.user ?? {}),
          name: player.user?.name ?? profile?.name ?? null,
          email: profile?.email ?? authUser?.email ?? null,
        },
        email: profile?.email ?? authUser?.email ?? null,
        lastSignInAt: isAi ? null : authUser?.lastSignInAt ?? null,
        turnStatus: getPlayerStatus(rawPlayer, row),
      };
    }),
  };
}

const MAP_SIZES: Record<string, number> = {
  S: 36,
  M: 72,
  L: 108,
  XL: 144,
};

export async function GET(request: Request) {
  try {
    const { user, response } = await requireCurrentUser(request);
    if (!user) return response;

    const supabase = createAdminClient();
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authError) return apiRouteError("api/games GET auth users", authError);

    const authUsersById = new Map(
      authUsers.users.map((authUser) => [
        authUser.id,
        {
          email: authUser.email ?? null,
          lastSignInAt: authUser.last_sign_in_at ?? null,
        },
      ]),
    );

    if (user.role === "admin") {
      const { data, error } = await fetchDashboardGames(supabase);
      if (error) return apiRouteError("api/games GET admin games", error);
      return NextResponse.json((data ?? []).map((row) => toDashboardGame(row as DbRow, authUsersById)));
    }

    const { data: memberships, error: memberError } = await supabase
      .from("game_players")
      .select("game_id")
      .eq("user_id", user.id);

    if (memberError) return apiRouteError("api/games GET memberships", memberError);

    const gameIds = new Set<string>(memberships.map((item) => String(item.game_id)));
    if (gameIds.size === 0) return NextResponse.json([]);

    const { data, error } = await fetchDashboardGames(supabase, Array.from(gameIds));

    if (error) return apiRouteError("api/games GET games", error);

    return NextResponse.json((data ?? []).map((row) => toDashboardGame(row as DbRow, authUsersById)));
  } catch (error) {
    return apiRouteError("api/games GET", error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireCurrentUser(request);
    if (!user) return response;

    const supabase = createAdminClient();
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      name: user.name ?? user.email ?? "Joueur",
    }, { onConflict: "id" });
    if (profileError) return apiRouteError("api/games POST profile", profileError);

    const body = await request.json();
    const {
      name,
      maxPlayers = 2,
      mapSize = "M",
      seed,
      templateId,
      rmgTuning,
      undergroundEnabled = false,
      faction = "castle",
      victory: victoryInput,
    } = body;
    const requestedFaction = String(faction);
    const playableFaction = normalizePlayableFaction(requestedFaction);
    if (user.role !== "admin" && !isPlayableFaction(requestedFaction)) {
      return NextResponse.json({ error: "Cette faction n'est pas jouable." }, { status: 400 });
    }
    const tuning = normalizeRmgTuning(rmgTuning);

    const size = MAP_SIZES[mapSize] ?? MAP_SIZES.M;
    const gateSchema = await getGateSchemaStatus(supabase);
    if (!gateSchema.ok) {
      return NextResponse.json({
        error: "Migration Supabase manquante: appliquez supabase/migrations/20260519000100_add_gates.sql avant de creer une partie avec les portes fortifiees.",
        details: gateSchema.message,
      }, { status: 500 });
    }

    const spellSchema = await getSpellSchemaStatus(supabase);
    if (!spellSchema.ok) {
      console.warn("Migration Supabase sorts manquante; creation en compatibilite legacy.", spellSchema.message);
    }
    const boatSchema = await getBoatSchemaStatus(supabase);
    if (!boatSchema.ok) {
      console.warn("Migration Supabase bateaux manquante; creation sans bateaux initiaux.", boatSchema.message);
    }

    const { generateMap } = await import("@/lib/game/engine");
    const mapData = generateMap({
      width: size,
      height: size,
      seed,
      templateId,
      playerCount: maxPlayers,
      tuning,
      undergroundEnabled: Boolean(undergroundEnabled),
    });
    const objectIdPrefix = randomUUID();
    prefixMonsterIds(mapData, objectIdPrefix);
    prefixGateIds(mapData, objectIdPrefix);
    assignMonsterSubtypes(mapData);
    assignNeutralTownTraits(mapData);
    const victory = buildVictoryForCreation(victoryInput, mapData);
    normalizeObeliskCount(mapData, maxPlayers);
    const obelisksTotal = getObeliskIds(mapData).length;
    const grail = pickGrailLocation(mapData);
    const profileName = await getProfileName(supabase, user.id);

    const gameInsert = {
      name: name || `Partie de ${profileName}`,
      max_players: maxPlayers,
      map_width: size,
      map_height: size,
      status: "PENDING",
      map_data: mapData,
      game_config: { turnTimeLimit: 86400, rmgTuning: tuning, undergroundEnabled: Boolean(undergroundEnabled), victory, grail, obelisksTotal },
      created_by_user_id: user.id,
      seed: mapData.seed,
      map_size: mapSize,
      template_id: mapData.templateId,
    };
    const { data: gameRow, error: gameError } = await insertGameRow(supabase, gameInsert);

    if (gameError) return apiRouteError("api/games POST game", gameError);

    if (user.role !== "admin") {
      await createGamePlayerSetup({
        supabase,
        gameId: gameRow.id,
        userId: user.id,
        faction: playableFaction,
        color: "#3b82f6",
        turnOrder: 0,
        mapData,
        victoryType: victory.type,
      });
    }

    const neutralArmyResult = await createNeutralArmies(supabase, gameRow.id, mapData);
    if (!neutralArmyResult.ok) return NextResponse.json({ error: neutralArmyResult.error }, { status: 500 });
    const gateResult = await createGates(supabase, gameRow.id, mapData);
    if (!gateResult.ok) return NextResponse.json({ error: gateResult.error }, { status: 500 });
    if (boatSchema.ok) {
      const boatResult = await createInitialBoats(supabase, gameRow.id, mapData, playableFaction, maxPlayers);
      if (!boatResult.ok) return NextResponse.json({ error: boatResult.error }, { status: 500 });
    }
    await createNeutralTowns(supabase, gameRow.id, mapData);

    const game = await getGameWithRelations(supabase, gameRow.id);
    return NextResponse.json(game, { status: 201 });
  } catch (error) {
    return apiRouteError("api/games POST", error);
  }
}

async function getGateSchemaStatus(supabase: ReturnType<typeof createAdminClient>): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error: gatesError } = await supabase.from("gates").select("id").limit(1);
  if (gatesError) return { ok: false, message: gatesError.message };

  const { error: stacksError } = await supabase.from("gate_stacks").select("id").limit(1);
  if (stacksError) return { ok: false, message: stacksError.message };

  return { ok: true };
}

async function getSpellSchemaStatus(supabase: ReturnType<typeof createAdminClient>): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from("heroes").select("mana,has_spell_book,known_spells").limit(1);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function getBoatSchemaStatus(supabase: ReturnType<typeof createAdminClient>): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from("boats").select("id").limit(1);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

function apiRouteError(scope: string, error: unknown) {
  const normalized = normalizeRouteError(error);
  console.error(scope, normalized);
  return NextResponse.json(normalized, { status: 500 });
}

function normalizeRouteError(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; code?: unknown; hint?: unknown };
    return {
      error: typeof value.message === "string" ? value.message : "Erreur serveur",
      details: typeof value.details === "string" ? value.details : undefined,
      code: typeof value.code === "string" ? value.code : undefined,
      hint: typeof value.hint === "string" ? value.hint : undefined,
    };
  }
  return { error: error instanceof Error ? error.message : String(error || "Erreur serveur") };
}

async function fetchDashboardGames(supabase: ReturnType<typeof createAdminClient>, gameIds?: string[]) {
  let withCreatorQuery = supabase
    .from("games")
    .select("*, created_by:profiles!games_created_by_user_id_fkey(name,email), game_players!game_players_game_id_fkey(*, profiles(name,email)), turns(*)")
    .order("created_at", { ascending: false });
  if (gameIds) withCreatorQuery = withCreatorQuery.in("id", gameIds);
  const withCreator = await withCreatorQuery;

  if (!withCreator.error || !isMissingCreatedByColumnError(withCreator.error)) return withCreator;

  let fallbackQuery = supabase
    .from("games")
    .select("*, game_players!game_players_game_id_fkey(*, profiles(name,email)), turns(*)")
    .order("created_at", { ascending: false });
  if (gameIds) fallbackQuery = fallbackQuery.in("id", gameIds);
  return fallbackQuery;
}

async function insertGameRow(
  supabase: ReturnType<typeof createAdminClient>,
  gameInsert: Record<string, unknown>
) {
  const result = await supabase
    .from("games")
    .insert(gameInsert)
    .select("*")
    .single();

  if (!result.error || !isMissingCreatedByColumnError(result.error)) return result;

  const { created_by_user_id: _drop, ...legacyInsert } = gameInsert;
  void _drop;
  return supabase
    .from("games")
    .insert(legacyInsert)
    .select("*")
    .single();
}

function isMissingCreatedByColumnError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("created_by_user_id") || text.includes("schema cache");
}

async function createInitialBoats(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
  faction: string,
  playerCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const placementWater = collectBoatPlacementWater(mapData);
  const targetCount = getInitialBoatCount(playerCount);
  const candidates = mapData.tiles
    .flatMap((row) => row)
    .filter((tile) =>
      tile.terrain === TerrainType.WATER &&
      tile.isPassable &&
      placementWater.has(tileKey(tile.x, tile.y)) &&
      hasCardinalAdjacentLand(mapData, tile.x, tile.y)
    );
  const selected = candidates
    .filter((_, index) => index % Math.max(1, Math.floor(candidates.length / targetCount)) === 0)
    .slice(0, targetCount);
  if (selected.length === 0) return { ok: true };

  const { error } = await supabase.from("boats").insert(selected.map((tile) => ({
    game_id: gameId,
    owner_player_id: null,
    hero_id: null,
    faction,
    x: tile.x,
    y: tile.y,
    map_level: SURFACE_LEVEL,
  })));
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function getInitialBoatCount(playerCount: number) {
  return Math.max(1, playerCount);
}

function collectBoatPlacementWater(mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>) {
  const regions = collectWaterRegions(mapData);
  const edgeRegions = regions.filter((region) => region.touchesEdge);
  const selectedRegions = edgeRegions.length > 0
    ? edgeRegions
    : regions
      .filter((region) => region.tiles.size >= Math.max(16, Math.floor(mapData.width * mapData.height * 0.01)))
      .sort((a, b) => b.tiles.size - a.tiles.size)
      .slice(0, 2);
  return new Set(selectedRegions.flatMap((region) => Array.from(region.tiles)));
}

function collectWaterRegions(mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>) {
  const seen = new Set<string>();
  const regions: Array<{ tiles: Set<string>; touchesEdge: boolean }> = [];

  for (const row of mapData.tiles) {
    for (const tile of row) {
      const startKey = tileKey(tile.x, tile.y);
      if (seen.has(startKey) || tile.terrain !== TerrainType.WATER || !tile.isPassable) continue;

      const tiles = new Set<string>();
      const queue = [{ x: tile.x, y: tile.y }];
      let touchesEdge = false;
      seen.add(startKey);

      while (queue.length > 0) {
        const current = queue.shift()!;
        tiles.add(tileKey(current.x, current.y));
        if (current.x === 0 || current.y === 0 || current.x === mapData.width - 1 || current.y === mapData.height - 1) {
          touchesEdge = true;
        }

        for (const next of [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 },
        ]) {
          const nextTile = mapData.tiles[next.y]?.[next.x];
          const nextKey = tileKey(next.x, next.y);
          if (!nextTile || seen.has(nextKey) || nextTile.terrain !== TerrainType.WATER || !nextTile.isPassable) continue;
          seen.add(nextKey);
          queue.push(next);
        }
      }

      regions.push({ tiles, touchesEdge });
    }
  }

  return regions;
}

function tileKey(x: number, y: number) {
  return `${x},${y}`;
}

function hasCardinalAdjacentLand(mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>, x: number, y: number) {
  for (const position of [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ]) {
    const tile = mapData.tiles[position.y]?.[position.x];
    if (tile && tile.terrain !== TerrainType.WATER && tile.isPassable) return true;
  }
  return false;
}

function allMapTiles(mapData: GameMap): Array<{ tile: MapTile; mapLevel: string; layer: GameMap }> {
  return mapLevels(mapData).flatMap((layer) => {
    const layerMap = {
      ...mapData,
      width: layer.width,
      height: layer.height,
      tiles: layer.tiles,
      zones: layer.zones,
    };
    return layer.tiles.flatMap((row) =>
      row.map((tile) => ({ tile, mapLevel: layer.id, layer: layerMap }))
    );
  });
}

async function createNeutralArmies(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const monsterTiles = allMapTiles(mapData).filter(({ tile }) => tile.object?.type === "monster");

  for (const { tile, mapLevel } of monsterTiles) {
    const id = tile.object?.id;
    if (!id) continue;
    const guardianPower = tile.object?.guardianPower ?? 100;
    const stacks = createNeutralArmyStacksForTile(tile, guardianPower, id);
    const { error: armyError } = await supabase.from("neutral_armies").insert({ id, game_id: gameId, x: tile.x, y: tile.y, map_level: mapLevel });
    if (armyError) return { ok: false, error: armyError.message };
    const { error: stackError } = await supabase.from("neutral_army_stacks").insert(stacks.map((stack) => ({
      neutral_army_id: id,
      unit_type: stack.unitType,
      count: stack.count,
      health: stack.health,
      max_health: stack.maxHealth,
      position: stack.position,
    })));
    if (stackError) return { ok: false, error: stackError.message };
  }
  return { ok: true };
}

async function createGates(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gateTiles = allMapTiles(mapData).filter(({ tile }) => tile.object?.type === "gate");

  for (const { tile, mapLevel } of gateTiles) {
    const id = tile.object?.id;
    if (!id) continue;
    const guardianPower = tile.object?.guardianPower ?? 100;
    const stacks = createNeutralArmyStacksForTile(tile, guardianPower, id);
    const { error: gateError } = await supabase.from("gates").insert({
      id,
      game_id: gameId,
      game_player_id: null,
      x: tile.x,
      y: tile.y,
      map_level: mapLevel,
      guardian_power: guardianPower,
    });
    if (gateError) return { ok: false, error: gateError.message };
    const { error: stackError } = await supabase.from("gate_stacks").insert(stacks.map((stack) => ({
      gate_id: id,
      unit_type: stack.unitType,
      count: stack.count,
      health: stack.health,
      max_health: stack.maxHealth,
      position: stack.position,
    })));
    if (stackError) return { ok: false, error: stackError.message };
  }
  return { ok: true };
}

function assignMonsterSubtypes(
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
) {
  for (const { tile } of allMapTiles(mapData)) {
    if (tile.object?.type !== "monster") continue;
    const stacks = createNeutralArmyStacksForTile(tile, tile.object.guardianPower ?? 100, tile.object.id);
    const dominantUnitType = getDominantUnitType(stacks);
    if (dominantUnitType) tile.object.subtype = dominantUnitType;
  }
}

function prefixMonsterIds(
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
  prefix: string,
) {
  for (const { tile } of allMapTiles(mapData)) {
    if (tile.object?.type === "monster") {
      tile.object.id = `${prefix}-${tile.object.id}`;
    }
  }
}

function prefixGateIds(
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
  prefix: string,
) {
  for (const { tile } of allMapTiles(mapData)) {
    if (tile.object?.type === "gate") {
      tile.object.id = `${prefix}-${tile.object.id}`;
    }
  }
}

async function createNeutralTowns(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
) {
  for (const { tile, mapLevel, layer } of allMapTiles(mapData)) {
    const { x, y } = tile;
    if (tile.object?.type !== "town") continue;
    if (!isNeutralTownObject(tile.object)) continue;

    const terrain = townBiomeTerrain(layer, tile);
    const seed = `${mapData.seed ?? gameId}:${mapLevel}:${tile.object.id}:${x}:${y}`;
    const f = isFaction(tile.object.subtype)
      ? tile.object.subtype
      : pickTownFactionForTerrain(terrain, seed);
    const townName = tile.object.name ?? pickTownName(f, seed);

    await supabase.from("towns").insert({
      game_id: gameId,
      game_player_id: null,
      name: townName,
      town_type: f,
      x,
      y,
      map_level: mapLevel,
      buildings: [BuildingType.VILLAGE_HALL],
      garrison: [],
      is_neutral: true,
      neutral_garrison: createNeutralTownGarrison(f),
    });
  }
}

/**
 * Resolve the victory condition chosen in the creation wizard into a stored
 * {@link VictoryCondition}. For CAPTURE_TOWN we designate a target neutral town
 * on the map here; if none exists the objective degrades to domination.
 */
function buildVictoryForCreation(raw: unknown, mapData: GameMap): VictoryCondition {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (input.type === "CAPTURE_TOWN") {
    const target = pickCaptureTargetTown(mapData);
    if (!target) {
      console.warn("CAPTURE_TOWN victory requested but no neutral town found; falling back to domination.");
      return { type: "DOMINATION" };
    }
    return normalizeVictoryCondition({ type: "CAPTURE_TOWN", targetTown: target.position, targetTownName: target.name });
  }
  return normalizeVictoryCondition(input);
}

/** Pick the neutral town closest to map center (surface preferred) as a capture objective. */
function pickCaptureTargetTown(
  mapData: GameMap,
): { position: { x: number; y: number; mapLevel: string }; name?: string } | null {
  const neutralTowns = allMapTiles(mapData).filter(
    ({ tile }) => tile.object?.type === "town" && isNeutralTownObject(tile.object),
  );
  if (neutralTowns.length === 0) return null;

  const surfaceTowns = neutralTowns.filter(({ mapLevel }) => mapLevel === SURFACE_LEVEL);
  const pool = surfaceTowns.length > 0 ? surfaceTowns : neutralTowns;
  const centerX = mapData.width / 2;
  const centerY = mapData.height / 2;
  const best = pool.reduce((closest, candidate) => {
    const distance = (candidate.tile.x - centerX) ** 2 + (candidate.tile.y - centerY) ** 2;
    return distance < closest.distance ? { candidate, distance } : closest;
  }, { candidate: pool[0], distance: Infinity }).candidate;

  return {
    position: { x: best.tile.x, y: best.tile.y, mapLevel: best.mapLevel },
    name: best.tile.object?.name,
  };
}

function assignNeutralTownTraits(mapData: GameMap) {
  for (const { tile, mapLevel, layer } of allMapTiles(mapData)) {
    const x = tile.x;
    const y = tile.y;
    if (tile.object?.type !== "town") continue;
    if (!isNeutralTownObject(tile.object)) continue;

    const terrain = townBiomeTerrain(layer, tile);
    const seed = `${mapData.seed ?? "map"}:${mapLevel}:${tile.object.id}:${x}:${y}`;
    const faction = pickTownFactionForTerrain(terrain, seed);
    tile.object.subtype = faction;
    tile.object.name = pickTownName(faction, seed);
  }
}

function isNeutralTownObject(object: MapObject) {
  return object.id.startsWith("neutral-town-") || object.subtype === "neutral" || object.subtype === undefined;
}

function townBiomeTerrain(mapData: GameMap, tile: MapTile): TerrainType | string | undefined {
  return tile.zoneId !== undefined
    ? mapData.zones?.[tile.zoneId]?.baseTerrain ?? tile.terrain
    : tile.terrain;
}
