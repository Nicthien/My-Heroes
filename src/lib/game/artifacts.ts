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
  artifact("centaurs_axe", "Hache du centaure", "Centaur's Axe", "treasure", 2000, ["weapon"], { attack: 2 }),
  artifact("blackshard_dead_knight", "Éclat noir du chevalier mort", "Blackshard of the Dead Knight", "minor", 3000, ["weapon"], { attack: 3 }, [], "armor_of_the_damned"),
  artifact("greater_gnolls_flail", "Fléau du grand gnoll", "Greater Gnoll's Flail", "minor", 4000, ["weapon"], { attack: 4 }),
  artifact("ogres_club_havoc", "Massue de ravage de l'ogre", "Ogre's Club of Havoc", "major", 5000, ["weapon"], { attack: 5 }),
  artifact("sword_hellfire", "Épée du feu infernal", "Sword of Hellfire", "major", 6000, ["weapon"], { attack: 6 }),
  artifact("red_dragon_flame_tongue", "Langue de feu du dragon rouge", "Red Dragon Flame Tongue", "minor", 4000, ["weapon"], { attack: 2, defense: 2 }, [], "power_of_the_dragon_father"),
  artifact("titans_gladius", "Glaive des titans", "Titan's Gladius", "relic", 10000, ["weapon"], { attack: 12, defense: -3 }, [], "titans_thunder"),
  artifact("sword_judgement", "Épée du jugement", "Sword of Judgement", "relic", 20000, ["weapon"], { attack: 5, defense: 5, spellPower: 5, knowledge: 5 }, [], "angelic_alliance"),

  artifact("shield_dwarven_lords", "Bouclier des seigneurs nains", "Shield of the Dwarven Lords", "treasure", 2000, ["shield"], { defense: 2 }),
  artifact("shield_yawning_dead", "Bouclier des morts béants", "Shield of the Yawning Dead", "minor", 3000, ["shield"], { defense: 3 }, [], "armor_of_the_damned"),
  artifact("buckler_gnoll_king", "Targe du roi gnoll", "Buckler of the Gnoll King", "minor", 4000, ["shield"], { defense: 4 }),
  artifact("shield_damned", "Bouclier des damnés", "Shield of the Damned", "major", 6000, ["shield"], { defense: 6 }),
  artifact("dragon_scale_shield", "Bouclier en écailles de dragon", "Dragon Scale Shield", "major", 6000, ["shield"], { attack: 3, defense: 3 }, [], "power_of_the_dragon_father"),
  artifact("lions_shield_courage", "Bouclier de courage du lion", "Lion's Shield of Courage", "relic", 16000, ["shield"], { attack: 4, defense: 4, spellPower: 4, knowledge: 4 }, [], "angelic_alliance"),
  artifact("sentinels_shield", "Bouclier du sentinelle", "Sentinel's Shield", "relic", 10000, ["shield"], { attack: -3, defense: 12 }, [], "titans_thunder"),

  artifact("breastplate_petrified_wood", "Cuirasse de bois pétrifié", "Breastplate of Petrified Wood", "treasure", 1000, ["torso"], { spellPower: 1 }),
  artifact("rib_cage", "Cage thoracique", "Rib Cage", "minor", 3000, ["torso"], { spellPower: 2 }, [], "armor_of_the_damned"),
  artifact("scales_greater_basilisk", "Écailles du grand basilic", "Scales of the Greater Basilisk", "minor", 4000, ["torso"], { spellPower: 3 }),
  artifact("breastplate_brimstone", "Cuirasse de soufre", "Breastplate of Brimstone", "major", 6000, ["torso"], { spellPower: 5 }),
  artifact("armor_wonder", "Armure des merveilles", "Armor of Wonder", "minor", 4000, ["torso"], { attack: 1, defense: 1, spellPower: 1, knowledge: 1 }, [], "angelic_alliance"),
  artifact("dragon_scale_armor", "Armure en écailles de dragon", "Dragon Scale Armor", "relic", 8000, ["torso"], { attack: 4, defense: 4 }, [], "power_of_the_dragon_father"),
  artifact("titans_cuirass", "Cuirasse des titans", "Titan's Cuirass", "relic", 10000, ["torso"], { spellPower: 10, knowledge: -2 }, [], "titans_thunder"),

  artifact("helm_alabaster_unicorn", "Heaume de la licorne d'albâtre", "Helm of the Alabaster Unicorn", "treasure", 1000, ["helmet"], { knowledge: 1 }),
  artifact("skull_helmet", "Casque crâne", "Skull Helmet", "treasure", 3000, ["helmet"], { knowledge: 2 }, [], "armor_of_the_damned"),
  artifact("helm_chaos", "Heaume du chaos", "Helm of Chaos", "minor", 4000, ["helmet"], { knowledge: 3 }),
  artifact("hellstorm_helmet", "Casque de tempête infernale", "Hellstorm Helmet", "major", 6000, ["helmet"], { knowledge: 5 }),
  artifact("crown_dragontooth", "Couronne de dent de dragon", "Crown of Dragontooth", "relic", 8000, ["helmet"], { spellPower: 4, knowledge: 4 }, [], "power_of_the_dragon_father"),
  artifact("thunder_helmet", "Casque du tonnerre", "Thunder Helmet", "relic", 10000, ["helmet"], { spellPower: -2, knowledge: 10 }, [], "titans_thunder"),
  artifact("helm_heavenly_enlightenment", "Heaume de l'illumination céleste", "Helm of Heavenly Enlightenment", "relic", 24000, ["helmet"], { attack: 6, defense: 6, spellPower: 6, knowledge: 6 }, [], "angelic_alliance"),

  artifact("dragonbone_greaves", "Grèves d'os de dragon", "Dragonbone Greaves", "treasure", 2000, ["feet"], { spellPower: 1, knowledge: 1 }, [], "power_of_the_dragon_father"),
  artifact("sandals_saint", "Sandales du saint", "Sandals of the Saint", "relic", 8000, ["feet"], { attack: 2, defense: 2, spellPower: 2, knowledge: 2 }, [], "angelic_alliance"),
  artifact("boots_speed", "Bottes de vitesse", "Boots of Speed", "minor", 6000, ["feet"], { movement: 600 }),

  artifact("necklace_swiftness", "Collier de célérité", "Necklace of Swiftness", "minor", 5000, ["necklace"], {}, ["+1 vitesse en combat"]),
  artifact("necklace_dragonteeth", "Collier de dents de dragon", "Necklace of Dragonteeth", "major", 6000, ["necklace"], { spellPower: 3, knowledge: 3 }, [], "power_of_the_dragon_father"),
  artifact("celestial_necklace_bliss", "Collier céleste de félicité", "Celestial Necklace of Bliss", "relic", 12000, ["necklace"], { attack: 3, defense: 3, spellPower: 3, knowledge: 3 }, [], "angelic_alliance"),
  artifact("pendant_courage", "Pendentif du courage", "Pendant of Courage", "major", 7000, ["necklace"], { morale: 3, luck: 3 }),

  artifact("quiet_eye_dragon", "Œil calme du dragon", "Quiet Eye of the Dragon", "treasure", 2000, ringSlots, { attack: 1, defense: 1 }, [], "power_of_the_dragon_father"),
  artifact("still_eye_dragon", "Œil immobile du dragon", "Still Eye of the Dragon", "minor", 2000, ringSlots, { morale: 1, luck: 1 }, [], "power_of_the_dragon_father"),
  artifact("ring_vitality", "Anneau de vitalité", "Ring of Vitality", "treasure", 5000, ringSlots, {}, ["+1 PV aux créatures"]),
  artifact("ring_life", "Anneau de vie", "Ring of Life", "minor", 10000, ringSlots, {}, ["+1 PV aux créatures"]),
  artifact("ring_infinite_gems", "Anneau des gemmes infinies", "Ring of Infinite Gems", "major", 5000, ringSlots, {}, ["+1 gemme par jour"]),

  artifact("clover_fortune", "Trèfle de fortune", "Clover of Fortune", "treasure", 1000, miscSlots, { luck: 1 }),
  artifact("cards_prophecy", "Cartes de prophétie", "Cards of Prophecy", "treasure", 1000, miscSlots, { luck: 1 }),
  artifact("ladybird_luck", "Scarabée de chance", "Ladybird of Luck", "treasure", 1000, miscSlots, { luck: 1 }),
  artifact("badge_courage", "Insigne de courage", "Badge of Courage", "treasure", 1000, miscSlots, { morale: 1 }),
  artifact("crest_valor", "Blason de vaillance", "Crest of Valor", "treasure", 1000, miscSlots, { morale: 1 }),
  artifact("glyph_gallantry", "Glyphe de bravoure", "Glyph of Gallantry", "treasure", 1000, miscSlots, { morale: 1 }),
  artifact("speculum", "Speculum", "Speculum", "treasure", 4000, miscSlots, {}, ["Rayon de vision +1"]),
  artifact("spyglass", "Longue-vue", "Spyglass", "treasure", 4000, miscSlots, {}, ["Rayon de vision +1"]),
] as const satisfies readonly ArtifactDefinition[];

export type ArtifactId = string;

export const ARTIFACTS_BY_ID = Object.fromEntries(ARTIFACTS.map((item) => [item.id, item])) as Record<ArtifactId, ArtifactDefinition>;
export const ARTIFACT_POOLS = ARTIFACT_CLASSES.reduce((pools, artifactClass) => {
  pools[artifactClass] = ARTIFACTS.filter((artifact) => artifact.class === artifactClass).map((artifact) => artifact.id);
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
