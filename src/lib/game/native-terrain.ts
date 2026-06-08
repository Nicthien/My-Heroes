import { TerrainType, type UnitType } from "./types";
import { getCreature, type CreatureGroupKey } from "./creature-catalog";

// Native terrain per faction. An army whose creatures are all native to a
// terrain moves across it without penalty (adventure map) and gains +1 morale on it
// (combat). Stronghold is native to Rough, Dungeon to Subterranean.
export const FACTION_NATIVE_TERRAIN: Partial<Record<CreatureGroupKey, TerrainType>> = {
  castle: TerrainType.GRASS,
  rampart: TerrainType.GRASS,
  tower: TerrainType.SNOW,
  inferno: TerrainType.LAVA,
  necropolis: TerrainType.DIRT,
  dungeon: TerrainType.SUBTERRANEAN,
  stronghold: TerrainType.ROUGH,
  fortress: TerrainType.SWAMP,
  conflux: TerrainType.GRASS,
  cove: TerrainType.SAND,
  factory: TerrainType.SAND,
  bulwark: TerrainType.SNOW,
};

export function getNativeTerrainForGroup(group: CreatureGroupKey): TerrainType | undefined {
  return FACTION_NATIVE_TERRAIN[group];
}

export function getNativeTerrainForUnit(unitType: UnitType): TerrainType | undefined {
  return FACTION_NATIVE_TERRAIN[getCreature(unitType).group];
}

/**
 * The terrain a hero army moves across without penalty, or null when the army is
 * empty or its creatures do not all share a single native terrain. Used to waive the
 * adventure-map movement penalty (native-terrain rule).
 */
export function getArmyNativeTerrain(army: ReadonlyArray<{ unitType: UnitType }>): TerrainType | null {
  if (army.length === 0) return null;
  let native: TerrainType | undefined;
  for (const stack of army) {
    const terrain = getNativeTerrainForUnit(stack.unitType);
    if (!terrain) return null;
    if (native === undefined) native = terrain;
    else if (native !== terrain) return null;
  }
  return native ?? null;
}
