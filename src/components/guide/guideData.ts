import {
  BUILDING_RULES,
  FACTION_UNITS,
  FACTION_UPGRADED_UNITS,
  RESOURCE_BUILDING_RULES,
  getFactionBuildingRules,
  type ResourceCost,
} from "@/lib/game/economy";
import { getCreature } from "@/lib/game/creature-catalog";
import { getUnitSpritePath } from "@/lib/rendering/phaser/assets";
import { getTownBuildingSprite } from "@/lib/game/town-building-sprites";
import { ADVENTURE_BUILDING_RULES } from "@/lib/game/adventure-buildings";
import { ARTIFACTS, ARTIFACT_CLASSES, type ArtifactClass, type ArtifactStatsBonus } from "@/lib/game/artifacts";
import { CREATURE_BANK_DEFINITIONS } from "@/lib/game/creature-banks";
import { HERO_ROSTER, CLASS_STARTING_STATS } from "@/lib/game/heroes";
import { SKILL_DEFINITIONS } from "@/lib/game/skills";
import { SPELLS, type SpellSchool, type SpellKind, type SpellContext } from "@/lib/game/spells";
import { localizeCreatureAbilities, localizeCreatureSpecial } from "@/lib/i18n/creatureAbilities";
import { BuildingType, Faction, HeroClass, type Resources } from "@/lib/game/types";
import { PLAYABLE_FACTIONS } from "@/lib/game/playable-factions";
import { FACTION_META } from "@/app/dashboard/factionMeta";

/**
 * Reference data for the guide, derived from the authoritative game rules so the
 * tables stay in sync with the actual balance. Anything purely descriptive (the
 * movement / terrain ladders documented in ADVENTURE_MOVEMENT_RULES.md) is mirrored
 * as static rows here with a pointer back to the doc.
 */

export type ResourceKey = keyof Resources;

export interface ResourceInfo {
  key: ResourceKey;
  label: string;
  sprite: string;
  kind: "Précieux" | "Commune" | "Rare";
  usage: string;
}

export const RESOURCE_INFO: ResourceInfo[] = [
  { key: "gold", label: "Or", sprite: "/assets/sprites/resources/gold.webp", kind: "Précieux", usage: "Tout : construire, recruter, acheter des héros. La ressource reine." },
  { key: "wood", label: "Bois", sprite: "/assets/sprites/resources/wood.webp", kind: "Commune", usage: "Bâtiments de base et premiers habitats. Toujours nécessaire tôt." },
  { key: "ore", label: "Minerai", sprite: "/assets/sprites/resources/ore.webp", kind: "Commune", usage: "Fortifications et habitats intermédiaires." },
  { key: "mercury", label: "Mercure", sprite: "/assets/sprites/resources/mercury.webp", kind: "Rare", usage: "Bâtiments magiques et créatures évoluées." },
  { key: "crystals", label: "Cristaux", sprite: "/assets/sprites/resources/crystals.webp", kind: "Rare", usage: "Habitats de haut palier et unités d’élite." },
  { key: "gems", label: "Gemmes", sprite: "/assets/sprites/resources/gems.webp", kind: "Rare", usage: "Magie avancée et créatures puissantes." },
  { key: "sulfur", label: "Soufre", sprite: "/assets/sprites/resources/sulfur.webp", kind: "Rare", usage: "Unités d’élite (palier 7) et bâtiments démoniaques." },
];

export const RESOURCE_BY_KEY = Object.fromEntries(RESOURCE_INFO.map((r) => [r.key, r])) as Record<ResourceKey, ResourceInfo>;

// --- Town buildings (generic ladder shared by every faction) -----------------

const DWELLING_TYPES = new Set<string>([
  BuildingType.DWELLING_1,
  BuildingType.DWELLING_2,
  BuildingType.DWELLING_3,
  BuildingType.DWELLING_4,
  BuildingType.DWELLING_5,
  BuildingType.DWELLING_6,
  BuildingType.DWELLING_7,
]);

export const CORE_BUILDINGS = BUILDING_RULES.filter((rule) => !DWELLING_TYPES.has(rule.type));
export const DWELLING_BUILDINGS = BUILDING_RULES.filter((rule) => DWELLING_TYPES.has(rule.type));

// --- Faction creature roster -------------------------------------------------

export interface RosterUnit {
  tier: number;
  baseLabel: string;
  baseSprite: string;
  upgradedLabel: string;
  upgradedSprite: string;
  attack: number;
  defense: number;
  health: number;
  speed: number;
  growth: number;
  ranged: boolean;
}

