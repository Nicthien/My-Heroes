import { Resources, TerrainType, UnitStack, UnitType } from "./types";
import { hashSeed } from "./engine/rng";
import { getUnitRule } from "./units";

export const CREATURE_BANK_TYPES = [
  "ancient_altar",
  "bandit_camp",
  "beholders_sanctuary",
  "black_tower",
  "churchyard",
  "crypt",
  "cyclops_stockpile",
  "derelict_ship",
  "dragon_fly_hive",
  "dragon_utopia",
  "dwarven_treasury",
  "experimental_shop",
  "griffin_conservatory",
  "imp_cache",
  "ivory_tower",
  "mansion",
  "medusa_stores",
  "naga_bank",
  "pirate_cavern",
  "red_tower",
  "ruins",
  "shipwreck",
  "spit",
  "temple_of_the_sea",
  "wolf_raider_picket",
] as const;

export type CreatureBankType = (typeof CREATURE_BANK_TYPES)[number];

export interface CreatureBankReward {
  gold?: number;
  resources?: Partial<Omit<Resources, "gold">>;
  experience?: number;
  creatures?: Array<{ unitType: UnitType; count: number }>;
  artifactTokens?: string[];
}

export interface PendingCreatureBankReward {
  bankId: string;
  bankType: CreatureBankType;
  label: string;
  heroId: string;
  playerId: string;
  reward: CreatureBankReward;
}

interface CreatureBankVariant {
  chance: number;
  guardPower: number;
  guards: Array<{ unitType: UnitType; count: number }>;
  reward: CreatureBankReward;
}

export interface CreatureBankDefinition {
  type: CreatureBankType;
  label: string;
  description: string;
  preferredTerrain: TerrainType[];
  rarity: number;
  aquatic?: boolean;
  variants: CreatureBankVariant[];
}

const rareResources: Array<keyof Omit<Resources, "gold">> = ["mercury", "crystals", "gems", "sulfur"];

