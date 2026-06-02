import { CREATURE_GROUPS, getCreature } from "@/lib/game/creature-catalog";
import { FACTION_UNITS } from "@/lib/game/economy";
import { HERO_ROSTER } from "@/lib/game/heroes";
import { Faction } from "@/lib/game/types";

export type FactionAlignment = "good" | "evil" | "barbarian";

export const FACTION_META: Record<
  string,
  { label: string; color: string; alignment: FactionAlignment; tagline: string; desc: string; emblem: string }
> = {
  castle: {
    label: "Château",
    color: "#3b82f6",
    alignment: "good",
    emblem: "♔",
    tagline: "Nobles humains & créatures célestes",
    desc: "Piquiers, archers, griffons, croisés, cavaliers et anges combattent au nom de la lumière.",
  },
  rampart: {
    label: "Rempart",
    color: "#22c55e",
    alignment: "good",
    emblem: "🌳",
    tagline: "Elfes, nains et dragons",
    desc: "Nains, elfes archers, pégases, druides, licornes et dragons d'or veillent sur la forêt.",
  },
  tower: {
    label: "Tour",
    color: "#8b5cf6",
    alignment: "good",
    emblem: "✦",
    tagline: "Créatures liées à la magie",
    desc: "Gremlins, golems, mages, génies et titans : la science arcanique au service du bien.",
  },
  inferno: {
    label: "Hadès",
    color: "#ef4444",
    alignment: "evil",
    emblem: "🔥",
    tagline: "La ville des démons et des diables",
    desc: "Lutins, gogs, cerbères, démons, magogs et diables surgis des Enfers.",
  },
  necropolis: {
    label: "Nécropole",
    color: "#6b7280",
    alignment: "evil",
    emblem: "☠",
    tagline: "Morts-vivants et fantômes",
    desc: "Squelettes, zombies, fantômes, vampires, liches et dragons-os ressuscités.",
  },
  dungeon: {
    label: "Donjon",
    color: "#7c3aed",
    alignment: "evil",
    emblem: "✸",
    tagline: "Créatures maléfiques des profondeurs",
    desc: "Troglodytes, harpies, gorgones, minotaures, manticores et dragons noirs.",
  },
  stronghold: {
    label: "Bastion",
    color: "#f97316",
    alignment: "barbarian",
    emblem: "⚔",
    tagline: "Adeptes de la force brute",
    desc: "Gobelins, orcs, ogres, rocs, cyclopes et puissants béhémoths.",
  },
  fortress: {
    label: "Forteresse",
    color: "#059669",
    alignment: "barbarian",
    emblem: "🐍",
    tagline: "Poison, marécages et écailles",
    desc: "Gnolls, hommes-lézards, mouches dragons, basilics, gorgones et hydres venimeuses.",
  },
};

export const ALIGNMENT_GROUPS: { key: FactionAlignment; label: string; accent: string }[] = [
  { key: "good", label: "Les bons", accent: "text-sky-200" },
  { key: "evil", label: "Les mauvais", accent: "text-rose-200" },
  { key: "barbarian", label: "Les barbares", accent: "text-orange-200" },
];

export const FACTION_FIRST_UNIT: Record<string, string | undefined> = Object.fromEntries(
  CREATURE_GROUPS.map((group) => [group.key, group.units[0]]),
);

export function factionLabel(faction: string) {
  return FACTION_META[faction]?.label ?? faction;
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
