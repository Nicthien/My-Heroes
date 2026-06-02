import {
  calculateArmyPower,
  autoResolveCombat,
  applyLossesToWinnerArmies,
} from "@/lib/game/combat/autoResolve";
import { getUnitRule } from "@/lib/game/units";
import { UnitType, type UnitStack } from "@/lib/game/types";
import { applyHeroExperienceGain } from "@/lib/game/server/level-up";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import type { AiHero } from "./types";

export function calculateHeroPower(hero: Pick<AiHero, "id" | "armies" | "attack" | "defense" | "morale" | "luck">) {
  return calculateArmyPower({
    id: hero.id,
    attack: Number(hero.attack ?? 1),
    defense: Number(hero.defense ?? 1),
    morale: Number(hero.morale ?? 0),
    luck: Number(hero.luck ?? 0),
    armies: hero.armies,
  });
}

export function calculateStacksPower(stacks: UnitStack[] | undefined | null, attack = 1, defense = 1, morale = 0) {
  return calculateArmyPower({
    id: "stacks",
    attack,
    defense,
    morale,
    armies: stacks ?? [],
  });
}

export function canAiWinAutoCombat(
  attacker: Pick<AiHero, "id" | "armies" | "attack" | "defense" | "morale" | "luck">,
  defender: {
    id: string;
    attack?: number;
    defense?: number;
    morale?: number;
    luck?: number;
    armies: UnitStack[];
  },
) {
  const result = autoResolveCombat(
    {
      id: attacker.id,
      attack: Number(attacker.attack ?? 1),
      defense: Number(attacker.defense ?? 1),
      morale: Number(attacker.morale ?? 0),
      luck: Number(attacker.luck ?? 0),
      armies: attacker.armies,
    },
    {
      id: defender.id,
      attack: Number(defender.attack ?? 1),
      defense: Number(defender.defense ?? 1),
      morale: Number(defender.morale ?? 0),
      luck: Number(defender.luck ?? 0),
      armies: defender.armies,
    },
  );
  return result.winnerHeroId === attacker.id;
}

/**
 * Estimates the fraction of the attacker's army lost in an auto-resolve win,
 * reusing the same Lanchester model the real resolver applies. Returns 1 when
 * the attacker would lose (caller already vetoes those via canAiWinAutoCombat).
 */
export function estimateAttackLossRatio(
  attacker: Pick<AiHero, "id" | "armies" | "attack" | "defense" | "morale" | "luck">,
  defender: {
    id: string;
    attack?: number;
    defense?: number;
    morale?: number;
    luck?: number;
    armies: UnitStack[];
  },
): number {
  const result = autoResolveCombat(
    {
      id: attacker.id,
      attack: Number(attacker.attack ?? 1),
      defense: Number(attacker.defense ?? 1),
      morale: Number(attacker.morale ?? 0),
      luck: Number(attacker.luck ?? 0),
      armies: attacker.armies,
    },
    {
      id: defender.id,
      attack: Number(defender.attack ?? 1),
      defense: Number(defender.defense ?? 1),
      morale: Number(defender.morale ?? 0),
      luck: Number(defender.luck ?? 0),
      armies: defender.armies,
    },
  );
  return result.winnerHeroId === attacker.id ? result.winnerLossRatio : 1;
}

export function shouldAttackNeutral(hero: AiHero, defenderPower: number, requiredRatio: number) {
  return calculateHeroPower(hero) >= Math.max(1, defenderPower) * requiredRatio;
}

export function shouldAttackHuman(hero: AiHero, defenderPower: number, requiredRatio: number) {
  return calculateHeroPower(hero) >= Math.max(1, defenderPower) * requiredRatio;
}

export async function resolveAiAutoCombat({
  supabase,
  gameId,
  attacker,
  defender,
  onAttackerWon,
  experience = 500,
}: {
  supabase: SupabaseAdmin;
  gameId: string;
  attacker: AiHero;
  defender: {
    id: string;
    attack?: number;
    defense?: number;
    morale?: number;
    luck?: number;
    armies: UnitStack[];
  };
  onAttackerWon: () => Promise<void>;
  experience?: number;
}) {
  const result = autoResolveCombat(
    {
      id: attacker.id,
      attack: Number(attacker.attack ?? 1),
      defense: Number(attacker.defense ?? 1),
      morale: Number(attacker.morale ?? 0),
      luck: Number(attacker.luck ?? 0),
      armies: attacker.armies,
    },
    {
      id: defender.id,
      attack: Number(defender.attack ?? 1),
      defense: Number(defender.defense ?? 1),
      morale: Number(defender.morale ?? 0),
      luck: Number(defender.luck ?? 0),
      armies: defender.armies,
    },
  );
  const attackerWon = result.winnerHeroId === attacker.id;

  if (attackerWon) {
    const nextArmies = applyLossesToWinnerArmies(attacker.armies, result.winnerLossRatio);
    await persistHeroArmies(supabase, attacker.id, nextArmies);
    await applyHeroExperienceGain(supabase, gameId, attacker.id, Number(attacker.experience ?? 0) + experience);
    await onAttackerWon();
    return { attackerWon: true, attackerPower: result.attackerPower, defenderPower: result.defenderPower };
  }

  await supabase.from("armies").delete().eq("hero_id", attacker.id);
  await supabase.from("heroes").delete().eq("id", attacker.id);
  return { attackerWon: false, attackerPower: result.attackerPower, defenderPower: result.defenderPower };
}

export async function persistHeroArmies(supabase: SupabaseAdmin, heroId: string, armies: UnitStack[]) {
  for (const army of armies) {
    if (army.count <= 0) {
      await supabase.from("armies").delete().eq("id", army.id).eq("hero_id", heroId);
      continue;
    }
    await supabase.from("armies").update({
      count: army.count,
      health: army.health,
      position: army.position,
    }).eq("id", army.id).eq("hero_id", heroId);
  }
}

export function createBuildingGuardStacks(buildingId: string, guardianPower: number): UnitStack[] {
  const rule = getUnitRule(UnitType.PIKEMAN);
  const count = Math.max(5, Math.ceil(Math.max(0, guardianPower) / rule.power));
  return [{
    id: `${buildingId}-guards`,
    unitType: UnitType.PIKEMAN,
    count,
    health: count * rule.health,
    maxHealth: rule.health,
    position: 0,
  }];
}
