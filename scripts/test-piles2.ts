import { generateMap } from "../src/lib/game/engine";

for (const seed of ["a", "b", "c", "d"]) {
  for (const templateId of ["jebus-cross", "archipelago", "volcanic-crown"]) {
    const map = generateMap({ width: 36, height: 36, seed, playerCount: 2, templateId });
    const playerZone = map.zones?.find((z) => z.type === "player" && z.ownerIndex === 0);
    if (!playerZone) continue;
    let piles = 0, mines = 0, advBldg = 0, monsters = 0;
    const pilesNearCastle: string[] = [];
    for (const row of map.tiles) for (const t of row) {
      if (!t.object) continue;
      let bestId = -1, bestD = Infinity;
      for (const z of map.zones ?? []) {
        const d = (t.x - z.centerX)**2 + (t.y - z.centerY)**2;
        if (d < bestD) { bestD = d; bestId = z.id; }
      }
      if (bestId !== playerZone.id) continue;
      const cheb = Math.max(Math.abs(t.x - playerZone.centerX), Math.abs(t.y - playerZone.centerY));
      if (t.object.type === "resource") {
        piles++;
        if (cheb <= 3) pilesNearCastle.push(`${t.object.subtype}@${cheb}`);
      }
      else if (t.object.type === "building") mines++;
      else if (t.object.type === "adventure_building") advBldg++;
      else if (t.object.type === "monster") monsters++;
    }
    console.log(`${templateId.padEnd(20)} ${seed}: piles=${piles} (${pilesNearCastle.length} near castle: ${pilesNearCastle.join(",")}), mines=${mines}, adv=${advBldg}, mon=${monsters}`);
  }
}
