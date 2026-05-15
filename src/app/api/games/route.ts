import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCurrentUser } from "@/lib/auth";
import { computeVisibleTiles } from "@/lib/game/engine";
import { FACTION_UNITS, UNIT_RULES } from "@/lib/game/economy";
import { createNeutralArmyStacksForTile, getDominantUnitType } from "@/lib/game/neutral-armies";
import { isFaction, pickTownFactionForTerrain, pickTownName } from "@/lib/game/town-generation";
import { BuildingType, Faction, GameMap, HeroClass, MapObject, MapTile, TerrainType } from "@/lib/game/types";
import { CLASS_STARTING_STATS, HERO_ROSTER } from "@/lib/game/heroes";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameWithRelations, getProfileName, toGame } from "@/lib/supabase/game-db";

const STARTER_ARMY_COUNTS: [number, number, number] = [20, 12, 4];

const MAP_SIZES: Record<string, number> = {
  S: 36,
  M: 72,
  L: 108,
  XL: 144,
};

function buildStarterArmy(faction: Faction, heroId: string) {
  const tiers = FACTION_UNITS[faction] ?? FACTION_UNITS[Faction.CASTLE];
  return STARTER_ARMY_COUNTS.map((count, i) => {
    const unitType = tiers[i];
    const rule = UNIT_RULES[unitType];
    return {
      hero_id: heroId,
      unit_type: unitType,
      count,
      health: rule.health * count,
      max_health: rule.health,
      position: i,
    };
  });
}

export async function GET(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const supabase = createAdminClient();
  const { data: memberships, error: memberError } = await supabase
    .from("game_players")
    .select("game_id")
    .eq("user_id", user.id);

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  const gameIds = memberships.map((item) => item.game_id);
  if (gameIds.length === 0) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("games")
    .select("*, game_players!game_players_game_id_fkey(*, profiles(name))")
    .in("id", gameIds)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(toGame));
}

export async function POST(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const supabase = createAdminClient();
  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    name: user.name ?? user.email ?? "Joueur",
  }, { onConflict: "id" });

  const body = await request.json();
  const {
    name,
    maxPlayers = 2,
    mapSize = "M",
    seed,
    templateId,
    faction = "castle",
  } = body;

  const size = MAP_SIZES[mapSize] ?? MAP_SIZES.M;

  const { generateMap, placePlayerStart } = await import("@/lib/game/engine");
  const mapData = generateMap({
    width: size,
    height: size,
    seed,
    templateId,
    playerCount: maxPlayers,
  });
  prefixMonsterIds(mapData, randomUUID());
  assignMonsterSubtypes(mapData);
  assignNeutralTownTraits(mapData);
  const startPos = placePlayerStart(mapData, 0);
  const initialExplored = computeVisibleTiles(mapData, [{ x: startPos.x, y: startPos.y }], 5);
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
      game_config: { turnTimeLimit: 86400 },
      seed: mapData.seed,
      map_size: mapSize,
      template_id: mapData.templateId,
    })
    .select("*")
    .single();

  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 });

  const { data: playerRow, error: playerError } = await supabase
    .from("game_players")
    .insert({
      game_id: gameRow.id,
      user_id: user.id,
      faction,
      color: "#3b82f6",
      turn_order: 0,
      explored_tiles: Array.from(initialExplored),
    })
    .select("*")
    .single();

  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 });

  const factionKey = (faction as Faction) in FACTION_UNITS ? (faction as Faction) : Faction.CASTLE;
  const factionHeroes = HERO_ROSTER.filter((h) => h.faction === factionKey);
  const startingHero = factionHeroes.length > 0
    ? factionHeroes[Math.floor(Math.random() * factionHeroes.length)]
    : null;
  const heroClass = (startingHero?.class ?? HeroClass.KNIGHT) as HeroClass;
  const heroStats = CLASS_STARTING_STATS[heroClass];

  const heroInsert: Record<string, unknown> = {
    game_player_id: playerRow.id,
    name: startingHero?.name ?? "Sire Christian",
    hero_class: heroClass,
    specialty: startingHero?.specialty ?? null,
    attack: heroStats.attack,
    defense: heroStats.defense,
    spell_power: heroStats.spellPower,
    knowledge: heroStats.knowledge,
    x: startPos.x,
    y: startPos.y,
  };

  let { data: heroRow, error: heroError } = await supabase
    .from("heroes")
    .insert(heroInsert)
    .select("*")
    .single();

  if (heroError) {
    delete heroInsert.hero_class;
    delete heroInsert.specialty;
    ({ data: heroRow, error: heroError } = await supabase
      .from("heroes")
      .insert(heroInsert)
      .select("*")
      .single());
  }

  if (heroError) return NextResponse.json({ error: heroError.message }, { status: 500 });
  const { error: armyError } = await supabase.from("armies").insert(buildStarterArmy(factionKey, heroRow.id));
  if (armyError) return NextResponse.json({ error: armyError.message }, { status: 500 });

  const { error: townError } = await supabase.from("towns").insert({
    game_id: gameRow.id,
    game_player_id: playerRow.id,
    name: pickTownName(factionKey, `${gameRow.id}:${playerRow.id}:0`),
    town_type: factionKey,
    x: startPos.x,
    y: startPos.y,
    buildings: [BuildingType.VILLAGE_HALL],
    garrison: [],
    is_neutral: false,
  });
  if (townError) return NextResponse.json({ error: townError.message }, { status: 500 });

  await createNeutralArmies(supabase, gameRow.id, mapData);
  await createResourceBuildings(supabase, gameRow.id, mapData);
  await createNeutralTowns(supabase, gameRow.id, mapData);

  const game = await getGameWithRelations(supabase, gameRow.id);
  return NextResponse.json(game, { status: 201 });
}