export function getFactionRoster(faction: Faction): RosterUnit[] {
  const base = FACTION_UNITS[faction];
  const upgraded = FACTION_UPGRADED_UNITS[faction];
  return base.map((unitType, index) => {
    const creature = getCreature(unitType);
    const upg = getCreature(upgraded[index]);
    return {
      tier: index + 1,
      baseLabel: creature.label,
      baseSprite: getUnitSpritePath(unitType),
      upgradedLabel: upg.label,
      upgradedSprite: getUnitSpritePath(upgraded[index]),
      attack: creature.attack,
      defense: creature.defense,
      health: creature.health,
      speed: creature.speed,
      growth: creature.growth,
      ranged: creature.ranged,
    };
  });
}

export interface GuideFaction {
  key: string;
  faction: Faction;
  label: string;
  color: string;
  emblem: string;
  alignment: "good" | "evil" | "barbarian";
  tagline: string;
  desc: string;
  townSprite: string;
  topUnitSprite: string;
  topUnitLabel: string;
}

export const GUIDE_FACTIONS: GuideFaction[] = PLAYABLE_FACTIONS.map((faction) => {
  const meta = FACTION_META[faction];
  const topType = FACTION_UNITS[faction][6];
  const top = getCreature(topType);
  return {
    key: faction,
    faction,
    label: meta.label,
    color: meta.color,
    emblem: meta.emblem,
    alignment: meta.alignment,
    tagline: meta.tagline,
    desc: meta.desc,
    townSprite: `/assets/sprites/map/town-${faction}.webp`,
    topUnitSprite: getUnitSpritePath(topType),
    topUnitLabel: top.label,
  };
});

export const ALIGNMENT_LABEL: Record<GuideFaction["alignment"], string> = {
  good: "Bien",
  evil: "Mal",
  barbarian: "Barbare",
};

// --- Adventure-map movement (mirrors ADVENTURE_MOVEMENT_RULES.md) -------------

export const TERRAIN_COSTS: Array<{ surface: string; cost: string; note?: string }> = [
  { surface: "Route pavée", cost: "50", note: "La plus rapide — privilégiez les routes" },
  { surface: "Route de gravier", cost: "65" },
  { surface: "Route de terre", cost: "75" },
  { surface: "Herbe / terre / eau / souterrain", cost: "100", note: "Coût de base" },
  { surface: "Terrain accidenté (badlands)", cost: "125" },
  { surface: "Sable / neige / forêt", cost: "150" },
  { surface: "Marais", cost: "175" },
  { surface: "Montagne", cost: "250", note: "Très coûteux" },
  { surface: "Lave / murs / décor bloquant", cost: "∞", note: "Infranchissable" },
];

export const MOVEMENT_BY_SPEED: Array<{ speed: string; pm: number }> = [
  { speed: "1", pm: 1360 },
  { speed: "3", pm: 1500 },
  { speed: "5", pm: 1630 },
  { speed: "7", pm: 1760 },
  { speed: "9", pm: 1900 },
  { speed: "11+", pm: 2000 },
];

// --- Combat actions ----------------------------------------------------------

export const COMBAT_ACTIONS: Array<{ name: string; icon: string; desc: string }> = [
  { name: "Déplacer", icon: "🦶", desc: "Avancer sur la grille hexagonale, dans la limite de la vitesse de l’unité." },
  { name: "Attaquer (corps-à-corps)", icon: "⚔️", desc: "Frapper une unité adjacente. La cible riposte une fois si elle survit." },
  { name: "Tirer (à distance)", icon: "🏹", desc: "Frapper à distance sans riposte. Munitions limitées ; tir réduit au corps-à-corps." },
  { name: "Défendre", icon: "🛡️", desc: "Passer son tour en réduisant les dégâts reçus. Utile pour temporiser." },
  { name: "Attendre", icon: "⏳", desc: "Repousser son action plus tard dans le round, pour réagir à l’ennemi." },
];

// --- Full creature stats (for the encyclopedia tables) -----------------------

export interface CreatureRow {
  type: string;
  label: string;
  sprite: string;
  faction: Faction;
  tier: number;
  upgraded: boolean;
  attack: number;
  defense: number;
  minDamage: number;
  maxDamage: number;
  health: number;
  speed: number;
  growth: number;
  goldCost: number;
  ranged: boolean;
  shots: number;
  abilities: string;
  special: string;
}

