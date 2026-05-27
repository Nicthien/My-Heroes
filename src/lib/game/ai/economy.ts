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
import { recordGameAction } from "@/lib/game/server/action-log";
import { AI_BUILD_PRIORITY, buildPriorityForPersonality, normalizeFaction, normalizeTownCenter, playerResources } from "./context";
import { BuildingType } from "@/lib/game/types";
import type { AiArmy, AiContext, AiGame, AiPlayer } from "./types";

export async function runAiEconomy(
  supabase: SupabaseAdmin,
  game: AiGame,
  player: AiPlayer,
  context?: AiContext,
) {
  let buildPriority = context ? buildPriorityForPersonality(context) : AI_BUILD_PRIORITY;
  // Urgence : si plus aucun héros, la TAVERNE devient priorité absolue (après le TOWN_HALL).
  // Sans taverne pas de tavern_offer, donc pas de recrutement possible.
  if ((player.heroes ?? []).length === 0) {
    buildPriority = [
      BuildingType.TOWN_HALL,
      BuildingType.TAVERN,
      ...buildPriority.filter((b) => b !== BuildingType.TOWN_HALL && b !== BuildingType.TAVERN),
    ];
  }
  const built = await buildOneAffordableBuilding(supabase, game, player, buildPriority);
  if (built) {
    await recordGameAction(supabase, {
      gameId: game.id,
      gamePlayerId: player.id,
      actorKind: "ai",
      turnNumber: Number(game.turnNumber ?? 0),
      actionType: "BUILD",
      category: "economy",
      summary: `${player.aiName || "IA"} construit un batiment.`,
      details: built,
    });
  }
  const recruited = await recruitAvailableUnits(supabase, player, context);
  if (recruited > 0) {
    await recordGameAction(supabase, {
      gameId: game.id,
      gamePlayerId: player.id,
      actorKind: "ai",
      turnNumber: Number(game.turnNumber ?? 0),
      actionType: "RECRUIT_UNIT",
      category: "recruitment",
      summary: `${player.aiName || "IA"} recrute des unites.`,
      details: { stacks: recruited },
    });
  }
}

async function buildOneAffordableBuilding(
  supabase: SupabaseAdmin,
  game: AiGame,
  player: AiPlayer,
  buildPriority: typeof AI_BUILD_PRIORITY,
) {
  const town = [...(player.towns ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .find((item) => item.lastBuiltTurn !== game.turnNumber);
  if (!town) return;

  const faction = normalizeFaction(town.townType ?? player.faction);
  const buildings = [...(town.buildings ?? [])];
  const resources = playerResources(player);

  for (const building of buildPriority) {
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
    return { townId: town.id, building };
  }
  return null;
}

async function recruitAvailableUnits(supabase: SupabaseAdmin, player: AiPlayer, _context?: AiContext) {
  void _context;
  const towns = [...(player.towns ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  if (towns.length === 0) return 0;

  let resources = playerResources(player);
  let resourcesChanged = false;
  let recruitedStacks = 0;

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
      recruitedStacks++;
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
  return recruitedStacks;
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
