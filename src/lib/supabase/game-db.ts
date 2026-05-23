import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import { MINIMUM_ADVENTURE_STEP_COST, getDailyAdventureMovement } from "@/lib/game/engine";
import { normalizeArtifactBag } from "@/lib/game/artifacts";
import { type CombatBoardUnit, UnitType } from "@/lib/game/types";

export type SupabaseAdmin = ReturnType<typeof createAdminClient>;
type DbRow = Record<string, unknown>;

function rows(value: unknown): DbRow[] {
  return Array.isArray(value) ? (value as DbRow[]) : [];
}

export function toGame(row: DbRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    maxPlayers: row.max_players,
    mapWidth: row.map_width,
    mapHeight: row.map_height,
    turnNumber: row.turn_number,
    currentTurnPlayerId: row.current_turn_player_id,
    winnerId: row.winner_id,
    mapData: row.map_data,
    gameConfig: row.game_config,
    mapState: row.map_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    players: rows(row.game_players ?? row.players).map(toPlayer),
    turns: rows(row.turns).map(toTurn),
    combats: rows(row.combats).map(toCombat),
    neutralArmies: rows(row.neutral_armies).map(toNeutralArmy),
    gates: rows(row.gates).map(toGate),
  };
}

export function toPlayer(row: DbRow) {
  const profile = row.profiles as DbRow | null | undefined;
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    user: profile ? { name: profile.name ?? null } : undefined,
    isAi: row.is_ai ?? false,
    aiName: row.ai_name ?? null,
    aiDifficulty: row.ai_difficulty ?? null,
    faction: row.faction,
    color: row.color,
    gold: row.gold,
    wood: row.wood,
    ore: row.ore,
    mercury: row.mercury,
    crystals: row.crystals,
    gems: row.gems ?? 0,
    sulfur: row.sulfur,
    isReady: row.is_ready,
    isAlive: row.is_alive,
    turnOrder: row.turn_order,
    exploredTiles: row.explored_tiles ?? [],
    heroes: rows(row.heroes).map(toHero),
    towns: rows(row.towns).map(toTown),
    resourceBuildings: rows(row.resource_buildings).map(toResourceBuilding),
  };
}

export function toHero(row: DbRow) {
  const armies = rows(row.armies).map(toArmy);
  const maxMovement = normalizeLegacyHeroMaxMovement(row.max_movement, armies);
  const movement = normalizeHeroCurrentMovement(row.movement, row.max_movement, maxMovement);

  return {
    id: row.id,
    gamePlayerId: row.game_player_id,
    name: row.name,
    class: row.hero_class ?? "knight",
    specialty: row.specialty ?? null,
    level: row.level,
    experience: row.experience,
    attack: row.attack,
    defense: row.defense,
    spellPower: row.spell_power,
    knowledge: row.knowledge,
    morale: Number(row.morale ?? 0),
    luck: Number(row.luck ?? 0),
    mana: row.mana ?? Number(row.knowledge ?? 1) * 10,
    hasSpellBook: row.has_spell_book ?? true,
    knownSpellIds: row.known_spells ?? null,
    artifacts: normalizeArtifactBag(row.artifacts),
    movement,
    maxMovement,
    x: row.x,
    y: row.y,
    isMoving: row.is_moving,
    armies,
  };
}

function normalizeLegacyHeroMaxMovement(value: unknown, armies: ReturnType<typeof toArmy>[]) {
  const movement = Number(value ?? 0);
  if (movement > 20) return movement;
  return getDailyAdventureMovement(armies.map((army) => ({ unitType: army.unitType as UnitType })));
}

function normalizeHeroCurrentMovement(value: unknown, rawMaxValue: unknown, normalizedMaxMovement: number) {
  const movement = Number(value ?? 0);
  if (movement <= 0) return 0;

  const maxMovement = Number(rawMaxValue ?? 0);
  if (maxMovement > 0 && maxMovement <= 20 && movement === maxMovement) return normalizedMaxMovement;
  if (movement < MINIMUM_ADVENTURE_STEP_COST) return 0;
  return movement;
}

export function toArmy(row: DbRow) {
  return {
    id: row.id,
    heroId: row.hero_id,
    unitType: row.unit_type,
    count: row.count,
    health: row.health,
    maxHealth: row.max_health,
    position: row.position,
  };
}

export function toTown(row: DbRow) {
  return {
    id: row.id,
    gamePlayerId: row.game_player_id,
    name: row.name,
    townType: row.town_type,
    x: row.x,
    y: row.y,
    level: row.level,
    isFort: row.is_fort,
    isNeutral: row.is_neutral,
    buildings: row.buildings ?? [],
    garrison: row.garrison ?? [],
    neutralGarrison: row.neutral_garrison ?? [],
    availableRecruits: row.available_recruits ?? {},
    tavernOffer: row.tavern_offer ?? [],
    lastBuiltTurn: row.last_built_turn,
  };
}

export function toResourceBuilding(row: DbRow) {
  return {
    id: row.id,
    gameId: row.game_id,
    gamePlayerId: row.game_player_id,
    buildingType: row.building_type,
    x: row.x,
    y: row.y,
    guardianPower: row.guardian_power,
  };
}

export function toTurn(row: DbRow) {
  return {
    id: row.id,
    gameId: row.game_id,
    gamePlayerId: row.game_player_id,
    turnNumber: row.turn_number,
    actions: row.actions ?? [],
    isCompleted: row.is_completed,
  };
}

