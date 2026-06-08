import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import { computeHeroLevel, generateSkillChoices, type HeroSkills, type SkillId } from "@/lib/game/skills";
import { rollPrimarySkillGain, type PrimaryStatKey } from "@/lib/game/heroes";
import { HeroClass } from "@/lib/game/types";

export type PendingSkillChoice = { level: number; options: SkillId[]; primaryGain?: PrimaryStatKey };
export type PendingSkillChoicesMap = Record<string, PendingSkillChoice[]>;

type HeroLevelRow = {
  level?: number | null;
  skills?: HeroSkills | null;
  hero_class?: string | null;
  attack?: number | null;
  defense?: number | null;
  spell_power?: number | null;
  knowledge?: number | null;
};

// Each rolled primary maps to its hero DB column.
const PRIMARY_STAT_COLUMN: Record<PrimaryStatKey, "attack" | "defense" | "spell_power" | "knowledge"> = {
  attack: "attack",
  defense: "defense",
  spellPower: "spell_power",
  knowledge: "knowledge",
};

export async function applyHeroExperienceGain(
  supabase: SupabaseAdmin,
  gameId: string,
  heroId: string,
  newExperience: number,
) {
  let hero: HeroLevelRow | null = null;
  const withSkills = await supabase
    .from("heroes")
    .select("level,skills,hero_class,attack,defense,spell_power,knowledge")
    .eq("id", heroId)
    .maybeSingle();
  if (withSkills.error) {
    const fallback = await supabase
      .from("heroes")
      .select("level,hero_class,attack,defense,spell_power,knowledge")
      .eq("id", heroId)
      .maybeSingle();
    hero = fallback.data as HeroLevelRow | null;
  } else {
    hero = withSkills.data as HeroLevelRow | null;
  }
  if (!hero) return;

  const oldLevel = Number(hero.level ?? 1);
  const newLevel = computeHeroLevel(newExperience);
  const skills = ((hero.skills ?? {}) as HeroSkills);

  if (newLevel <= oldLevel) {
    await supabase.from("heroes").update({ experience: newExperience }).eq("id", heroId);
    return;
  }

  // HoMM3: every level-up raises one primary skill, weighted by hero class. Roll the
  // gains for each level reached, accumulate the stat increments, and remember which
  // stat advanced at each level so the level-up panel can show it.
  const heroClass = (hero.hero_class ?? HeroClass.KNIGHT) as HeroClass;
  const primaryStats: Record<"attack" | "defense" | "spell_power" | "knowledge", number> = {
    attack: Number(hero.attack ?? 0),
    defense: Number(hero.defense ?? 0),
    spell_power: Number(hero.spell_power ?? 0),
    knowledge: Number(hero.knowledge ?? 0),
  };
  const primaryGainByLevel = new Map<number, PrimaryStatKey>();
  for (let level = oldLevel + 1; level <= newLevel; level++) {
    const gain = rollPrimarySkillGain(heroClass, `${gameId}:${heroId}:primary:${level}`);
    primaryGainByLevel.set(level, gain);
    primaryStats[PRIMARY_STAT_COLUMN[gain]] += 1;
  }

  await supabase
    .from("heroes")
    .update({ experience: newExperience, level: newLevel, ...primaryStats })
    .eq("id", heroId);

  const { data: game } = await supabase.from("games").select("map_state").eq("id", gameId).maybeSingle();
  const mapState = (game?.map_state as Record<string, unknown> | undefined) ?? {};
  const pending = ((mapState.pendingSkillChoices as PendingSkillChoicesMap | undefined) ?? {});
  const heroPending = [...(pending[heroId] ?? [])];
  const bannedNewSkills = new Set<SkillId>(
    heroPending.flatMap((entry) => entry.options).filter((id) => !skills[id])
  );

  for (let level = oldLevel + 1; level <= newLevel; level++) {
    const options = generateSkillChoices(skills, `${gameId}:${heroId}:level:${level}`, bannedNewSkills, heroClass);
    if (options.length === 0) continue;
    heroPending.push({ level, options, primaryGain: primaryGainByLevel.get(level) });
    for (const id of options) {
      if (!skills[id]) bannedNewSkills.add(id);
    }
  }

  await supabase.from("games").update({
    map_state: { ...mapState, pendingSkillChoices: { ...pending, [heroId]: heroPending } },
  }).eq("id", gameId);
}
