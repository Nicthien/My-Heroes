import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { computeVisibleTiles, placePlayerStart } from "@/lib/game/engine";
import { FACTION_TOWN_NAMES, FACTION_UNITS, UNIT_RULES } from "@/lib/game/economy";
import { Faction, GameMap } from "@/lib/game/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameWithRelations } from "@/lib/supabase/game-db";

const HERO_NAMES: Record<string, string[]> = {
  castle: ["Sire Christian", "Seigneur Haart", "Sire Vorcharch", "Rion", "Adela"],
  rampart: ["Gemma", "Mephala", "Ufretin", "Ryland", "Ivor"],
  tower: ["Josefa", "Astral", "Terek", "Fafner", "Neela"],
  inferno: ["Fiona", "Rashka", "Marius", "Ignatius", "Octavia"],
  necropolis: ["Thant", "Moandor", "Nagash", "Sirus", "Vidomina"],
  dungeon: ["Lorena", "Suzerain", "Dace", "Ajit", "Damacon"],
  stronghold: ["Yog", "Gurnisson", "Shiva", "Tyraxor", "Crag Hack"],
  fortress: ["Voy", "Drakon", "Wystan", "Ros", "Tiva"],
};

const PLAYER_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const { id } = await params;
  const body = await request.json();
  const faction = (body.faction || "castle") as string;
  const supabase = createAdminClient();

  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    name: user.name ?? user.email ?? "Joueur",
  }, { onConflict: "id" });

  const game = await getGameWithRelations(supabase, id);
  if (!game) return NextResponse.json({ error: "Partie non trouvee" }, { status: 404 });
  const players = game.players as unknown as Array<{ id: string; userId: string; turnOrder: number }>;

  if (players.some((player) => player.userId === user.id)) {
    return NextResponse.json({ error: "Deja dans cette partie" }, { status: 400 });
  }
  if (game.status !== "PENDING") {
    return NextResponse.json({ error: "La partie a deja commence" }, { status: 400 });
  }
  if (players.length >= Number(game.maxPlayers)) {
    return NextResponse.json({ error: "La partie est pleine" }, { status: 400 });
  }

  const turnOrder = players.length;
  const mapData = game.mapData as GameMap;
  const startPos = placePlayerStart(mapData, turnOrder);
  const initialExplored = computeVisibleTiles(mapData, [{ x: startPos.x, y: startPos.y }], 5);
  const heroNames = HERO_NAMES[faction] || HERO_NAMES.castle;

  const { data: playerRow, error: playerError } = await supabase
    .from("game_players")
    .insert({
      game_id: id,
      user_id: user.id,
      faction,
      color: PLAYER_COLORS[turnOrder] || "#ffffff",
      turn_order: turnOrder,
      explored_tiles: Array.from(initialExplored),
    })
    .select("*")
    .single();

  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 });

  const { data: heroRow, error: heroError } = await supabase
    .from("heroes")
    .insert({
      game_player_id: playerRow.id,
      name: heroNames[turnOrder % heroNames.length],
      attack: 2,
      defense: 2,
      spell_power: 1,
      knowledge: 1,
      x: startPos.x,
      y: startPos.y,
    })
    .select("*")
    .single();

  if (heroError) return NextResponse.json({ error: heroError.message }, { status: 500 });

  const factionKey = (faction as Faction) in FACTION_UNITS ? (faction as Faction) : Faction.CASTLE;
  const tiers = FACTION_UNITS[factionKey];
  const starterCounts: [number, number, number] = [20, 12, 4];
  await supabase.from("armies").insert(
    starterCounts.map((count, i) => {
      const unitType = tiers[i];
      const rule = UNIT_RULES[unitType];
      return {
        hero_id: heroRow.id,
        unit_type: unitType,
        count,
        health: rule.health * count,
        max_health: rule.health,
        position: i,
      };
    })
  );

  await supabase.from("towns").insert({
    game_player_id: playerRow.id,
    name: FACTION_TOWN_NAMES[factionKey],
    town_type: factionKey,
    x: startPos.x,
    y: startPos.y,
    buildings: ["castle"],
    garrison: [],
  });

  return NextResponse.json({ gamePlayer: playerRow, gameStarted: false }, { status: 201 });
}
