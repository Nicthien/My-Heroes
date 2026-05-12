import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { BUILDING_RULES, RESOURCE_BUILDING_RULES, UNIT_RULES, canAfford, subtractCost } from "@/lib/game/economy";
import { BuildingType, GameMap, Resources, UnitType } from "@/lib/game/types";
import { computeVisibleTiles, getPlayerVisionCenters, normalizeMapMovement } from "@/lib/game/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGamePlayer, getGameWithRelations } from "@/lib/supabase/game-db";

interface MinimalBuilding {
  id: string;
  x: number;
  y: number;
  buildingType?: string;
}

interface MinimalTown {
  id: string;
  x: number;
  y: number;
  buildings?: string[];
  availableRecruits?: Record<string, number>;
}

interface MinimalResourceBuilding {
  id: string;
  buildingType: string;
}

interface MinimalTurn {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
}

interface MinimalArmy {
  id: string;
  unitType: UnitType;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

interface MinimalHero {
  id: string;
  x: number;
  y: number;
  movement: number;
  experience: number;
  armies: MinimalArmy[];
}

interface MinimalPlayer {
  id: string;
  isAlive?: boolean;
  turnOrder?: number;
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  sulfur: number;
  exploredTiles: string[];
  heroes: MinimalHero[];
  towns: MinimalTown[];
  resourceBuildings: MinimalResourceBuilding[];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireCurrentUser();
    if (!user) return response;

    const { id } = await params;
    const action = await request.json();
    const supabase = createAdminClient();
    const gamePlayer = await getGamePlayer(supabase, id, user.id) as unknown as MinimalPlayer | null;
    const game = await getGameWithRelations(supabase, id);

    if (!gamePlayer) return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
    if (!game) return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
    if (game.status !== "ACTIVE") return NextResponse.json({ error: "La partie n'est pas active" }, { status: 400 });

    const players = game.players as unknown as Array<{
      id: string;
      isAlive: boolean;
      turnOrder: number;
      resourceBuildings: MinimalBuilding[];
      towns: MinimalTown[];
    }>;
    const turns = game.turns as MinimalTurn[];
    const completedTurn = turns.find((turn) =>
      turn.gamePlayerId === gamePlayer.id && turn.turnNumber === game.turnNumber && turn.isCompleted
    );
    if (completedTurn && action.type !== "END_TURN") {
      return NextResponse.json({ error: "Vous avez deja termine votre tour" }, { status: 403 });
    }

    if (action.type === "MOVE_HERO") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      if (!hero) return NextResponse.json({ error: "Heros invalide" }, { status: 400 });

      const mapData = normalizeMapMovement(game.mapData as GameMap);
      const validation = validateMovePath(mapData, { x: hero.x, y: hero.y }, action.path, hero.movement);
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

      const lastPos = action.path[action.path.length - 1];
      const { error: heroUpdateError } = await supabase.from("heroes").update({
        x: lastPos.x,
        y: lastPos.y,
        movement: Math.max(0, hero.movement - validation.usedMovement),
      }).eq("id", hero.id);
      if (heroUpdateError) {
        console.error("heroes.update failed:", heroUpdateError, { heroId: hero.id, x: lastPos.x, y: lastPos.y, movement: hero.movement, used: validation.usedMovement });
        return NextResponse.json({ error: `Erreur mise à jour héros: ${heroUpdateError.message}` }, { status: 500 });
      }

