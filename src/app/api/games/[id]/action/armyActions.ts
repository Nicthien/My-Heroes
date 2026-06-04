import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  UNIT_RULES,
  canAfford,
  getFactionBuildingRules,
  subtractCost,
} from "@/lib/game/economy";
import {
  HERO_ARMY_STACK_LIMIT,
  UNIT_STACK_COUNT_CAP,
  addUnitsToStacks,
  removeUnitsFromStack,
  sortedStacks,
} from "@/lib/game/army-stacks";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { Faction, type Resources, type UnitType } from "@/lib/game/types";
import type { MinimalArmy, MinimalHero, MinimalPlayer, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;

type ArmyActionHelpers = {
  addUnitsToHeroArmy: (
    supabase: SupabaseAdminClient,
    hero: MinimalHero,
    unitType: UnitType,
    count: number,
    maxHealth: number,
  ) => Promise<void>;
  addUnitsToStackList: (stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) => MinimalArmy[];
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: ActionRecord,
  ) => Promise<void>;
  persistHeroArmyDiff: (
    supabase: SupabaseAdminClient,
    heroId: string,
    before: MinimalArmy[],
    after: MinimalArmy[],
  ) => Promise<void>;
  playerResources: (player: MinimalPlayer) => Resources;
  removeUnitsFromHeroArmy: (
    supabase: SupabaseAdminClient,
    source: MinimalArmy,
    count: number,
    maxHealth: number,
  ) => Promise<void>;
  removeUnitsFromStackList: (stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) => MinimalArmy[];
  updatePlayerResources: (supabase: SupabaseAdminClient, playerId: string, resources: Partial<Resources>) => Promise<void>;
};

type HandleArmyActionParams = {
  supabase: SupabaseAdminClient;
  game: {
    combats?: Parameters<typeof isHeroInActiveCombat>[0];
    turnNumber?: unknown;
  };
  gameId: string;
  gamePlayer: MinimalPlayer;
  action: ActionRecord;
  heroInCombatError: string;
  helpers: ArmyActionHelpers;
};

