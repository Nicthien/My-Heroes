import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, toCombat } from "@/lib/supabase/game-db";
import { addReinforcementUnits, buildTurnQueue } from "@/lib/game/combat/persistent";
import type { CombatBoardUnit, CombatSide, CombatTerrainFeature, UnitStack } from "@/lib/game/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; combatId: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id, combatId } = await params;
  const body = await request.json();
  const supabase = createAdminClient();
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("status")
    .eq("id", id)
    .single();
  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 });
  if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

  const gamePlayer = await getGamePlayer(supabase, id, user.id) as unknown as {
    id: string;
    heroes: Array<{ id: string; armies: UnitStack[] }>;
  } | null;
  const hero = gamePlayer?.heroes.find((item) => item.id === String(body.heroId));

  if (!gamePlayer || !hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });

  const side: CombatSide = body.side === "defender" ? "defender" : "attacker";

  const { data: participantRow, error: insertError } = await supabase
    .from("combat_participants")
    .upsert({
      combat_id: combatId,
      player_id: gamePlayer.id,
      hero_id: hero.id,
      side,
    }, { onConflict: "combat_id,hero_id" })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data: combatRow, error: combatError } = await supabase
    .from("combats")
    .select("board_state, turn_queue, round, current_unit_id, status")
    .eq("id", combatId)
    .single();
  if (combatError) return NextResponse.json({ error: combatError.message }, { status: 500 });

  if (combatRow.status === "ACTIVE") {
    const boardState = (combatRow.board_state ?? { units: [], terrain: [] }) as {
      units: CombatBoardUnit[];
      terrain?: CombatTerrainFeature[];
    };
    const units = [...(boardState.units ?? [])];
    const terrain = boardState.terrain ?? [];
    const round = combatRow.round ?? 1;
    const alreadyOnBoard = units.some((unit) => unit.heroId === hero.id);

    if (!alreadyOnBoard) {
      addReinforcementUnits({
        units,
        terrain,
        armies: hero.armies ?? [],
        side,
        ownerPlayerId: gamePlayer.id,
        heroId: hero.id,
        participantId: participantRow.id,
        joinsRound: round + 1,
      });

      const turnQueue = buildTurnQueue(units, round);
      const currentUnitId = combatRow.current_unit_id && turnQueue.includes(combatRow.current_unit_id)
        ? combatRow.current_unit_id
        : turnQueue[0] ?? null;

      const { error: updateError } = await supabase
        .from("combats")
        .update({
          board_state: { units, terrain },
          turn_queue: turnQueue,
          current_unit_id: currentUnitId,
        })
        .eq("id", combatId);

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from("combats")
    .select("*, combat_participants(*)")
    .eq("id", combatId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ combat: toCombat(data), result: null });
}
