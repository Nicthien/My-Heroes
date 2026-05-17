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
import { hasTownBuilding } from "@/lib/game/town-buildings";
import { BuildingType, Faction, GameMap, MapObject, Position, Resources } from "@/lib/game/types";
import { calculateStacksPower } from "./combat";
import type { AiContext, AiDifficulty, AiDifficultyProfile, AiGame, AiPlayer, AiThreat, AiTown } from "./types";

export const AI_BUILD_PRIORITY: BuildingType[] = [
  BuildingType.TOWN_HALL,
  BuildingType.MARKET,
  BuildingType.BARRACKS,
  BuildingType.DWELLING_1,
  BuildingType.RESOURCE_SILO,
  BuildingType.DWELLING_2,
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

export function buildAiContext(game: AiGame, player: AiPlayer): AiContext {
  const map = normalizeMapMovement(game.mapData as GameMap);
  const mapState = ((game.mapState as Record<string, unknown> | undefined) ?? {});
  const explored = new Set(player.exploredTiles ?? []);
  const currentVisible = computeVisibleTiles(
    map,
    getPlayerVisionCenters({
      heroes: (player.heroes ?? []).map((hero) => ({ position: { x: hero.x, y: hero.y } })),
      towns: (player.towns ?? []).map((town) => ({ position: { x: town.x, y: town.y } })),
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
      heroes: (candidate.heroes ?? []).filter((hero) => explored.has(tileKey({ x: hero.x, y: hero.y }))),
      towns: (candidate.towns ?? []).filter((town) => explored.has(tileKey({ x: town.x, y: town.y }))),
    }))
    .filter((candidate) => candidate.heroes.length > 0 || candidate.towns.length > 0);

  return {
    game,
    player,
    map,
    mapState,
    collected: new Set((mapState.collected as string[] | undefined) ?? []),
    visitedAdventureBuildings: new Set((mapState.visitedAdventureBuildings as string[] | undefined) ?? []),
    playerAdventureVisits: (mapState.playerAdventureVisits as Record<string, string[]> | undefined) ?? {},
    killedNeutralArmies,
    explored,
    difficulty,
    profile: DIFFICULTY_PROFILES[difficulty],
    visibleOpponents,
    threats: buildThreats(game, player.id, explored),
    resourceNeeds: computeResourceNeeds(player),
  };
}

function buildThreats(game: AiGame, playerId: string, explored: Set<string>): AiThreat[] {
  const threats: AiThreat[] = [];

  for (const army of game.neutralArmies ?? []) {
    if (army.status !== "ACTIVE") continue;
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
      const position = { x: hero.x, y: hero.y };
      if (!explored.has(tileKey(position))) continue;
      threats.push({
        id: hero.id,
        position,
        power: calculateStacksPower(hero.armies, hero.attack, hero.defense),
        ownerPlayerId: player.id,
        kind: "human",
      });
    }
  }

  return threats;
}

export function computeResourceNeeds(player: AiPlayer): Partial<Record<keyof Resources, number>> {
  const needs: Partial<Record<keyof Resources, number>> = {};
  const resources = playerResources(player);

  for (const town of [...(player.towns ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const faction = normalizeFaction(town.townType ?? player.faction);
    const buildings = town.buildings ?? [];
    const nextRule = AI_BUILD_PRIORITY
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
