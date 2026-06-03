import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { UNIT_RULES } from "@/lib/game/economy";
import { addUnitsToStacks, sortedStacks } from "@/lib/game/army-stacks";
import { BuildingType, Faction, type UnitType } from "@/lib/game/types";
import type { MinimalArmy, MinimalGate, MinimalHero, MinimalPlayer, MinimalTown, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;

type GarrisonActionHelpers = {
  addUnitsToGateGarrison: (
    supabase: SupabaseAdminClient,
    gate: MinimalGate,
    unitType: UnitType,
    count: number,
    maxHealth: number,
  ) => Promise<void>;
  addUnitsToHeroArmy: (
    supabase: SupabaseAdminClient,
    hero: MinimalHero,
    unitType: UnitType,
    count: number,
    maxHealth: number,
  ) => Promise<void>;
  addUnitsToStackList: (stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) => MinimalArmy[];
  areAdjacentOrSame: (a: { x: number; y: number }, b: { x: number; y: number }) => boolean;
  compactGateStackPositions: (supabase: SupabaseAdminClient, gateId: string) => Promise<void>;
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: ActionRecord,
  ) => Promise<void>;
  removeUnitsFromHeroArmy: (
    supabase: SupabaseAdminClient,
    source: MinimalArmy,
    count: number,
    maxHealth: number,
  ) => Promise<void>;
  removeUnitsFromStackList: (stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) => MinimalArmy[];
};

type HandleGarrisonActionParams = {
  supabase: SupabaseAdminClient;
  game: { turnNumber?: unknown };
  gameId: string;
  gamePlayer: MinimalPlayer;
  gates: MinimalGate[];
  action: ActionRecord;
  helpers: GarrisonActionHelpers;
};