      const movedHeroes: MinimalHero[] = gamePlayer.heroes.map((item) =>
        item.id === hero.id ? { ...hero, x: lastPos.x, y: lastPos.y } : item
      );
      const newlyVisible = computeVisibleTiles(
        mapData,
        getPlayerVisionCenters({
          heroes: movedHeroes.map((h) => ({ position: { x: h.x, y: h.y } })),
          towns: gamePlayer.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
        }),
        5
      );
      const currentlyVisible = computeVisibleTiles(
        mapData,
        getPlayerVisionCenters({
          heroes: gamePlayer.heroes.map((h) => ({ position: { x: h.x, y: h.y } })),
          towns: gamePlayer.towns.map((town) => ({ position: { x: town.x, y: town.y } })),
        }),
        5
      );
      const explored = new Set<string>(gamePlayer.exploredTiles ?? []);
      for (const key of currentlyVisible) explored.add(key);
      for (const key of newlyVisible) explored.add(key);
      await supabase.from("game_players").update({ explored_tiles: Array.from(explored) }).eq("id", gamePlayer.id);

      const tile = (game.mapData as GameMap).tiles?.[lastPos.y]?.[lastPos.x];
      const mapState = (game.mapState as Record<string, unknown>) ?? {};
      const collected = new Set<string>((mapState.collected as string[]) ?? []);
      const killed = new Set<string>((mapState.killed as string[]) ?? []);
      let interaction: { type: string; resource?: string; gold?: number } | null = null;

      if (tile?.object?.type === "resource" && !collected.has(tile.object.id)) {
        collected.add(tile.object.id);
        const resourceType = tile.object.subtype ?? "gold";
        const amount = resourceType === "gold" ? 500 : 2;
        await incrementPlayerResource(supabase, gamePlayer.id, resourceType, amount);
        await supabase.from("games").update({ map_state: { ...mapState, collected: Array.from(collected) } }).eq("id", id);
        interaction = { type: "COLLECT", resource: resourceType, gold: resourceType === "gold" ? amount : undefined };
      }

      if (tile?.object?.type === "monster" && !killed.has(tile.object.id)) {
        killed.add(tile.object.id);
        await supabase.from("games").update({ map_state: { ...mapState, collected: Array.from(collected), killed: Array.from(killed) } }).eq("id", id);
        await supabase.from("heroes").update({ experience: hero.experience + 150 }).eq("id", hero.id);
        await supabase.from("neutral_armies").update({ status: "DEFEATED" }).eq("id", tile.object.id);
        interaction = { type: "FIGHT", resource: "victory", gold: 150 };
      }

      return NextResponse.json({ success: true, interaction });
    }

    if (action.type === "CAPTURE_BUILDING") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      const building = players.flatMap((player) => player.resourceBuildings)
        .find((item) => item.id === action.buildingId)
        ?? await getResourceBuilding(supabase, id, String(action.buildingId ?? ""));
      if (!hero || !building) return NextResponse.json({ error: "Capture invalide" }, { status: 400 });

