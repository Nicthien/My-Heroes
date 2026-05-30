import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { HERO_ARMY_STACK_LIMIT, addUnitsToStacks, sortedStacks } from "@/lib/game/army-stacks";
import { type PendingCreatureBankReward } from "@/lib/game/creature-banks";
import { normalizeArtifactBag, pickArtifactId } from "@/lib/game/artifacts";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import { getUnitRule } from "@/lib/game/units";
import type { Resources, UnitType } from "@/lib/game/types";
import type { MinimalHero, MinimalPlayer, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;
type CreatureBankStateMap = Record<string, Record<string, unknown> & { claimed?: boolean; pendingReward?: unknown }>;

type RewardActionHelpers = {
  addUnitsToHeroArmy: (
    supabase: SupabaseAdminClient,
    hero: MinimalHero,
    unitType: UnitType,
    count: number,
    maxHealth: number,
  ) => Promise<void>;
  getCreatureBankStateMap: (mapState: Record<string, unknown>) => CreatureBankStateMap;
  getLatestMapState: (
    supabase: SupabaseAdminClient,
    gameId: string,
    fallback: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown; mapState?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: ActionRecord,
  ) => Promise<void>;
  normalizeCreatureRewardSelection: (
    selected: unknown,
    available: Array<{ unitType: UnitType; count: number }>,
  ) => Partial<Record<UnitType, number>>;
  playerResources: (player: MinimalPlayer) => Resources;
  updatePlayerResources: (
    supabase: SupabaseAdminClient,
    playerId: string,
    resources: Partial<Resources>,
  ) => Promise<void>;
};

type HandleRewardActionParams = {
  supabase: SupabaseAdminClient;
  game: { turnNumber?: unknown; mapState?: unknown };
  gameId: string;
  gamePlayer: MinimalPlayer;
  action: ActionRecord;
  helpers: RewardActionHelpers;
};

export async function handleRewardAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  action,
  helpers,
}: HandleRewardActionParams) {
  if (action.type !== "CLAIM_CREATURE_BANK_REWARD") return null;

  const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
  if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });

  const mapState = (game.mapState as Record<string, unknown>) ?? {};
  const creatureBanks = helpers.getCreatureBankStateMap(mapState);
  const bankState = creatureBanks[String(action.bankId ?? "")];
  const pendingReward = bankState?.pendingReward as PendingCreatureBankReward | undefined;
  if (!pendingReward || bankState.claimed) {
    return NextResponse.json({ error: "Aucune récompense de banque disponible" }, { status: 400 });
  }
  if (pendingReward.playerId !== gamePlayer.id || pendingReward.heroId !== hero.id) {
    return NextResponse.json({ error: "Cette récompense appartient à un autre héros" }, { status: 403 });
  }

  const acceptedCreatures = helpers.normalizeCreatureRewardSelection(action.creatures, pendingReward.reward.creatures ?? []);
  let rewardCapacityCheck = sortedStacks(hero.armies);
  for (const [unitTypeValue, count] of Object.entries(acceptedCreatures)) {
    const unitType = unitTypeValue as UnitType;
    if (count <= 0) continue;
    const rule = getUnitRule(unitType);
    const result = addUnitsToStacks(rewardCapacityCheck, unitType, count, rule.health, () => randomUUID());
    if (result.remainder > 0) {
      return NextResponse.json({ error: "Pas assez de place dans l'armée du héros" }, { status: 400 });
    }
    rewardCapacityCheck = result.stacks;
  }

  const newStackTypes = Object.entries(acceptedCreatures)
    .filter(([, count]) => count > 0)
    .map(([unitType]) => unitType as UnitType)
    .filter((unitType) => !hero.armies.some((army) => army.unitType === unitType));
  if (hero.armies.length + newStackTypes.length > HERO_ARMY_STACK_LIMIT) {
    return NextResponse.json({ error: "Pas assez de place dans l'armée du héros" }, { status: 400 });
  }

  const resources = helpers.playerResources(gamePlayer);
  const nextResources: Partial<Resources> = {};
  if (pendingReward.reward.gold) nextResources.gold = resources.gold + pendingReward.reward.gold;
  for (const [resource, amount] of Object.entries(pendingReward.reward.resources ?? {})) {
    const key = resource as keyof Resources;
    nextResources[key] = (resources[key] ?? 0) + Number(amount ?? 0);
  }
  if (Object.keys(nextResources).length > 0) {
    await helpers.updatePlayerResources(supabase, gamePlayer.id, nextResources);
  }
  if (pendingReward.reward.experience) {
    await applyHeroExperienceGain(supabase, gameId, hero.id, hero.experience + pendingReward.reward.experience);
  }

  for (const [unitTypeValue, count] of Object.entries(acceptedCreatures)) {
    const unitType = unitTypeValue as UnitType;
    if (count <= 0) continue;
    const rule = getUnitRule(unitType);
    await helpers.addUnitsToHeroArmy(supabase, hero, unitType, count, rule.health);
  }

  let nextHeroArtifacts = normalizeArtifactBag(hero.artifacts);
  if (pendingReward.reward.artifactTokens?.length) {
    const pickedArtifacts = pendingReward.reward.artifactTokens.map((token, index) =>
      pickArtifactId(token, `${gameId}:${pendingReward.bankId}:${hero.id}:${index}`)
    );
    nextHeroArtifacts = {
      ...nextHeroArtifacts,
      inventory: [...nextHeroArtifacts.inventory, ...pickedArtifacts],
    };
    await supabase.from("heroes").update({ artifacts: nextHeroArtifacts }).eq("id", hero.id);
  }

  const latestMapState = await helpers.getLatestMapState(supabase, gameId, mapState);
  await supabase.from("games").update({
    map_state: {
      ...latestMapState,
      creatureBanks: {
        ...((latestMapState.creatureBanks as typeof creatureBanks | undefined) ?? creatureBanks),
        [pendingReward.bankId]: {
          ...bankState,
          defeated: true,
          claimed: true,
          pendingReward: null,
        },
      },
    },
  }).eq("id", gameId);

  await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

  return NextResponse.json({ success: true });
}