export async function handleGarrisonAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  gates,
  action,
  helpers,
}: HandleGarrisonActionParams) {
  if (action.type === "TRANSFER_GARRISON_TO_HERO") {
    const unitType = action.unitType as UnitType;
    const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
    const rule = UNIT_RULES[unitType];
    const town = findTown(gamePlayer, action.townId);
    const hero = findHero(gamePlayer, action.heroId);
    if (!rule || !town || !hero) return NextResponse.json({ error: "Transfert invalide" }, { status: 400 });
    if (hero.x !== town.x || hero.y !== town.y) {
      return NextResponse.json({ error: "Le héros doit être au château pour recevoir la garnison" }, { status: 400 });
    }

    const garrison = town.garrison ?? [];
    const source = garrison.find((unit) => unit.unitType === unitType);
    if (!source || source.count < count) {
      return NextResponse.json({ error: "Garnison insuffisante" }, { status: 400 });
    }
    const capacity = addUnitsToStacks(sortedStacks(hero.armies), unitType, count, rule.health, () => randomUUID());
    if (capacity.remainder > 0) {
      return NextResponse.json({ error: "Pas assez de place dans l'armée du héros" }, { status: 400 });
    }

    const nextGarrison = helpers.removeUnitsFromStackList(garrison, unitType, count, rule.health);
    await supabase.from("towns").update({ garrison: nextGarrison }).eq("id", town.id);
    await helpers.addUnitsToHeroArmy(supabase, hero, unitType, count, rule.health);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true });
  }

  if (action.type === "TRANSFER_HERO_TO_GARRISON") {
    const unitType = action.unitType as UnitType;
    const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
    const rule = UNIT_RULES[unitType];
    const town = findTown(gamePlayer, action.townId);
    const hero = findHero(gamePlayer, action.heroId);
    if (!rule || !town || !hero) return NextResponse.json({ error: "Transfert invalide" }, { status: 400 });
    if (hero.x !== town.x || hero.y !== town.y) {
      return NextResponse.json({ error: "Le héros doit être au château pour déposer des unités" }, { status: 400 });
    }

    const source = hero.armies.find((army) => army.unitType === unitType);
    if (!source || source.count < count) {
      return NextResponse.json({ error: "Armee insuffisante" }, { status: 400 });
    }

    const nextGarrison = helpers.addUnitsToStackList(town.garrison ?? [], unitType, count, rule.health);
    await supabase.from("towns").update({ garrison: nextGarrison }).eq("id", town.id);
    await helpers.removeUnitsFromHeroArmy(supabase, source, count, rule.health);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true });
  }

  if (action.type === "TRANSFER_GATE_GARRISON_TO_HERO" || action.type === "TRANSFER_HERO_TO_GATE_GARRISON") {
    const unitType = action.unitType as UnitType;
    const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
    const rule = UNIT_RULES[unitType];
    const hero = findHero(gamePlayer, action.heroId);
    const gate = gates.find((item) => item.id === action.gateId);
    if (!rule || !hero || !gate || gate.gamePlayerId !== gamePlayer.id) {
      return NextResponse.json({ error: "Transfert de porte invalide" }, { status: 400 });
    }
    if (!helpers.areAdjacentOrSame({ x: hero.x, y: hero.y }, { x: gate.x, y: gate.y })) {
      return NextResponse.json({ error: "Le héros doit être adjacent à la porte" }, { status: 400 });
    }

    if (action.type === "TRANSFER_GATE_GARRISON_TO_HERO") {
      const source = (gate.garrison ?? []).find((unit) => unit.unitType === unitType);
      if (!source || source.count < count) return NextResponse.json({ error: "Garnison insuffisante" }, { status: 400 });
      const capacity = addUnitsToStacks(sortedStacks(hero.armies), unitType, count, rule.health, () => randomUUID());
      if (capacity.remainder > 0) {
        return NextResponse.json({ error: "Pas assez de place dans l'armée du héros" }, { status: 400 });
      }

      if (source.count === count) {
        await supabase.from("gate_stacks").delete().eq("id", source.id);
      } else {
        await supabase.from("gate_stacks").update({
          count: source.count - count,
          health: Math.max(0, source.health - rule.health * count),
        }).eq("id", source.id);
      }
      await helpers.addUnitsToHeroArmy(supabase, hero, unitType, count, rule.health);
    } else {
      const source = hero.armies.find((army) => army.unitType === unitType);
      if (!source || source.count < count) return NextResponse.json({ error: "Armee insuffisante" }, { status: 400 });

      await helpers.addUnitsToGateGarrison(supabase, gate, unitType, count, rule.health);
      await helpers.removeUnitsFromHeroArmy(supabase, source, count, rule.health);
    }

    await helpers.compactGateStackPositions(supabase, gate.id);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  if (action.type === "CASTLE_GATE_TRANSFER") {
    const fromTown = findTown(gamePlayer, action.fromTownId);
    const toTown = findTown(gamePlayer, action.toTownId);
    if (!fromTown || !toTown || fromTown.id === toTown.id) {
      return NextResponse.json({ error: "Transfert invalide" }, { status: 400 });
    }

    const fromFaction = ((fromTown.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction);
    const toFaction = ((toTown.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction);
    if (fromFaction !== Faction.INFERNO || toFaction !== Faction.INFERNO) {
      return NextResponse.json({ error: "La Porte des Braises ne relie que les villes des Braises Profanes" }, { status: 400 });
    }
    if (!(fromTown.buildings ?? []).includes(BuildingType.UNIQUE_1) || !(toTown.buildings ?? []).includes(BuildingType.UNIQUE_1)) {
      return NextResponse.json({ error: "Les deux villes doivent posséder la Porte des Braises" }, { status: 400 });
    }

    const unitType = action.unitType as UnitType;
    const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
    const rule = UNIT_RULES[unitType];
    if (!rule) return NextResponse.json({ error: "Unité invalide" }, { status: 400 });

    const fromGarrison = fromTown.garrison ?? [];
    const source = fromGarrison.find((unit) => unit.unitType === unitType);
    if (!source || source.count < count) {
      return NextResponse.json({ error: "Garnison insuffisante" }, { status: 400 });
    }

    const nextFromGarrison = helpers.removeUnitsFromStackList(fromGarrison, unitType, count, rule.health);
    const nextToGarrison = helpers.addUnitsToStackList(toTown.garrison ?? [], unitType, count, rule.health);
    await supabase.from("towns").update({ garrison: nextFromGarrison }).eq("id", fromTown.id);
    await supabase.from("towns").update({ garrison: nextToGarrison }).eq("id", toTown.id);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true });
  }

  return null;
}

function findTown(gamePlayer: MinimalPlayer, value: unknown): MinimalTown | undefined {
  return gamePlayer.towns.find((item) => item.id === value);
}

function findHero(gamePlayer: MinimalPlayer, value: unknown): MinimalHero | undefined {
  return gamePlayer.heroes.find((item) => item.id === value);
}