      await supabase.from("resource_buildings").update({ game_player_id: gamePlayer.id, guardian_power: 0 }).eq("id", building.id);
      await supabase.from("heroes").update({ x: building.x, y: building.y, experience: hero.experience + 150 }).eq("id", hero.id);
      return NextResponse.json({ success: true, interaction: { type: "CAPTURE_BUILDING", buildingType: building.buildingType } });
    }

    if (action.type === "CAPTURE_TOWN") {
      const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
      const town = players.flatMap((player) => player.towns).find((item) => item.id === action.townId);
      if (!hero || !town) return NextResponse.json({ error: "Chateau invalide" }, { status: 400 });
      await supabase.from("towns").update({ game_player_id: gamePlayer.id }).eq("id", town.id);
      await supabase.from("heroes").update({ x: town.x, y: town.y, experience: hero.experience + 250 }).eq("id", hero.id);
      return NextResponse.json({ success: true, interaction: { type: "CAPTURE" } });
    }

    if (action.type === "BUILD") {
      const town = gamePlayer.towns.find((item: { id: string }) => item.id === action.townId);
      const building = action.building as BuildingType;
      const rule = BUILDING_RULES.find((item) => item.type === building);
      if (!town || !rule) return NextResponse.json({ error: "Batiment invalide" }, { status: 400 });

      const buildings = (town.buildings ?? []) as string[];
      if (buildings.includes(building)) return NextResponse.json({ error: "Batiment deja construit" }, { status: 400 });
      const resources = playerResources(gamePlayer);
      if (!canAfford(resources, rule.cost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });

      await supabase.from("game_players").update(subtractCost(resources, rule.cost)).eq("id", gamePlayer.id);
      await supabase.from("towns").update({
        buildings: [...buildings, building],
        last_built_turn: game.turnNumber,
      }).eq("id", town.id);
      return NextResponse.json({ success: true });
    }

    if (action.type === "RECRUIT_UNIT") {
      const unitType = action.unitType as UnitType;
      const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
      const rule = UNIT_RULES.find((item) => item.type === unitType);
      const hero = gamePlayer.heroes[0];
      const town = gamePlayer.towns.find((item: { id: string }) => item.id === action.townId);
      if (!rule || !hero || !town) return NextResponse.json({ error: "Unite invalide" }, { status: 400 });

      const available = (town.availableRecruits?.[unitType] ?? 0);
      if (available < count) return NextResponse.json({ error: "Pas assez d'unites disponibles" }, { status: 400 });

      const totalCost = Object.fromEntries(Object.entries(rule.cost).map(([key, value]) => [key, (value ?? 0) * count]));
      const resources = playerResources(gamePlayer);
      if (!canAfford(resources, totalCost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });

      await supabase.from("game_players").update(subtractCost(resources, totalCost)).eq("id", gamePlayer.id);
      await supabase.from("towns").update({
        available_recruits: { ...(town.availableRecruits ?? {}), [unitType]: available - count },
      }).eq("id", town.id);

      const existing = hero.armies.find((army: { unitType: UnitType }) => army.unitType === unitType);
      if (existing) {
        await supabase.from("armies").update({
          count: existing.count + count,
          health: existing.health + rule.health * count,
        }).eq("id", existing.id);
      } else {
        await supabase.from("armies").insert({
          hero_id: hero.id,
          unit_type: unitType,
          count,
          health: rule.health * count,
          max_health: rule.health,
          position: hero.armies.length,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action.type === "END_TURN") {
      await completePlayerTurn(supabase, id, Number(game.turnNumber), gamePlayer.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
    console.error("Action error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function playerResources(player: {
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  sulfur: number;
}): Resources {
  return {
    gold: player.gold,
    wood: player.wood,
    ore: player.ore,
    mercury: player.mercury,
    crystals: player.crystals,
    sulfur: player.sulfur,
  };
}

async function incrementPlayerResource(supabase: ReturnType<typeof createAdminClient>, playerId: string, resource: string, amount: number) {
  const game = await getGameRowForPlayer(supabase, playerId);
  if (!game) return;
  const current = Number(game[resource] ?? 0);
  await supabase.from("game_players").update({ [resource]: current + amount }).eq("id", playerId);
}

async function getGameRowForPlayer(supabase: ReturnType<typeof createAdminClient>, playerId: string) {
  const { data } = await supabase.from("game_players").select("*").eq("id", playerId).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getResourceBuilding(
  supabase: ReturnType<typeof createAdminClient>,
  gameId: string,
  buildingId: string
): Promise<MinimalBuilding | null> {
  const { data } = await supabase
    .from("resource_buildings")
    .select("id,x,y,building_type")
    .eq("game_id", gameId)
    .eq("id", buildingId)
    .maybeSingle();

  return data
    ? { id: data.id, x: data.x, y: data.y, buildingType: data.building_type }
    : null;
}

async function completePlayerTurn(supabase: ReturnType<typeof createAdminClient>, gameId: string, turnNumber: number, gamePlayerId: string) {
  await supabase.from("turns").upsert({
    game_id: gameId,
    game_player_id: gamePlayerId,
    turn_number: turnNumber,
    actions: [],
    is_completed: true,
  }, { onConflict: "game_id,game_player_id,turn_number" });

  const game = await getGameWithRelations(supabase, gameId);
  if (!game) return;
  const alivePlayers = (game.players as unknown as MinimalPlayer[]).filter((player) => player.isAlive);
  const turns = game.turns as MinimalTurn[];
  const completedPlayerIds = new Set(
    turns
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );
  if (completedPlayerIds.size < alivePlayers.length) {
    const sortedPlayers = [...alivePlayers].sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0));
    const currentIndex = sortedPlayers.findIndex((player) => player.id === gamePlayerId);
    const nextPlayer = sortedPlayers
      .slice(currentIndex + 1)
      .concat(sortedPlayers.slice(0, Math.max(0, currentIndex + 1)))
      .find((player) => !completedPlayerIds.has(player.id));

    await supabase.from("games").update({
      current_turn_player_id: nextPlayer?.id ?? null,
    }).eq("id", gameId);
    return;
  }

  const nextTurnNumber = turnNumber + 1;
  for (const player of alivePlayers) {
    let goldIncome = 500, woodIncome = 2, oreIncome = 1;
    let mercuryIncome = 0, crystalsIncome = 0, sulfurIncome = 0;

    for (const building of player.resourceBuildings ?? []) {
      const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === building.buildingType);
      if (rule) {
        goldIncome += rule.production.gold ?? 0;
        woodIncome += rule.production.wood ?? 0;
        oreIncome += rule.production.ore ?? 0;
        mercuryIncome += rule.production.mercury ?? 0;
        crystalsIncome += rule.production.crystals ?? 0;
        sulfurIncome += rule.production.sulfur ?? 0;
      }
    }

    for (const town of player.towns ?? []) {
      const buildings = (town.buildings ?? []) as string[];
      if (buildings.includes(BuildingType.RESOURCE_SILO)) goldIncome += 500;
    }

    await supabase.from("game_players").update({
      gold: player.gold + goldIncome,
      wood: player.wood + woodIncome,
      ore: player.ore + oreIncome,
      mercury: player.mercury + mercuryIncome,
      crystals: player.crystals + crystalsIncome,
      sulfur: player.sulfur + sulfurIncome,
    }).eq("id", player.id);
    await supabase.from("heroes").update({ movement: 10 }).eq("game_player_id", player.id);

    for (const town of player.towns ?? []) {
      const buildings = (town.buildings ?? []) as string[];
      const recruits: Record<string, number> = { ...(town.availableRecruits ?? {}) };
      for (const rule of UNIT_RULES) {
        if (buildings.includes(rule.dwelling)) {
          recruits[rule.type] = (recruits[rule.type] ?? 0) + rule.growth;
        }
      }
      await supabase.from("towns").update({ available_recruits: recruits }).eq("id", town.id);
    }
  }
  const firstPlayer = alivePlayers.sort((a, b) => Number(a.turnOrder ?? 0) - Number(b.turnOrder ?? 0))[0];
  await supabase.from("games").update({
    turn_number: nextTurnNumber,
    current_turn_player_id: firstPlayer?.id ?? null,
  }).eq("id", gameId);
}

function validateMovePath(
  map: GameMap,
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
  movement: number
): { ok: true; usedMovement: number } | { ok: false; error: string } {
  if (!Array.isArray(path) || path.length < 2) return { ok: false, error: "Chemin invalide" };
  if (path[0]?.x !== start.x || path[0]?.y !== start.y) return { ok: false, error: "Le chemin ne commence pas sur le heros" };

  let usedMovement = 0;
  for (let i = 1; i < path.length; i++) {
    const previous = path[i - 1];
    const current = path[i];
    if (Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y) !== 1) {
      return { ok: false, error: "Chemin invalide" };
    }
    const tile = map.tiles[current.y]?.[current.x];
    if (!tile || !tile.isPassable) return { ok: false, error: "Terrain infranchissable" };
    usedMovement += tile.movementCost;
  }
  if (usedMovement > movement) return { ok: false, error: "Deplacement insuffisant" };
  return { ok: true, usedMovement };
}
