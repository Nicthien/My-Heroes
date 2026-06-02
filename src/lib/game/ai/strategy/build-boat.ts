import { canAfford, getFactionBuildingRule, subtractCost } from "@/lib/game/economy";
import { computeVisibleTiles } from "@/lib/game/engine";
import { isTownCoastalForBoats } from "@/lib/game/engine/town-coast";
import { BOAT_COST, canBuildBoat } from "@/lib/game/boats/boat-ops";
import { getTownCenterLevel, hasShipyardBuilding, hasTownBuilding } from "@/lib/game/town-buildings";
import { normalizeMapLevel, SURFACE_LEVEL } from "@/lib/game/map-levels";
import { BuildingType, Faction } from "@/lib/game/types";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { normalizeFaction, normalizeTownCenter, playerResources } from "../context";
import type { AiContext } from "../types";

// Gold kept in reserve so naval spending never starves the core economy.
const BOAT_GOLD_BUFFER = 1500;
const SHIPYARD_GOLD_BUFFER = 4000;

/**
 * Lets the AI bootstrap and use a navy with full parity to a human: build a boat
 * from an existing coastal shipyard when it has none idle, or build a shipyard on
 * a coastal town that lacks one. Boats are surface-only (mirrors boatActions.ts).
 */
export async function maybeBuildBoat(supabase: SupabaseAdmin, context: AiContext) {
  const player = context.player;
  const surfaceTowns = (player.towns ?? []).filter((town) => normalizeMapLevel(town.mapLevel) === SURFACE_LEVEL);
  if (surfaceTowns.length === 0) return;

  const resources = playerResources(player);
  const hasIdleBoat = context.boats.some((boat) => boat.ownerId === player.id && !boat.heroId);

  // 1) Build a boat from a coastal shipyard when none is idle and gold is spare.
  if (!hasIdleBoat && resources.gold >= BOAT_COST.gold + BOAT_GOLD_BUFFER) {
    for (const town of surfaceTowns) {
      const faction = (town.townType ?? player.faction ?? Faction.CASTLE) as Faction;
      const check = canBuildBoat({ town, faction, resources, mapData: context.map, boats: context.boats });
      if (!check.ok) continue;
      await supabase.from("game_players").update(subtractCost(resources, BOAT_COST)).eq("id", player.id);
      await supabase.from("boats").insert({
        game_id: context.game.id,
        owner_player_id: player.id,
        hero_id: null,
        faction,
        x: check.destination.x,
        y: check.destination.y,
        map_level: SURFACE_LEVEL,
      });
      await mergeExplored(supabase, context, check.destination);
      return;
    }
  }

  // 2) Bootstrap: build a SHIPYARD on a coastal town that lacks one.
  if (resources.gold < SHIPYARD_GOLD_BUFFER) return;
  for (const town of surfaceTowns) {
    if (town.lastBuiltTurn === context.game.turnNumber) continue;
    const faction = normalizeFaction(town.townType ?? player.faction);
    const buildings = [...(town.buildings ?? [])];
    if (hasShipyardBuilding(faction, buildings)) continue;
    if (!isTownCoastalForBoats(context.map, { x: town.x, y: town.y })) continue;
    const rule = getFactionBuildingRule(faction, BuildingType.SHIPYARD);
    if (!rule) continue;
    if (rule.requires?.some((requirement) => !hasTownBuilding(buildings, requirement))) continue;
    if (!canAfford(resources, rule.cost)) continue;
    const nextBuildings = normalizeTownCenter([...buildings, BuildingType.SHIPYARD]);
    await supabase.from("game_players").update(subtractCost(resources, rule.cost)).eq("id", player.id);
    await supabase.from("towns").update({
      buildings: nextBuildings,
      level: getTownCenterLevel(nextBuildings),
      last_built_turn: context.game.turnNumber,
    }).eq("id", town.id);
    return;
  }
}

async function mergeExplored(supabase: SupabaseAdmin, context: AiContext, center: { x: number; y: number }) {
  const explored = new Set(context.player.exploredTiles ?? []);
  for (const key of computeVisibleTiles(context.map, [center], 5)) {
    explored.add(key.includes(":") ? key : `${SURFACE_LEVEL}:${key}`);
  }
  await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", context.player.id);
}
