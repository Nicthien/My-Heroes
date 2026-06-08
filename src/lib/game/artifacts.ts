import type { Hero, HeroArtifactBag, HeroStats } from "./types";
import { hashSeed } from "./engine/rng";

export const ARTIFACT_CLASSES = ["treasure", "minor", "major", "relic"] as const;
export type ArtifactClass = (typeof ARTIFACT_CLASSES)[number];

export const ARTIFACT_SLOTS = [
  "weapon",
  "shield",
  "torso",
  "helmet",
  "necklace",
  "feet",
  "ringLeft",
  "ringRight",
  "misc1",
  "misc2",
  "misc3",
  "misc4",
] as const;
export type ArtifactSlot = (typeof ARTIFACT_SLOTS)[number];

export interface ArtifactStatsBonus {
  attack?: number;
  defense?: number;
  spellPower?: number;
  knowledge?: number;
  morale?: number;
  luck?: number;
  movement?: number;
  seaMovement?: number;
}

export interface ArtifactDefinition {
  id: ArtifactId;
  name: string;
  originalName: string;
  class: ArtifactClass;
  cost: number;
  slots: ArtifactSlot[];
  bonus: ArtifactStatsBonus;
  unsupportedEffects?: string[];
  combo?: string;
}

const miscSlots: ArtifactSlot[] = ["misc1", "misc2", "misc3", "misc4"];
const ringSlots: ArtifactSlot[] = ["ringLeft", "ringRight"];

