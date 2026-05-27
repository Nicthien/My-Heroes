import { calculateHeroPower } from "./combat";
import type { AiContext, AiHero, AiRole } from "./types";

export function assignHeroRole(context: AiContext, hero: AiHero, heroIndex: number): AiRole {
  const hasVisibleEnemy = context.visibleOpponents.some(
    (opponent) => (opponent.heroes?.length ?? 0) > 0 || (opponent.towns?.length ?? 0) > 0,
  );
  const isChampion = context.memory.championHeroId === hero.id;

  // Phase EXPLORE : tous les héros scoutent activement, sauf le champion qui exploite l'économie locale.
  if (context.posture === "EXPLORE") {
    if (isChampion) {
      // Le champion fait BUILDER s'il manque des ressources de base, sinon SCOUT.
      const hasMissingBasicEconomy = context.resourceNeeds.wood || context.resourceNeeds.ore || context.resourceNeeds.gold;
      return hasMissingBasicEconomy ? "BUILDER" : "SCOUT";
    }
    return "SCOUT";
  }

  // Le rôle CHAMPION ne s'active que quand il a un sens : ennemi visible, posture offensive ou défense critique.
  if (
    isChampion &&
    (hasVisibleEnemy || context.posture === "FINISH" || context.posture === "CONSOLIDATE")
  ) {
    return "CHAMPION";
  }
  if (context.posture === "DEFEND" && hasVisibleEnemy) return "DEFENDER";

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
    if (objectiveType === "exploration") return 1.25;
    if (objectiveType === "adventure_building") return 1.4;
    if (objectiveType === "resource" || objectiveType === "resource_building") return 1.4;
    if (objectiveType === "plan_waypoint") return 1.5;
    if (objectiveType === "enemy_hero" || objectiveType === "enemy_town") return 0.55;
    if (objectiveType === "defend_town") return 0.9;
    if (objectiveType === "pickup_garrison") return 0.85;
  }

  if (role === "BUILDER") {
    if (objectiveType === "resource" || objectiveType === "resource_building") return 1.35;
    if (objectiveType === "exploration") return 0.9;
    if (objectiveType === "enemy_hero" || objectiveType === "enemy_town") return 0.65;
    if (objectiveType === "defend_town") return 1.1;
    if (objectiveType === "pickup_garrison") return 1.05;
  }

  if (role === "CONQUEROR") {
    if (objectiveType === "enemy_hero" || objectiveType === "enemy_town" || objectiveType === "neutral_town" || objectiveType === "gate") return 1.5;
    if (objectiveType === "neutral_army") return 1.15;
    if (objectiveType === "resource") return 0.75;
    if (objectiveType === "defend_town") return 1.1;
    if (objectiveType === "pickup_garrison") return 1.25;
  }

  if (role === "CHAMPION") {
    if (objectiveType === "enemy_hero" || objectiveType === "enemy_town") return 1.9;
    if (objectiveType === "neutral_town" || objectiveType === "gate") return 1.6;
    if (objectiveType === "neutral_army") return 1.3;
    if (objectiveType === "plan_waypoint") return 1.8;
    if (objectiveType === "defend_town") return 1.7;
    if (objectiveType === "pickup_garrison") return 1.45;
    if (objectiveType === "resource_building") return 1.15;
    if (objectiveType === "resource") return 0.95;
    if (objectiveType === "exploration") return 0.95;
  }

  if (role === "DEFENDER") {
    if (objectiveType === "defend_town") return 2.4;
    if (objectiveType === "pickup_garrison") return 1.8;
    if (objectiveType === "enemy_hero") return 1.1;
    if (objectiveType === "exploration") return 0.6;
    if (objectiveType === "neutral_army") return 0.85;
  }

  return 1;
}
