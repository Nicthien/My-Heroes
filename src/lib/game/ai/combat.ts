import {
  calculateArmyPower,
  autoResolveCombat,
  applyLossesToWinnerArmies,
} from "@/lib/game/combat/autoResolve";
import { UnitType, type UnitStack } from "@/lib/game/types";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import type { AiHero } from "./types";

export function calculateHeroPower(hero: Pick<AiHero, "id" | "armies" | "attack" | "defense">) {
  return calculateArmyPower({
    id: hero.id,
    attack: Number(hero.attack ?? 1),
    defense: Number(hero.defense ?? 1),
    armies: hero.armies,
  });
}

export function calculateStacksPower(stacks: UnitStack[] | undefined | null, attack = 1, defense = 1) {
  return calculateArmyPower({
    id: "stacks",
    attack,
    defense,
    armies: stacks ?? [],
  });
}

export function shouldAttackNeutral(hero: AiHero, defenderPower: number, requiredRatio: number) {
  return calculateHeroPower(hero) >= Math.max(1, defenderPower) * requiredRatio;
}

export function shouldAttackHuman(hero: AiHero, defenderPower: number, requiredRatio: number) {
  return calculateHeroPower(hero) >= Math.max(1, defenderPower) * requiredRatio;
}

export async function resolveAiAutoCombat({
  supabase,
  attacker,
  defender,
  onAttackerWon,
  experience = 500,
}: {
  supabase: SupabaseAdmin;
  attacker: AiHero;
  defender: {
    id: string;
    attack?: number;
    defense?: number;
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
      armies: attacker.armies,
    },
    {
      id: defender.id,
      attack: Number(defender.attack ?? 1),
      defense: Number(defender.defense ?? 1),
      armies: defender.armies,
    },
  );
  const attackerWon = result.winnerHeroId === attacker.id;

  if (attackerWon) {
    const nextArmies = applyLossesToWinnerArmies(attacker.armies, result.winnerLossRatio);
    await persistHeroArmies(supabase, attacker.id, nextArmies);
    await supabase
      .from("heroes")
      .update({ experience: Number(attacker.experience ?? 0) + experience })
      .eq("id", attacker.id);
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
  const count = Math.max(5, Math.ceil(Math.max(0, guardianPower) / 12));
  return [{
    id: `${buildingId}-guards`,
    unitType: UnitType.PIKEMAN,
    count,
    health: count * 12,
    maxHealth: 12,
    position: 0,
  }];
}
