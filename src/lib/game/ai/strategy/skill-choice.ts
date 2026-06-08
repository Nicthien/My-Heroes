import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { sanitizePendingSkillEntry, type HeroSkills, type SkillId } from "@/lib/game/skills";
import type { AiContext, AiHero } from "../types";
import type { AiPersonality } from "./personality";
import { getPersonalityProfile } from "./personality";

const COMBAT_SKILLS: SkillId[] = ["offense", "armorer", "tactics", "leadership", "luck", "archery", "first_aid"];
const ECONOMY_SKILLS: SkillId[] = ["estates", "logistics", "scouting", "pathfinding", "navigation"];
const MAGIC_SKILLS: SkillId[] = [
  "wisdom",
  "fire_magic",
  "water_magic",
  "earth_magic",
  "air_magic",
  "sorcery",
  "mysticism",
  "intelligence",
];
const UTILITY_SKILLS: SkillId[] = ["eagle_eye", "learning", "scholar", "ballistics", "artillery", "resistance", "diplomacy", "necromancy"];

export async function consumePendingSkillChoices(
  supabase: SupabaseAdmin,
  context: AiContext,
) {
  const mapState = context.mapState ?? {};
  const pendingMap = (mapState.pendingSkillChoices as Record<string, Array<{ level: number; options: SkillId[] }>> | undefined) ?? {};
  if (Object.keys(pendingMap).length === 0) return;
  const heroes = context.player.heroes ?? [];
  const personality = context.personality;
  let nextMap = { ...pendingMap };
  let changed = false;
  for (const hero of heroes) {
    const pending = nextMap[hero.id];
    if (!pending || pending.length === 0) continue;
    const heroSkillsRow = await supabase.from("heroes").select("skills,hero_class").eq("id", hero.id).maybeSingle();
    let currentSkills = ((heroSkillsRow.data?.skills ?? {}) as HeroSkills);
    const heroClass = (heroSkillsRow.data?.hero_class ?? undefined) as string | undefined;
    let remainingForHero = pending;
    for (const entry of pending) {
      // Drop options forbidden for this class before the AI commits to one (handles
      // pending choices generated before class-based bans existed).
      const sanitized = sanitizePendingSkillEntry(entry, currentSkills, heroClass, `${context.game.id}:${hero.id}:level:${entry.level}`);
      const choice = pickSkill(sanitized.options, currentSkills, personality, hero);
      if (!choice) continue;
      const current = currentSkills[choice];
      const nextLevel: "basic" | "advanced" | "expert" =
        current === "expert" ? "expert" : current === "advanced" ? "expert" : current === "basic" ? "advanced" : "basic";
      currentSkills = { ...currentSkills, [choice]: nextLevel };
      await supabase.from("heroes").update({ skills: currentSkills }).eq("id", hero.id);
      remainingForHero = remainingForHero.filter((p) => p.level !== entry.level);
      changed = true;
    }
    if (remainingForHero.length > 0) nextMap[hero.id] = remainingForHero;
    else {
      const { [hero.id]: _drop, ...rest } = nextMap;
      void _drop;
      nextMap = rest;
    }
  }
  if (changed) {
    const finalMapState = { ...mapState, pendingSkillChoices: nextMap };
    await supabase.from("games").update({ map_state: finalMapState }).eq("id", context.game.id);
    context.mapState = finalMapState;
  }
}

function pickSkill(
  options: SkillId[],
  current: HeroSkills,
  personality: AiPersonality,
  hero: AiHero,
): SkillId | null {
  if (!options || options.length === 0) return null;
  const profile = getPersonalityProfile(personality);
  const isChampion = hero.armies && hero.armies.length > 0;
  let best: { id: SkillId; score: number } | null = null;
  for (const id of options) {
    const tierBonus = current[id] === "basic" ? 1.3 : current[id] === "advanced" ? 1.5 : 1;
    let categoryScore = 1;
    if (COMBAT_SKILLS.includes(id)) categoryScore = profile.skillPreference.combat;
    else if (ECONOMY_SKILLS.includes(id)) categoryScore = profile.skillPreference.economy;
    else if (MAGIC_SKILLS.includes(id)) categoryScore = profile.skillPreference.magic;
    else if (UTILITY_SKILLS.includes(id)) categoryScore = profile.skillPreference.utility;
    // Boost combat skills pour un héros lourd en armée.
    if (isChampion && COMBAT_SKILLS.includes(id)) categoryScore *= 1.2;
    const score = categoryScore * tierBonus;
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id ?? options[0];
}
