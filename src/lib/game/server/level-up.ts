import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { computeHeroLevel, generateSkillChoices, type HeroSkills, type SkillId } from "@/lib/game/skills";

export type PendingSkillChoice = { level: number; options: SkillId[] };
export type PendingSkillChoicesMap = Record<string, PendingSkillChoice[]>;

export async function applyHeroExperienceGain(
  supabase: SupabaseAdmin,
  gameId: string,
  heroId: string,
  newExperience: number,
) {
  let hero: { level?: number | null; skills?: HeroSkills | null } | null = null;
  const withSkills = await supabase
    .from("heroes")
    .select("level,skills")
    .eq("id", heroId)
    .maybeSingle();
  if (withSkills.error) {
    const fallback = await supabase.from("heroes").select("level").eq("id", heroId).maybeSingle();
    hero = fallback.data as { level?: number | null } | null;
  } else {
    hero = withSkills.data as { level?: number | null; skills?: HeroSkills | null } | null;
  }
  if (!hero) return;

  const oldLevel = Number(hero.level ?? 1);
  const newLevel = computeHeroLevel(newExperience);
  const skills = ((hero.skills ?? {}) as HeroSkills);

  if (newLevel <= oldLevel) {
    await supabase.from("heroes").update({ experience: newExperience }).eq("id", heroId);
    return;
  }

  await supabase.from("heroes").update({ experience: newExperience, level: newLevel }).eq("id", heroId);

  const { data: game } = await supabase.from("games").select("map_state").eq("id", gameId).maybeSingle();
  const mapState = (game?.map_state as Record<string, unknown> | undefined) ?? {};
  const pending = ((mapState.pendingSkillChoices as PendingSkillChoicesMap | undefined) ?? {});
  const heroPending = [...(pending[heroId] ?? [])];
  const bannedNewSkills = new Set<SkillId>(
    heroPending.flatMap((entry) => entry.options).filter((id) => !skills[id])
  );

  for (let level = oldLevel + 1; level <= newLevel; level++) {
    const options = generateSkillChoices(skills, `${gameId}:${heroId}:level:${level}`, bannedNewSkills);
    if (options.length === 0) continue;
    heroPending.push({ level, options });
    for (const id of options) {
      if (!skills[id]) bannedNewSkills.add(id);
    }
  }

  await supabase.from("games").update({
    map_state: { ...mapState, pendingSkillChoices: { ...pending, [heroId]: heroPending } },
  }).eq("id", gameId);
}
