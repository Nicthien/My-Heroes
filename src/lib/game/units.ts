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
  pikeman: { type: UnitType.PIKEMAN, label: "Piquier", health: 12, speed: 4, attack: 4, defense: 5, minDamage: 1, maxDamage: 3, power: 60 },
  halberdier: { type: UnitType.HALBERDIER, label: "Hallebardier", health: 12, speed: 5, attack: 6, defense: 5, minDamage: 2, maxDamage: 3, power: 90 },
  archer: { type: UnitType.ARCHER, label: "Archer", health: 10, speed: 4, attack: 6, defense: 3, minDamage: 2, maxDamage: 3, power: 90, ranged: true, shots: 12 },
  marksman: { type: UnitType.MARKSMAN, label: "Tireur d'elite", health: 10, speed: 6, attack: 6, defense: 3, minDamage: 2, maxDamage: 3, power: 140, ranged: true, shots: 24, abilities: ["double_shot"] },
  griffin: { type: UnitType.GRIFFIN, label: "Griffon", health: 25, speed: 7, attack: 8, defense: 8, minDamage: 3, maxDamage: 6, power: 220, abilities: ["two_retaliations"] },
  royal_griffin: { type: UnitType.ROYAL_GRIFFIN, label: "Griffon royal", health: 25, speed: 9, attack: 9, defense: 9, minDamage: 3, maxDamage: 6, power: 320, abilities: ["unlimited_retaliations"] },
  swordsman: { type: UnitType.SWORDSMAN, label: "Epeiste", health: 35, speed: 5, attack: 10, defense: 12, minDamage: 6, maxDamage: 9, power: 350 },
  crusader: { type: UnitType.CRUSADER, label: "Croise", health: 35, speed: 6, attack: 12, defense: 12, minDamage: 7, maxDamage: 10, power: 520, abilities: ["double_attack"] },
  monk: { type: UnitType.MONK, label: "Moine", health: 30, speed: 5, attack: 12, defense: 7, minDamage: 10, maxDamage: 12, power: 500, ranged: true, shots: 12 },
  zealot: { type: UnitType.ZEALOT, label: "Zelote", health: 30, speed: 7, attack: 12, defense: 10, minDamage: 10, maxDamage: 12, power: 700, ranged: true, shots: 24 },
  cavalier: { type: UnitType.CAVALIER, label: "Cavalier", health: 100, speed: 7, attack: 15, defense: 15, minDamage: 15, maxDamage: 25, power: 900, abilities: ["charge"] },
  champion: { type: UnitType.CHAMPION, label: "Champion", health: 100, speed: 9, attack: 16, defense: 16, minDamage: 20, maxDamage: 25, power: 1200, abilities: ["charge"] },
  angel: { type: UnitType.ANGEL, label: "Ange", health: 200, speed: 12, attack: 20, defense: 20, minDamage: 50, maxDamage: 50, power: 3000 },
  archangel: { type: UnitType.ARCHANGEL, label: "Archange", health: 250, speed: 18, attack: 30, defense: 30, minDamage: 50, maxDamage: 50, power: 4500 },
};

export function getUnitRule(unitType: UnitType | string): UnitRule {
  return UNIT_RULES[unitType as UnitType] ?? UNIT_RULES[UnitType.PIKEMAN];
}