export const CREATURE_BANK_DEFINITIONS: Record<CreatureBankType, CreatureBankDefinition> = {
  ancient_altar: bank("ancient_altar", "Autel ancien", "Autel elementaire defendu par des gardiens magiques.", [TerrainType.GRASS, TerrainType.MOUNTAIN, TerrainType.LAVA], 0.35, [
    variant(30, 1800, [[UnitType.AIR_ELEMENTAL, 18], [UnitType.WATER_ELEMENTAL, 18]], { experience: 800, artifactTokens: ["minor"] }),
    variant(30, 2600, [[UnitType.FIRE_ELEMENTAL, 24], [UnitType.EARTH_ELEMENTAL, 24]], { experience: 1100, artifactTokens: ["minor"], resources: { mercury: 3 } }),
    variant(30, 3600, [[UnitType.PSYCHIC_ELEMENTAL, 20], [UnitType.MAGIC_ELEMENTAL, 16]], { experience: 1500, artifactTokens: ["major"] }),
    variant(10, 5200, [[UnitType.MAGIC_ELEMENTAL, 32], [UnitType.PHOENIX, 4]], { experience: 2200, artifactTokens: ["relic"], creatures: [{ unitType: UnitType.MAGIC_ELEMENTAL, count: 2 }] }),
  ]),
  bandit_camp: bank("bandit_camp", "Camp de bandits", "Camp de pillards protégé par des voleurs et nomades.", [TerrainType.GRASS, TerrainType.DIRT, TerrainType.SAND, TerrainType.FOREST], 1.15, [
    variant(30, 550, [[UnitType.ROGUE, 35]], { gold: 800, resources: { wood: 2 } }),
    variant(30, 900, [[UnitType.ROGUE, 55], [UnitType.NOMAD, 8]], { gold: 1300, resources: { wood: 3, ore: 2 } }),
    variant(30, 1450, [[UnitType.ROGUE, 80], [UnitType.NOMAD, 18]], { gold: 2200, artifactTokens: ["treasure"] }),
    variant(10, 2300, [[UnitType.ROGUE, 120], [UnitType.NOMAD, 32], [UnitType.ENCHANTER, 4]], { gold: 3500, artifactTokens: ["minor"], creatures: [{ unitType: UnitType.ROGUE, count: 10 }] }),
  ]),
  beholders_sanctuary: bank("beholders_sanctuary", "Sanctuaire des beholders", "Sanctuaire souterrain aux regards mortels.", [TerrainType.DIRT, TerrainType.MOUNTAIN, TerrainType.SWAMP], 0.85, [
    variant(30, 900, [[UnitType.BEHOLDER, 24]], { gold: 1200, resources: { gems: 2 } }),
    variant(30, 1400, [[UnitType.BEHOLDER, 32], [UnitType.EVIL_EYE, 12]], { gold: 1800, resources: { gems: 3 } }),
    variant(30, 2100, [[UnitType.EVIL_EYE, 38]], { gold: 2500, resources: { gems: 5 }, creatures: [{ unitType: UnitType.EVIL_EYE, count: 4 }] }),
    variant(10, 3200, [[UnitType.EVIL_EYE, 54], [UnitType.MEDUSA_QUEEN, 12]], { gold: 3500, resources: { gems: 7 }, creatures: [{ unitType: UnitType.EVIL_EYE, count: 7 }] }),
  ]),
  black_tower: bank("black_tower", "Tour noire", "Tour noire gardée par des dragons.", [TerrainType.MOUNTAIN, TerrainType.LAVA, TerrainType.DIRT], 0.25, [
    variant(30, 5200, [[UnitType.RED_DRAGON, 3], [UnitType.MINOTAUR_KING, 20]], { gold: 4000, artifactTokens: ["major"] }),
    variant(30, 7200, [[UnitType.RED_DRAGON, 5], [UnitType.BLACK_DRAGON, 1]], { gold: 6000, artifactTokens: ["major"] }),
    variant(30, 9400, [[UnitType.BLACK_DRAGON, 3], [UnitType.RED_DRAGON, 5]], { gold: 8000, artifactTokens: ["relic"] }),
    variant(10, 12600, [[UnitType.BLACK_DRAGON, 6]], { gold: 12000, artifactTokens: ["relic"], creatures: [{ unitType: UnitType.BLACK_DRAGON, count: 1 }] }),
  ]),
  churchyard: bank("churchyard", "Cimetiere", "Cimetiere maudit rempli de morts-vivants.", [TerrainType.DIRT, TerrainType.SWAMP, TerrainType.FOREST], 1.0, [
    variant(30, 700, [[UnitType.SKELETON, 80], [UnitType.WALKING_DEAD, 30]], { gold: 1000, resources: { mercury: 1 } }),
    variant(30, 1200, [[UnitType.SKELETON_WARRIOR, 90], [UnitType.ZOMBIE, 40]], { gold: 1500, resources: { mercury: 2 } }),
    variant(30, 1800, [[UnitType.WIGHT, 30], [UnitType.VAMPIRE, 12]], { gold: 2200, artifactTokens: ["minor"] }),
    variant(10, 2800, [[UnitType.VAMPIRE_LORD, 24], [UnitType.LICH, 12]], { gold: 3200, artifactTokens: ["major"], creatures: [{ unitType: UnitType.VAMPIRE, count: 4 }] }),
  ]),
  crypt: bank("crypt", "Crypte", "Tombe ancienne aux tresors ensevelis.", [TerrainType.DIRT, TerrainType.SWAMP, TerrainType.SNOW], 1.25, [
    variant(30, 650, [[UnitType.SKELETON, 60], [UnitType.WIGHT, 12]], { gold: 1000 }),
    variant(30, 950, [[UnitType.SKELETON_WARRIOR, 70], [UnitType.WRAITH, 15]], { gold: 1500, resources: { gems: 1 } }),
    variant(30, 1400, [[UnitType.VAMPIRE, 18], [UnitType.LICH, 8]], { gold: 2500, artifactTokens: ["minor"] }),
    variant(10, 2300, [[UnitType.VAMPIRE_LORD, 24], [UnitType.POWER_LICH, 10]], { gold: 4000, artifactTokens: ["major"] }),
  ]),
  cyclops_stockpile: bank("cyclops_stockpile", "Reserve de cyclopes", "Reserve fortifiée remplie de projectiles et minerais.", [TerrainType.MOUNTAIN, TerrainType.DIRT, TerrainType.SAND], 0.55, [
    variant(30, 1800, [[UnitType.CYCLOPS, 10], [UnitType.OGRE, 35]], { resources: { ore: 12, crystals: 2 } }),
    variant(30, 2600, [[UnitType.CYCLOPS, 16], [UnitType.OGRE_MAGE, 30]], { resources: { ore: 18, crystals: 3 } }),
    variant(30, 3600, [[UnitType.CYCLOPS_KING, 16], [UnitType.THUNDERBIRD, 8]], { resources: { ore: 24, crystals: 5 }, creatures: [{ unitType: UnitType.CYCLOPS, count: 2 }] }),
    variant(10, 5200, [[UnitType.CYCLOPS_KING, 28], [UnitType.BEHEMOTH, 4]], { resources: { ore: 36, crystals: 8 }, creatures: [{ unitType: UnitType.CYCLOPS_KING, count: 3 }] }),
  ]),
  derelict_ship: bank("derelict_ship", "Épave abandonnée", "Épave échouée gardée par un équipage hostile.", [TerrainType.SAND, TerrainType.WATER, TerrainType.SWAMP], 0.75, [
    variant(30, 900, [[UnitType.PIRATE, 30]], { gold: 1200, resources: { wood: 5 } }),
    variant(30, 1500, [[UnitType.PIRATE, 40], [UnitType.CORSAIR, 15]], { gold: 2000, resources: { wood: 8 } }),
    variant(30, 2400, [[UnitType.CORSAIR, 45], [UnitType.SEA_WITCH, 10]], { gold: 3200, artifactTokens: ["minor"] }),
    variant(10, 3800, [[UnitType.SEA_DOG, 45], [UnitType.SORCERESS, 18]], { gold: 5000, artifactTokens: ["major"], creatures: [{ unitType: UnitType.CORSAIR, count: 5 }] }),
  ], true),
  dragon_fly_hive: bank("dragon_fly_hive", "Ruche de libellules-dragon", "Nid bourdonnant des marais.", [TerrainType.SWAMP, TerrainType.FOREST, TerrainType.GRASS], 1.05, [
    variant(30, 700, [[UnitType.SERPENT_FLY, 30]], { resources: { sulfur: 2 }, creatures: [{ unitType: UnitType.SERPENT_FLY, count: 4 }] }),
    variant(30, 1100, [[UnitType.SERPENT_FLY, 45], [UnitType.DRAGON_FLY, 10]], { resources: { sulfur: 3 }, creatures: [{ unitType: UnitType.SERPENT_FLY, count: 6 }] }),
    variant(30, 1600, [[UnitType.DRAGON_FLY, 35]], { resources: { sulfur: 5 }, creatures: [{ unitType: UnitType.DRAGON_FLY, count: 5 }] }),
    variant(10, 2400, [[UnitType.DRAGON_FLY, 55], [UnitType.WYVERN, 6]], { resources: { sulfur: 8 }, creatures: [{ unitType: UnitType.DRAGON_FLY, count: 8 }] }),
  ]),
  dragon_utopia: bank("dragon_utopia", "Utopie des dragons", "Tresor mythique protégé par plusieurs dragons.", [TerrainType.MOUNTAIN, TerrainType.LAVA, TerrainType.SNOW], 0.18, [
    variant(30, 9000, [[UnitType.GREEN_DRAGON, 8], [UnitType.RED_DRAGON, 4]], { gold: 12000, resources: spreadRare(4), artifactTokens: ["major", "major"] }),
    variant(30, 12500, [[UnitType.RED_DRAGON, 8], [UnitType.GOLD_DRAGON, 4]], { gold: 20000, resources: spreadRare(6), artifactTokens: ["major", "relic"] }),
    variant(30, 16500, [[UnitType.BLACK_DRAGON, 6], [UnitType.GOLD_DRAGON, 6]], { gold: 30000, resources: spreadRare(8), artifactTokens: ["relic", "relic"] }),
    variant(10, 24000, [[UnitType.BLACK_DRAGON, 10], [UnitType.AZURE_DRAGON, 2]], { gold: 50000, resources: spreadRare(12), artifactTokens: ["relic", "relic", "relic"] }),
  ]),
  dwarven_treasury: bank("dwarven_treasury", "Tresorerie naine", "Tresorerie naine blinde de coffres.", [TerrainType.MOUNTAIN, TerrainType.FOREST, TerrainType.SNOW], 1.0, [
    variant(30, 800, [[UnitType.DWARF, 45]], { gold: 1500, resources: { gems: 1 } }),
    variant(30, 1300, [[UnitType.DWARF, 65], [UnitType.BATTLE_DWARF, 18]], { gold: 2500, resources: { gems: 2, crystals: 1 } }),
    variant(30, 1900, [[UnitType.BATTLE_DWARF, 70]], { gold: 4000, resources: { gems: 4, crystals: 2 }, creatures: [{ unitType: UnitType.DWARF, count: 8 }] }),
    variant(10, 3000, [[UnitType.BATTLE_DWARF, 110], [UnitType.STEEL_GOLEM, 12]], { gold: 6000, resources: { gems: 6, crystals: 4 }, creatures: [{ unitType: UnitType.BATTLE_DWARF, count: 10 }] }),
  ]),
  experimental_shop: bank("experimental_shop", "Atelier expérimental", "Atelier bruyant rempli de prototypes.", [TerrainType.DIRT, TerrainType.SAND, TerrainType.MOUNTAIN], 0.7, [
    variant(30, 900, [[UnitType.MECHANIC, 35], [UnitType.ARMADILLO, 8]], { resources: { ore: 6, wood: 3 } }),
    variant(30, 1600, [[UnitType.ENGINEER, 30], [UnitType.AUTOMATON, 10]], { resources: { ore: 10, crystals: 2 }, creatures: [{ unitType: UnitType.MECHANIC, count: 5 }] }),
    variant(30, 2600, [[UnitType.SENTINEL_AUTOMATON, 18], [UnitType.GUNSLINGER, 15]], { gold: 2500, resources: { ore: 14, crystals: 4 }, creatures: [{ unitType: UnitType.AUTOMATON, count: 3 }] }),
    variant(10, 4200, [[UnitType.JUGGERNAUT, 4], [UnitType.BOUNTY_HUNTER, 28]], { gold: 4500, resources: { ore: 20, crystals: 6 }, artifactTokens: ["major"] }),
  ]),
  griffin_conservatory: bank("griffin_conservatory", "Conservatoire de griffons", "Rocher-nid de griffons royaux.", [TerrainType.GRASS, TerrainType.MOUNTAIN, TerrainType.SNOW], 0.8, [
    variant(30, 1000, [[UnitType.GRIFFIN, 28]], { creatures: [{ unitType: UnitType.ANGEL, count: 1 }] }),
    variant(30, 1600, [[UnitType.GRIFFIN, 42], [UnitType.ROYAL_GRIFFIN, 10]], { creatures: [{ unitType: UnitType.ANGEL, count: 2 }] }),
    variant(30, 2500, [[UnitType.ROYAL_GRIFFIN, 45]], { creatures: [{ unitType: UnitType.ANGEL, count: 3 }] }),
    variant(10, 3800, [[UnitType.ROYAL_GRIFFIN, 70], [UnitType.CHAMPION, 8]], { creatures: [{ unitType: UnitType.ARCHANGEL, count: 1 }] }),
  ]),
  imp_cache: bank("imp_cache", "Cache des diablotins", "Cache infernale pleine de soufre et d'or vole.", [TerrainType.LAVA, TerrainType.DIRT, TerrainType.SAND], 1.2, [
    variant(30, 450, [[UnitType.IMP, 80]], { gold: 700, resources: { sulfur: 1 } }),
    variant(30, 800, [[UnitType.IMP, 110], [UnitType.FAMILIAR, 30]], { gold: 1200, resources: { sulfur: 2 } }),
    variant(30, 1300, [[UnitType.FAMILIAR, 120], [UnitType.GOG, 18]], { gold: 1800, resources: { sulfur: 4 }, creatures: [{ unitType: UnitType.FAMILIAR, count: 12 }] }),
    variant(10, 2200, [[UnitType.FAMILIAR, 160], [UnitType.MAGOG, 30]], { gold: 2800, resources: { sulfur: 6 }, creatures: [{ unitType: UnitType.FAMILIAR, count: 18 }] }),
  ]),
  ivory_tower: bank("ivory_tower", "Tour d'ivoire", "Tour blanche protegee par des mages.", [TerrainType.SNOW, TerrainType.GRASS, TerrainType.MOUNTAIN], 0.65, [
    variant(30, 1200, [[UnitType.MAGE, 18], [UnitType.GOLEM, 30]], { gold: 1500, resources: { gems: 2 } }),
    variant(30, 1900, [[UnitType.ARCH_MAGE, 18], [UnitType.IRON_GOLEM, 32]], { gold: 2500, resources: { gems: 3 }, artifactTokens: ["minor"] }),
    variant(30, 3000, [[UnitType.ARCH_MAGE, 32], [UnitType.GENIE, 12]], { gold: 3500, resources: { gems: 5 }, creatures: [{ unitType: UnitType.MAGE, count: 4 }] }),
    variant(10, 4600, [[UnitType.MASTER_GENIE, 24], [UnitType.NAGA, 10]], { gold: 6000, artifactTokens: ["major"], creatures: [{ unitType: UnitType.ARCH_MAGE, count: 5 }] }),
  ]),
  mansion: bank("mansion", "Manoir", "Manoir occulte de vampires.", [TerrainType.DIRT, TerrainType.SWAMP, TerrainType.FOREST], 0.75, [
    variant(30, 1100, [[UnitType.VAMPIRE, 18], [UnitType.WIGHT, 18]], { gold: 1500, resources: { mercury: 2 } }),
    variant(30, 1800, [[UnitType.VAMPIRE, 30], [UnitType.WRAITH, 20]], { gold: 2500, resources: { mercury: 4 } }),
    variant(30, 2800, [[UnitType.VAMPIRE_LORD, 32], [UnitType.LICH, 10]], { gold: 4000, artifactTokens: ["minor"], creatures: [{ unitType: UnitType.VAMPIRE, count: 4 }] }),
    variant(10, 4300, [[UnitType.VAMPIRE_LORD, 50], [UnitType.DREAD_KNIGHT, 8]], { gold: 6500, artifactTokens: ["major"], creatures: [{ unitType: UnitType.VAMPIRE_LORD, count: 5 }] }),
  ]),
  medusa_stores: bank("medusa_stores", "Depot des meduses", "Depot pierreux de meduses.", [TerrainType.SAND, TerrainType.DIRT, TerrainType.MOUNTAIN], 0.9, [
    variant(30, 850, [[UnitType.MEDUSA, 24]], { resources: { sulfur: 2, gems: 1 } }),
    variant(30, 1400, [[UnitType.MEDUSA, 34], [UnitType.MEDUSA_QUEEN, 8]], { resources: { sulfur: 4, gems: 2 } }),
    variant(30, 2100, [[UnitType.MEDUSA_QUEEN, 36]], { resources: { sulfur: 6, gems: 4 }, creatures: [{ unitType: UnitType.MEDUSA, count: 4 }] }),
    variant(10, 3200, [[UnitType.MEDUSA_QUEEN, 52], [UnitType.MANTICORE, 8]], { resources: { sulfur: 9, gems: 6 }, creatures: [{ unitType: UnitType.MEDUSA_QUEEN, count: 5 }] }),
  ]),
  naga_bank: bank("naga_bank", "Banque des nagas", "Banque gardée par des nagas.", [TerrainType.SNOW, TerrainType.GRASS, TerrainType.MOUNTAIN], 0.45, [
    variant(30, 2400, [[UnitType.NAGA, 12], [UnitType.IRON_GOLEM, 28]], { gold: 4000, resources: { gems: 2 } }),
    variant(30, 3600, [[UnitType.NAGA, 20], [UnitType.NAGA_QUEEN, 4]], { gold: 6000, resources: { gems: 4 } }),
    variant(30, 5200, [[UnitType.NAGA_QUEEN, 18], [UnitType.MASTER_GENIE, 12]], { gold: 9000, resources: { gems: 6 }, creatures: [{ unitType: UnitType.NAGA, count: 2 }] }),
    variant(10, 7600, [[UnitType.NAGA_QUEEN, 32], [UnitType.TITAN, 2]], { gold: 14000, artifactTokens: ["major"], creatures: [{ unitType: UnitType.NAGA_QUEEN, count: 2 }] }),
  ]),
  pirate_cavern: bank("pirate_cavern", "Caverne de pirates", "Caverne côtière remplie de butin.", [TerrainType.SAND, TerrainType.WATER, TerrainType.SWAMP], 0.8, [
    variant(30, 850, [[UnitType.PIRATE, 28]], { gold: 1200, resources: { wood: 4 } }),
    variant(30, 1500, [[UnitType.CORSAIR, 24], [UnitType.PIRATE, 20]], { gold: 2200, resources: { wood: 6 } }),
    variant(30, 2600, [[UnitType.SEA_DOG, 30], [UnitType.SEA_WITCH, 10]], { gold: 3600, artifactTokens: ["minor"], creatures: [{ unitType: UnitType.PIRATE, count: 5 }] }),
    variant(10, 4200, [[UnitType.SEA_DOG, 50], [UnitType.NIX, 8]], { gold: 6500, artifactTokens: ["major"], creatures: [{ unitType: UnitType.CORSAIR, count: 6 }] }),
  ], true),
  red_tower: bank("red_tower", "Tour rouge", "Tour ecarlate protegee par des dragons rouges.", [TerrainType.MOUNTAIN, TerrainType.LAVA, TerrainType.DIRT], 0.28, [
    variant(30, 4400, [[UnitType.RED_DRAGON, 3], [UnitType.MANTICORE, 12]], { resources: { sulfur: 4 }, artifactTokens: ["minor"] }),
    variant(30, 6200, [[UnitType.RED_DRAGON, 5], [UnitType.SCORPICORE, 12]], { resources: { sulfur: 6 }, artifactTokens: ["major"] }),
    variant(30, 8400, [[UnitType.RED_DRAGON, 8]], { gold: 5000, resources: { sulfur: 8 }, artifactTokens: ["major"] }),
    variant(10, 11600, [[UnitType.RED_DRAGON, 12], [UnitType.BLACK_DRAGON, 2]], { gold: 9000, resources: { sulfur: 12 }, artifactTokens: ["relic"] }),
  ]),
  ruins: bank("ruins", "Ruines", "Ruines gardees par des soldats oublies.", [TerrainType.DIRT, TerrainType.GRASS, TerrainType.FOREST], 1.05, [
    variant(30, 850, [[UnitType.ROGUE, 30], [UnitType.NOMAD, 10]], { gold: 1200, artifactTokens: ["minor"] }),
    variant(30, 1400, [[UnitType.NOMAD, 22], [UnitType.MUMMY, 18]], { gold: 2000, resources: { gems: 2 } }),
    variant(30, 2300, [[UnitType.MUMMY, 35], [UnitType.ENCHANTER, 8]], { gold: 3200, artifactTokens: ["minor"] }),
    variant(10, 3600, [[UnitType.ENCHANTER, 22], [UnitType.DIAMOND_GOLEM, 8]], { gold: 5200, artifactTokens: ["major"] }),
  ]),
  shipwreck: bank("shipwreck", "Épave", "Navire brise charge de tresors.", [TerrainType.SAND, TerrainType.WATER, TerrainType.SWAMP], 0.65, [
    variant(30, 1200, [[UnitType.CREW_MATE, 55], [UnitType.PIRATE, 16]], { gold: 1800, resources: { wood: 6 } }),
    variant(30, 2200, [[UnitType.SEAMAN, 50], [UnitType.CORSAIR, 24]], { gold: 3200, resources: { wood: 9 }, artifactTokens: ["minor"] }),
    variant(30, 3600, [[UnitType.SEA_DOG, 45], [UnitType.SEA_WITCH, 18]], { gold: 5200, artifactTokens: ["major"] }),
    variant(10, 5600, [[UnitType.SEA_DOG, 70], [UnitType.NIX_WARRIOR, 8]], { gold: 9000, artifactTokens: ["relic"] }),
  ], true),
  spit: bank("spit", "Banc de sable", "Banc de sable protégé par des créatures marines.", [TerrainType.SAND, TerrainType.WATER], 0.75, [
    variant(30, 800, [[UnitType.NYMPH, 60], [UnitType.OCEANID, 12]], { gold: 900, resources: { gems: 1 } }),
    variant(30, 1500, [[UnitType.OCEANID, 50], [UnitType.WATER_ELEMENTAL, 14]], { gold: 1500, resources: { gems: 2 } }),
    variant(30, 2600, [[UnitType.ICE_ELEMENTAL, 36], [UnitType.SEA_WITCH, 12]], { gold: 2400, resources: { gems: 4 }, creatures: [{ unitType: UnitType.OCEANID, count: 6 }] }),
    variant(10, 4300, [[UnitType.SEA_SERPENT, 8], [UnitType.NIX, 10]], { gold: 4200, artifactTokens: ["major"], creatures: [{ unitType: UnitType.ICE_ELEMENTAL, count: 4 }] }),
  ], true),
  temple_of_the_sea: bank("temple_of_the_sea", "Temple de la mer", "Temple marin consacre aux serpents des abysses.", [TerrainType.WATER, TerrainType.SAND, TerrainType.SWAMP], 0.35, [
    variant(30, 3200, [[UnitType.SEA_SERPENT, 5], [UnitType.SEA_WITCH, 18]], { gold: 3500, resources: { gems: 3 }, artifactTokens: ["minor"] }),
    variant(30, 4800, [[UnitType.SEA_SERPENT, 8], [UnitType.NIX, 12]], { gold: 5500, resources: { gems: 5 }, artifactTokens: ["major"] }),
    variant(30, 7000, [[UnitType.HASPID, 5], [UnitType.NIX_WARRIOR, 12]], { gold: 8000, artifactTokens: ["major"], creatures: [{ unitType: UnitType.SEA_SERPENT, count: 1 }] }),
    variant(10, 9800, [[UnitType.HASPID, 9], [UnitType.SEA_SERPENT, 8]], { gold: 13000, artifactTokens: ["relic"], creatures: [{ unitType: UnitType.HASPID, count: 1 }] }),
  ], true),
  wolf_raider_picket: bank("wolf_raider_picket", "Poste de pillards loups", "Poste de pillards rapides.", [TerrainType.DIRT, TerrainType.GRASS, TerrainType.SAND], 1.15, [
    variant(30, 650, [[UnitType.WOLF_RIDER, 45]], { gold: 800, resources: { wood: 3 } }),
    variant(30, 1000, [[UnitType.WOLF_RIDER, 65], [UnitType.WOLF_RAIDER, 12]], { gold: 1300, resources: { wood: 4 } }),
    variant(30, 1550, [[UnitType.WOLF_RAIDER, 55], [UnitType.ORC, 20]], { gold: 2100, creatures: [{ unitType: UnitType.WOLF_RIDER, count: 7 }] }),
    variant(10, 2400, [[UnitType.WOLF_RAIDER, 85], [UnitType.ORC_CHIEFTAIN, 25]], { gold: 3200, creatures: [{ unitType: UnitType.WOLF_RAIDER, count: 8 }] }),
  ]),
};

