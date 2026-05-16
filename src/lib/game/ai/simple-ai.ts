import { randomUUID } from "crypto";
import {
  canAfford,
  getFactionBuildingRule,
  getRecruitableUnitsForFaction,
  subtractCost,
  type ResourceCost,
} from "@/lib/game/economy";
import {
  computeVisibleTiles,
  findPath,
  getAdventurePathCost,
  getPlayerVisionCenters,
  getUsableAdventureMovement,
  isTileTraversable,
  MINIMUM_ADVENTURE_STEP_COST,
  normalizeMapMovement,
} from "@/lib/game/engine";
import { getTownCenterLevel, hasTownBuilding } from "@/lib/game/town-buildings";
import { BuildingType, Faction, GameMap, MapObject, Position, Resources, UnitType } from "@/lib/game/types";
import { getGameWithRelations, type SupabaseAdmin } from "@/lib/supabase/game-db";
import { completePlayerTurn } from "@/lib/game/server/turns";

interface AiArmy {
  id: string;
  unitType: UnitType;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

interface AiHero {
  id: string;
  x: number;
  y: number;
  movement: number;
  armies: AiArmy[];
}

interface AiTown {
  id: string;
  x: number;
  y: number;
  townType?: string;
  buildings?: string[];
  garrison?: AiArmy[];
  availableRecruits?: Record<string, number>;
  lastBuiltTurn?: number | null;
}

interface AiPlayer {
  id: string;
  userId: string | null;
  isAi?: boolean;
  isAlive?: boolean;
  turnOrder?: number;
  faction?: string;
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems: number;
  sulfur: number;
  exploredTiles: string[];
  heroes: AiHero[];
  towns: AiTown[];
}

interface AiGame {
  id: string;
  status: string;
  maxPlayers: number;
  turnNumber: number;
  currentTurnPlayerId?: string | null;
  mapData: unknown;
  mapState?: unknown;
  players: AiPlayer[];
}

const BUILD_PRIORITY: BuildingType[] = [
  BuildingType.TOWN_HALL,
  BuildingType.MARKET,
  BuildingType.BARRACKS,
  BuildingType.DWELLING_1,
  BuildingType.RESOURCE_SILO,
  BuildingType.DWELLING_2,
  BuildingType.CITY_HALL,
];
const AI_TURN_START_DELAY_MS = 500;
const AI_MOVE_DELAY_MS = 450;
const AI_TURN_END_DELAY_MS = 2300;

export async function runAiTurnsUntilHuman(supabase: SupabaseAdmin, gameId: string) {
  if (!(await acquireAiRunnerLock(supabase, gameId))) return;

  try {
    const initialGame = await getGameWithRelations(supabase, gameId);
    const maxSteps = Math.max(2, Number(initialGame?.maxPlayers ?? 0) + 2);

    for (let step = 0; step < maxSteps; step++) {
      const game = await getGameWithRelations(supabase, gameId) as unknown as AiGame | null;
      if (!game || game.status !== "ACTIVE" || !game.currentTurnPlayerId) return;

      const currentPlayer = game.players.find((player) => player.id === game.currentTurnPlayerId && player.isAlive);
      if (!currentPlayer?.isAi) return;

      await sleep(AI_TURN_START_DELAY_MS);
      await runSimpleAiTurn(supabase, game, currentPlayer);
      await sleep(AI_TURN_END_DELAY_MS);
      await completePlayerTurn(supabase, game.id, Number(game.turnNumber), currentPlayer.id);
    }
  } finally {
    await supabase.from("games").update({ ai_runner_locked_at: null }).eq("id", gameId);
  }
}

async function acquireAiRunnerLock(supabase: SupabaseAdmin, gameId: string) {
  const { data: game, error: fetchError } = await supabase
    .from("games")
    .select("ai_runner_locked_at")
    .eq("id", gameId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const lockedAt = game?.ai_runner_locked_at ? Date.parse(String(game.ai_runner_locked_at)) : 0;
  if (lockedAt && Date.now() - lockedAt < 2 * 60 * 1000) return false;

  const { error } = await supabase
    .from("games")
    .update({ ai_runner_locked_at: new Date().toISOString() })
    .eq("id", gameId)
    .select("id")
    .single();

  if (error) throw error;
  return true;
}

async function runSimpleAiTurn(supabase: SupabaseAdmin, game: AiGame, player: AiPlayer) {
  await buildOneAffordableBuilding(supabase, game, player);
  const afterBuild = await getGameWithRelations(supabase, game.id) as unknown as AiGame | null;
  const freshPlayer = afterBuild?.players.find((item) => item.id === player.id) ?? player;
  await recruitAvailableUnits(supabase, freshPlayer);

  const afterRecruit = await getGameWithRelations(supabase, game.id) as unknown as AiGame | null;
  const movePlayer = afterRecruit?.players.find((item) => item.id === player.id) ?? freshPlayer;
  if (afterRecruit) await moveHeroesForAi(supabase, afterRecruit, movePlayer);
}

async function buildOneAffordableBuilding(supabase: SupabaseAdmin, game: AiGame, player: AiPlayer) {
  const town = [...(player.towns ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .find((item) => item.lastBuiltTurn !== game.turnNumber);
  if (!town) return;

  const faction = normalizeFaction(town.townType ?? player.faction);
  const buildings = [...(town.buildings ?? [])];
  const resources = playerResources(player);

  for (const building of BUILD_PRIORITY) {
    if (hasTownBuilding(buildings, building)) continue;
    const rule = getFactionBuildingRule(faction, building);
    if (!rule) continue;
    if (rule.requires?.some((requirement) => !hasTownBuilding(buildings, requirement))) continue;
    if (!canAfford(resources, rule.cost)) continue;

    const nextBuildings = normalizeTownCenter([...buildings, building]);
    const nextResources = subtractCost(resources, rule.cost);
    await supabase.from("game_players").update(nextResources).eq("id", player.id);
    await supabase.from("towns").update({
      buildings: nextBuildings,
      level: getTownCenterLevel(nextBuildings),
      last_built_turn: game.turnNumber,
    }).eq("id", town.id);
    return;
  }
}

async function recruitAvailableUnits(supabase: SupabaseAdmin, player: AiPlayer) {
  const town = [...(player.towns ?? [])].sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!town) return;

  const faction = normalizeFaction(town.townType ?? player.faction);
  const buildings = town.buildings ?? [];
  const availableRecruits = { ...(town.availableRecruits ?? {}) };
  const garrison = [...(town.garrison ?? [])];
  let resources = playerResources(player);
  let changed = false;

  for (const entry of getRecruitableUnitsForFaction(faction).filter((item) => !item.upgraded)) {
    if (!hasTownBuilding(buildings, entry.dwelling)) continue;
    const available = Math.floor(Number(availableRecruits[entry.unitType] ?? 0));
    if (available <= 0) continue;

    const count = getAffordableCount(resources, entry.rule.cost, available);
    if (count <= 0) continue;

    const totalCost = multiplyCost(entry.rule.cost, count);
    resources = subtractCost(resources, totalCost);
    availableRecruits[entry.unitType] = available - count;
    addUnitsToGarrison(garrison, entry.unitType, count, entry.rule.health);
    changed = true;
  }

  if (!changed) return;

  await supabase.from("game_players").update(resources).eq("id", player.id);
  await supabase.from("towns").update({
    available_recruits: availableRecruits,
    garrison,
  }).eq("id", town.id);
}

async function moveHeroesForAi(supabase: SupabaseAdmin, game: AiGame, player: AiPlayer) {
  const map = normalizeMapMovement(game.mapData as GameMap);
  const collected = new Set<string>(((game.mapState as Record<string, unknown> | undefined)?.collected as string[] | undefined) ?? []);
  const explored = new Set<string>(player.exploredTiles ?? []);
  const heroes = [...(player.heroes ?? [])].sort((a, b) => Number(a.id > b.id) - Number(a.id < b.id));
  let resources = playerResources(player);

  for (const hero of heroes) {
    let currentHero = { ...hero };
    for (let step = 0; step < 12 && currentHero.movement >= MINIMUM_ADVENTURE_STEP_COST; step++) {
      const move = chooseAiMove(map, explored, collected, currentHero);
      if (!move) break;

      const result = await applyAiHeroMove({
        supabase,
        game,
        player,
        hero: currentHero,
        map,
        collected,
        explored,
        resources,
        path: move.path,
      });
      if (!result.moved) break;
      currentHero = result.hero;
      resources = result.resources;
      player.exploredTiles = Array.from(explored);
      await sleep(AI_MOVE_DELAY_MS);
    }
  }
}

function chooseAiMove(map: GameMap, explored: Set<string>, collected: Set<string>, hero: AiHero) {
  const start = { x: hero.x, y: hero.y };
  const resourceTargets = findVisibleResourceTargets(map, explored, collected)
    .map((target) => ({ position: target.position, path: findPath(map, start, target.position, hero.movement) }))
    .filter((item) => item.path.length > 1)
    .sort((a, b) => getAdventurePathCost(map, a.path) - getAdventurePathCost(map, b.path));

  return resourceTargets[0] ?? findExplorationTargets(map, explored, start, hero.movement)[0] ?? null;
}

async function applyAiHeroMove({
  supabase,
  game,
  player,
  hero,
  map,
  collected,
  explored,
  resources,
  path,
}: {
  supabase: SupabaseAdmin;
  game: AiGame;
  player: AiPlayer;
  hero: AiHero;
  map: GameMap;
  collected: Set<string>;
  explored: Set<string>;
  resources: Resources;
  path: Position[];
}): Promise<{ moved: boolean; hero: AiHero; resources: Resources }> {
  const destination = path[path.length - 1];
  const usedMovement = getAdventurePathCost(map, path);
  if (!destination || path.length <= 1 || !Number.isFinite(usedMovement) || usedMovement <= 0 || usedMovement > hero.movement) {
    return { moved: false, hero, resources };
  }
  const nextMovement = getUsableAdventureMovement(map, destination, hero.movement - usedMovement);

  await supabase.from("heroes").update({
    x: destination.x,
    y: destination.y,
    movement: nextMovement,
  }).eq("id", hero.id);

  const visible = computeVisibleTiles(
    map,
    getPlayerVisionCenters({
      heroes: [{ position: destination }],
      towns: player.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
    }),
    5
  );
  for (const key of visible) explored.add(key);

  const nextMapState = { ...((game.mapState as Record<string, unknown> | undefined) ?? {}) };
  const tile = map.tiles[destination.y]?.[destination.x];
  if (tile?.object?.type === "resource" && !collected.has(tile.object.id)) {
    collected.add(tile.object.id);
    const resourceType = (tile.object.subtype ?? "gold") as keyof Resources;
    const amount = getResourcePileAmount(tile.object);
    const nextResources = { ...resources, [resourceType]: Number(resources[resourceType] ?? 0) + amount };
    await supabase.from("game_players").update({
      [resourceType]: nextResources[resourceType],
      explored_tiles: Array.from(explored),
    }).eq("id", player.id);
    nextMapState.collected = Array.from(collected);
    await supabase.from("games").update({ map_state: nextMapState }).eq("id", game.id);
    return { moved: true, hero: { ...hero, x: destination.x, y: destination.y, movement: nextMovement }, resources: nextResources };
  }

  await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", player.id);
  return { moved: true, hero: { ...hero, x: destination.x, y: destination.y, movement: nextMovement }, resources };
}

function findVisibleResourceTargets(map: GameMap, explored: Set<string>, collected: Set<string>) {
  const targets: Array<{ position: Position; object: MapObject }> = [];
  for (const row of map.tiles) {
    for (const tile of row) {
      if (!explored.has(`${tile.x},${tile.y}`)) continue;
      if (tile.object?.type !== "resource" || collected.has(tile.object.id)) continue;
      targets.push({ position: { x: tile.x, y: tile.y }, object: tile.object });
    }
  }
  return targets;
}

function findExplorationTargets(map: GameMap, explored: Set<string>, start: Position, movement: number) {
  const targets: Array<{ position: Position; path: Position[]; score: number }> = [];

  for (const row of map.tiles) {
    for (const tile of row) {
      const position = { x: tile.x, y: tile.y };
      if (!explored.has(tileKey(position))) continue;
      if (position.x === start.x && position.y === start.y) continue;
      if (!isTileTraversable(tile)) continue;

      const path = findPath(map, start, position, movement);
      if (path.length <= 1) continue;
      const cost = getAdventurePathCost(map, path);
      if (cost > movement) continue;
      const revealScore = countNewVisibleTiles(map, explored, position);
      const frontierBonus = hasAdjacentUnexplored(map, explored, position) ? 1 : 0;
      targets.push({
        position,
        path,
        score: revealScore * 100000 + frontierBonus * 1000 + cost,
      });
    }
  }

  return targets.sort((a, b) => b.score - a.score || getAdventurePathCost(map, b.path) - getAdventurePathCost(map, a.path));
}

function countNewVisibleTiles(map: GameMap, explored: Set<string>, position: Position) {
  let count = 0;
  for (const key of computeVisibleTiles(map, [position], 5)) {
    if (!explored.has(key)) count++;
  }
  return count;
}

function hasAdjacentUnexplored(map: GameMap, explored: Set<string>, position: Position) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = position.x + dx;
      const y = position.y + dy;
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
      if (!explored.has(`${x},${y}`)) return true;
    }
  }
  return false;
}