export function getCreatureRow(unitType: string, faction: Faction): CreatureRow {
  const c = getCreature(unitType);
  return {
    type: unitType,
    label: c.label,
    sprite: getUnitSpritePath(unitType),
    faction,
    tier: c.tier,
    upgraded: c.upgradeLevel > 0,
    attack: c.attack,
    defense: c.defense,
    minDamage: c.minDamage,
    maxDamage: c.maxDamage,
    health: c.health,
    speed: c.speed,
    growth: c.growth,
    goldCost: c.cost.gold ?? 0,
    ranged: c.ranged,
    shots: c.shots,
    abilities: localizeCreatureAbilities(c.abilities ?? [], "fr"),
    special: localizeCreatureSpecial(c.special ?? "", "fr"),
  };
}

/** Every recruitable creature of a faction (7 base + 7 upgraded), tier-ordered. */
export function getFactionCreatureRows(faction: Faction): CreatureRow[] {
  const rows: CreatureRow[] = [];
  FACTION_UNITS[faction].forEach((unit, tier) => {
    rows.push(getCreatureRow(unit, faction));
    rows.push(getCreatureRow(FACTION_UPGRADED_UNITS[faction][tier], faction));
  });
  return rows;
}

// --- Town buildings, per faction ---------------------------------------------

export interface FactionBuildingRow {
  type: string;
  label: string;
  description: string;
  category: "common" | "mage_guild" | "dwelling" | "dwelling_upgrade" | "unique";
  cost: ResourceCost;
  sprite?: string;
}

export function getFactionBuildingRows(faction: Faction): FactionBuildingRow[] {
  return getFactionBuildingRules(faction).map((rule) => ({
    type: rule.type,
    label: rule.label,
    description: rule.description,
    category: rule.category,
    cost: rule.cost,
    sprite: getTownBuildingSprite(rule, faction),
  }));
}

export const BUILDING_CATEGORY_LABEL: Record<FactionBuildingRow["category"], string> = {
  common: "Bâtiments communs",
  mage_guild: "Guilde des mages",
  dwelling: "Habitats (créatures)",
  dwelling_upgrade: "Habitats améliorés",
  unique: "Bâtiments uniques",
};

// --- Artifacts ---------------------------------------------------------------

export const ARTIFACT_CLASS_LABEL: Record<ArtifactClass, string> = {
  treasure: "Trésor",
  minor: "Mineur",
  major: "Majeur",
  relic: "Relique",
};

export const ARTIFACT_CLASS_COLOR: Record<ArtifactClass, string> = {
  treasure: "#a3a3a3",
  minor: "#60a5fa",
  major: "#a78bfa",
  relic: "#fbbf24",
};

export const ARTIFACT_CLASS_ORDER = ARTIFACT_CLASSES;

const BONUS_LABEL: Record<keyof ArtifactStatsBonus, string> = {
  attack: "Att",
  defense: "Déf",
  spellPower: "Pouv",
  knowledge: "Conn",
  morale: "Moral",
  luck: "Chance",
  movement: "Mvt",
  seaMovement: "Mvt mer",
};

export function formatArtifactBonus(bonus: ArtifactStatsBonus): string {
  const parts = (Object.entries(bonus) as Array<[keyof ArtifactStatsBonus, number | undefined]>)
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .map(([k, v]) => `${v! > 0 ? "+" : ""}${v} ${BONUS_LABEL[k]}`);
  return parts.join(", ");
}

export interface ArtifactRow {
  id: string;
  name: string;
  cls: ArtifactClass;
  sprite: string;
  bonus: string;
  extra?: string;
}

export const ARTIFACT_ROWS: ArtifactRow[] = ARTIFACTS.map((a) => ({
  id: a.id,
  name: a.name,
  cls: a.class,
  sprite: `/assets/sprites/artifacts/${a.id}.webp`,
  bonus: formatArtifactBonus(a.bonus),
  extra: a.unsupportedEffects?.join(" · "),
}));

// --- Map objects -------------------------------------------------------------

export interface ResourceBuildingRow {
  type: string;
  label: string;
  sprite: string;
  production: ResourceCost;
  guardian: number;
}

export const RESOURCE_BUILDING_ROWS: ResourceBuildingRow[] = RESOURCE_BUILDING_RULES.map((rule) => ({
  type: rule.type,
  label: rule.label,
  sprite: `/assets/sprites/map/${rule.type.replace(/_/g, "-")}.webp`,
  production: rule.production,
  guardian: rule.guardianBasePower,
}));

export interface AdventureBuildingRow {
  type: string;
  label: string;
  description: string;
  sprite: string;
}

