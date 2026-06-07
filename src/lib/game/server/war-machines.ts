import type { createAdminClient } from "@/lib/supabase/admin";

/** Maps a war-machine combat unit type to its `heroes.war_machines` ownership flag. */
const WAR_MACHINE_FLAG: Record<string, "ballista" | "firstAid" | "ammoCart"> = {
  ballista: "ballista",
  first_aid_tent: "firstAid",
  ammo_cart: "ammoCart",
};

interface MachineUnit {
  id: string;
  unitType: string;
  heroId?: string | null;
  count: number;
}

/**
 * Clears the ownership flag of any bought war machine (Ballista, First Aid Tent,
 * Ammo Cart) that was destroyed during a combat, so the hero must buy it again.
 * The Catapult is never tracked here — it is virtual and reappears every siege.
 *
 * `before` are the units that entered the fight (carry heroId + unitType); `after`
 * is the resolved board (a machine missing or at count 0 is considered destroyed).
 */
export async function clearDestroyedWarMachines(
  supabase: ReturnType<typeof createAdminClient>,
  before: MachineUnit[],
  after: Array<{ id: string; count: number }>,
) {
  const survivingCountById = new Map(after.map((unit) => [unit.id, unit.count]));
  const destroyedByHero = new Map<string, Set<"ballista" | "firstAid" | "ammoCart">>();

  for (const unit of before) {
    const flag = WAR_MACHINE_FLAG[unit.unitType];
    if (!flag || !unit.heroId) continue;
    if ((survivingCountById.get(unit.id) ?? 0) > 0) continue; // survived
    const set = destroyedByHero.get(unit.heroId) ?? new Set();
    set.add(flag);
    destroyedByHero.set(unit.heroId, set);
  }

  for (const [heroId, flags] of destroyedByHero) {
    const { data } = await supabase.from("heroes").select("war_machines").eq("id", heroId).maybeSingle();
    const current = (data?.war_machines ?? {}) as Record<string, boolean>;
    const next = { ...current };
    for (const flag of flags) next[flag] = false;
    await supabase.from("heroes").update({ war_machines: next }).eq("id", heroId);
  }
}
