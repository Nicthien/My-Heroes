import {
  RESOURCE_BUILDING_RULES,
  getFactionBuildingRule,
  type ResourceCost,
} from "@/lib/game/economy";
import {
  computeVisibleTiles,
  getPlayerVisionCenters,
  normalizeMapMovement,
} from "@/lib/game/engine";
import {
  mapLevels,
  normalizeMapLevel,
  SURFACE_LEVEL,
  withActiveMapLayer,
} from "@/lib/game/map-levels";
import { hasTownBuilding } from "@/lib/game/town-buildings";
import { BuildingType, Faction, GameMap, MapLevelId, MapObject, Position, Resources } from "@/lib/game/types";
import { calculateStacksPower } from "./combat";
import type { AiBoat, AiContext, AiDifficulty, AiDifficultyProfile, AiGame, AiPlayer, AiThreat, AiTown } from "./types";
import { loadAiMemory } from "./strategy/memory";
import { getPersonalityProfile, mergeDifficultyProfile } from "./strategy/personality";
import { computePosture } from "./strategy/posture";

export const AI_BUILD_PRIORITY: BuildingType[] = [
  // Tavern gates the Town Hall (canonical hall chain), so it comes first.
  BuildingType.TAVERN,
  BuildingType.TOWN_HALL,
  BuildingType.MARKET,
  // The Fort gates every creature dwelling (canonical dwelling tree).
  BuildingType.FORT,
  BuildingType.DWELLING_1,
  BuildingType.RESOURCE_SILO,
  BuildingType.DWELLING_2,
  // Mage Guild lvl 1 + Blacksmith are prerequisites of the City Hall (and the
  // Blacksmith also gates the Barracks for Castle/Stronghold).
  BuildingType.MAGE_GUILD,
  BuildingType.BLACKSMITH,
  BuildingType.CITY_HALL,
  BuildingType.DWELLING_3,
  BuildingType.DWELLING_4,
];

const DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  simple: {
    neutralPowerRatio: 1.35,
    humanPowerRatio: 1.8,
    threatWeight: 1.25,
    explorationWeight: 1.35,
    economyWeight: 1,
    aggressionWeight: 0.55,
  },
  normal: {
    neutralPowerRatio: 1.25,
    humanPowerRatio: 1.6,
    threatWeight: 1,
    explorationWeight: 1,
    economyWeight: 1.05,
    aggressionWeight: 1,
  },
  hard: {
    neutralPowerRatio: 1.12,
    humanPowerRatio: 1.45,
    threatWeight: 0.85,
    explorationWeight: 0.9,
    economyWeight: 1.1,
    aggressionWeight: 1.35,
  },
};