export function isCreatureBankType(value: string | undefined): value is CreatureBankType {
  return CREATURE_BANK_TYPES.includes(value as CreatureBankType);
}

export function getCreatureBankDefinition(type: string | undefined): CreatureBankDefinition | undefined {
  return isCreatureBankType(type) ? CREATURE_BANK_DEFINITIONS[type] : undefined;
}

export function getCreatureBankLabel(type: string | undefined): string | undefined {
  return getCreatureBankDefinition(type)?.label;
}

export function pickCreatureBankVariant(type: CreatureBankType, seed: string): CreatureBankVariant {
  const definition = CREATURE_BANK_DEFINITIONS[type];
  const roll = hashSeed(seed) % 100;
  let cursor = 0;
  for (const candidate of definition.variants) {
    cursor += candidate.chance;
    if (roll < cursor) return candidate;
  }
  return definition.variants[definition.variants.length - 1];
}

export function createCreatureBankGuardStacks(type: CreatureBankType, bankId: string): UnitStack[] {
  return pickCreatureBankVariant(type, bankId).guards.map(({ unitType, count }, position) => {
    const rule = getUnitRule(unitType);
    return {
      id: `${bankId}-guard-${position}`,
      unitType,
      count,
      health: count * rule.health,
      maxHealth: rule.health,
      position,
    };
  });
}