async function createNeutralArmies(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
) {
  const monsterTiles = mapData.tiles.flatMap((row) =>
    row.filter((tile) => tile.object?.type === "monster"),
  );

  for (const tile of monsterTiles) {
    const id = tile.object?.id;
    if (!id) continue;
    const guardianPower = tile.object?.guardianPower ?? 100;
    const stacks = createNeutralArmyStacksForTile(tile, guardianPower, id);
    await supabase.from("neutral_armies").insert({ id, game_id: gameId, x: tile.x, y: tile.y });
    await supabase.from("neutral_army_stacks").insert(stacks.map((stack) => ({
      neutral_army_id: id,
      unit_type: stack.unitType,
      count: stack.count,
      health: stack.health,
      max_health: stack.maxHealth,
      position: stack.position,
    })));
  }
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

async function createResourceBuildings(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  mapData: ReturnType<typeof import("@/lib/game/engine").generateMap>,
) {
  const buildingTiles = mapData.tiles.flatMap((row) =>
    row.filter((tile) => tile.object?.type === "building"),
  );

  for (const tile of buildingTiles) {
    const id = tile.object?.id;
    const buildingType = tile.object?.subtype;
    const guardianPower = tile.object?.guardianPower ?? 200;
    if (!id || !buildingType) continue;

    await supabase.from("resource_buildings").insert({
      id,
      game_id: gameId,
      game_player_id: null,
      building_type: buildingType,
      x: tile.x,
      y: tile.y,
      guardian_power: guardianPower,
    });
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
      // Garnison neutre simple : 1 stack de tier 4-5 de la faction
      const tierUnit = FACTION_UNITS[f][3];
      const rule = UNIT_RULES[tierUnit];
      const count = 10;
      const garrison = [
        {
          id: randomUUID(),
          unitType: tierUnit,
          count,
          health: rule.health * count,
          maxHealth: rule.health,
          position: 0,
        },
      ];

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
        neutral_garrison: garrison,
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