function tileKey(position: Position) {
  return `${position.x},${position.y}`;
}

function addUnitsToGarrison(stacks: AiArmy[], unitType: UnitType, count: number, maxHealth: number) {
  const existing = stacks.find((unit) => unit.unitType === unitType);
  if (existing) {
    existing.count += count;
    existing.health += maxHealth * count;
    return;
  }

  stacks.push({
    id: randomUUID(),
    unitType,
    count,
    health: maxHealth * count,
    maxHealth,
    position: stacks.length,
  });
}

function getAffordableCount(resources: Resources, cost: ResourceCost, available: number) {
  let limit = available;
  for (const [resource, amount] of Object.entries(cost)) {
    if (!amount) continue;
    const owned = resources[resource as keyof Resources] ?? 0;
    limit = Math.min(limit, Math.floor(owned / amount));
  }
  return Math.max(0, limit);
}

function multiplyCost(cost: ResourceCost, count: number): ResourceCost {
  return Object.fromEntries(
    Object.entries(cost).map(([resource, amount]) => [resource, (amount ?? 0) * count])
  ) as ResourceCost;
}

function playerResources(player: Pick<AiPlayer, "gold" | "wood" | "ore" | "mercury" | "crystals" | "gems" | "sulfur">): Resources {
  return {
    gold: player.gold,
    wood: player.wood,
    ore: player.ore,
    mercury: player.mercury,
    crystals: player.crystals,
    gems: player.gems ?? 0,
    sulfur: player.sulfur,
  };
}

function normalizeFaction(faction: string | undefined): Faction {
  return faction && Object.values(Faction).includes(faction as Faction) ? (faction as Faction) : Faction.CASTLE;
}

function normalizeTownCenter(buildings: string[]) {
  const centerBuildings = [BuildingType.VILLAGE_HALL, BuildingType.TOWN_HALL, BuildingType.CITY_HALL, BuildingType.CAPITOL];
  const strongest = [...buildings]
    .filter((building) => centerBuildings.includes(building as BuildingType))
    .sort((a, b) => centerBuildings.indexOf(b as BuildingType) - centerBuildings.indexOf(a as BuildingType))[0];
  return buildings.filter((building) => !centerBuildings.includes(building as BuildingType)).concat(strongest ?? BuildingType.VILLAGE_HALL);
}

function getResourcePileAmount(object: MapObject) {
  const amount = Number(object.amount);
  if (Number.isFinite(amount) && amount > 0) return amount;

  switch (object.subtype) {
    case "gold":
      return 500;
    case "wood":
    case "ore":
      return 5;
    case "mercury":
    case "crystals":
    case "gems":
    case "sulfur":
      return 3;
    default:
      return 1;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
