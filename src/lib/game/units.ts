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

export const UNIT_RULES = Object.fromEntries(
  CREATURES.map((creature) => [
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
) as Record<UnitType, UnitRule>;

export function getUnitRule(unitType: UnitType | string): UnitRule {
  return UNIT_RULES[unitType as UnitType] ?? UNIT_RULES[UnitType.PIKEMAN];
}
