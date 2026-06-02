import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import { MINIMUM_ADVENTURE_STEP_COST, getDailyAdventureMovement } from "@/lib/game/engine";
import { normalizeArtifactBag } from "@/lib/game/artifacts";
import { HERO_ROSTER } from "@/lib/game/heroes";
import { type CombatBoardUnit, type Resources, UnitType } from "@/lib/game/types";
import { normalizeMapLevel } from "@/lib/game/map-levels";
import { normalizeScoreStats } from "@/lib/game/score";

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
    createdByUserId: row.created_by_user_id ?? null,
    createdBy: row.created_by
      ? {
          id: row.created_by_user_id ?? null,
          name: (row.created_by as DbRow).name ?? null,
          email: (row.created_by as DbRow).email ?? null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    players: rows(row.game_players ?? row.players).map(toPlayer),
    turns: rows(row.turns).map(toTurn),
    combats: rows(row.combats).map(toCombat),
    neutralArmies: rows(row.neutral_armies).map(toNeutralArmy),
    gates: rows(row.gates).map(toGate),
    boats: rows(row.boats).map(toBoat),
    actionLogs: rows(row.game_action_logs).map(toGameActionLog),
  };
}

export function toPlayer(row: DbRow) {
  const profile = row.profiles as DbRow | null | undefined;
  const heroRows = rows(row.heroes);
  const activeHeroRows = heroRows.filter((hero) => String(hero.status ?? "ACTIVE") !== "TAVERN");
  const tavernHeroRows = heroRows.filter((hero) => String(hero.status ?? "ACTIVE") === "TAVERN");
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
    surrendered: row.surrendered ?? false,
    turnOrder: row.turn_order,
    exploredTiles: row.explored_tiles ?? [],
    heroes: activeHeroRows.map(toHero),
    tavernHeroes: tavernHeroRows.map(toTavernHero),
    towns: rows(row.towns).map(toTown),
    resourceBuildings: rows(row.resource_buildings).map(toResourceBuilding),
    scoreStats: normalizeScoreStats(row.score_stats),
  };
}

