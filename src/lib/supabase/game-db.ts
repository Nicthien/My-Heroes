import { createAdminClient } from "@/lib/supabase/admin";

export type SupabaseAdmin = ReturnType<typeof createAdminClient>;
type DbRow = Record<string, unknown>;

function rows(value: unknown): DbRow[] {
  return Array.isArray(value) ? (value as DbRow[]) : [];
}

function isOptionalSchemaError(error: { code?: string; message?: string; details?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    error.code === "PGRST200" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    text.includes("schema cache") ||
    text.includes("no matches were found") ||
    text.includes("does not exist")
  );
}

async function attachHeroRows(
  supabase: SupabaseAdmin,
  heroes: DbRow[],
  table: string,
  property: string,
): Promise<void> {
  const heroIds = heroes.map((hero) => hero.id).filter((id): id is string => typeof id === "string");
  if (heroIds.length === 0) return;

  const { data, error } = await supabase.from(table).select("*").in("hero_id", heroIds);
  if (error) {
    if (isOptionalSchemaError(error)) return;
    throw error;
  }

  const byHero = new Map<string, DbRow[]>();
  for (const row of rows(data)) {
    const heroId = row.hero_id;
    if (typeof heroId !== "string") continue;
    byHero.set(heroId, [...(byHero.get(heroId) ?? []), row]);
  }

  for (const hero of heroes) {
    hero[property] = typeof hero.id === "string" ? byHero.get(hero.id) ?? [] : [];
  }
}

async function hydrateOptionalAdventureState(supabase: SupabaseAdmin, gameRow: DbRow): Promise<void> {
  const players = rows(gameRow.game_players ?? gameRow.players);
  const heroes = players.flatMap((player) => rows(player.heroes));

  await attachHeroRows(supabase, heroes, "hero_artifacts", "hero_artifacts");
  await attachHeroRows(supabase, heroes, "hero_skills", "hero_skills");
  await attachHeroRows(supabase, heroes, "hero_spellbook", "hero_spellbook");
  await attachHeroRows(supabase, heroes, "hero_status_effects", "hero_status_effects");

  if (typeof gameRow.id !== "string") return;
  const { data, error } = await supabase.from("adventure_objects").select("*").eq("game_id", gameRow.id);
  if (error) {
    if (isOptionalSchemaError(error)) {
      gameRow.adventure_objects = [];
      return;
    }
    throw error;
  }
  gameRow.adventure_objects = data ?? [];
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
    adventureObjects: rows(row.adventure_objects).map(toAdventureObject),
  };
}

export function toPlayer(row: DbRow) {
  const profile = row.profiles as DbRow | null | undefined;
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    user: profile ? { name: profile.name ?? null } : undefined,
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
    mana: row.mana ?? 10,
    maxMana: row.max_mana ?? 10,
    morale: row.morale ?? 0,
    luck: row.luck ?? 0,
    movement: row.movement,
    maxMovement: row.max_movement,
    x: row.x,
    y: row.y,
    isMoving: row.is_moving,
    armies: rows(row.armies).map(toArmy),
    artifacts: rows(row.hero_artifacts).map(toHeroArtifact),
    skills: rows(row.hero_skills).map(toHeroSkill),
    spellbook: rows(row.hero_spellbook).map(toHeroSpell),
    statusEffects: rows(row.hero_status_effects).map(toHeroStatusEffect),
  };
}

export function toHeroArtifact(row: DbRow) {
  return {
    id: row.id,
    heroId: row.hero_id,
    artifactType: row.artifact_type,
    slot: row.slot,
  };
}

export function toHeroSkill(row: DbRow) {
  return {
    id: row.id,
    heroId: row.hero_id,
    skill: row.skill,
    level: row.level,
  };
}

export function toHeroSpell(row: DbRow) {
  return {
    id: row.id,
    heroId: row.hero_id,
    spell: row.spell,
  };
}

export function toHeroStatusEffect(row: DbRow) {
  return {
    id: row.id,
    heroId: row.hero_id,
    effectType: row.effect_type,
    amount: row.amount,
    expiresOn: row.expires_on,
    expiresTurn: row.expires_turn,
  };
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

export function toAdventureObject(row: DbRow) {
  return {
    id: row.id,
    gameId: row.game_id,
    gamePlayerId: row.game_player_id,
    objectType: row.object_type,
    x: row.x,
    y: row.y,
    guardianPower: row.guardian_power,
    state: row.state ?? {},
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

export function toCombat(row: DbRow) {
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
    currentPlayerId: row.current_player_id,
    currentUnitId: row.current_unit_id,
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
  if (data) {
    await hydrateOptionalAdventureState(supabase, { id: gameId, game_players: [data] });
  }
  return data ? toPlayer(data) : null;
}

export async function getGameWithRelations(supabase: SupabaseAdmin, id: string) {
  const { data, error } = await supabase
    .from("games")
    .select(`
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
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (data) await hydrateOptionalAdventureState(supabase, data);
  return data ? toGame(data) : null;
}

export async function getGameRow(supabase: SupabaseAdmin, id: string) {
  const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