export const ADVENTURE_BUILDING_ROWS: AdventureBuildingRow[] = Object.values(ADVENTURE_BUILDING_RULES).map((rule) => ({
  type: rule.type,
  label: rule.label,
  description: rule.description,
  sprite: `/assets/sprites/map/adventure-${rule.type.replace(/_/g, "-")}.webp`,
}));

// --- Heroes ------------------------------------------------------------------

export const HERO_CLASS_LABEL: Record<HeroClass, string> = {
  [HeroClass.KNIGHT]: "Chevalier",
  [HeroClass.CLERIC]: "Clerc",
  [HeroClass.RANGER]: "Rôdeur",
  [HeroClass.DRUID]: "Druide",
  [HeroClass.ALCHEMIST]: "Alchimiste",
  [HeroClass.WIZARD]: "Magicien",
  [HeroClass.DEMONIAC]: "Démoniste",
  [HeroClass.HERETIC]: "Hérétique",
  [HeroClass.DEATH_KNIGHT]: "Chevalier de la mort",
  [HeroClass.NECROMANCER]: "Nécromancien",
  [HeroClass.OVERLORD]: "Seigneur souterrain",
  [HeroClass.WARLOCK]: "Sorcier",
  [HeroClass.BARBARIAN]: "Barbare",
  [HeroClass.BATTLE_MAGE]: "Mage de guerre",
  [HeroClass.BEASTMASTER]: "Maître des bêtes",
  [HeroClass.WITCH]: "Sorcière",
  [HeroClass.CHANNELER]: "Canaliseur",
  [HeroClass.ELEMENTALIST]: "Élémentaliste",
};

export interface HeroRow {
  id: string;
  name: string;
  className: string;
  specialty: string;
}

export function getFactionHeroes(faction: Faction): HeroRow[] {
  return HERO_ROSTER.filter((hero) => hero.faction === faction).map((hero) => ({
    id: hero.id,
    name: hero.name,
    className: HERO_CLASS_LABEL[hero.class] ?? hero.class,
    specialty: hero.specialty,
  }));
}

/** The two hero classes available to each faction, with their starting stats. */
export function getFactionClasses(faction: Faction): Array<{ className: string; stats: typeof CLASS_STARTING_STATS[HeroClass] }> {
  const classes = Array.from(new Set(HERO_ROSTER.filter((h) => h.faction === faction).map((h) => h.class)));
  return classes.map((c) => ({ className: HERO_CLASS_LABEL[c] ?? c, stats: CLASS_STARTING_STATS[c] }));
}

// --- Skills ------------------------------------------------------------------

export interface SkillRow {
  id: string;
  label: string;
  basic: string;
  advanced: string;
  expert: string;
  /** True when the three tiers share the same text (no graduated effect). */
  flat: boolean;
}

export const SKILL_ROWS: SkillRow[] = SKILL_DEFINITIONS.map((skill) => {
  const basic = skill.description("basic");
  const advanced = skill.description("advanced");
  const expert = skill.description("expert");
  return { id: skill.id, label: skill.label, basic, advanced, expert, flat: basic === advanced && advanced === expert };
});

// --- Spells ------------------------------------------------------------------

export const SPELL_SCHOOL_LABEL: Record<SpellSchool, string> = {
  air: "Air",
  earth: "Terre",
  fire: "Feu",
  water: "Eau",
  all: "Toutes",
};

export const SPELL_SCHOOL_COLOR: Record<SpellSchool, string> = {
  air: "#7dd3fc",
  earth: "#84cc16",
  fire: "#fb7185",
  water: "#60a5fa",
  all: "#fbbf24",
};

/** Filter order: neutral first, then the four elemental schools. */
export const SPELL_SCHOOL_ORDER: SpellSchool[] = ["all", "air", "earth", "fire", "water"];

export const SPELL_KIND_LABEL: Record<SpellKind, string> = {
  damage: "Dégâts",
  buff: "Amélioration",
  debuff: "Affaiblissement",
  utility: "Utilitaire",
};

export const SPELL_CONTEXT_LABEL: Record<SpellContext, string> = {
  combat: "Combat",
  adventure: "Aventure",
};

export interface SpellRow {
  id: string;
  label: string;
  school: SpellSchool;
  schoolLabel: string;
  schoolColor: string;
  level: number;
  kind: SpellKind;
  kindLabel: string;
  context: SpellContext;
  contextLabel: string;
  costStandard: number;
  costExpert: number;
  effect: string;
  damage?: string;
}

