import { CLASS_STARTING_STATS, getHeroTemplate, HERO_RECRUIT_COST_GOLD, MAX_HEROES_PER_PLAYER, startingArmyForFaction, type TavernOffer } from "@/lib/game/heroes";
import { UNIT_RULES } from "@/lib/game/economy";
import { BuildingType, type HeroClass } from "@/lib/game/types";
import { getDailyAdventureMovement } from "@/lib/game/engine";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { recordGameAction } from "@/lib/game/server/action-log";
import type { AiArmy, AiContext } from "../types";

const BASE_SINGLE_STACK_HERO_ALLOWANCE = 2;
const SINGLE_STACK_HEROES_PER_TOWN = 1;

type SingleStackHeroLike = { armies?: Array<{ count?: number | null }> };
type SingleStackRecruitContext = {
  player: {
    heroes?: SingleStackHeroLike[];
    towns?: unknown[];
  };
};

export async function maybeRecruitHero(supabase: SupabaseAdmin, context: AiContext) {
  const heroes = context.player.heroes ?? [];
  const towns = context.player.towns ?? [];
  if (heroes.length >= MAX_HEROES_PER_PLAYER) return;
  const posture = context.posture;
  const maxDesired = posture === "FINISH" ? 5 : posture === "EXPAND" ? 3 : 2;
  if (heroes.length >= maxDesired) return;
  if (context.player.gold < HERO_RECRUIT_COST_GOLD) return;

  // Cherche une ville avec taverne et au moins une offre.
  for (const town of towns) {
    const buildings = (town.buildings ?? []) as string[];
    if (!buildings.includes(BuildingType.TAVERN)) continue;
    const offer = ((town as unknown as { tavernOffer?: TavernOffer[] }).tavernOffer ?? []);
    if (!Array.isArray(offer) || offer.length === 0) continue;

    const picked = offer[0];
    const template = getHeroTemplate(picked.templateId);
    if (!template) continue;
    const stats = CLASS_STARTING_STATS[template.class as HeroClass];
    const army = startingArmyForFaction(template.faction);
    if (!canRecruitSingleStackHero(context, army)) return;
    const dailyMovement = getDailyAdventureMovement([{ unitType: army.unitType }]);

    await supabase
      .from("game_players")
      .update({ gold: context.player.gold - HERO_RECRUIT_COST_GOLD })
      .eq("id", context.player.id);

    const heroInsert: Record<string, unknown> = {
      game_player_id: context.player.id,
      name: template.name,
      hero_class: template.class,
      specialty: template.specialty,
      attack: stats.attack,
      defense: stats.defense,
      spell_power: stats.spellPower,
      knowledge: stats.knowledge,
      morale: stats.morale,
      luck: stats.luck,
      mana: stats.knowledge * 10,
      has_spell_book: true,
      known_spells: null,
      artifacts: { inventory: [], equipment: {} },
      x: town.x,
      y: town.y,
      movement: dailyMovement,
      max_movement: dailyMovement,
    };

    let { data: heroRow, error: heroError } = await supabase
      .from("heroes")
      .insert(heroInsert)
      .select("id")
      .single();
    if (heroError) {
      // Fallback : schéma sans champs avancés.
      delete heroInsert.mana;
      delete heroInsert.has_spell_book;
      delete heroInsert.known_spells;
      delete heroInsert.morale;
      delete heroInsert.luck;
      delete heroInsert.artifacts;
      ({ data: heroRow, error: heroError } = await supabase
        .from("heroes")
        .insert(heroInsert)
        .select("id")
        .single());
    }
    if (heroError || !heroRow) return;

    const unitRule = UNIT_RULES[army.unitType];
    if (unitRule) {
      await supabase.from("armies").insert({
        hero_id: heroRow.id,
        unit_type: army.unitType,
        count: army.count,
        health: unitRule.health * army.count,
        max_health: unitRule.health,
        position: 0,
      });
    }

    const remaining = offer.filter((entry) => entry.templateId !== picked.templateId);
    await supabase.from("towns").update({ tavern_offer: remaining }).eq("id", town.id);
    await recordGameAction(supabase, {
      gameId: context.game.id,
      gamePlayerId: context.player.id,
      actorKind: "ai",
      turnNumber: Number(context.game.turnNumber ?? 0),
      actionType: "RECRUIT_HERO",
      category: "recruitment",
      summary: `${context.player.aiName || "IA"} recrute ${template.name}.`,
      details: { townId: town.id, heroId: heroRow.id, templateId: picked.templateId },
    });
    return;
  }
}

export function canRecruitSingleStackHero(context: SingleStackRecruitContext, recruitArmy: AiArmy | { count: number }) {
  const heroes = context.player.heroes ?? [];
  if (heroes.length <= 1) return true;

  const healthyMultiStackHeroes = heroes.filter((hero) => !isSingleStackHero(hero)).length;
  const singleStackHeroes = heroes.filter(isSingleStackHero).length;
  const allowance =
    BASE_SINGLE_STACK_HERO_ALLOWANCE +
    Math.max(0, (context.player.towns?.length ?? 0) - 1) * SINGLE_STACK_HEROES_PER_TOWN +
    healthyMultiStackHeroes;

  if (singleStackHeroes < allowance) return true;

  const recruitCount = Math.max(0, Math.trunc(Number(recruitArmy.count ?? 0)));
  const totalHeroCount = heroes.reduce((total, hero) => total + countHeroCreatures(hero), 0);
  const projectedAverage = (totalHeroCount + recruitCount) / (heroes.length + 1);

  return projectedAverage >= recruitCount * 2;
}

function isSingleStackHero(hero: SingleStackHeroLike) {
  return (hero.armies ?? []).filter((stack) => Number(stack.count ?? 0) > 0).length <= 1;
}

function countHeroCreatures(hero: SingleStackHeroLike) {
  return (hero.armies ?? []).reduce((total, stack) => total + Math.max(0, Math.trunc(Number(stack.count ?? 0))), 0);
}