export function toNeutralArmy(row: DbRow) {
  return {
    id: row.id,
    gameId: row.game_id,
    x: row.x,
    y: row.y,
    status: row.status,
    stacks: rows(row.neutral_army_stacks ?? row.stacks).map(toNeutralArmyStack),
  };
}

export function toNeutralArmyStack(row: DbRow) {
  return {
    id: row.id,
    neutralArmyId: row.neutral_army_id,
    unitType: row.unit_type,
    count: row.count,
    health: row.health,
    maxHealth: row.max_health,
    position: row.position,
  };
}

export function toGate(row: DbRow) {
  return {
    id: row.id,
    gameId: row.game_id,
    gamePlayerId: row.game_player_id,
    x: row.x,
    y: row.y,
    guardianPower: row.guardian_power,
    garrison: rows(row.gate_stacks ?? row.garrison).map(toGateStack).filter((stack) => Number(stack.count) > 0),
  };
}

export function toGateStack(row: DbRow) {
  return {
    id: row.id,
    gateId: row.gate_id,
    unitType: row.unit_type,
    count: row.count,
    health: row.health,
    maxHealth: row.max_health,
    position: row.position,
  };
}

export function toCombat(row: DbRow) {
  const boardState = row.board_state as { units?: CombatBoardUnit[] } | null;
  const currentUnitId = row.current_unit_id as string | null;

  return {
    id: row.id,
    gameId: row.game_id,
    mode: row.mode,
    status: row.status,
    attackerPlayerId: row.attacker_player_id,
    defenderPlayerId: row.defender_player_id,
    attackerHeroId: row.attacker_hero_id,
    defenderHeroId: row.defender_hero_id,
    neutralArmyId: row.neutral_army_id,
    gateId: row.gate_id,
    currentPlayerId: getCurrentCombatPlayerId(boardState, currentUnitId, row.current_player_id as string | null),
    currentUnitId,
    round: row.round,
    x: row.x,
    y: row.y,
    boardState: row.board_state,
    turnQueue: row.turn_queue ?? [],
    actionLog: row.action_log ?? [],
    result: row.result,
    participants: rows(row.combat_participants ?? row.participants).map(toCombatParticipant),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCombatParticipant(row: DbRow) {
  return {
    id: row.id,
    combatId: row.combat_id,
    playerId: row.player_id,
    heroId: row.hero_id,
    side: row.side,
    joinedAt: row.joined_at,
  };
}

export async function getProfileName(supabase: SupabaseAdmin, userId: string) {
  const { data } = await supabase.from("profiles").select("name,email").eq("id", userId).single();
  return data?.name ?? data?.email ?? "Joueur";
}

export async function getGamePlayer(supabase: SupabaseAdmin, gameId: string, userId: string) {
  const { data, error } = await supabase
    .from("game_players")
    .select(`
      *,
      heroes(*, armies(*)),
      towns(*),
      resource_buildings(*)
    `)
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? toPlayer(data) : null;
}

export async function getGameWithRelations(supabase: SupabaseAdmin, id: string) {
  const { data, error } = await supabase
    .from("games")
    .select(gameRelationsSelect(true))
    .eq("id", id)
    .maybeSingle();

  if (error && isMissingGateSchemaError(error)) {
    const fallback = await supabase
      .from("games")
      .select(gameRelationsSelect(false))
      .eq("id", id)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data ? toGame(fallback.data as unknown as DbRow) : null;
  }

  if (error) throw error;
  return data ? toGame(data as unknown as DbRow) : null;
}

export async function getGameSyncWithRelations(supabase: SupabaseAdmin, id: string) {
  const { data, error } = await supabase
    .from("games")
    .select(gameSyncRelationsSelect(true))
    .eq("id", id)
    .maybeSingle();

  if (error && isMissingGateSchemaError(error)) {
    const fallback = await supabase
      .from("games")
      .select(gameSyncRelationsSelect(false))
      .eq("id", id)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data ? toGame(fallback.data as unknown as DbRow) : null;
  }

  if (error) throw error;
  return data ? toGame(data as unknown as DbRow) : null;
}

function gameRelationsSelect(includeGates: boolean) {
  return `
    *,
    game_players!game_players_game_id_fkey(
      *,
      profiles(name),
      heroes(*, armies(*)),
      towns(*),
      resource_buildings(*)
    ),
    turns(*),
    combats(*, combat_participants(*)),
    neutral_armies(*, neutral_army_stacks(*))
    ${includeGates ? ", gates(*, gate_stacks(*))" : ""}
  `;
}

function gameSyncRelationsSelect(includeGates: boolean) {
  return `
    id,
    status,
    max_players,
    map_width,
    map_height,
    turn_number,
    current_turn_player_id,
    winner_id,
    map_state,
    updated_at,
    game_players!game_players_game_id_fkey(
      *,
      profiles(name),
      heroes(*, armies(*)),
      towns(*),
      resource_buildings(*)
    ),
    turns(*),
    combats(*, combat_participants(*)),
    neutral_armies(*, neutral_army_stacks(*))
    ${includeGates ? ", gates(*, gate_stacks(*))" : ""}
  `;
}

function isMissingGateSchemaError(error: { code?: string; message?: string; details?: string | null }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("gates") || text.includes("gate_stacks") || text.includes("gate_id");
}

export async function getGameRow(supabase: SupabaseAdmin, id: string) {
  const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
