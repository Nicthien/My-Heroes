import { CREATURE_GROUPS, getCreature } from "@/lib/game/creature-catalog";
import { FACTION_UNITS } from "@/lib/game/economy";
import { HERO_ROSTER } from "@/lib/game/heroes";
import { Faction } from "@/lib/game/types";
import type { Locale } from "@/lib/i18n/types";

export type FactionAlignment = "good" | "evil" | "barbarian";

export const FACTION_META: Record<
  string,
  {
    label: string; labelEn: string;
    color: string; alignment: FactionAlignment;
    tagline: string; taglineEn: string;
    desc: string; descEn: string;
    emblem: string;
  }
> = {
  castle: {
    label: "Château",
    labelEn: "Castle",
    color: "#3b82f6",
    alignment: "good",
    emblem: "♔",
    tagline: "Nobles humains & créatures célestes",
    taglineEn: "Noble humans & celestial creatures",
    desc: "Piquiers, archers, griffons, croisés, cavaliers et anges combattent au nom de la lumière.",
    descEn: "Pikemen, archers, griffins, crusaders, cavaliers and angels fight in the name of light.",
  },
  rampart: {
    label: "Rempart",
    labelEn: "Rampart",
    color: "#22c55e",
    alignment: "good",
    emblem: "🌳",
    tagline: "Elfes, nains et dragons",
    taglineEn: "Elves, dwarves and dragons",
    desc: "Nains, elfes archers, pégases, druides, licornes et dragons d'or veillent sur la forêt.",
    descEn: "Dwarves, elven archers, pegasi, druids, unicorns and gold dragons watch over the forest.",
  },
  tower: {
    label: "Tour",
    labelEn: "Tower",
    color: "#8b5cf6",
    alignment: "good",
    emblem: "✦",
    tagline: "Créatures liées à la magie",
    taglineEn: "Magic-bound creatures",
    desc: "Gremlins, golems, mages, génies et titans : la science arcanique au service du bien.",
    descEn: "Gremlins, golems, mages, genies and titans: arcane science in the service of good.",
  },
  inferno: {
    label: "Hadès",
    labelEn: "Inferno",
    color: "#ef4444",
    alignment: "evil",
    emblem: "🔥",
    tagline: "La ville des démons et des diables",
    taglineEn: "The city of demons and devils",
    desc: "Lutins, gogs, cerbères, démons, magogs et diables surgis des Enfers.",
    descEn: "Imps, gogs, cerberi, demons, magogs and devils risen from the Inferno.",
  },
  necropolis: {
    label: "Nécropole",
    labelEn: "Necropolis",
    color: "#6b7280",
    alignment: "evil",
    emblem: "☠",
    tagline: "Morts-vivants et fantômes",
    taglineEn: "Undead and ghosts",
    desc: "Squelettes, zombies, fantômes, vampires, liches et dragons-os ressuscités.",
    descEn: "Skeletons, zombies, ghosts, vampires, liches and bone dragons risen anew.",
  },
  dungeon: {
    label: "Donjon",
    labelEn: "Dungeon",
    color: "#7c3aed",
    alignment: "evil",
    emblem: "✸",
    tagline: "Créatures maléfiques des profondeurs",
    taglineEn: "Evil creatures of the depths",
    desc: "Troglodytes, harpies, gorgones, minotaures, manticores et dragons noirs.",
    descEn: "Troglodytes, harpies, medusas, minotaurs, manticores and black dragons.",
  },
  stronghold: {
    label: "Bastion",
    labelEn: "Stronghold",
    color: "#f97316",
    alignment: "barbarian",
    emblem: "⚔",
    tagline: "Adeptes de la force brute",
    taglineEn: "Masters of brute force",
    desc: "Gobelins, orcs, ogres, rocs, cyclopes et puissants béhémoths.",
    descEn: "Goblins, orcs, ogres, rocs, cyclopes and mighty behemoths.",
  },
  fortress: {
    label: "Forteresse",
    labelEn: "Fortress",
    color: "#059669",
    alignment: "barbarian",
    emblem: "🐍",
    tagline: "Poison, marécages et écailles",
    taglineEn: "Poison, swamps and scales",
    desc: "Gnolls, hommes-lézards, mouches dragons, basilics, gorgones et hydres venimeuses.",
    descEn: "Gnolls, lizardmen, dragon flies, basilisks, gorgons and venomous hydras.",
  },
};

export const ALIGNMENT_GROUPS: { key: FactionAlignment; label: string; labelEn: string; accent: string }[] = [
  { key: "good", label: "Les bons", labelEn: "The good", accent: "text-sky-200" },
  { key: "evil", label: "Les mauvais", labelEn: "The evil", accent: "text-rose-200" },
  { key: "barbarian", label: "Les barbares", labelEn: "The barbarians", accent: "text-orange-200" },
];

export const FACTION_FIRST_UNIT: Record<string, string | undefined> = Object.fromEntries(
  CREATURE_GROUPS.map((group) => [group.key, group.units[0]]),
);

export function factionLabel(faction: string, locale: Locale = "fr") {
  const meta = FACTION_META[faction];
  if (!meta) return faction;
  return locale === "en" ? meta.labelEn : meta.label;
}

export interface FactionShowcaseCreature {
  type: string;
  label: string;
  tier: number;
  attack: number;
  health: number;
  sprite: string;
}

export interface FactionShowcase {
  townSprite: string;
  hero: { name: string; specialty: string; sprite: string } | null;
  creatures: FactionShowcaseCreature[];
}

// Indices (tiers) shown in the faction detail panel: low / mid / top.
const SHOWCASE_TIER_INDICES = [0, 3, 6] as const;

/**
 * Returns the data needed to render the faction detail panel: town sprite,
 * a representative hero, and 3 creatures (low / mid / top tier).
 */
export function getFactionShowcase(faction: string): FactionShowcase {
  const townSprite = `/assets/sprites/map/town-${faction}.webp`;

  const heroTemplate = HERO_ROSTER.find((hero) => hero.faction === (faction as Faction)) ?? null;
  const hero = heroTemplate
    ? {
        name: heroTemplate.name,
        specialty: heroTemplate.specialty,
        sprite: `/assets/sprites/heroes/${faction}/adventure.webp`,
      }
    : null;

  const tiers = FACTION_UNITS[faction as Faction] ?? FACTION_UNITS[Faction.CASTLE];
  const creatures: FactionShowcaseCreature[] = SHOWCASE_TIER_INDICES.map((index) => {
    const unitType = tiers[index];
    const creature = getCreature(unitType);
    return {
      type: unitType,
      label: creature.label,
      tier: creature.tier,
      attack: creature.attack,
      health: creature.health,
      sprite: `/assets/sprites/units/${unitType}.webp`,
    };
  });

  return { townSprite, hero, creatures };
}
