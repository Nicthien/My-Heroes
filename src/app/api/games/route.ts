import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCurrentUser } from "@/lib/auth";
import { createNeutralArmyStacksForTile, getDominantUnitType } from "@/lib/game/neutral-armies";
import { createNeutralTownGarrison } from "@/lib/game/neutral-towns";
import { isFaction, pickTownFactionForTerrain, pickTownName } from "@/lib/game/town-generation";
import { BuildingType, GameMap, MapObject, MapTile, TerrainType } from "@/lib/game/types";
import { normalizeRmgTuning } from "@/lib/game/engine/rmg-tuning";
import { createGamePlayerSetup } from "@/lib/game/server/player-setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameWithRelations, getProfileName, toGame } from "@/lib/supabase/game-db";

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
    const { data: memberships, error: memberError } = await supabase
      .from("game_players")
      .select("game_id")
      .eq("user_id", user.id);

    if (memberError) return apiRouteError("api/games GET memberships", memberError);

    const gameIds = memberships.map((item) => item.game_id);
    if (gameIds.length === 0) return NextResponse.json([]);

    const { data, error } = await supabase
      .from("games")
      .select("*, game_players!game_players_game_id_fkey(*, profiles(name))")
      .in("id", gameIds)
      .order("created_at", { ascending: false });

    if (error) return apiRouteError("api/games GET games", error);

    return NextResponse.json((data ?? []).map(toGame));
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
      faction = "castle",
    } = body;
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
    });
    const objectIdPrefix = randomUUID();
    prefixMonsterIds(mapData, objectIdPrefix);
    prefixGateIds(mapData, objectIdPrefix);
    assignMonsterSubtypes(mapData);
    assignNeutralTownTraits(mapData);
    const profileName = await getProfileName(supabase, user.id);

    const { data: gameRow, error: gameError } = await supabase
      .from("games")
      .insert({
        name: name || `Partie de ${profileName}`,
        max_players: maxPlayers,
        map_width: size,
        map_height: size,
        status: "PENDING",
        map_data: mapData,
        game_config: { turnTimeLimit: 86400, rmgTuning: tuning },
        seed: mapData.seed,
        map_size: mapSize,
        template_id: mapData.templateId,
      })
      .select("*")
      .single();

    if (gameError) return apiRouteError("api/games POST game", gameError);

    await createGamePlayerSetup({
      supabase,
      gameId: gameRow.id,
      userId: user.id,
      faction,
      color: "#3b82f6",
      turnOrder: 0,
      mapData,
    });

    const neutralArmyResult = await createNeutralArmies(supabase, gameRow.id, mapData);
    if (!neutralArmyResult.ok) return NextResponse.json({ error: neutralArmyResult.error }, { status: 500 });
    const gateResult = await createGates(supabase, gameRow.id, mapData);
    if (!gateResult.ok) return NextResponse.json({ error: gateResult.error }, { status: 500 });
    if (boatSchema.ok) {
      const boatResult = await createInitialBoats(supabase, gameRow.id, mapData, faction);
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

async function createInitialBoats(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
  faction: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const candidates = mapData.tiles
    .flatMap((row) => row)
    .filter((tile) =>
      tile.terrain === TerrainType.WATER &&
      tile.isPassable &&
      hasAdjacentLand(mapData, tile.x, tile.y)
    );
  const selected = candidates
    .filter((_, index) => index % Math.max(1, Math.floor(candidates.length / 4)) === 0)
    .slice(0, 4);
  if (selected.length === 0) return { ok: true };

  const { error } = await supabase.from("boats").insert(selected.map((tile) => ({
    game_id: gameId,
    owner_player_id: null,
    hero_id: null,
    faction,
    x: tile.x,
    y: tile.y,
  })));
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function hasAdjacentLand(mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>, x: number, y: number) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tile = mapData.tiles[y + dy]?.[x + dx];
      if (tile && tile.terrain !== TerrainType.WATER && tile.isPassable) return true;
    }
  }
  return false;
}

async function createNeutralArmies(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const monsterTiles = mapData.tiles.flatMap((row) =>
    row.filter((tile) => tile.object?.type === "monster"),
  );

  for (const tile of monsterTiles) {
    const id = tile.object?.id;
    if (!id) continue;
    const guardianPower = tile.object?.guardianPower ?? 100;
    const stacks = createNeutralArmyStacksForTile(tile, guardianPower, id);
    const { error: armyError } = await supabase.from("neutral_armies").insert({ id, game_id: gameId, x: tile.x, y: tile.y });
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
  const gateTiles = mapData.tiles.flatMap((row) =>
    row.filter((tile) => tile.object?.type === "gate"),
  );

  for (const tile of gateTiles) {
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
  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (tile.object?.type !== "monster") continue;
      const stacks = createNeutralArmyStacksForTile(tile, tile.object.guardianPower ?? 100, tile.object.id);
      const dominantUnitType = getDominantUnitType(stacks);
      if (dominantUnitType) tile.object.subtype = dominantUnitType;
    }
  }
}

function prefixMonsterIds(
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
  prefix: string,
) {
  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "monster") {
        tile.object.id = `${prefix}-${tile.object.id}`;
      }
    }
  }
}

function prefixGateIds(
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
  prefix: string,
) {
  for (const row of mapData.tiles) {
    for (const tile of row) {
      if (tile.object?.type === "gate") {
        tile.object.id = `${prefix}-${tile.object.id}`;
      }
    }
  }
}

async function createNeutralTowns(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
) {
  for (let y = 0; y < mapData.tiles.length; y++) {
    for (let x = 0; x < mapData.tiles[y].length; x++) {
      const tile = mapData.tiles[y][x];
      if (tile.object?.type !== "town") continue;
      if (!isNeutralTownObject(tile.object)) continue;

      const terrain = townBiomeTerrain(mapData, tile);
      const seed = `${mapData.seed ?? gameId}:${tile.object.id}:${x}:${y}`;
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
        buildings: [BuildingType.VILLAGE_HALL],
        garrison: [],
        is_neutral: true,
        neutral_garrison: createNeutralTownGarrison(f),
      });
    }
  }
}

function assignNeutralTownTraits(mapData: GameMap) {
  for (let y = 0; y < mapData.tiles.length; y++) {
    for (let x = 0; x < mapData.tiles[y].length; x++) {
      const tile = mapData.tiles[y][x];
      if (tile.object?.type !== "town") continue;
      if (!isNeutralTownObject(tile.object)) continue;

      const terrain = townBiomeTerrain(mapData, tile);
      const seed = `${mapData.seed ?? "map"}:${tile.object.id}:${x}:${y}`;
      const faction = pickTownFactionForTerrain(terrain, seed);
      tile.object.subtype = faction;
      tile.object.name = pickTownName(faction, seed);
    }
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