export function buildAiContext(
  game: AiGame,
  player: AiPlayer,
  activeLevel: MapLevelId = SURFACE_LEVEL,
): AiContext {
  // Normalize movement metadata on every layer in place, then bind `map` to the
  // requested level so all pathing/objective code operates on a single layer.
  const fullMap = game.mapData as GameMap;
  for (const layer of mapLevels(fullMap)) normalizeMapMovement(withActiveMapLayer(fullMap, layer.id));
  const map = withActiveMapLayer(fullMap, activeLevel);

  const mapState = ((game.mapState as Record<string, unknown> | undefined) ?? {});
  // Working explored set: active-level-only, unprefixed `${x},${y}` keys so the
  // existing fog/objective helpers keep working unchanged on the active layer.
  const explored = activeLevelExploredSet(player.exploredTiles, activeLevel);
  const currentVisible = computeVisibleTiles(
    map,
    getPlayerVisionCenters({
      heroes: (player.heroes ?? []).filter((hero) => normalizeMapLevel(hero.mapLevel) === activeLevel).map((hero) => ({ position: { x: hero.x, y: hero.y } })),
      towns: (player.towns ?? []).filter((town) => normalizeMapLevel(town.mapLevel) === activeLevel).map((town) => ({ position: { x: town.x, y: town.y } })),
    }),
    5,
  );
  for (const key of currentVisible) explored.add(key);

  const killedNeutralArmies = new Set<string>((mapState.killed as string[] | undefined) ?? []);
  for (const army of game.neutralArmies ?? []) {
    if (army.status !== "ACTIVE") killedNeutralArmies.add(army.id);
  }

  const difficulty = normalizeDifficulty(player.aiDifficulty);
  const visibleOpponents = (game.players ?? [])
    .filter((candidate) => candidate.id !== player.id && candidate.isAlive)
    .map((candidate) => ({
      ...candidate,
      heroes: (candidate.heroes ?? []).filter((hero) => normalizeMapLevel(hero.mapLevel) === activeLevel && explored.has(tileKey({ x: hero.x, y: hero.y }))),
      towns: (candidate.towns ?? []).filter((town) => normalizeMapLevel(town.mapLevel) === activeLevel && explored.has(tileKey({ x: town.x, y: town.y }))),
    }))
    .filter((candidate) => candidate.heroes.length > 0 || candidate.towns.length > 0);

  const memory = loadAiMemory(game, player);
  const personalityProfile = getPersonalityProfile(memory.personality);
  const profile = mergeDifficultyProfile(DIFFICULTY_PROFILES[difficulty], memory.personality);
  const partial: AiContext = {
    game,
    player,
    map,
    fullMap,
    activeLevel,
    boats: (game.boats ?? []) as AiBoat[],
    mapState,
    collected: new Set((mapState.collected as string[] | undefined) ?? []),
    visitedAdventureBuildings: new Set((mapState.visitedAdventureBuildings as string[] | undefined) ?? []),
    playerAdventureVisits: (mapState.playerAdventureVisits as Record<string, string[]> | undefined) ?? {},
    heroAdventureVisits: (mapState.heroAdventureVisits as Record<string, string[]> | undefined) ?? {},
    weeklyAdventureVisits: (mapState.weeklyAdventureVisits as Record<string, string> | undefined) ?? {},
    mysticalGardenVisits: (mapState.mysticalGardenVisits as Record<string, string> | undefined) ?? {},
    killedNeutralArmies,
    explored,
    difficulty,
    profile,
    visibleOpponents,
    threats: buildThreats(game, player.id, explored, activeLevel),
    resourceNeeds: computeResourceNeeds(player, personalityProfile.buildPriority),
    memory,
    personality: memory.personality,
    posture: memory.posture,
  };
  partial.posture = computePosture(partial, memory);
  partial.memory = { ...memory, posture: partial.posture };
  return partial;
}

export function buildPriorityForPersonality(context: AiContext) {
  return getPersonalityProfile(context.personality).buildPriority;
}

function buildThreats(game: AiGame, playerId: string, explored: Set<string>, activeLevel: MapLevelId): AiThreat[] {
  const threats: AiThreat[] = [];

  for (const army of game.neutralArmies ?? []) {
    if (army.status !== "ACTIVE") continue;
    if (normalizeMapLevel(army.mapLevel) !== activeLevel) continue;
    const position = { x: army.x, y: army.y };
    if (!explored.has(tileKey(position))) continue;
    threats.push({
      id: army.id,
      position,
      power: calculateStacksPower(army.stacks),
      ownerPlayerId: null,
      kind: "neutral",
    });
  }

  for (const player of game.players ?? []) {
    if (!player.isAlive || player.id === playerId) continue;
    for (const hero of player.heroes ?? []) {
      if (normalizeMapLevel(hero.mapLevel) !== activeLevel) continue;
      const position = { x: hero.x, y: hero.y };
      if (!explored.has(tileKey(position))) continue;
      threats.push({
        id: hero.id,
        position,
        power: calculateStacksPower(hero.armies, hero.attack, hero.defense, hero.morale ?? 0),
        ownerPlayerId: player.id,
        kind: "human",
      });
    }
  }

  return threats;
}

