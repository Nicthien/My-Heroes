import type { AiContext, AiHero } from "../types";
import type { AiMultiTurnPlan, AiPlayerMemory } from "./memory";
import { calculateHeroPower, calculateStacksPower } from "../combat";
import { getGarrisonPickupStacks } from "./army-transfers";

const PLAN_HORIZON_TURNS = 8;
const SCOUT_PLAN_HORIZON_TURNS = 4;
const CHEBYSHEV = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function updateMultiTurnPlans(
  context: AiContext,
  memory: AiPlayerMemory,
): AiMultiTurnPlan[] {
  const turn = Number(context.game.turnNumber ?? 1);
  const heroes = context.player.heroes ?? [];

  // Purge plans pour héros disparus ou expirés ou cible plus valide.
  const surviving = memory.multiTurnPlans.filter((plan) => {
    if (turn > plan.expiresAtTurn) return false;
    if (!heroes.some((h) => h.id === plan.heroId)) return false;
    if (plan.goal === "RAID_TOWN" || plan.goal === "RALLY_AT") {
      // Le target doit exister encore.
      const target = locateTownAt(context, plan.targetX, plan.targetY);
      if (!target) return false;
      if (plan.goal === "RAID_TOWN" && target.ownerPlayerId === context.player.id) return false;
    }
    if (plan.goal === "SCOUT_FRONTIER") {
      // Si on a déjà exploré la zone cible, le plan est obsolète.
      if (context.explored.has(`${plan.targetX},${plan.targetY}`)) return false;
    }
    if (plan.goal === "RALLY_TO_CHAMPION") {
      // Valable tant que le champion existe et que ce n'est pas lui-même ; on
      // rafraîchit la cible vers sa position courante (il bouge).
      if (plan.heroId === memory.championHeroId) return false;
      const champion = heroes.find((h) => h.id === memory.championHeroId);
      if (!champion) return false;
      plan.targetX = champion.x;
      plan.targetY = champion.y;
    }
    return true;
  });

  const championId = memory.championHeroId;
  const champion = championId ? heroes.find((h) => h.id === championId) : null;
  if (champion && !surviving.some((p) => p.heroId === champion.id)) {
    const plan = pickChampionPlan(context, champion, memory.primaryEnemyId, turn);
    if (plan) surviving.push(plan);
  }

  const reinforcementPlan = pickReinforcementPlan(context, surviving, turn);
  if (reinforcementPlan) surviving.push(reinforcementPlan);

  // Logistique : un héros secondaire portant une vraie armée fait route vers le
  // champion pour la lui transférer (schéma "mule" multi-tours).
  if (champion) {
    for (const feederPlan of pickChampionFeederPlans(context, champion, surviving, turn)) {
      surviving.push(feederPlan);
    }
  }

  // Si aucun ennemi n'est connu, donne un plan SCOUT_FRONTIER au héros secondaire
  // (ou au champion si on est seul) pour aller chercher l'inconnu activement.
  const knowsAnyEnemy = context.visibleOpponents.length > 0;
  if (!knowsAnyEnemy) {
    const scoutCandidate = pickScoutHero(heroes, championId, surviving);
    if (scoutCandidate) {
      const target = pickFrontierTarget(context, scoutCandidate);
      if (target) {
        surviving.push({
          heroId: scoutCandidate.id,
          goal: "SCOUT_FRONTIER",
          targetX: target.x,
          targetY: target.y,
          etaTurns: estimateEta(scoutCandidate, target),
          expiresAtTurn: turn + SCOUT_PLAN_HORIZON_TURNS,
        });
      }
    }
  }

  return surviving;
}

function pickScoutHero(
  heroes: AiHero[],
  championId: string | null,
  existingPlans: AiMultiTurnPlan[],
): AiHero | null {
  if (heroes.length === 0) return null;
  const withoutPlan = heroes.filter((h) => !existingPlans.some((p) => p.heroId === h.id));
  if (withoutPlan.length === 0) return null;
  // Préfère un secondaire ; à défaut, le champion sert d'éclaireur en l'absence d'ennemi connu.
  const secondary = withoutPlan.find((h) => h.id !== championId);
  return secondary ?? withoutPlan[0];
}

const MULE_MIN_POWER = 400;

// Secondary heroes carrying a meaningful army are routed to the champion so they
// can hand their stacks over (multi-turn "mule" logistics). Heroes already next
// to the champion are left to executeArmyTransfers.
function pickChampionFeederPlans(
  context: AiContext,
  champion: AiHero,
  existingPlans: AiMultiTurnPlan[],
  turn: number,
): AiMultiTurnPlan[] {
  const plans: AiMultiTurnPlan[] = [];
  for (const hero of context.player.heroes ?? []) {
    if (hero.id === champion.id) continue;
    if (existingPlans.some((plan) => plan.heroId === hero.id)) continue;
    if (CHEBYSHEV(hero.x, hero.y, champion.x, champion.y) <= 1) continue;
    if (calculateHeroPower(hero) < MULE_MIN_POWER) continue;
    plans.push({
      heroId: hero.id,
      goal: "RALLY_TO_CHAMPION",
      targetX: champion.x,
      targetY: champion.y,
      etaTurns: estimateEta(hero, champion),
      expiresAtTurn: turn + 3,
    });
  }
  return plans;
}

