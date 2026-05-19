import { GameMap } from "@/lib/game/types";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";

interface ExistingResourceBuilding {
  id: string;
  game_player_id: string | null;
  guardian_power: number;
}

export async function syncResourceBuildingsFromMap(
  supabase: SupabaseAdmin,
  gameId: string,
  mapData: GameMap,
) {
  const { data: existingRows, error: existingError } = await supabase
    .from("resource_buildings")
    .select("id, game_player_id, guardian_power")
    .eq("game_id", gameId);

  if (existingError) throw existingError;

  const existingById = new Map(
    ((existingRows ?? []) as ExistingResourceBuilding[]).map((row) => [row.id, row]),
  );
  const rows = mapData.tiles.flatMap((row) =>
    row
      .filter((tile) => tile.object?.type === "building" && tile.object.subtype)
      .map((tile) => {
        const object = tile.object!;
        const existing = existingById.get(object.id);
        const preserveCapturedState = Boolean(existing?.game_player_id) || Number(existing?.guardian_power ?? 1) <= 0;

        return {
          id: object.id,
          game_id: gameId,
          game_player_id: existing?.game_player_id ?? null,
          building_type: object.subtype!,
          x: tile.x,
          y: tile.y,
          guardian_power: preserveCapturedState
            ? Number(existing?.guardian_power ?? 0)
            : Number(object.guardianPower ?? 200),
        };
      }),
  );

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("resource_buildings")
    .upsert(rows, { onConflict: "id" });

  if (error) throw error;
}
