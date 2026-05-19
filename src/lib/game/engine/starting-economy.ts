import { Faction, GameMap, ResourceBuildingType } from "../types";

const FACTION_RARE_MINE: Partial<Record<Faction, ResourceBuildingType>> = {
  [Faction.RAMPART]: ResourceBuildingType.CRYSTAL_CAVERN,
  [Faction.TOWER]: ResourceBuildingType.GEM_POND,
  [Faction.INFERNO]: ResourceBuildingType.SULFUR_DUNE,
  [Faction.DUNGEON]: ResourceBuildingType.SULFUR_DUNE,
  [Faction.NECROPOLIS]: ResourceBuildingType.ALCHEMIST_LAB,
  [Faction.CONFLUX]: ResourceBuildingType.ALCHEMIST_LAB,
};

const FALLBACK_RARE_MINES = [
  ResourceBuildingType.CRYSTAL_CAVERN,
  ResourceBuildingType.GEM_POND,
  ResourceBuildingType.SULFUR_DUNE,
  ResourceBuildingType.ALCHEMIST_LAB,
] as const;

export function rareMineForFaction(faction: Faction | string | undefined, ownerIndex = 0): ResourceBuildingType {
  const typedFaction = isFaction(faction) ? faction : undefined;
  return typedFaction && FACTION_RARE_MINE[typedFaction]
    ? FACTION_RARE_MINE[typedFaction]
    : FALLBACK_RARE_MINES[Math.abs(ownerIndex) % FALLBACK_RARE_MINES.length];
}

export function finalizeStartingRareMines(
  map: GameMap,
  playerFactionsByOwnerIndex: Map<number, Faction | string | undefined> | Array<Faction | string | undefined>,
): GameMap {
  for (const row of map.tiles) {
    for (const tile of row) {
      const object = tile.object;
      if (object?.type !== "building" || object.strategicRole !== "start_rare") continue;

      const ownerIndex = object.ownerIndex ?? 0;
      const faction = Array.isArray(playerFactionsByOwnerIndex)
        ? playerFactionsByOwnerIndex[ownerIndex]
        : playerFactionsByOwnerIndex.get(ownerIndex);
      const type = rareMineForFaction(faction, ownerIndex);

      object.subtype = type;
    }
  }

  return map;
}

function isFaction(value: unknown): value is Faction {
  return typeof value === "string" && Object.values(Faction).includes(value as Faction);
}
