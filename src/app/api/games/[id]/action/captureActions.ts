import { NextResponse } from "next/server";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { normalizeMapMovement } from "@/lib/game/engine";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { evaluateGameLifecycle } from "@/lib/game/server/lifecycle";
import { getTownCenterLevel } from "@/lib/game/town-buildings";
import { BuildingType, type GameMap, type Position } from "@/lib/game/types";
import type {
  CaptureTownRow,
  MinimalBuilding,
  MinimalGate,
  MinimalHero,
  MinimalPlayer,
  MinimalTown,
  SupabaseAdminClient,
} from "./types";

type ActionRecord = Record<string, unknown>;
type CombatLike = {
  status?: unknown;
  attackerHeroId?: unknown;
  defenderHeroId?: unknown;
  participants?: Array<{ heroId?: unknown }> | null;
};

type CaptureActionHelpers = {
  areAdjacentOrSame: (a: Position, b: Position) => boolean;
  captureGate: (
    supabase: SupabaseAdminClient,
    gameId: string,
    gate: MinimalGate,
    playerId: string,
  ) => Promise<void>;
  createNeutralTownForMapTile: (
    supabase: SupabaseAdminClient,
    gameId: string,
    mapData: GameMap,
    tile: GameMap["tiles"][number][number],
  ) => Promise<CaptureTownRow | null>;
  ensureNeutralTownGarrison: (
    supabase: SupabaseAdminClient,
    town: CaptureTownRow,
  ) => Promise<CaptureTownRow>;
  findTownForCapture: (
    supabase: SupabaseAdminClient,
    gameId: string,
    townId: string,
    positions: Array<Position | null>,
  ) => Promise<CaptureTownRow | null>;
  getActionPathDestination: (path: unknown) => Position | null;
  getActionPosition: (value: unknown) => Position | null;
  getEffectiveGates: (gates: MinimalGate[], mapData: GameMap) => MinimalGate[];
  getResourceBuilding: (
    supabase: SupabaseAdminClient,
    gameId: string,
    buildingId: string,
  ) => Promise<MinimalBuilding | null>;
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: ActionRecord,
  ) => Promise<void>;
  validateAndApplyActionPath: (params: {
    supabase: SupabaseAdminClient;
    mapData: GameMap;
    gamePlayer: MinimalPlayer;
    hero: MinimalHero;
    path: unknown;
    destination: Position;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type HandleCaptureActionParams = {
  supabase: SupabaseAdminClient;
  game: { turnNumber?: unknown; mapData?: unknown; combats?: CombatLike[] | null };
  gameId: string;
  gamePlayer: MinimalPlayer;
  players: Array<{ resourceBuildings: MinimalBuilding[]; towns: MinimalTown[] }>;
  gates: MinimalGate[];
  action: ActionRecord;
  heroInCombatError: string;
  helpers: CaptureActionHelpers;
};

export async function handleCaptureAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  players,
  gates,
  action,
  heroInCombatError,
  helpers,
}: HandleCaptureActionParams) {
  if (action.type === "CAPTURE_BUILDING") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    const building = players.flatMap((player) => player.resourceBuildings)
      .find((item) => item.id === action.buildingId)
      ?? await helpers.getResourceBuilding(supabase, gameId, String(action.buildingId ?? ""));
    if (!hero || !building) return NextResponse.json({ error: "Capture invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }
    if (Number(building.guardianPower ?? 0) > 0) {
      return NextResponse.json({ error: "Ce bâtiment est gardé" }, { status: 400 });
    }

    const mapData = normalizeMapMovement(game.mapData as GameMap);
    const movement = await helpers.validateAndApplyActionPath({
      supabase,
      mapData,
      gamePlayer,
      hero,
      path: action.path,
      destination: { x: building.x, y: building.y },
    });
    if (!movement.ok) return NextResponse.json({ error: movement.error }, { status: 400 });

    await supabase.from("resource_buildings").update({ game_player_id: gamePlayer.id, guardian_power: 0 }).eq("id", building.id);
    await applyHeroExperienceGain(supabase, gameId, hero.id, hero.experience + 150);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, interaction: { type: "CAPTURE_BUILDING", buildingType: building.buildingType } });
  }

  if (action.type === "CAPTURE_TOWN") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    let town = players.flatMap((player) => player.towns).find((item) => item.id === action.townId);
    if (!town) {
      const mapData = game.mapData as GameMap;
      const pathDestination = helpers.getActionPosition(action.destination) ?? helpers.getActionPathDestination(action.path);
      const heroPosition = hero ? { x: hero.x, y: hero.y } : null;
      const mapTownTile = mapData.tiles
        .flatMap((row) => row)
        .find((tile) =>
          tile.object?.type === "town" &&
          (
            tile.object.id === action.townId ||
            tile.object.targetId === action.townId ||
            (pathDestination && tile.x === pathDestination.x && tile.y === pathDestination.y) ||
            (heroPosition && tile.x === heroPosition.x && tile.y === heroPosition.y)
          )
        );

      let townRow = await helpers.findTownForCapture(supabase, gameId, String(action.townId ?? ""), [
        mapTownTile ? { x: mapTownTile.x, y: mapTownTile.y } : null,
        pathDestination,
        heroPosition,
      ]);
      if (!townRow && mapTownTile) {
        townRow = await helpers.createNeutralTownForMapTile(supabase, gameId, mapData, mapTownTile);
      }
      if (townRow?.is_neutral && (townRow.neutral_garrison?.length ?? 0) === 0) {
        townRow = await helpers.ensureNeutralTownGarrison(supabase, townRow);
      }

      if (townRow) {
        town = {
          id: townRow.id,
          gamePlayerId: townRow.game_player_id,
          x: townRow.x,
          y: townRow.y,
          level: townRow.level ?? undefined,
          townType: townRow.town_type ?? undefined,
          buildings: townRow.buildings ?? [],
          isNeutral: townRow.is_neutral ?? undefined,
          neutralGarrison: townRow.neutral_garrison ?? [],
        };
      }
    }
    if (!hero || !town) return NextResponse.json({ error: "Chateau invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }
    if (!town.isNeutral && town.gamePlayerId === gamePlayer.id) {
      return NextResponse.json({ error: "Ce château vous appartient déjà" }, { status: 400 });
    }
    if (town.isNeutral && (town.neutralGarrison?.length ?? 0) > 0) {
      return NextResponse.json({ error: "Ce château neutre est gardé" }, { status: 400 });
    }

    const mapData = normalizeMapMovement(game.mapData as GameMap);
    const movement = await helpers.validateAndApplyActionPath({
      supabase,
      mapData,
      gamePlayer,
      hero,
      path: action.path,
      destination: { x: town.x, y: town.y },
    });
    if (!movement.ok) return NextResponse.json({ error: movement.error }, { status: 400 });

    const capturedBuildings = (town.buildings ?? []) as string[];
    const hasAnotherCapitol = gamePlayer.towns.some((item) => (item.buildings ?? []).includes(BuildingType.CAPITOL));
    const townOwnershipUpdate: Record<string, unknown> = {
      game_player_id: gamePlayer.id,
      is_neutral: false,
      neutral_garrison: [],
    };
    if (hasAnotherCapitol && capturedBuildings.includes(BuildingType.CAPITOL)) {
      const demotedBuildings = capturedBuildings
        .filter((item) => item !== BuildingType.CAPITOL)
        .concat(capturedBuildings.includes(BuildingType.CITY_HALL) ? [] : [BuildingType.CITY_HALL]);
      townOwnershipUpdate.buildings = demotedBuildings;
      townOwnershipUpdate.level = getTownCenterLevel(demotedBuildings);
    }
    await supabase
      .from("towns")
      .update(townOwnershipUpdate)
      .eq("id", town.id);
    await applyHeroExperienceGain(supabase, gameId, hero.id, hero.experience + 250);
    await evaluateGameLifecycle(supabase, gameId);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, interaction: { type: "CAPTURE" } });
  }

  if (action.type === "CAPTURE_GATE") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    const mapData = normalizeMapMovement(game.mapData as GameMap);
    const gate = helpers.getEffectiveGates(gates, mapData).find((item) => item.id === action.gateId);
    if (!hero || !gate) {
      return NextResponse.json({ error: "Porte invalide" }, { status: 400 });
    }
    if (!helpers.areAdjacentOrSame({ x: hero.x, y: hero.y }, { x: gate.x, y: gate.y })) {
      return NextResponse.json({ error: "Le héros doit être adjacent à la porte" }, { status: 400 });
    }
    if ((gate.garrison ?? []).some((unit) => unit.count > 0)) {
      return NextResponse.json({ error: "La porte est gardée" }, { status: 400 });
    }

    await helpers.captureGate(supabase, gameId, gate, gamePlayer.id);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, interaction: { type: "CAPTURE_GATE", gateId: gate.id } });
  }

  return null;
}
