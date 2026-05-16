import { computeVisibleTiles, getDailyAdventureMovement, placePlayerStart } from "@/lib/game/engine";
import { makeRng } from "@/lib/game/engine/rng";
import { FACTION_UNITS, UNIT_RULES } from "@/lib/game/economy";
import { CLASS_STARTING_STATS, HERO_ROSTER } from "@/lib/game/heroes";
import { BuildingType, Faction, GameMap, HeroClass } from "@/lib/game/types";
import { pickTownName } from "@/lib/game/town-generation";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";

export const PLAYER_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];
export const AI_NAMES = ["Sandro IA", "Kyrre IA", "Solmyr IA", "Mephala IA", "Crag Hack IA", "Gunnar IA", "Tazar IA", "Loynis IA"];

const STARTER_ARMY_COUNTS: [number, number, number] = [20, 12, 4];
const AI_FACTIONS: Faction[] = [
  Faction.CASTLE,
  Faction.RAMPART,
  Faction.TOWER,
  Faction.INFERNO,
  Faction.NECROPOLIS,
  Faction.DUNGEON,
  Faction.STRONGHOLD,
  Faction.FORTRESS,
  Faction.CONFLUX,
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
      explored_tiles: Array.from(initialExplored),
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
    name: hero?.name ?? "Sire Christian",
    hero_class: heroClass,
    specialty: hero?.specialty ?? null,
    attack: heroStats.attack,
    defense: heroStats.defense,
    spell_power: heroStats.spellPower,
    knowledge: heroStats.knowledge,
    x: startPos.x,
    y: startPos.y,
    movement: dailyMovement,
    max_movement: dailyMovement,
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
    buildings: [BuildingType.VILLAGE_HALL],
    garrison: [],
    is_neutral: false,
  });
  if (townError) throw townError;

  return playerRow;
}

function normalizeFaction(faction: string | undefined): Faction {
  return faction && faction in FACTION_UNITS ? (faction as Faction) : Faction.CASTLE;
}

function pickStartingHero(faction: Faction, seed: string) {
  const factionHeroes = HERO_ROSTER.filter((hero) => hero.faction === faction);
  if (factionHeroes.length === 0) return null;
  const rng = makeRng(seed);
  return factionHeroes[Math.floor(rng() * factionHeroes.length)];
}
