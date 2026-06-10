import { computeVisibleTiles, getDailyAdventureMovement, placePlayerStart } from "@/lib/game/engine";
import { SURFACE_LEVEL } from "@/lib/game/map-levels";
import { makeRng } from "@/lib/game/engine/rng";
import { FACTION_UNITS, UNIT_RULES, getTownWeeklyGrowth } from "@/lib/game/economy";
import { getUnitRule } from "@/lib/game/units";
import { CLASS_STARTING_STATS, HERO_ROSTER } from "@/lib/game/heroes";
import { normalizePlayableFaction } from "@/lib/game/playable-factions";
import { BuildingType, Faction, GameMap, HeroClass, UnitType, type VictoryConditionType } from "@/lib/game/types";
import { pickTownName } from "@/lib/game/town-generation";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";

export const PLAYER_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];
export const AI_NAMES = ["Malrec IA", "Sylane IA", "Asterion IA", "Briselle IA", "Brogar IA", "Torvald IA", "Vornek IA", "Celian IA"];
export const STARTING_RESOURCES = {
  gold: 15000,
  wood: 20,
  ore: 20,
  mercury: 10,
  crystals: 10,
  gems: 10,
  sulfur: 10,
};

const STARTER_ARMY_COUNTS: [number, number, number] = [20, 12, 4];
/**
 * Heroes III-style starting town: never a bare plot. The first castle ships with
 * the town hall, a tavern (hero hiring), a fort (defense + unlocks dwellings) and
 * the tier-1 creature dwelling already built.
 */
const STARTING_TOWN_BUILDINGS: BuildingType[] = [
  BuildingType.VILLAGE_HALL,
  BuildingType.TAVERN,
  BuildingType.FORT,
  BuildingType.DWELLING_1,
];
const AI_FACTIONS: Faction[] = [
  Faction.CASTLE,
  Faction.RAMPART,
  Faction.TOWER,
  Faction.INFERNO,
  Faction.NECROPOLIS,
  Faction.DUNGEON,
  Faction.STRONGHOLD,
  Faction.FORTRESS,
];

export interface CreateGamePlayerSetupOptions {
  supabase: SupabaseAdmin;
  gameId: string;
  mapData: GameMap;
  turnOrder: number;
  faction?: string;
  color?: string;
  userId?: string | null;
  isAi?: boolean;
  aiName?: string;
  aiDifficulty?: string;
  victoryType?: VictoryConditionType;
}

/** King mode: every player starts with their unique King in the castle garrison. */
function buildStartingGarrison(victoryType: VictoryConditionType | undefined) {
  if (victoryType !== "KING") return [];
  const rule = getUnitRule(UnitType.KING);
  return [
    {
      id: crypto.randomUUID(),
      unitType: UnitType.KING,
      count: 1,
      health: rule.health,
      maxHealth: rule.health,
      position: 0,
    },
  ];
}

export function pickAiFaction(turnOrder: number) {
  return AI_FACTIONS[turnOrder % AI_FACTIONS.length];
}

export function pickAiName(turnOrder: number) {
  return AI_NAMES[turnOrder % AI_NAMES.length];
}

export function getStarterArmyMovement(faction: Faction) {
  const tiers = FACTION_UNITS[faction] ?? FACTION_UNITS[Faction.CASTLE];
  return getDailyAdventureMovement(
    STARTER_ARMY_COUNTS.map((_, i) => ({ unitType: tiers[i] }))
  );
}

