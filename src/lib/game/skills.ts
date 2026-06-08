import { HeroClass } from "./types";

export type SkillLevel = "basic" | "advanced" | "expert";
export const SKILL_LEVEL_VALUES: Record<SkillLevel, number> = { basic: 1, advanced: 2, expert: 3 };

export type SkillId =
  | "necromancy"
  | "wisdom"
  | "fire_magic"
  | "water_magic"
  | "earth_magic"
  | "air_magic"
  | "tactics"
  | "logistics"
  | "leadership"
  | "luck"
  | "scouting"
  | "pathfinding"
  | "archery"
  | "offense"
  | "armorer"
  | "ballistics"
  | "artillery"
  | "sorcery"
  | "mysticism"
  | "intelligence"
  | "eagle_eye"
  | "learning"
  | "scholar"
  | "first_aid"
  | "navigation"
  | "estates"
  | "resistance"
  | "diplomacy";

export interface SkillDefinition {
  id: SkillId;
  label: string;
  description: (level: SkillLevel) => string;
}

const pickTier = (level: SkillLevel, basic: string, advanced: string, expert: string) =>
  level === "basic" ? basic : level === "advanced" ? advanced : expert;
const tiered = (basic: string, advanced: string, expert: string, suffix: string) =>
  (level: SkillLevel) => `${pickTier(level, basic, advanced, expert)} ${suffix}`;
const flat = (text: string) => () => text;

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  { id: "necromancy", label: "Nécromancie", description: flat("Ressuscite une fraction des ennemis tués comme squelettes.") },
  { id: "wisdom", label: "Sagesse", description: flat("Permet d'apprendre les sorts de plus haut niveau.") },
  { id: "fire_magic", label: "Magie du feu", description: flat("Améliore les sorts de l'école du feu.") },
  { id: "water_magic", label: "Magie de l'eau", description: flat("Améliore les sorts de l'école de l'eau.") },
  { id: "earth_magic", label: "Magie de la terre", description: flat("Améliore les sorts de l'école de la terre.") },
  { id: "air_magic", label: "Magie de l'air", description: flat("Améliore les sorts de l'école de l'air.") },
  { id: "tactics", label: "Tactique", description: flat("Permet de repositionner les unités avant le combat.") },
  { id: "logistics", label: "Logistique", description: tiered("+10%", "+20%", "+30%", "de mouvement quotidien.") },
  { id: "leadership", label: "Commandement", description: tiered("+1", "+2", "+3", "au moral en combat.") },
  { id: "luck", label: "Chance", description: tiered("+1", "+2", "+3", "à la chance en combat.") },
  { id: "scouting", label: "Reconnaissance", description: tiered("+1", "+2", "+3", "portée de vision.") },
  { id: "pathfinding", label: "Orientation", description: flat("Réduit le malus de mouvement sur terrain rude.") },
  { id: "archery", label: "Tir à l'arc", description: tiered("+10%", "+25%", "+50%", "de dégâts pour les unités à distance.") },
  { id: "offense", label: "Attaque", description: tiered("+10%", "+20%", "+30%", "de dégâts pour les unités au corps à corps.") },
  { id: "armorer", label: "Armurerie", description: tiered("−5%", "−10%", "−15%", "de dégâts subis.") },
  { id: "ballistics", label: "Balistique", description: flat("Améliore la précision de la catapulte.") },
  { id: "artillery", label: "Artillerie", description: flat("Permet de contrôler la baliste et augmente ses dégâts.") },
  { id: "sorcery", label: "Magie", description: tiered("+5%", "+10%", "+15%", "de dégâts des sorts.") },
  { id: "mysticism", label: "Mysticisme", description: tiered("+1", "+2", "+3", "mana régénéré par jour.") },
  { id: "intelligence", label: "Intelligence", description: tiered("+25%", "+50%", "+100%", "de mana maximum.") },
  { id: "eagle_eye", label: "Œil d'aigle", description: flat("Apprend les sorts adverses lancés en combat.") },
  { id: "learning", label: "Apprentissage", description: tiered("+5%", "+10%", "+15%", "d'expérience gagnée.") },
  { id: "scholar", label: "Érudit", description: flat("Permet d'échanger des sorts entre héros adjacents.") },
  { id: "first_aid", label: "Premiers secours", description: flat("Améliore la tente de soins.") },
  { id: "navigation", label: "Navigation", description: tiered("+50%", "+100%", "+150%", "de mouvement en mer.") },
  { id: "estates", label: "Domaines", description: tiered("+125", "+250", "+500", "or par jour.") },
  { id: "resistance", label: "Résistance", description: tiered("5%", "10%", "20%", "de chance d'ignorer les sorts.") },
  { id: "diplomacy", label: "Diplomatie", description: flat("Permet aux armées neutres de se joindre ou s'enfuir.") },
];