function toTavernHero(row: DbRow) {
  const armies = rows(row.armies).map(toArmy);
  const template = HERO_ROSTER.find((hero) =>
    hero.name === row.name &&
    hero.class === row.hero_class &&
    hero.specialty === row.specialty
  );
  return {
    templateId: `returning:${row.id}`,
    heroId: row.id,
    name: row.name,
    class: row.hero_class ?? "knight",
    faction: template?.faction ?? "castle",
    specialty: row.specialty ?? "",
    level: row.level ?? 1,
    returning: true,
    armyCount: armies.reduce((total, army) => total + Number(army.count ?? 0), 0),
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
    activeSpellEffects: (row.active_spell_effects ?? null) as Array<{ spellId: string }> | null,
    artifacts: normalizeArtifactBag(row.artifacts),
    skills: (row.skills ?? {}) as Partial<Record<string, "basic" | "advanced" | "expert">>,
    warMachines: (row.war_machines ?? {}) as { ballista?: boolean; firstAid?: boolean; ammoCart?: boolean },
    movement,
    maxMovement,
    x: row.x,
    y: row.y,
    mapLevel: normalizeMapLevel(row.map_level),
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
    mapLevel: normalizeMapLevel(row.map_level),
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
    mapLevel: normalizeMapLevel(row.map_level),
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
    mapLevel: normalizeMapLevel(row.map_level),
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
    mapLevel: normalizeMapLevel(row.map_level),
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

export function toBoat(row: DbRow) {
  return {
    id: row.id,
    gameId: row.game_id,
    ownerId: row.owner_player_id ?? null,
    heroId: row.hero_id ?? null,
    faction: row.faction ?? "castle",
    x: row.x,
    y: row.y,
    mapLevel: normalizeMapLevel(row.map_level),
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
    mapLevel: normalizeMapLevel(row.map_level),
    boardState: row.board_state,
    turnQueue: row.turn_queue ?? [],
    actionLog: row.action_log ?? [],
    result: row.result,
    participants: rows(row.combat_participants ?? row.participants).map(toCombatParticipant),
    reinforcementRequests: rows(row.combat_reinforcement_requests ?? row.reinforcement_requests)
      .map(toCombatReinforcementRequest)
      .filter((request) => request.status === "PENDING"),
    surrenderNegotiations: rows(row.combat_surrender_negotiations ?? row.surrender_negotiations)
      .map(toCombatSurrenderNegotiation)
      .filter((negotiation) => negotiation.status === "PENDING"),
    truces: rows(row.combat_truces ?? row.truces)
      .map(toCombatTruce),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toGameActionLog(row: DbRow) {
  return {
    id: row.id,
    gameId: row.game_id,
    gamePlayerId: row.game_player_id ?? null,
    actorKind: row.actor_kind,
    turnNumber: row.turn_number,
    actionType: row.action_type,
    category: row.category,
    summary: row.summary,
    details: row.details ?? {},
    createdAt: row.created_at,
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

export function toCombatReinforcementRequest(row: DbRow) {
  return {
    id: row.id,
    combatId: row.combat_id,
    requesterPlayerId: row.requester_player_id,
    requesterHeroId: row.requester_hero_id,
    targetPlayerId: row.target_player_id,
    side: row.side,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export function toCombatSurrenderNegotiation(row: DbRow) {
  return {
    id: row.id,
    combatId: row.combat_id,
    surrenderingPlayerId: row.surrendering_player_id,
    surrenderingHeroId: row.surrendering_hero_id,
    targetPlayerId: row.target_player_id,
    side: row.side,
    baseGold: Number(row.base_gold ?? 0),
    offer: normalizeResources(row.offer),
    refusalCount: Number(row.refusal_count ?? 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

export function toCombatTruce(row: DbRow) {
  return {
    id: row.id,
    combatId: row.combat_id,
    requestedByPlayerId: row.requested_by_player_id,
    requestedByHeroId: row.requested_by_hero_id,
    side: row.side,
    pauseUntilTurn: Number(row.pause_until_turn ?? 0),
    acknowledgedPlayerIds: Array.isArray(row.acknowledged_player_ids)
      ? row.acknowledged_player_ids.map(String)
      : [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeResources(value: unknown): Resources {
  const resources = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof Resources, unknown>>;
  return {
    gold: Math.max(0, Number(resources.gold ?? 0)),
    wood: Math.max(0, Number(resources.wood ?? 0)),
    ore: Math.max(0, Number(resources.ore ?? 0)),
    mercury: Math.max(0, Number(resources.mercury ?? 0)),
    crystals: Math.max(0, Number(resources.crystals ?? 0)),
    gems: Math.max(0, Number(resources.gems ?? 0)),
    sulfur: Math.max(0, Number(resources.sulfur ?? 0)),
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
  return getGameWithOptionalRelations(supabase, id, gameRelationsSelect);
}

export async function getGameSyncWithRelations(supabase: SupabaseAdmin, id: string) {
  return getGameWithOptionalRelations(supabase, id, gameSyncRelationsSelect);
}

async function getGameWithOptionalRelations(
  supabase: SupabaseAdmin,
  id: string,
  buildSelect: (includeGates: boolean, includeReinforcementRequests: boolean, includeCreatedBy: boolean, includeActionLogs: boolean) => string,
) {
  const attempts = [
    { includeGates: true, includeReinforcementRequests: true, includeCreatedBy: true, includeActionLogs: true },
    { includeGates: false, includeReinforcementRequests: true, includeCreatedBy: true, includeActionLogs: true },
    { includeGates: true, includeReinforcementRequests: false, includeCreatedBy: true, includeActionLogs: true },
    { includeGates: false, includeReinforcementRequests: false, includeCreatedBy: true, includeActionLogs: true },
    { includeGates: true, includeReinforcementRequests: true, includeCreatedBy: false, includeActionLogs: true },
    { includeGates: false, includeReinforcementRequests: true, includeCreatedBy: false, includeActionLogs: true },
    { includeGates: true, includeReinforcementRequests: false, includeCreatedBy: false, includeActionLogs: true },
    { includeGates: false, includeReinforcementRequests: false, includeCreatedBy: false, includeActionLogs: true },
    { includeGates: true, includeReinforcementRequests: true, includeCreatedBy: true, includeActionLogs: false },
    { includeGates: false, includeReinforcementRequests: true, includeCreatedBy: true, includeActionLogs: false },
    { includeGates: true, includeReinforcementRequests: false, includeCreatedBy: true, includeActionLogs: false },
    { includeGates: false, includeReinforcementRequests: false, includeCreatedBy: true, includeActionLogs: false },
    { includeGates: true, includeReinforcementRequests: true, includeCreatedBy: false, includeActionLogs: false },
    { includeGates: false, includeReinforcementRequests: true, includeCreatedBy: false, includeActionLogs: false },
    { includeGates: true, includeReinforcementRequests: false, includeCreatedBy: false, includeActionLogs: false },
    { includeGates: false, includeReinforcementRequests: false, includeCreatedBy: false, includeActionLogs: false },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("games")
      .select(buildSelect(attempt.includeGates, attempt.includeReinforcementRequests, attempt.includeCreatedBy, attempt.includeActionLogs))
      .eq("id", id)
      .maybeSingle();

    if (!error) return data ? toGame(data as unknown as DbRow) : null;
    lastError = error;
    if (!isMissingOptionalGameSchemaError(error)) throw error;
  }

  throw lastError;
}

function gameRelationsSelect(includeGates: boolean, includeReinforcementRequests: boolean, includeCreatedBy: boolean, includeActionLogs: boolean) {
  const combatRelations = buildCombatRelationsSelect(includeReinforcementRequests);
  return `
    *,
    ${includeCreatedBy ? "created_by:profiles!games_created_by_user_id_fkey(name,email)," : ""}
    game_players!game_players_game_id_fkey(
      *,
      profiles(name),
      heroes(*, armies(*)),
      towns(*),
      resource_buildings(*)
    ),
    turns(*),
    ${includeActionLogs ? "game_action_logs(*)," : ""}
    ${combatRelations},
    neutral_armies(*, neutral_army_stacks(*))
    ${includeGates ? ", gates(*, gate_stacks(*)), boats(*)" : ""}
  `;
}

function gameSyncRelationsSelect(includeGates: boolean, includeReinforcementRequests: boolean, includeCreatedBy: boolean, includeActionLogs: boolean) {
  const combatRelations = buildCombatRelationsSelect(includeReinforcementRequests);
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
    ${includeCreatedBy ? "created_by_user_id," : ""}
    game_players!game_players_game_id_fkey(
      *,
      profiles(name),
      heroes(*, armies(*)),
      towns(*),
      resource_buildings(*)
    ),
    turns(*),
    ${includeActionLogs ? "game_action_logs(*)," : ""}
    ${combatRelations},
    neutral_armies(*, neutral_army_stacks(*))
    ${includeGates ? ", gates(*, gate_stacks(*)), boats(*)" : ""}
  `;
}

function isMissingOptionalGameSchemaError(error: { code?: string; message?: string; details?: string | null }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("gates") ||
    text.includes("gate_stacks") ||
    text.includes("gate_id") ||
    text.includes("boats") ||
    text.includes("created_by") ||
    text.includes("created_by_user_id") ||
    text.includes("games_created_by_user_id_fkey") ||
    text.includes("combat_reinforcement_requests") ||
    text.includes("combat_surrender_negotiations") ||
    text.includes("combat_truces") ||
    text.includes("game_action_logs");
}

function buildCombatRelationsSelect(includeNegotiationTables: boolean) {
  return includeNegotiationTables
    ? "combats(*, combat_participants(*), combat_reinforcement_requests(*), combat_surrender_negotiations(*), combat_truces(*))"
    : "combats(*, combat_participants(*))";
}

export async function getGameRow(supabase: SupabaseAdmin, id: string) {
  const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