export function computeResourceNeeds(
  player: AiPlayer,
  buildPriority: BuildingType[] = AI_BUILD_PRIORITY,
): Partial<Record<keyof Resources, number>> {
  const needs: Partial<Record<keyof Resources, number>> = {};
  const resources = playerResources(player);

  for (const town of [...(player.towns ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const faction = normalizeFaction(town.townType ?? player.faction);
    const buildings = town.buildings ?? [];
    const nextRule = buildPriority
      .filter((building) => !hasTownBuilding(buildings, building))
      .map((building) => getFactionBuildingRule(faction, building))
      .find((rule) => rule && !rule.requires?.some((requirement) => !hasTownBuilding(buildings, requirement)));

    if (!nextRule) continue;
    for (const [resource, amount] of Object.entries(nextRule.cost as ResourceCost)) {
      const key = resource as keyof Resources;
      const missing = Math.max(0, Number(amount ?? 0) - Number(resources[key] ?? 0));
      if (missing > 0) needs[key] = Math.max(needs[key] ?? 0, missing);
    }
    break;
  }

  return needs;
}

export function playerResources(player: Pick<AiPlayer, "gold" | "wood" | "ore" | "mercury" | "crystals" | "gems" | "sulfur">): Resources {
  return {
    gold: Number(player.gold ?? 0),
    wood: Number(player.wood ?? 0),
    ore: Number(player.ore ?? 0),
    mercury: Number(player.mercury ?? 0),
    crystals: Number(player.crystals ?? 0),
    gems: Number(player.gems ?? 0),
    sulfur: Number(player.sulfur ?? 0),
  };
}

export function normalizeFaction(faction: string | undefined): Faction {
  return faction && Object.values(Faction).includes(faction as Faction) ? (faction as Faction) : Faction.CASTLE;
}

export function normalizeDifficulty(difficulty: string | null | undefined): AiDifficulty {
  return difficulty === "normal" || difficulty === "hard" ? difficulty : "simple";
}

export function normalizeTownCenter(buildings: string[]) {
  const centerBuildings = [BuildingType.VILLAGE_HALL, BuildingType.TOWN_HALL, BuildingType.CITY_HALL, BuildingType.CAPITOL];
  const strongest = [...buildings]
    .filter((building) => centerBuildings.includes(building as BuildingType))
    .sort((a, b) => centerBuildings.indexOf(b as BuildingType) - centerBuildings.indexOf(a as BuildingType))[0];
  return buildings.filter((building) => !centerBuildings.includes(building as BuildingType)).concat(strongest ?? BuildingType.VILLAGE_HALL);
}

export function getResourcePileAmount(object: MapObject) {
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

export function getResourceValue(resource: keyof Resources, amount: number, needs: Partial<Record<keyof Resources, number>>) {
  const base = resource === "gold" ? 1 : 120;
  const needMultiplier = needs[resource] ? 2.25 : resource === "gold" ? 0.75 : 1;
  return Math.max(1, amount * base * needMultiplier);
}

export function getResourceBuildingValue(buildingType: string | undefined, needs: Partial<Record<keyof Resources, number>>) {
  const rule = RESOURCE_BUILDING_RULES.find((item) => item.type === buildingType);
  if (!rule) return 900;
  return Object.entries(rule.production).reduce((total, [resource, amount]) => {
    return total + getResourceValue(resource as keyof Resources, Number(amount ?? 0) * 8, needs);
  }, 600);
}

export function countNewVisibleTiles(map: GameMap, explored: Set<string>, position: Position) {
  let count = 0;
  for (const key of computeVisibleTiles(map, [position], 5)) {
    if (!explored.has(key)) count++;
  }
  return count;
}

// Mesure si une case est sur la frontière de l'inconnu (8 voisines).
// Plus le score est élevé, plus la case sert à pousser le brouillard.
export function frontierScore(map: GameMap, explored: Set<string>, position: Position): number {
  let unexplored = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = position.x + dx;
      const y = position.y + dy;
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
      if (!explored.has(`${x},${y}`)) unexplored++;
    }
  }
  return unexplored;
}

export function hasAdjacentUnexplored(map: GameMap, explored: Set<string>, position: Position) {
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

export function isTownOwnedByPlayer(player: AiPlayer, position: Position, townId: string | undefined) {
  return (player.towns ?? []).some((town: AiTown) =>
    town.id === townId || (town.x === position.x && town.y === position.y)
  );
}

export function tileKey(position: Position) {
  return `${position.x},${position.y}`;
}

/**
 * Extracts the explored tiles for a single map level as unprefixed `${x},${y}`
 * keys. Stored keys use the `${level}:${x},${y}` scheme; legacy unprefixed keys
 * are treated as surface (mirrors normalizeExploredTileKey on the human side).
 */
export function activeLevelExploredSet(exploredTiles: string[] | undefined, level: MapLevelId): Set<string> {
  const result = new Set<string>();
  for (const raw of exploredTiles ?? []) {
    const key = String(raw);
    const separator = key.indexOf(":");
    if (separator >= 0) {
      if (normalizeMapLevel(key.slice(0, separator)) === level) result.add(key.slice(separator + 1));
    } else if (level === SURFACE_LEVEL) {
      result.add(key);
    }
  }
  return result;
}
