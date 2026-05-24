import { CREATURES } from "./creature-catalog";
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

const WAR_MACHINE_RULES: Array<[UnitType, UnitRule]> = [
  [UnitType.BALLISTA, { type: UnitType.BALLISTA, label: "Baliste", health: 250, speed: 0, attack: 10, defense: 10, minDamage: 2, maxDamage: 3, power: 2500, ranged: true, shots: 99, abilities: ["war_machine"] }],
  [UnitType.FIRST_AID_TENT, { type: UnitType.FIRST_AID_TENT, label: "Tente de premiers secours", health: 75, speed: 0, attack: 0, defense: 5, minDamage: 0, maxDamage: 0, power: 750, abilities: ["war_machine", "heal"] }],
  [UnitType.AMMO_CART, { type: UnitType.AMMO_CART, label: "Chariot de munitions", health: 100, speed: 0, attack: 0, defense: 5, minDamage: 0, maxDamage: 0, power: 1000, abilities: ["war_machine"] }],
  [UnitType.CATAPULT, { type: UnitType.CATAPULT, label: "Catapulte", health: 500, speed: 0, attack: 10, defense: 5, minDamage: 30, maxDamage: 50, power: 0, ranged: true, shots: 99, abilities: ["war_machine", "siege"] }],
];

export const UNIT_RULES = Object.fromEntries([
  ...CREATURES.map((creature) => [
    creature.type,
    {
      type: creature.type,
      label: creature.label,
      health: creature.health,
      speed: creature.speed,
      attack: creature.attack,
      defense: creature.defense,
      minDamage: creature.minDamage,
      maxDamage: creature.maxDamage,
      power: creature.cost.gold ?? creature.aiValue,
      ranged: creature.ranged || undefined,
      shots: creature.ranged ? creature.shots : undefined,
      abilities: creature.abilities.length > 0 ? creature.abilities : undefined,
    },
  ]),
  ...WAR_MACHINE_RULES,
]) as Record<UnitType, UnitRule>;

export function getUnitRule(unitType: UnitType | string): UnitRule {
  return UNIT_RULES[unitType as UnitType] ?? UNIT_RULES[UnitType.PIKEMAN];
}