export function createCreatureBankPendingReward(
  type: CreatureBankType,
  bankId: string,
  heroId: string,
  playerId: string,
): PendingCreatureBankReward {
  const definition = CREATURE_BANK_DEFINITIONS[type];
  const variant = pickCreatureBankVariant(type, bankId);
  return {
    bankId,
    bankType: type,
    label: definition.label,
    heroId,
    playerId,
    reward: cloneReward(variant.reward),
  };
}

export function getCreatureBankGuardPower(type: CreatureBankType, bankId: string): number {
  return pickCreatureBankVariant(type, bankId).guardPower;
}

function bank(
  type: CreatureBankType,
  label: string,
  description: string,
  preferredTerrain: TerrainType[],
  rarity: number,
  variants: CreatureBankVariant[],
  aquatic = false,
): CreatureBankDefinition {
  return { type, label, description, preferredTerrain, rarity, variants, aquatic };
}

function variant(
  chance: number,
  guardPower: number,
  guards: Array<[UnitType, number]>,
  reward: CreatureBankReward,
): CreatureBankVariant {
  return { chance, guardPower, guards: guards.map(([unitType, count]) => ({ unitType, count })), reward };
}

function spreadRare(amount: number): Partial<Omit<Resources, "gold">> {
  return Object.fromEntries(rareResources.map((resource) => [resource, amount])) as Partial<Omit<Resources, "gold">>;
}

function cloneReward(reward: CreatureBankReward): CreatureBankReward {
  return {
    gold: reward.gold,
    resources: reward.resources ? { ...reward.resources } : undefined,
    experience: reward.experience,
    creatures: reward.creatures?.map((entry) => ({ ...entry })),
    artifactTokens: reward.artifactTokens ? [...reward.artifactTokens] : undefined,
  };
}
