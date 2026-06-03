import type { Locale } from "@/lib/i18n/types";
import { unitTypeToEnglishLabel } from "@/lib/i18n/gameLabels";
import {
  SKILL_DEFINITIONS,
  type SkillId,
  type SkillLevel,
} from "./skills";

const pickTier = (level: SkillLevel, basic: string, advanced: string, expert: string) =>
  level === "basic" ? basic : level === "advanced" ? advanced : expert;
const tiered = (basic: string, advanced: string, expert: string, suffix: string) =>
  (level: SkillLevel) => `${pickTier(level, basic, advanced, expert)} ${suffix}`;
const flat = (text: string) => () => text;

// English mirror of SKILL_DEFINITIONS descriptions (FR source lives in skills.ts).
const SKILL_DESC_EN: Record<SkillId, (level: SkillLevel) => string> = {
  necromancy: flat("Resurrects a fraction of slain enemies as skeletons."),
  wisdom: flat("Allows learning higher-level spells."),
  fire_magic: flat("Improves spells of the fire school."),
  water_magic: flat("Improves spells of the water school."),
  earth_magic: flat("Improves spells of the earth school."),
  air_magic: flat("Improves spells of the air school."),
  tactics: flat("Allows repositioning units before combat."),
  logistics: tiered("+10%", "+20%", "+30%", "daily movement."),
  leadership: tiered("+1", "+2", "+3", "to morale in combat."),
  luck: tiered("+1", "+2", "+3", "to luck in combat."),
  scouting: tiered("+1", "+2", "+3", "vision range."),
  pathfinding: flat("Reduces the movement penalty on rough terrain."),
  archery: tiered("+10%", "+25%", "+50%", "damage for ranged units."),
  offense: tiered("+10%", "+20%", "+30%", "damage for melee units."),
  armorer: tiered("−5%", "−10%", "−15%", "damage taken."),
  ballistics: flat("Improves catapult accuracy."),
  artillery: flat("Lets you control the ballista and increases its damage."),
  sorcery: tiered("+5%", "+10%", "+15%", "spell damage."),
  mysticism: tiered("+1", "+2", "+3", "mana regenerated per day."),
  intelligence: tiered("+25%", "+50%", "+100%", "maximum mana."),
  eagle_eye: flat("Learns enemy spells cast in combat."),
  learning: tiered("+5%", "+10%", "+15%", "experience gained."),
  scholar: flat("Allows exchanging spells between adjacent heroes."),
  first_aid: flat("Improves the first aid tent."),
  navigation: tiered("+50%", "+100%", "+150%", "movement at sea."),
  estates: tiered("+125", "+250", "+500", "gold per day."),
  resistance: tiered("5%", "10%", "20%", "chance to ignore spells."),
  diplomacy: flat("Allows neutral armies to join or flee."),
};

export function localizedSkillLabel(id: string, frLabel: string, locale: Locale): string {
  return locale === "en" ? unitTypeToEnglishLabel(id) : frLabel;
}

export function localizedSkillDescription(id: SkillId, level: SkillLevel, locale: Locale): string {
  if (locale === "en") {
    const fn = SKILL_DESC_EN[id];
    if (fn) return fn(level);
  }
  return SKILL_DEFINITIONS.find((s) => s.id === id)?.description(level) ?? "";
}