export const ARTIFACTS = [
  artifact("centaurs_axe", "Hache du maraudeur", "Marauder's Axe", "treasure", 2000, ["weapon"], { attack: 2 }),
  artifact("blackshard_dead_knight", "Lame d'obsidienne brisée", "Cracked Obsidian Blade", "minor", 3000, ["weapon"], { attack: 3 }, [], "armor_of_the_damned"),
  artifact("greater_gnolls_flail", "Fléau du charognard", "Carrion Flail", "minor", 4000, ["weapon"], { attack: 4 }),
  artifact("ogres_club_havoc", "Masse de dévastation", "Devastation Maul", "major", 5000, ["weapon"], { attack: 5 }),
  artifact("sword_hellfire", "Épée des cendres ardentes", "Sword of Burning Ash", "major", 6000, ["weapon"], { attack: 6 }),
  artifact("red_dragon_flame_tongue", "Croc de flamme draconique", "Draconic Flame Fang", "minor", 4000, ["weapon"], { attack: 2, defense: 2 }, [], "power_of_the_dragon_father"),
  artifact("titans_gladius", "Glaive du colosse", "Colossus Gladius", "relic", 10000, ["weapon"], { attack: 12, defense: -3 }, [], "titans_thunder"),
  artifact("sword_judgement", "Lame du verdict céleste", "Blade of Celestial Verdict", "relic", 20000, ["weapon"], { attack: 5, defense: 5, spellPower: 5, knowledge: 5 }, [], "angelic_alliance"),

  artifact("shield_dwarven_lords", "Écu des forges naines", "Dwarven Forge Shield", "treasure", 2000, ["shield"], { defense: 2 }),
  artifact("shield_yawning_dead", "Écu des âmes hurlantes", "Shield of Wailing Souls", "minor", 3000, ["shield"], { defense: 3 }, [], "armor_of_the_damned"),
  artifact("buckler_gnoll_king", "Targe du chef de meute", "Packlord's Buckler", "minor", 4000, ["shield"], { defense: 4 }),
  artifact("shield_damned", "Bouclier des maudits", "Shield of the Cursed", "major", 6000, ["shield"], { defense: 6 }),
  artifact("dragon_scale_shield", "Écu d'écailles draconiques", "Draconic Scale Ward", "major", 6000, ["shield"], { attack: 3, defense: 3 }, [], "power_of_the_dragon_father"),
  artifact("lions_shield_courage", "Égide du lion vaillant", "Aegis of the Valiant Lion", "relic", 16000, ["shield"], { attack: 4, defense: 4, spellPower: 4, knowledge: 4 }, [], "angelic_alliance"),
  artifact("sentinels_shield", "Pavois du gardien", "Warden's Pavise", "relic", 10000, ["shield"], { attack: -3, defense: 12 }, [], "titans_thunder"),

  artifact("breastplate_petrified_wood", "Plastron d'écorce pétrifiée", "Petrified Bark Plate", "treasure", 1000, ["torso"], { spellPower: 1 }),
  artifact("rib_cage", "Carcasse d'ossements", "Bone Carcass", "minor", 3000, ["torso"], { spellPower: 2 }, [], "armor_of_the_damned"),
  artifact("scales_greater_basilisk", "Cuirasse d'écailles de basilic", "Basilisk Scale Cuirass", "minor", 4000, ["torso"], { spellPower: 3 }),
  artifact("breastplate_brimstone", "Cuirasse de soufre ardent", "Searing Brimstone Plate", "major", 6000, ["torso"], { spellPower: 5 }),
  artifact("armor_wonder", "Armure des prodiges", "Armor of Marvels", "minor", 4000, ["torso"], { attack: 1, defense: 1, spellPower: 1, knowledge: 1 }, [], "angelic_alliance"),
  artifact("dragon_scale_armor", "Armure d'écailles draconiques", "Draconic Scale Armor", "relic", 8000, ["torso"], { attack: 4, defense: 4 }, [], "power_of_the_dragon_father"),
  artifact("titans_cuirass", "Cuirasse du colosse", "Colossus Cuirass", "relic", 10000, ["torso"], { spellPower: 10, knowledge: -2 }, [], "titans_thunder"),

  artifact("helm_alabaster_unicorn", "Heaume de la licorne pâle", "Pale Unicorn Helm", "treasure", 1000, ["helmet"], { knowledge: 1 }),
  artifact("skull_helmet", "Heaume de crâne forgé", "Skull-Forged Helm", "treasure", 3000, ["helmet"], { knowledge: 2 }, [], "armor_of_the_damned"),
  artifact("helm_chaos", "Heaume du tumulte", "Helm of Turmoil", "minor", 4000, ["helmet"], { knowledge: 3 }),
  artifact("hellstorm_helmet", "Casque de la tempête ardente", "Emberstorm Helm", "major", 6000, ["helmet"], { knowledge: 5 }),
  artifact("crown_dragontooth", "Couronne de croc draconique", "Crown of the Draconic Fang", "relic", 8000, ["helmet"], { spellPower: 4, knowledge: 4 }, [], "power_of_the_dragon_father"),
  artifact("thunder_helmet", "Heaume du fracas", "Thunderclap Helm", "relic", 10000, ["helmet"], { spellPower: -2, knowledge: 10 }, [], "titans_thunder"),
  artifact("helm_heavenly_enlightenment", "Heaume de l'éveil céleste", "Helm of Celestial Awakening", "relic", 24000, ["helmet"], { attack: 6, defense: 6, spellPower: 6, knowledge: 6 }, [], "angelic_alliance"),

  artifact("dragonbone_greaves", "Grèves d'ossements draconiques", "Draconic Bone Greaves", "treasure", 2000, ["feet"], { spellPower: 1, knowledge: 1 }, [], "power_of_the_dragon_father"),
  artifact("sandals_saint", "Sandales du bienheureux", "Sandals of the Blessed", "relic", 8000, ["feet"], { attack: 2, defense: 2, spellPower: 2, knowledge: 2 }, [], "angelic_alliance"),
  artifact("boots_speed", "Bottes de célérité", "Boots of Haste", "minor", 6000, ["feet"], { movement: 600 }),

  artifact("necklace_swiftness", "Collier de prestesse", "Pendant of Quickness", "minor", 5000, ["necklace"], {}, ["+1 vitesse en combat"]),
  artifact("necklace_dragonteeth", "Collier de crocs draconiques", "Necklace of Draconic Fangs", "major", 6000, ["necklace"], { spellPower: 3, knowledge: 3 }, [], "power_of_the_dragon_father"),
  artifact("celestial_necklace_bliss", "Collier de la grâce céleste", "Necklace of Celestial Grace", "relic", 12000, ["necklace"], { attack: 3, defense: 3, spellPower: 3, knowledge: 3 }, [], "angelic_alliance"),
  artifact("pendant_courage", "Pendentif de bravoure", "Pendant of Bravery", "major", 7000, ["necklace"], { morale: 3, luck: 3 }),

  artifact("quiet_eye_dragon", "Œil serein du drake", "Serene Drake Eye", "treasure", 2000, ringSlots, { attack: 1, defense: 1 }, [], "power_of_the_dragon_father"),
  artifact("still_eye_dragon", "Œil paisible du drake", "Placid Drake Eye", "minor", 2000, ringSlots, { morale: 1, luck: 1 }, [], "power_of_the_dragon_father"),
  artifact("ring_vitality", "Anneau de vigueur", "Ring of Vigor", "treasure", 5000, ringSlots, {}, ["+1 PV aux créatures"]),
  artifact("ring_life", "Anneau de longévité", "Ring of Longevity", "minor", 10000, ringSlots, {}, ["+1 PV aux créatures"]),
  artifact("ring_infinite_gems", "Anneau des gemmes sans fin", "Ring of Endless Gems", "major", 5000, ringSlots, {}, ["+1 gemme par jour"]),

  artifact("clover_fortune", "Trèfle porte-bonheur", "Lucky Clover", "treasure", 1000, miscSlots, { luck: 1 }),
  artifact("cards_prophecy", "Cartes divinatoires", "Divining Cards", "treasure", 1000, miscSlots, { luck: 1 }),
  artifact("ladybird_luck", "Coccinelle porte-chance", "Lucky Ladybird", "treasure", 1000, miscSlots, { luck: 1 }),
  artifact("badge_courage", "Insigne de bravoure", "Badge of Bravery", "treasure", 1000, miscSlots, { morale: 1 }),
  artifact("crest_valor", "Écusson de vaillance", "Crest of Gallantry", "treasure", 1000, miscSlots, { morale: 1 }),
  artifact("glyph_gallantry", "Glyphe d'honneur", "Glyph of Honor", "treasure", 1000, miscSlots, { morale: 1 }),
  artifact("speculum", "Miroir de guet", "Scrying Mirror", "treasure", 4000, miscSlots, {}, ["Rayon de vision +1"]),
  artifact("spyglass", "Longue-vue", "Spyglass", "treasure", 4000, miscSlots, {}, ["Rayon de vision +1"]),
  // The Grail is a carried, non-equippable relic (no slot). It is excluded from
  // every random/merchant pool below — it can only be dug up from its buried
  // tile — and is consumed when erected as a town's Grail structure.
  artifact("grail", "Graal", "Grail", "relic", 0, [], {}, ["Bâtiment du Graal : à porter jusqu'à une ville alliée pour ériger la structure monumentale."]),
] as const satisfies readonly ArtifactDefinition[];