export const SPELL_ROWS: SpellRow[] = SPELLS.map((spell) => ({
  id: spell.id,
  label: spell.label,
  school: spell.school,
  schoolLabel: SPELL_SCHOOL_LABEL[spell.school],
  schoolColor: SPELL_SCHOOL_COLOR[spell.school],
  level: spell.level,
  kind: spell.kind,
  kindLabel: SPELL_KIND_LABEL[spell.kind],
  context: spell.context,
  contextLabel: SPELL_CONTEXT_LABEL[spell.context],
  costStandard: spell.cost.standard,
  costExpert: spell.cost.expert,
  effect: spell.effect,
  damage: spell.damage
    ? `${spell.damage.base.join(" / ")}${spell.damage.multiplier > 0 ? ` (+${spell.damage.multiplier} × Pouv)` : ""}`
    : undefined,
}));

// --- Creature banks (guarded treasure sites) ---------------------------------

export interface CreatureBankRow {
  type: string;
  label: string;
  description: string;
  guardMin: number;
  guardMax: number;
  rewards: string;
}

const REWARD_FLAGS: Array<{ key: "gold" | "resources" | "experience" | "artifactTokens" | "creatures"; label: string }> = [
  { key: "gold", label: "Or" },
  { key: "resources", label: "Ressources" },
  { key: "artifactTokens", label: "Artefacts" },
  { key: "creatures", label: "Créatures" },
  { key: "experience", label: "Expérience" },
];

export const CREATURE_BANK_ROWS: CreatureBankRow[] = Object.values(CREATURE_BANK_DEFINITIONS)
  .map((bank) => {
    const guards = bank.variants.map((v) => v.guardPower);
    const present = new Set<string>();
    for (const variant of bank.variants) {
      for (const flag of REWARD_FLAGS) {
        const value = variant.reward[flag.key];
        if (Array.isArray(value) ? value.length > 0 : Boolean(value)) present.add(flag.label);
      }
    }
    return {
      type: bank.type,
      label: bank.label,
      description: bank.description,
      guardMin: Math.min(...guards),
      guardMax: Math.max(...guards),
      rewards: REWARD_FLAGS.filter((f) => present.has(f.label)).map((f) => f.label).join(", "),
    };
  })
  .sort((a, b) => a.guardMin - b.guardMin);

// --- Artifact combinations ---------------------------------------------------

export const ARTIFACT_COMBO_LABEL: Record<string, string> = {
  angelic_alliance: "Alliance angélique",
  armor_of_the_damned: "Armure des damnés",
  power_of_the_dragon_father: "Puissance du Père des dragons",
  titans_thunder: "Foudre des Titans",
};

export interface ArtifactComboGroup {
  id: string;
  label: string;
  members: Array<{ id: string; name: string; sprite: string }>;
}

export const ARTIFACT_COMBOS: ArtifactComboGroup[] = (() => {
  const groups = new Map<string, ArtifactComboGroup>();
  for (const a of ARTIFACTS) {
    if (!a.combo) continue;
    if (!groups.has(a.combo)) {
      groups.set(a.combo, { id: a.combo, label: ARTIFACT_COMBO_LABEL[a.combo] ?? a.combo, members: [] });
    }
    groups.get(a.combo)!.members.push({ id: a.id, name: a.name, sprite: `/assets/sprites/artifacts/${a.id}.webp` });
  }
  return Array.from(groups.values());
})();

// --- Cross-wiki search index -------------------------------------------------

export interface SearchEntry {
  label: string;
  kind: string;
  sub: string;
  sprite?: string;
  href: string;
}

export const SEARCH_INDEX: SearchEntry[] = (() => {
  const entries: SearchEntry[] = [];
  const seenCreatures = new Set<string>();
  for (const faction of PLAYABLE_FACTIONS) {
    for (const row of getFactionCreatureRows(faction)) {
      if (seenCreatures.has(row.type)) continue;
      seenCreatures.add(row.type);
      entries.push({
        label: row.label,
        kind: "Créature",
        sub: `${FACTION_META[faction]?.label ?? faction} · palier ${row.tier}`,
        sprite: row.sprite,
        href: "/guide/creatures",
      });
    }
  }
  for (const a of ARTIFACT_ROWS) {
    entries.push({ label: a.name, kind: "Artefact", sub: ARTIFACT_CLASS_LABEL[a.cls], sprite: a.sprite, href: "/guide/artefacts" });
  }
  for (const s of SPELL_ROWS) {
    entries.push({ label: s.label, kind: "Sort", sub: `${s.schoolLabel} · niv. ${s.level}`, href: "/guide/sorts" });
  }
  for (const s of SKILL_ROWS) {
    entries.push({ label: s.label, kind: "Compétence", sub: s.basic, href: "/guide/competences" });
  }
  return entries;
})();
