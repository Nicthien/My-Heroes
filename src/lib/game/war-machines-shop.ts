import { Faction } from "./types";

export type WarMachineKey = "ballista" | "firstAid" | "ammoCart";

/** Gold cost of each war machine, aligned with Heroes of Might & Magic III. */
export const WAR_MACHINE_COST: Record<WarMachineKey, number> = {
  ballista: 1500,
  firstAid: 750,
  ammoCart: 1000,
};

/**
 * Which war machine each faction's Blacksmith forges (HoMM3). Every faction can buy
 * its own machine once the town has a Blacksmith; the War Machine Factory on the
 * adventure map sells all three to anyone.
 */
export const BLACKSMITH_WAR_MACHINES: Record<Faction, WarMachineKey[]> = {
  [Faction.CASTLE]: ["ballista"],
  [Faction.RAMPART]: ["firstAid"],
  [Faction.TOWER]: ["ammoCart"],
  [Faction.INFERNO]: ["ammoCart"],
  [Faction.NECROPOLIS]: ["firstAid"],
  [Faction.DUNGEON]: ["ballista"],
  // Stronghold's Ballista Yard lets it forge both the Ballista and the Ammo Cart.
  [Faction.STRONGHOLD]: ["ballista", "ammoCart"],
  [Faction.FORTRESS]: ["firstAid"],
  [Faction.CONFLUX]: ["ballista"],
};

export function getBlacksmithMachines(faction: Faction | string | undefined): WarMachineKey[] {
  return BLACKSMITH_WAR_MACHINES[faction as Faction] ?? ["ballista"];
}

export const WAR_MACHINE_LABEL_KEY: Record<WarMachineKey, { label: string; desc: string }> = {
  ballista: { label: "ballista.ballistaLabel", desc: "ballista.ballistaDesc" },
  firstAid: { label: "ballista.tentLabel", desc: "ballista.tentDesc" },
  ammoCart: { label: "ballista.ammoLabel", desc: "ballista.ammoDesc" },
};