// HoMM3 secondary-skill availability. Each hero class has a set of skills it can
// NEVER be offered on level-up (probability 0 in the original game). Necromancy is the
// headline one — only the two Necropolis classes (Death Knight, Necromancer) can learn
// it. The rest are the canonical class-specific zeros: Fire/Water Magic, Navigation,
// and the asymmetric Necropolis bans (First Aid / Leadership / Estates). A banned skill
// only blocks being offered it as a NEW skill — an already-known skill (gained from a
// witch hut, university, scholar, event, etc.) can still be upgraded, matching HoMM3.
// Source: heroes.thelazy.net secondary-skill probability tables (RoE/Complete/HD).
export const CLASS_FORBIDDEN_SKILLS: Record<HeroClass, SkillId[]> = {
  [HeroClass.KNIGHT]: ["necromancy"],
  [HeroClass.CLERIC]: ["necromancy"],
  [HeroClass.RANGER]: ["necromancy", "fire_magic"],
  [HeroClass.DRUID]: ["necromancy"],
  [HeroClass.ALCHEMIST]: ["necromancy"],
  [HeroClass.WIZARD]: ["necromancy"],
  [HeroClass.DEMONIAC]: ["necromancy"],
  [HeroClass.HERETIC]: ["necromancy"],
  [HeroClass.DEATH_KNIGHT]: ["first_aid", "estates"],
  [HeroClass.NECROMANCER]: ["first_aid", "leadership"],
  [HeroClass.OVERLORD]: ["necromancy", "water_magic"],
  [HeroClass.WARLOCK]: ["necromancy"],
  [HeroClass.BARBARIAN]: ["necromancy", "water_magic"],
  [HeroClass.BATTLE_MAGE]: ["necromancy", "navigation"],
  [HeroClass.BEASTMASTER]: ["necromancy", "fire_magic"],
  [HeroClass.WITCH]: ["necromancy"],
  [HeroClass.PLANESWALKER]: ["necromancy"],
  [HeroClass.ELEMENTALIST]: ["necromancy"],
};

// Skills this hero class can never be offered as NEW skills on level-up.
export function getForbiddenNewSkills(heroClass: HeroClass | string | null | undefined): Set<SkillId> {
  if (!heroClass) return new Set();
  return new Set(CLASS_FORBIDDEN_SKILLS[heroClass as HeroClass] ?? []);
}

// Repair a pending skill-choice entry generated before class-based bans existed: if any
// stored option is now forbidden for this class, deterministically regenerate the entry
// from the same seed so an already-running game stops offering e.g. Necromancy to a
// non-Necropolis hero. Both the display path and the LEARN_SKILL validation call this
// with identical inputs, so the offered and accepted option sets always match.
export function sanitizePendingSkillEntry(
  entry: { level: number; options: SkillId[] },
  currentSkills: HeroSkills,
  heroClass: HeroClass | string | null | undefined,
  seed: string,
): { level: number; options: SkillId[] } {
  const forbidden = getForbiddenNewSkills(heroClass);
  if (forbidden.size === 0 || !entry.options.some((id) => forbidden.has(id))) return entry;
  const options = generateSkillChoices(currentSkills, seed, undefined, heroClass);
  return {
    ...entry,
    options: options.length > 0 ? options : entry.options.filter((id) => !forbidden.has(id)),
  };
}

export type HeroSkills = Partial<Record<SkillId, SkillLevel>>;

export function getSkillLevel(skills: HeroSkills | null | undefined, id: SkillId): SkillLevel | null {
  return skills?.[id] ?? null;
}

export function getSkillLevelValue(skills: HeroSkills | null | undefined, id: SkillId): number {
  const lvl = getSkillLevel(skills, id);
  return lvl ? SKILL_LEVEL_VALUES[lvl] : 0;
}

export function setSkillLevel(skills: HeroSkills | null | undefined, id: SkillId, level: SkillLevel): HeroSkills {
  return { ...(skills ?? {}), [id]: level };
}

export function upgradeSkill(skills: HeroSkills | null | undefined, id: SkillId): HeroSkills {
  const current = getSkillLevel(skills, id);
  if (current === "expert") return skills ?? {};
  const next: SkillLevel = current === "advanced" ? "expert" : current === "basic" ? "advanced" : "basic";
  return setSkillLevel(skills, id, next);
}

