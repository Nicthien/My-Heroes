import { calculateHeroPower } from "./combat";
import type { AiContext, AiHero, AiRole } from "./types";

export function assignHeroRole(context: AiContext, hero: AiHero, heroIndex: number): AiRole {
  const visibleHumanTargets = context.visibleOpponents.flatMap((player) => player.heroes ?? []);
  const heroPower = calculateHeroPower(hero);
  const hasGoodHumanTarget = visibleHumanTargets.some((target) => {
    const targetPower = calculateHeroPower(target);
    return heroPower >= targetPower * context.profile.humanPowerRatio;
  });

  if (hasGoodHumanTarget && context.difficulty !== "simple") return "CONQUEROR";

  const hasMissingBasicEconomy = context.resourceNeeds.wood || context.resourceNeeds.ore || context.resourceNeeds.gold;
  if (heroIndex === 0 && hasMissingBasicEconomy && (context.player.resourceBuildings?.length ?? 0) < 2) {
    return "BUILDER";
  }

  if (context.player.heroes.length > 1 && heroIndex > 0) return "SCOUT";
  return hasMissingBasicEconomy ? "BUILDER" : "SCOUT";
}

export function roleMultiplier(role: AiRole, objectiveType: string) {
  if (role === "SCOUT") {
    if (objectiveType === "exploration" || objectiveType === "adventure_building") return 1.35;
    if (objectiveType === "enemy_hero") return 0.55;
  }

  if (role === "BUILDER") {
    if (objectiveType === "resource" || objectiveType === "resource_building") return 1.35;
    if (objectiveType === "exploration") return 0.9;
    if (objectiveType === "enemy_hero") return 0.65;
  }

  if (role === "CONQUEROR") {
    if (objectiveType === "enemy_hero" || objectiveType === "neutral_town") return 1.5;
    if (objectiveType === "neutral_army") return 1.15;
    if (objectiveType === "resource") return 0.75;
  }

  return 1;
}