/** Carried, non-equippable Grail relic — see {@link import("./grail").GRAIL_ARTIFACT_ID}. */
export const GRAIL_ARTIFACT_ID = "grail";

export type ArtifactId = string;

export const ARTIFACTS_BY_ID = Object.fromEntries(ARTIFACTS.map((item) => [item.id, item])) as Record<ArtifactId, ArtifactDefinition>;
export const ARTIFACT_POOLS = ARTIFACT_CLASSES.reduce((pools, artifactClass) => {
  pools[artifactClass] = ARTIFACTS
    .filter((artifact) => artifact.class === artifactClass && artifact.id !== GRAIL_ARTIFACT_ID)
    .map((artifact) => artifact.id);
  return pools;
}, {} as Record<ArtifactClass, ArtifactId[]>);

export const ARTIFACT_GUARDIAN_POWER: Record<ArtifactClass, number> = {
  treasure: 650,
  minor: 1350,
  major: 2600,
  relic: 5200,
};

function artifact(
  id: string,
  name: string,
  originalName: string,
  artifactClass: ArtifactClass,
  cost: number,
  slots: ArtifactSlot[],
  bonus: ArtifactStatsBonus,
  unsupportedEffects: string[] = [],
  combo?: string,
): ArtifactDefinition {
  return { id, name, originalName, class: artifactClass, cost, slots, bonus, unsupportedEffects, combo };
}

export function getArtifact(id: string | undefined | null): ArtifactDefinition | null {
  return id && id in ARTIFACTS_BY_ID ? ARTIFACTS_BY_ID[id as ArtifactId] : null;
}

export function isArtifactClass(value: string | undefined | null): value is ArtifactClass {
  return ARTIFACT_CLASSES.includes(value as ArtifactClass);
}

export function pickArtifactId(token: string | undefined | null, seed: string): ArtifactId {
  if (token && token in ARTIFACTS_BY_ID) return token as ArtifactId;
  const artifactClass = isArtifactClass(token) ? token : "minor";
  const pool = ARTIFACT_POOLS[artifactClass];
  return pool[hashSeed(seed) % pool.length];
}

