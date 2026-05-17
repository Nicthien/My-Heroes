import { randomUUID } from "crypto";
import {
  canAfford,
  getFactionBuildingRule,
  getRecruitableUnitsForFaction,
  subtractCost,
  type ResourceCost,
} from "@/lib/game/economy";
import { getTownCenterLevel, hasTownBuilding } from "@/lib/game/town-buildings";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { AI_BUILD_PRIORITY, normalizeFaction, normalizeTownCenter, playerResources } from "./context";
import type { AiArmy, AiGame, AiPlayer } from "./types";

export async function runAiEconomy(supabase: SupabaseAdmin, game: AiGame, player: AiPlayer) {
  await buildOneAffordableBuilding(supabase, game, player);
  await recruitAvailableUnits(supabase, player);
}

async function buildOneAffordableBuilding(supabase: SupabaseAdmin, game: AiGame, player: AiPlayer) {
  const town = [...(player.towns ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .find((item) => item.lastBuiltTurn !== game.turnNumber);
  if (!town) return;

  const faction = normalizeFaction(town.townType ?? player.faction);
  const buildings = [...(town.buildings ?? [])];
  const resources = playerResources(player);

  for (const building of AI_BUILD_PRIORITY) {
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
  const towns = [...(player.towns ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  if (towns.length === 0) return;

  let resources = playerResources(player);
  let resourcesChanged = false;

  for (const town of towns) {
    const faction = normalizeFaction(town.townType ?? player.faction);
    const buildings = town.buildings ?? [];
    const availableRecruits = { ...(town.availableRecruits ?? {}) };
    const garrison = [...(town.garrison ?? [])];
    let townChanged = false;

    for (const entry of getRecruitableUnitsForFaction(faction).filter((item) => !item.upgraded)) {
      if (!hasTownBuilding(buildings, entry.dwelling)) continue;
      const available = Math.floor(Number(availableRecruits[entry.unitType] ?? 0));
      if (available <= 0) continue;

      const count = getAffordableCount(resources, entry.rule.cost, available);
      if (count <= 0) continue;

      const totalCost = multiplyCost(entry.rule.cost, count);
      resources = subtractCost(resources, totalCost);
      resourcesChanged = true;
      availableRecruits[entry.unitType] = available - count;
      addUnitsToGarrison(garrison, entry.unitType, count, entry.rule.health);
      townChanged = true;
    }

    if (townChanged) {
      await supabase.from("towns").update({
        available_recruits: availableRecruits,
        garrison,
      }).eq("id", town.id);
    }
  }

  if (resourcesChanged) {
    await supabase.from("game_players").update(resources).eq("id", player.id);
  }
}

function addUnitsToGarrison(stacks: AiArmy[], unitType: AiArmy["unitType"], count: number, maxHealth: number) {
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

function getAffordableCount(resources: ReturnType<typeof playerResources>, cost: ResourceCost, available: number) {
  let limit = available;
  for (const [resource, amount] of Object.entries(cost)) {
    if (!amount) continue;
    const owned = resources[resource as keyof typeof resources] ?? 0;
    limit = Math.min(limit, Math.floor(owned / amount));
  }
  return Math.max(0, limit);
}

function multiplyCost(cost: ResourceCost, count: number): ResourceCost {
  return Object.fromEntries(
    Object.entries(cost).map(([resource, amount]) => [resource, (amount ?? 0) * count])
  ) as ResourceCost;
}