export function countSkills(skills: HeroSkills | null | undefined): number {
  return Object.keys(skills ?? {}).length;
}

export function countSkillLevels(skills: HeroSkills | null | undefined): number {
  return Object.values(skills ?? {}).reduce((total, level) => total + (level ? SKILL_LEVEL_VALUES[level] ?? 0 : 0), 0);
}

export const MAX_HERO_SKILLS = 8;

// XP thresholds (cumulative XP required to reach level N).
// level 1 → 0, level 2 → 1000, level 3 → 2000, ... up to 30.
export const HERO_LEVEL_XP_THRESHOLDS: number[] = (() => {
  const arr: number[] = [0, 1000];
  for (let n = 3; n <= 50; n++) {
    const previous = arr[n - 2];
    const delta = Math.max(1000, Math.floor(previous / 3));
    arr.push(previous + delta);
  }
  return arr;
})();

export function computeHeroLevel(experience: number): number {
  const xp = Math.max(0, Math.floor(experience));
  let level = 1;
  for (let i = 1; i < HERO_LEVEL_XP_THRESHOLDS.length; i++) {
    if (xp >= HERO_LEVEL_XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

// On level-up, choose 2 skill candidates: prefer 1 to upgrade existing + 1 new, else fallback random.
export function generateSkillChoices(
  currentSkills: HeroSkills,
  seed: string,
  bannedFromNew?: Set<SkillId>,
  heroClass?: HeroClass | string | null,
): SkillId[] {
  const upgradable = (Object.keys(currentSkills) as SkillId[]).filter((s) => currentSkills[s] !== "expert");
  const known = new Set(Object.keys(currentSkills) as SkillId[]);
  const slotsLeft = Object.keys(currentSkills).length < MAX_HERO_SKILLS;
  // Merge caller-supplied bans (e.g. dedup across pending level-ups) with the class's
  // HoMM3 forbidden skills, so a banned skill can never be offered as a new candidate.
  const banned = new Set<SkillId>(bannedFromNew ?? []);
  for (const id of getForbiddenNewSkills(heroClass)) banned.add(id);
  const newCandidates = SKILL_DEFINITIONS
    .map((s) => s.id)
    .filter((id) => !known.has(id) && !banned.has(id));

  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const rng = (() => { let s = Math.abs(hash) | 1; return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) / 0xffffffff); }; })();
  const pickFrom = <T>(arr: T[]): T | null => arr.length === 0 ? null : arr[Math.floor(rng() * arr.length)];

  const choices: SkillId[] = [];
  if (upgradable.length > 0) {
    const upgrade = pickFrom(upgradable);
    if (upgrade) choices.push(upgrade);
  }
  if (slotsLeft) {
    const fresh = pickFrom(newCandidates.filter((id) => !choices.includes(id)));
    if (fresh) choices.push(fresh);
  }
  while (choices.length < 2) {
    const pool = [...upgradable, ...(slotsLeft ? newCandidates : [])].filter((id) => !choices.includes(id));
    const extra = pickFrom(pool);
    if (!extra) break;
    choices.push(extra);
  }
  return choices;
}

export function getNecromancyPercent(skills: HeroSkills | null | undefined, amplificationBonus = 0): number {
  const base = getSkillLevelValue(skills, "necromancy") * 10; // 10/20/30
  return Math.min(50, base + amplificationBonus);
}

export function getLogisticsPercent(skills: HeroSkills | null | undefined): number {
  return getSkillLevelValue(skills, "logistics") * 10;
}

export function getNavigationPercent(skills: HeroSkills | null | undefined): number {
  return getSkillLevelValue(skills, "navigation") * 50;
}

export function getEstatesGold(skills: HeroSkills | null | undefined): number {
  const lvl = getSkillLevelValue(skills, "estates");
  return lvl === 1 ? 125 : lvl === 2 ? 250 : lvl === 3 ? 500 : 0;
}

export function getScoutingBonus(skills: HeroSkills | null | undefined): number {
  return getSkillLevelValue(skills, "scouting");
}

// Intelligence raises maximum spell points (HoMM3): Basic +25%, Advanced +50%, Expert +100%.
export function getIntelligencePercent(skills: HeroSkills | null | undefined): number {
  const lvl = getSkillLevelValue(skills, "intelligence");
  return lvl === 1 ? 25 : lvl === 2 ? 50 : lvl === 3 ? 100 : 0;
}

// Mysticism regenerates spell points each day (HoMM3): +1 / +2 / +3 per day.
export function getMysticismRegen(skills: HeroSkills | null | undefined): number {
  return getSkillLevelValue(skills, "mysticism");
}