export function getArtifactMapLabel(subtype: string | undefined) {
  const artifact = getArtifact(subtype);
  if (artifact) return artifact.name;
  return isArtifactClass(subtype) ? `Artefact ${artifactClassLabel(subtype)}` : "Artefact";
}

export function artifactClassLabel(value: ArtifactClass) {
  if (value === "treasure") return "trésor";
  if (value === "minor") return "mineur";
  if (value === "major") return "majeur";
  return "relique";
}

export function getDefaultArtifactBag(): HeroArtifactBag {
  return { inventory: [], equipment: {} };
}

export function normalizeArtifactBag(value: unknown): HeroArtifactBag {
  const source = (value && typeof value === "object" ? value : {}) as Partial<HeroArtifactBag>;
  const inventory = Array.isArray(source.inventory)
    ? source.inventory.filter((id): id is ArtifactId => Boolean(getArtifact(id)))
    : [];
  const equipment: HeroArtifactBag["equipment"] = {};
  const rawEquipment = (source.equipment && typeof source.equipment === "object" ? source.equipment : {}) as Record<string, unknown>;
  for (const slot of ARTIFACT_SLOTS) {
    const id = rawEquipment[slot];
    if (typeof id === "string" && getArtifact(id)) equipment[slot] = id as ArtifactId;
  }
  return { inventory, equipment };
}

export function getEquippedArtifactIds(hero: { artifacts?: unknown }) {
  return Object.values(normalizeArtifactBag(hero.artifacts).equipment).filter((id): id is ArtifactId => Boolean(id));
}

export function getArtifactStatsBonus(hero: { artifacts?: unknown }): Required<ArtifactStatsBonus> {
  const total = emptyBonus();
  for (const id of getEquippedArtifactIds(hero)) {
    const bonus = ARTIFACTS_BY_ID[id].bonus;
    total.attack += bonus.attack ?? 0;
    total.defense += bonus.defense ?? 0;
    total.spellPower += bonus.spellPower ?? 0;
    total.knowledge += bonus.knowledge ?? 0;
    total.morale += bonus.morale ?? 0;
    total.luck += bonus.luck ?? 0;
    total.movement += bonus.movement ?? 0;
    total.seaMovement += bonus.seaMovement ?? 0;
  }
  return total;
}

export function getEffectiveHeroStats(hero: Pick<Hero, "stats" | "artifacts">): HeroStats {
  const bonus = getArtifactStatsBonus(hero);
  return {
    attack: Math.max(0, hero.stats.attack + bonus.attack),
    defense: Math.max(0, hero.stats.defense + bonus.defense),
    spellPower: Math.max(0, hero.stats.spellPower + bonus.spellPower),
    knowledge: Math.max(0, hero.stats.knowledge + bonus.knowledge),
    morale: hero.stats.morale + bonus.morale,
    luck: (hero.stats.luck ?? 0) + bonus.luck,
  };
}

export function getEffectiveHeroStatsFromValues(hero: {
  attack?: number | null;
  defense?: number | null;
  spellPower?: number | null;
  spell_power?: number | null;
  knowledge?: number | null;
  morale?: number | null;
  luck?: number | null;
  artifacts?: unknown;
}): HeroStats {
  return getEffectiveHeroStats({
    stats: {
      attack: Number(hero.attack ?? 0),
      defense: Number(hero.defense ?? 0),
      spellPower: Number(hero.spellPower ?? hero.spell_power ?? 0),
      knowledge: Number(hero.knowledge ?? 0),
      morale: Number(hero.morale ?? 0),
      luck: Number(hero.luck ?? 0),
    },
    artifacts: normalizeArtifactBag(hero.artifacts),
  });
}

export function getEffectiveHeroMovementBonus(hero: { artifacts?: unknown }, isOnWater = false) {
  const bonus = getArtifactStatsBonus(hero);
  return bonus.movement + (isOnWater ? bonus.seaMovement : 0);
}

function emptyBonus(): Required<ArtifactStatsBonus> {
  return {
    attack: 0,
    defense: 0,
    spellPower: 0,
    knowledge: 0,
    morale: 0,
    luck: 0,
    movement: 0,
    seaMovement: 0,
  };
}
