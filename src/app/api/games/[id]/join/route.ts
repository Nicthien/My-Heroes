import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { computeVisibleTiles, placePlayerStart } from "@/lib/game/engine";
import { FACTION_UNITS, UNIT_RULES } from "@/lib/game/economy";
import { pickTownName } from "@/lib/game/town-generation";
import { BuildingType, Faction, GameMap, HeroClass } from "@/lib/game/types";
import { CLASS_STARTING_STATS, HERO_ROSTER } from "@/lib/game/heroes";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameWithRelations } from "@/lib/supabase/game-db";

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

  const factionKey = (faction as Faction) in FACTION_UNITS ? (faction as Faction) : Faction.CASTLE;
  const factionHeroes = HERO_ROSTER.filter((h) => h.faction === factionKey);
  const startingHero = factionHeroes.length > 0
    ? factionHeroes[Math.floor(Math.random() * factionHeroes.length)]
    : null;
  const heroClass = (startingHero?.class ?? HeroClass.KNIGHT) as HeroClass;
  const heroStats = CLASS_STARTING_STATS[heroClass];

  const heroInsert: Record<string, unknown> = {
    game_player_id: playerRow.id,
    name: startingHero?.name ?? "Sire Christian",
    hero_class: heroClass,
    specialty: startingHero?.specialty ?? null,
    attack: heroStats.attack,
    defense: heroStats.defense,
    spell_power: heroStats.spellPower,
    knowledge: heroStats.knowledge,
    x: startPos.x,
    y: startPos.y,
  };

  let { data: heroRow, error: heroError } = await supabase
    .from("heroes")
    .insert(heroInsert)
    .select("*")
    .single();

  if (heroError) {
    delete heroInsert.hero_class;
    delete heroInsert.specialty;
    ({ data: heroRow, error: heroError } = await supabase
      .from("heroes")
      .insert(heroInsert)
      .select("*")
      .single());
  }

  if (heroError) return NextResponse.json({ error: heroError.message }, { status: 500 });
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
    name: pickTownName(factionKey, `${id}:${playerRow.id}:${turnOrder}`),
    town_type: factionKey,
    x: startPos.x,
    y: startPos.y,
    buildings: [BuildingType.VILLAGE_HALL],
    garrison: [],
  });

  return NextResponse.json({ gamePlayer: playerRow, gameStarted: false }, { status: 201 });
}
