import { generateMap } from "../src/lib/game/engine";

for (const seed of ["seed-A", "seed-B", "seed-C"]) {
  for (const templateId of ["jebus-cross", "archipelago", "broken-kingdoms"]) {
    const map = generateMap({ width: 72, height: 72, seed, playerCount: 2, templateId });

    const playerZone = map.zones?.find((z) => z.type === "player" && z.ownerIndex === 0);
    if (!playerZone) continue;

    let pileCount = 0;
    let mineCount = 0;
    for (const row of map.tiles) {
      for (const t of row) {
        if (!t.object) continue;
        // Nearest-center zone assignment (approx Voronoi)
        let bestId = -1;
        let bestD = Infinity;
        for (const z of map.zones ?? []) {
          const d = (t.x - z.centerX) ** 2 + (t.y - z.centerY) ** 2;
          if (d < bestD) {
            bestD = d;
            bestId = z.id;
          }
        }
        if (bestId !== playerZone.id) continue;
        if (t.object.type === "resource") pileCount++;
        else if (t.object.type === "building") mineCount++;
      }
    }
    console.log(`${templateId} ${seed}: zone value=${playerZone.value} → ${pileCount} piles, ${mineCount} mines`);
  }
}
