import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { mapLevels } from "@/lib/game/map-levels";
import { normalizeArtifactBag } from "@/lib/game/artifacts";
import { getMonsterReward, isMonsterRewardEligible, type MonsterReward } from "@/lib/game/monster-rewards";
import type { GameMap, Resources } from "@/lib/game/types";

function findMonsterGuardianPower(mapData: GameMap | undefined, monsterId: string): number {
  if (!mapData) return 0;
  for (const layer of mapLevels(mapData)) {
    for (const row of layer.tiles) {
      for (const tile of row) {
        if (tile.object?.type === "monster" && tile.object.id === monsterId) {
          return Number(tile.object.guardianPower ?? 0);
        }
      }
    }
  }
  return 0;
}

/**
 * Read-only: the deterministic loot a given monster would yield, or null if it isn't an
 * eligible free monster. Used both to grant the loot and to show it in the combat result
 * (same function → the displayed loot always matches what was granted).
 */
export async function computeMonsterRewardForCombat(
  supabase: SupabaseAdmin,
  gameId: string,
  monsterId: string | null | undefined,
): Promise<MonsterReward | null> {
  if (!monsterId || !isMonsterRewardEligible(monsterId)) return null;
  const { data: gameRow } = await supabase.from("games").select("map_data").eq("id", gameId).maybeSingle();
  const guardianPower = findMonsterGuardianPower(gameRow?.map_data as GameMap | undefined, monsterId);
  if (guardianPower <= 0) return null;
  return getMonsterReward(monsterId, guardianPower);
}

/**
 * Grants the deterministic loot of a just-defeated neutral monster: gold + resources to the
 * winning player, and (for ~50% of monsters) a minor artifact into the winning hero's bag.
 * Returns the granted loot (or null if nothing was granted) so callers can surface it in the
 * combat result. No-ops for pocket guardians and anything that isn't a free monster.
 */
export async function grantMonsterDefeatReward(
  supabase: SupabaseAdmin,
  gameId: string,
  monsterId: string,
  playerId: string | null | undefined,
  heroId: string | null | undefined,
): Promise<MonsterReward | null> {
  if (!playerId) return null;
  const reward = await computeMonsterRewardForCombat(supabase, gameId, monsterId);
  if (!reward) return null;

  // Resources → player.
  const { data: player } = await supabase
    .from("game_players")
    .select("gold,wood,ore,mercury,crystals,gems,sulfur")
    .eq("id", playerId)
    .maybeSingle();
  if (player) {
    const current = player as Record<string, number>;
    const next: Partial<Record<keyof Resources, number>> = { gold: Number(current.gold ?? 0) + reward.gold };
    for (const [key, amount] of Object.entries(reward.resources)) {
      const resourceKey = key as keyof Resources;
      next[resourceKey] = Number(current[key] ?? 0) + Number(amount ?? 0);
    }
    await supabase.from("game_players").update(next).eq("id", playerId);
  }

  // Minor artifact → hero inventory (~50% of monsters).
  if (reward.artifactId && heroId) {
    const { data: hero } = await supabase.from("heroes").select("artifacts").eq("id", heroId).maybeSingle();
    const bag = normalizeArtifactBag(hero?.artifacts);
    await supabase
      .from("heroes")
      .update({ artifacts: { ...bag, inventory: [...bag.inventory, reward.artifactId] } })
      .eq("id", heroId);
  }

  return reward;
}