function pickReinforcementPlan(
  context: AiContext,
  existingPlans: AiMultiTurnPlan[],
  turn: number,
): AiMultiTurnPlan | null {
  const towns = context.player.towns ?? [];
  const heroes = context.player.heroes ?? [];
  if (towns.length === 0 || heroes.length === 0) return null;

  let best: { hero: AiHero; town: { id: string; x: number; y: number }; score: number; pickupPower: number } | null = null;
  for (const hero of heroes) {
    if (existingPlans.some((plan) => plan.heroId === hero.id)) continue;
    for (const town of towns) {
      if (CHEBYSHEV(hero.x, hero.y, town.x, town.y) <= 1) continue;
      const pickupPower = calculateStacksPower(getGarrisonPickupStacks(town, context.posture === "DEFEND"));
      const heroPower = calculateHeroPower(hero);
      if (pickupPower < Math.max(500, heroPower * 0.35)) continue;
      const cadence = (turn + stableHash(`${context.game.id}:${hero.id}:${town.id}`)) % 4 === 0;
      if (!cadence && context.posture !== "CONSOLIDATE" && context.posture !== "DEFEND") continue;
      const distance = CHEBYSHEV(hero.x, hero.y, town.x, town.y);
      const score = pickupPower - distance * 80 + (context.memory.championHeroId === hero.id ? 300 : 0);
      if (!best || score > best.score) best = { hero, town, score, pickupPower };
    }
  }

  if (!best) return null;
  return {
    heroId: best.hero.id,
    goal: "RALLY_AT",
    targetX: best.town.x,
    targetY: best.town.y,
    etaTurns: estimateEta(best.hero, best.town),
    expiresAtTurn: turn + Math.max(3, estimateEta(best.hero, best.town) + 2),
  };
}

function pickFrontierTarget(context: AiContext, hero: AiHero): { x: number; y: number } | null {
  const map = context.map;
  // Cherche le coin inexploré le plus proche du héros (push outward).
  // Échantillonne à intervalles réguliers pour éviter de scanner toute la carte.
  let best: { x: number; y: number; score: number } | null = null;
  const STEP = 3;
  for (let y = 0; y < map.height; y += STEP) {
    for (let x = 0; x < map.width; x += STEP) {
      if (context.explored.has(`${x},${y}`)) continue;
      const distance = CHEBYSHEV(hero.x, hero.y, x, y);
      if (distance > 40) continue;
      // Score : on veut proche, mais aussi près du bord (les ennemis y sont souvent).
      const edgeProximity = Math.min(x, map.width - 1 - x, y, map.height - 1 - y);
      const score = 1000 - distance * 8 + Math.max(0, 15 - edgeProximity) * 4;
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

function pickChampionPlan(
  context: AiContext,
  champion: AiHero,
  primaryEnemyId: string | null,
  turn: number,
): AiMultiTurnPlan | null {
  // Cible prioritaire : capitale de l'ennemi principal si connue.
  const enemy = primaryEnemyId ? context.game.players.find((p) => p.id === primaryEnemyId) : null;
  const enemyTowns = (enemy?.towns ?? []).filter((t) => context.explored.has(`${t.x},${t.y}`));
  if (enemyTowns.length > 0 && enemy) {
    const target = enemyTowns.sort((a, b) =>
      CHEBYSHEV(champion.x, champion.y, a.x, a.y) - CHEBYSHEV(champion.x, champion.y, b.x, b.y)
    )[0];
    const garrisonPower = calculateStacksPower(target.garrison ?? []);
    const championPower = calculateHeroPower(champion);
    // On évite un plan suicide.
    if (championPower >= garrisonPower * 0.8) {
      return {
        heroId: champion.id,
        goal: "RAID_TOWN",
        targetX: target.x,
        targetY: target.y,
        etaTurns: estimateEta(champion, target),
        expiresAtTurn: turn + PLAN_HORIZON_TURNS,
        enemyPlayerId: enemy.id,
      };
    }
  }

  // Fallback : rallier le centre des villes alliées (consolidation / défense).
  const ourTowns = context.player.towns ?? [];
  if (context.posture === "DEFEND" && ourTowns.length > 0) {
    const target = ourTowns.sort((a, b) =>
      CHEBYSHEV(champion.x, champion.y, a.x, a.y) - CHEBYSHEV(champion.x, champion.y, b.x, b.y)
    )[0];
    return {
      heroId: champion.id,
      goal: "RETREAT_TO",
      targetX: target.x,
      targetY: target.y,
      etaTurns: estimateEta(champion, target),
      expiresAtTurn: turn + 3,
    };
  }

  return null;
}

function estimateEta(hero: AiHero, target: { x: number; y: number }): number {
  const distance = CHEBYSHEV(hero.x, hero.y, target.x, target.y);
  // Estimation grossière : 5-7 tiles par tour selon faction/route.
  return Math.max(1, Math.ceil(distance / 6));
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function locateTownAt(context: AiContext, x: number, y: number) {
  for (const player of context.game.players ?? []) {
    for (const town of player.towns ?? []) {
      if (town.x === x && town.y === y) return { ownerPlayerId: player.id };
    }
  }
  return null;
}