export async function handleArmyAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  action,
  heroInCombatError,
  helpers,
}: HandleArmyActionParams) {
  if (action.type === "RECRUIT_UNIT") {
    const unitType = action.unitType as UnitType;
    const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
    const rule = UNIT_RULES[unitType];
    const town = gamePlayer.towns.find((item) => item.id === action.townId);
    if (!rule || !town) return NextResponse.json({ error: "Unite invalide" }, { status: 400 });

    const available = town.availableRecruits?.[unitType] ?? 0;
    if (available < count) return NextResponse.json({ error: "Pas assez d'unités disponibles" }, { status: 400 });

    const totalCost = Object.fromEntries(Object.entries(rule.cost).map(([key, value]) => [key, (value ?? 0) * count]));
    const resources = helpers.playerResources(gamePlayer);
    if (!canAfford(resources, totalCost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });

    await supabase.from("game_players").update(subtractCost(resources, totalCost)).eq("id", gamePlayer.id);
    const nextGarrison = helpers.addUnitsToStackList(town.garrison ?? [], unitType, count, rule.health);
    await supabase.from("towns").update({
      available_recruits: { ...(town.availableRecruits ?? {}), [unitType]: available - count },
      garrison: nextGarrison,
    }).eq("id", town.id);

    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  if (action.type === "MERGE_HERO_STACKS") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    const sourceStackId = String(action.sourceStackId ?? "");
    const targetStackId = String(action.targetStackId ?? "");
    if (!hero || !sourceStackId || !targetStackId || sourceStackId === targetStackId) {
      return NextResponse.json({ error: "Fusion invalide" }, { status: 400 });
    }
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }

    const stacks = sortedStacks(hero.armies);
    const source = stacks.find((stack) => stack.id === sourceStackId);
    const target = stacks.find((stack) => stack.id === targetStackId);
    if (!source || !target || source.unitType !== target.unitType) {
      return NextResponse.json({ error: "Les stacks doivent contenir la même unité" }, { status: 400 });
    }
    const room = Math.max(0, UNIT_STACK_COUNT_CAP - target.count);
    if (room <= 0) return NextResponse.json({ error: "Le stack cible est déjà plein" }, { status: 400 });
    const moved = Math.min(source.count, room);
    const sourceRemoval = removeUnitsFromStack(source, moved);
    const next = stacks
      .flatMap((stack): MinimalArmy[] => {
        if (stack.id === source.id) {
          return sourceRemoval.remaining.count > 0 ? [sourceRemoval.remaining] : [];
        }
        if (stack.id === target.id) {
          const nextCount = target.count + moved;
          return [{
            ...target,
            count: nextCount,
            health: Math.min(nextCount * target.maxHealth, target.health + sourceRemoval.removedHealth),
          }];
        }
        return [stack];
      })
      .map((stack, position) => ({ ...stack, position }));
    await helpers.persistHeroArmyDiff(supabase, hero.id, stacks, next);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, moved });
  }

  if (action.type === "SPLIT_HERO_STACK") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    const sourceStackId = String(action.sourceStackId ?? "");
    const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
    if (!hero || !sourceStackId) return NextResponse.json({ error: "Séparation invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }

    const stacks = sortedStacks(hero.armies);
    if (stacks.length >= HERO_ARMY_STACK_LIMIT) {
      return NextResponse.json({ error: "L'armée du héros est pleine" }, { status: 400 });
    }
    const source = stacks.find((stack) => stack.id === sourceStackId);
    if (!source || source.count <= 1 || count >= source.count) {
      return NextResponse.json({ error: "Quantité invalide" }, { status: 400 });
    }
    if (source.unitType === "king") {
      return NextResponse.json({ error: "Le Roi ne peut pas être séparé" }, { status: 400 });
    }

    const removal = removeUnitsFromStack(source, count);
    const position = stacks.length;
    const newStack: MinimalArmy = {
      id: randomUUID(),
      unitType: source.unitType,
      count: removal.removed,
      health: removal.removedHealth,
      maxHealth: source.maxHealth,
      position,
    };
    const next = sortedStacks(stacks.map((stack) => stack.id === source.id ? removal.remaining : stack).concat(newStack))
      .map((stack, nextPosition) => ({ ...stack, position: nextPosition }));
    await helpers.persistHeroArmyDiff(supabase, hero.id, stacks, next);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  if (action.type === "UPGRADE_TROOPS") {
    const unitType = action.unitType as UnitType;
    const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
    const baseRule = UNIT_RULES[unitType];
    const town = gamePlayer.towns.find((item) => item.id === action.townId);
    if (!baseRule || !town) return NextResponse.json({ error: "Unite invalide" }, { status: 400 });

    const townFaction = (town.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction;
    const upgradeBuilding = getFactionBuildingRules(townFaction).find((rule) => rule.replacesUnit === unitType);
    const upgradedUnitType = upgradeBuilding?.unlocksUnit;
    const upgradedRule = upgradedUnitType ? UNIT_RULES[upgradedUnitType] : undefined;
    if (!upgradeBuilding || !upgradedUnitType || !upgradedRule) {
      return NextResponse.json({ error: "Cette unité ne peut pas être améliorée ici" }, { status: 400 });
    }
    if (!(town.buildings ?? []).includes(upgradeBuilding.type)) {
      return NextResponse.json({ error: "Bâtiment amélioré requis" }, { status: 400 });
    }

    const sourceHeroId = typeof action.heroId === "string" ? action.heroId : null;
    const sourceHero = sourceHeroId ? gamePlayer.heroes.find((hero) => hero.id === sourceHeroId) : null;
    if (sourceHeroId) {
      if (!sourceHero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
      if (sourceHero.x !== town.x || sourceHero.y !== town.y) {
        return NextResponse.json({ error: "Le héros doit être au château" }, { status: 400 });
      }
      if (isHeroInActiveCombat(game.combats, sourceHero.id)) {
        return NextResponse.json({ error: heroInCombatError }, { status: 400 });
      }
    }

    const garrison = town.garrison ?? [];
    const source = sourceHero
      ? sourceHero.armies.find((unit) => unit.unitType === unitType)
      : garrison.find((unit) => unit.unitType === unitType);
    if (!source || source.count < count) {
      return NextResponse.json({ error: "Troupes insuffisantes" }, { status: 400 });
    }

    const upgradeCost = getUnitUpgradeCost(baseRule.cost, upgradedRule.cost);
    const totalCost = Object.fromEntries(Object.entries(upgradeCost).map(([key, value]) => [key, (value ?? 0) * count]));
    const resources = helpers.playerResources(gamePlayer);
    if (!canAfford(resources, totalCost)) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });

    if (sourceHero) {
      const afterRemoval = helpers.removeUnitsFromStackList(sourceHero.armies, unitType, count, baseRule.health);
      const capacity = addUnitsToStacks(afterRemoval, upgradedUnitType, count, upgradedRule.health, () => randomUUID());
      if (capacity.remainder > 0) {
        return NextResponse.json({ error: "Pas assez de place dans l'armée du héros" }, { status: 400 });
      }
      await helpers.updatePlayerResources(supabase, gamePlayer.id, subtractCost(resources, totalCost));
      await helpers.removeUnitsFromHeroArmy(supabase, source, count, baseRule.health);
      await helpers.addUnitsToHeroArmy(supabase, sourceHero, upgradedUnitType, count, upgradedRule.health);
    } else {
      await helpers.updatePlayerResources(supabase, gamePlayer.id, subtractCost(resources, totalCost));
      const nextGarrison = helpers.addUnitsToStackList(
        helpers.removeUnitsFromStackList(garrison, unitType, count, baseRule.health),
        upgradedUnitType,
        count,
        upgradedRule.health
      );
      await supabase.from("towns").update({ garrison: nextGarrison }).eq("id", town.id);
    }

    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  return null;
}

function getUnitUpgradeCost(baseCost: Partial<Resources>, upgradedCost: Partial<Resources>) {
  const resources: Array<keyof Resources> = ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"];
  return Object.fromEntries(
    resources.map((resource) => [
      resource,
      Math.max(0, (upgradedCost[resource] ?? 0) - (baseCost[resource] ?? 0)),
    ])
  ) as Partial<Resources>;
}
