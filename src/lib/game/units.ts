import { UnitType } from "./types";

export interface UnitRule {
  type: UnitType;
  label: string;
  health: number;
  speed: number;
  attack: number;
  defense: number;
  minDamage: number;
  maxDamage: number;
  power: number;
  ranged?: boolean;
  shots?: number;
  abilities?: string[];
}

export const UNIT_RULES: Record<UnitType, UnitRule> = {
  pikeman: { type: UnitType.PIKEMAN, label: "Piquier", health: 10, speed: 4, attack: 4, defense: 5, minDamage: 1, maxDamage: 3, power: 60 },
  halberdier: { type: UnitType.HALBERDIER, label: "Hallebardier", health: 10, speed: 5, attack: 6, defense: 5, minDamage: 2, maxDamage: 3, power: 90 },
  archer: { type: UnitType.ARCHER, label: "Archer", health: 10, speed: 4, attack: 6, defense: 3, minDamage: 2, maxDamage: 3, power: 90, ranged: true, shots: 12 },
  marksman: { type: UnitType.MARKSMAN, label: "Tireur d'elite", health: 10, speed: 6, attack: 6, defense: 3, minDamage: 2, maxDamage: 3, power: 140, ranged: true, shots: 24, abilities: ["double_shot"] },
  griffin: { type: UnitType.GRIFFIN, label: "Griffon", health: 25, speed: 6, attack: 8, defense: 8, minDamage: 3, maxDamage: 6, power: 220, abilities: ["two_retaliations"] },
  royal_griffin: { type: UnitType.ROYAL_GRIFFIN, label: "Griffon royal", health: 25, speed: 9, attack: 9, defense: 9, minDamage: 3, maxDamage: 6, power: 320, abilities: ["unlimited_retaliations"] },
  swordsman: { type: UnitType.SWORDSMAN, label: "Epeiste", health: 35, speed: 5, attack: 10, defense: 12, minDamage: 6, maxDamage: 9, power: 350 },
  crusader: { type: UnitType.CRUSADER, label: "Croise", health: 35, speed: 6, attack: 12, defense: 12, minDamage: 7, maxDamage: 10, power: 520, abilities: ["double_attack"] },
  monk: { type: UnitType.MONK, label: "Moine", health: 30, speed: 5, attack: 12, defense: 7, minDamage: 10, maxDamage: 12, power: 500, ranged: true, shots: 12 },
  zealot: { type: UnitType.ZEALOT, label: "Zelote", health: 30, speed: 7, attack: 12, defense: 10, minDamage: 10, maxDamage: 12, power: 700, ranged: true, shots: 24 },
  cavalier: { type: UnitType.CAVALIER, label: "Cavalier", health: 100, speed: 7, attack: 15, defense: 15, minDamage: 15, maxDamage: 25, power: 900, abilities: ["charge"] },
  champion: { type: UnitType.CHAMPION, label: "Champion", health: 100, speed: 9, attack: 16, defense: 16, minDamage: 20, maxDamage: 25, power: 1200, abilities: ["charge"] },
  angel: { type: UnitType.ANGEL, label: "Ange", health: 200, speed: 12, attack: 20, defense: 20, minDamage: 50, maxDamage: 50, power: 3000 },
  archangel: { type: UnitType.ARCHANGEL, label: "Archange", health: 250, speed: 18, attack: 30, defense: 30, minDamage: 50, maxDamage: 50, power: 4500 },

  // Rempart
  centaur: { type: UnitType.CENTAUR, label: "Centaure", health: 8, speed: 6, attack: 5, defense: 3, minDamage: 2, maxDamage: 3, power: 70 },
  dwarf: { type: UnitType.DWARF, label: "Nain", health: 20, speed: 3, attack: 6, defense: 7, minDamage: 2, maxDamage: 4, power: 120 },
  wood_elf: { type: UnitType.WOOD_ELF, label: "Elfe sylvestre", health: 15, speed: 6, attack: 9, defense: 5, minDamage: 3, maxDamage: 5, power: 200, ranged: true, shots: 24 },
  pegasus: { type: UnitType.PEGASUS, label: "Pégase", health: 30, speed: 8, attack: 9, defense: 8, minDamage: 5, maxDamage: 9, power: 250 },
  dendroid: { type: UnitType.DENDROID, label: "Dendroïde", health: 55, speed: 3, attack: 9, defense: 12, minDamage: 10, maxDamage: 14, power: 350 },
  unicorn: { type: UnitType.UNICORN, label: "Licorne", health: 90, speed: 7, attack: 15, defense: 14, minDamage: 18, maxDamage: 22, power: 800 },
  green_dragon: { type: UnitType.GREEN_DRAGON, label: "Dragon vert", health: 180, speed: 10, attack: 18, defense: 18, minDamage: 40, maxDamage: 50, power: 2400 },

  // Tour
  gremlin: { type: UnitType.GREMLIN, label: "Gremlin", health: 4, speed: 4, attack: 3, defense: 3, minDamage: 1, maxDamage: 2, power: 55 },
  gargoyle: { type: UnitType.GARGOYLE, label: "Gargouille", health: 16, speed: 6, attack: 6, defense: 6, minDamage: 2, maxDamage: 3, power: 110 },
  golem: { type: UnitType.GOLEM, label: "Golem de pierre", health: 30, speed: 3, attack: 7, defense: 10, minDamage: 4, maxDamage: 5, power: 150 },
  mage: { type: UnitType.MAGE, label: "Mage", health: 25, speed: 5, attack: 11, defense: 8, minDamage: 7, maxDamage: 9, power: 350, ranged: true, shots: 24 },
  genie: { type: UnitType.GENIE, label: "Génie", health: 40, speed: 7, attack: 12, defense: 12, minDamage: 13, maxDamage: 16, power: 550 },
  naga: { type: UnitType.NAGA, label: "Naga", health: 110, speed: 5, attack: 16, defense: 13, minDamage: 20, maxDamage: 20, power: 1100, abilities: ["no_retaliation"] },
  giant: { type: UnitType.GIANT, label: "Géant", health: 150, speed: 7, attack: 19, defense: 16, minDamage: 40, maxDamage: 60, power: 2000 },

  // Hadès
  imp: { type: UnitType.IMP, label: "Lutin", health: 4, speed: 5, attack: 2, defense: 3, minDamage: 1, maxDamage: 2, power: 50 },
  gog: { type: UnitType.GOG, label: "Gog", health: 13, speed: 4, attack: 6, defense: 4, minDamage: 2, maxDamage: 4, power: 125, ranged: true, shots: 12 },
  hell_hound: { type: UnitType.HELL_HOUND, label: "Chien des enfers", health: 25, speed: 7, attack: 10, defense: 6, minDamage: 2, maxDamage: 7, power: 200 },
  demon: { type: UnitType.DEMON, label: "Démon", health: 35, speed: 5, attack: 10, defense: 10, minDamage: 7, maxDamage: 9, power: 250 },
  pit_fiend: { type: UnitType.PIT_FIEND, label: "Suppôt du Tartare", health: 45, speed: 6, attack: 13, defense: 13, minDamage: 13, maxDamage: 17, power: 500 },
  efreet: { type: UnitType.EFREET, label: "Efrit", health: 90, speed: 9, attack: 16, defense: 12, minDamage: 16, maxDamage: 24, power: 900 },
  devil: { type: UnitType.DEVIL, label: "Diable", health: 160, speed: 11, attack: 19, defense: 21, minDamage: 30, maxDamage: 40, power: 2700, abilities: ["no_retaliation"] },

  // Nécropole
  skeleton: { type: UnitType.SKELETON, label: "Squelette", health: 6, speed: 4, attack: 5, defense: 4, minDamage: 1, maxDamage: 3, power: 60 },
  zombie: { type: UnitType.ZOMBIE, label: "Zombie", health: 15, speed: 3, attack: 5, defense: 5, minDamage: 2, maxDamage: 3, power: 100 },
  wight: { type: UnitType.WIGHT, label: "Spectre", health: 18, speed: 5, attack: 7, defense: 7, minDamage: 3, maxDamage: 5, power: 230 },
  vampire: { type: UnitType.VAMPIRE, label: "Vampire", health: 30, speed: 6, attack: 10, defense: 9, minDamage: 5, maxDamage: 8, power: 360, abilities: ["life_drain"] },
  lich: { type: UnitType.LICH, label: "Liche", health: 30, speed: 6, attack: 13, defense: 10, minDamage: 11, maxDamage: 13, power: 550, ranged: true, shots: 12 },
  black_knight: { type: UnitType.BLACK_KNIGHT, label: "Chevalier noir", health: 120, speed: 7, attack: 16, defense: 16, minDamage: 15, maxDamage: 30, power: 1200 },
  bone_dragon: { type: UnitType.BONE_DRAGON, label: "Dragon-os", health: 150, speed: 9, attack: 17, defense: 15, minDamage: 25, maxDamage: 50, power: 1800 },

  // Donjon
  troglodyte: { type: UnitType.TROGLODYTE, label: "Troglodyte", health: 5, speed: 4, attack: 4, defense: 3, minDamage: 1, maxDamage: 3, power: 50 },
  harpy: { type: UnitType.HARPY, label: "Harpie", health: 14, speed: 6, attack: 6, defense: 5, minDamage: 1, maxDamage: 4, power: 130 },
  beholder: { type: UnitType.BEHOLDER, label: "Tyrannœil", health: 22, speed: 5, attack: 9, defense: 7, minDamage: 3, maxDamage: 5, power: 250, ranged: true, shots: 12 },
  medusa: { type: UnitType.MEDUSA, label: "Méduse", health: 25, speed: 5, attack: 9, defense: 9, minDamage: 6, maxDamage: 8, power: 320, ranged: true, shots: 4 },
  minotaur: { type: UnitType.MINOTAUR, label: "Minotaure", health: 50, speed: 6, attack: 14, defense: 12, minDamage: 12, maxDamage: 20, power: 500 },
  manticore: { type: UnitType.MANTICORE, label: "Manticore", health: 80, speed: 7, attack: 15, defense: 13, minDamage: 14, maxDamage: 20, power: 850 },
  red_dragon: { type: UnitType.RED_DRAGON, label: "Dragon rouge", health: 180, speed: 11, attack: 19, defense: 19, minDamage: 40, maxDamage: 50, power: 2500 },

  // Bastion
  goblin: { type: UnitType.GOBLIN, label: "Gobelin", health: 5, speed: 5, attack: 4, defense: 2, minDamage: 1, maxDamage: 2, power: 40 },
  wolf_rider: { type: UnitType.WOLF_RIDER, label: "Monteur de loup", health: 10, speed: 6, attack: 7, defense: 5, minDamage: 2, maxDamage: 4, power: 100 },
  orc: { type: UnitType.ORC, label: "Orc", health: 15, speed: 4, attack: 8, defense: 4, minDamage: 2, maxDamage: 5, power: 150, ranged: true, shots: 12 },
  ogre: { type: UnitType.OGRE, label: "Ogre", health: 40, speed: 4, attack: 13, defense: 7, minDamage: 6, maxDamage: 12, power: 300 },
  roc: { type: UnitType.ROC, label: "Roc", health: 60, speed: 7, attack: 13, defense: 11, minDamage: 11, maxDamage: 15, power: 600 },
  cyclops: { type: UnitType.CYCLOPS, label: "Cyclope", health: 70, speed: 6, attack: 15, defense: 12, minDamage: 16, maxDamage: 20, power: 750, ranged: true, shots: 16 },
  behemoth: { type: UnitType.BEHEMOTH, label: "Béhémoth", health: 160, speed: 6, attack: 17, defense: 17, minDamage: 30, maxDamage: 50, power: 1500 },

  // Forteresse
  gnoll: { type: UnitType.GNOLL, label: "Gnoll", health: 6, speed: 4, attack: 3, defense: 5, minDamage: 2, maxDamage: 3, power: 56 },
  lizardman: { type: UnitType.LIZARDMAN, label: "Homme-lézard", health: 14, speed: 4, attack: 5, defense: 6, minDamage: 2, maxDamage: 3, power: 110, ranged: true, shots: 12 },
  serpent_fly: { type: UnitType.SERPENT_FLY, label: "Mouche-dragon", health: 20, speed: 9, attack: 7, defense: 9, minDamage: 2, maxDamage: 5, power: 220 },
  basilisk: { type: UnitType.BASILISK, label: "Basilic", health: 35, speed: 5, attack: 11, defense: 11, minDamage: 6, maxDamage: 10, power: 325 },
  gorgon: { type: UnitType.GORGON, label: "Gorgone", health: 70, speed: 5, attack: 10, defense: 14, minDamage: 12, maxDamage: 16, power: 525 },
  wyvern: { type: UnitType.WYVERN, label: "Wyverne", health: 70, speed: 7, attack: 14, defense: 14, minDamage: 14, maxDamage: 18, power: 800 },
  hydra: { type: UnitType.HYDRA, label: "Hydre", health: 175, speed: 5, attack: 16, defense: 18, minDamage: 25, maxDamage: 45, power: 2200 },
};

export function getUnitRule(unitType: UnitType | string): UnitRule {
  return UNIT_RULES[unitType as UnitType] ?? UNIT_RULES[UnitType.PIKEMAN];
}