export function buildStarterArmyRows(faction: Faction, heroId: string) {
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

export async function createGamePlayerSetup(options: CreateGamePlayerSetupOptions) {
  const {
    supabase,
    gameId,
    mapData,
    turnOrder,
    userId = null,
    isAi = false,
    aiName,
    aiDifficulty = "simple",
    victoryType,
  } = options;
  const factionKey = normalizeFaction(options.faction);
  const startPos = placePlayerStart(mapData, turnOrder);
  const initialExplored = computeVisibleTiles(mapData, [{ x: startPos.x, y: startPos.y }], 5);

  const { data: playerRow, error: playerError } = await supabase
    .from("game_players")
    .insert({
      game_id: gameId,
      user_id: userId,
      faction: factionKey,
      color: options.color ?? PLAYER_COLORS[turnOrder] ?? "#ffffff",
      turn_order: turnOrder,
      explored_tiles: Array.from(initialExplored, (key) => key.includes(":") ? key : `${SURFACE_LEVEL}:${key}`),
      ...STARTING_RESOURCES,
      is_ai: isAi,
      ai_name: isAi ? aiName ?? pickAiName(turnOrder) : null,
      ai_difficulty: isAi ? aiDifficulty : "simple",
    })
    .select("*")
    .single();

  if (playerError) throw playerError;

  const hero = pickStartingHero(factionKey, `${gameId}:${turnOrder}:${userId ?? "ai"}`);
  const heroClass = (hero?.class ?? HeroClass.KNIGHT) as HeroClass;
  const heroStats = CLASS_STARTING_STATS[heroClass];
  const dailyMovement = getStarterArmyMovement(factionKey);

  const heroInsert: Record<string, unknown> = {
    game_player_id: playerRow.id,
    name: hero?.name ?? "Sire Corvin",
    hero_class: heroClass,
    specialty: hero?.specialty ?? null,
    attack: heroStats.attack,
    defense: heroStats.defense,
    spell_power: heroStats.spellPower,
    knowledge: heroStats.knowledge,
    morale: heroStats.morale,
    luck: heroStats.luck,
    mana: heroStats.knowledge * 10,
    has_spell_book: true,
    known_spells: null,
    artifacts: { inventory: [], equipment: {} },
    x: startPos.x,
    y: startPos.y,
    map_level: SURFACE_LEVEL,
    movement: dailyMovement,
    max_movement: dailyMovement,
  };

  let { data: heroRow, error: heroError } = await supabase
    .from("heroes")
    .insert(heroInsert)
    .select("*")
    .single();

  if (heroError && isMissingSpellSchemaError(heroError)) {
    delete heroInsert.mana;
    delete heroInsert.has_spell_book;
    delete heroInsert.known_spells;
    delete heroInsert.morale;
    delete heroInsert.luck;
    delete heroInsert.artifacts;
    ({ data: heroRow, error: heroError } = await supabase
      .from("heroes")
      .insert(heroInsert)
      .select("*")
      .single());
  }

  if (heroError) {
    delete heroInsert.hero_class;
    delete heroInsert.specialty;
    ({ data: heroRow, error: heroError } = await supabase
      .from("heroes")
      .insert(heroInsert)
      .select("*")
      .single());
  }

  if (heroError && isMissingSpellSchemaError(heroError)) {
    delete heroInsert.mana;
    delete heroInsert.has_spell_book;
    delete heroInsert.known_spells;
    delete heroInsert.morale;
    delete heroInsert.luck;
    delete heroInsert.artifacts;
    ({ data: heroRow, error: heroError } = await supabase
      .from("heroes")
      .insert(heroInsert)
      .select("*")
      .single());
  }

  if (heroError) throw heroError;

  const { error: armyError } = await supabase.from("armies").insert(buildStarterArmyRows(factionKey, heroRow.id));
  if (armyError) throw armyError;

  const { error: townError } = await supabase.from("towns").insert({
    game_id: gameId,
    game_player_id: playerRow.id,
    name: pickTownName(factionKey, `${gameId}:${playerRow.id}:${turnOrder}`),
    town_type: factionKey,
    x: startPos.x,
    y: startPos.y,
    buildings: STARTING_TOWN_BUILDINGS,
    // Seed the tier-1 dwelling with its first week's growth so the player can
    // recruit immediately, instead of waiting for the first weekly refresh.
    available_recruits: getTownWeeklyGrowth(factionKey, STARTING_TOWN_BUILDINGS),
    garrison: buildStartingGarrison(victoryType),
    is_neutral: false,
  });
  if (townError) throw townError;

  return playerRow;
}

function normalizeFaction(faction: string | undefined): Faction {
  return normalizePlayableFaction(faction);
}

function pickStartingHero(faction: Faction, seed: string) {
  const factionHeroes = HERO_ROSTER.filter((hero) => hero.faction === faction);
  if (factionHeroes.length === 0) return null;
  const rng = makeRng(seed);
  return factionHeroes[Math.floor(rng() * factionHeroes.length)];
}

function isMissingSpellSchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("mana") || text.includes("has_spell_book") || text.includes("known_spells") || text.includes("morale") || text.includes("luck") || text.includes("artifacts") || text.includes("schema cache");
}
