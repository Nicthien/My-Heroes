# Adventure Movement Rules

These rules are the source of truth for adventure-map movement and pathfinding.
Read this file before changing adventure movement, map pathfinding, roads, map generation, or server movement validation.

## Scope

- These rules apply only to the square-grid adventure map.
- Do not apply these rules to manual combat. Combat uses its own hex grid in `src/lib/game/combat/*`.
- Keep adventure buildings separate from resource buildings. Adventure buildings must not become road targets.

## Shared Helpers

Use the shared helpers from `src/lib/game/engine`:

- `canMoveAdventureStep(map, from, to)`
- `getAdventureStepCost(map, from, to)`
- `getAdventurePathCost(map, path)`
- `getDailyAdventureMovement(heroArmies)`

Do not add adventure movement by summing `tile.movementCost` directly. That skips diagonal rules, road priority, and corner blocking.

## Step Rules

- Heroes can move in 8 directions on the adventure map.
- Orthogonal steps cost the destination surface cost.
- Diagonal steps cost `floor(destination surface cost * 141 / 100)`.
- The movement cost is based on the destination tile.

## Terrain And Road Costs

Roads replace terrain cost:

- Paved road: 50 PM
- Gravel road: 65 PM
- Dirt road: 75 PM

Terrain costs when no road is present:

- Grass / dirt: 100 PM
- Sand / snow / forest: 150 PM
- Swamp: 175 PM
- Water: 200 PM
- Mountain: 250 PM
- Lava, walls, and blocking decor: impassable

## Diagonal Blocking

Diagonal movement is allowed only when:

- the destination tile is traversable, and
- both orthogonal side tiles in the 2x2 movement square are traversable.

A hero must never squeeze diagonally between two touching obstacles. Two impassable objects that touch by corners form a continuous barrier for adventure pathfinding.

## Server Authority

- The server validates submitted paths.
- The server updates `heroes.x`, `heroes.y`, and `heroes.movement`.
- The client may animate a chosen path, but must reload/sync state after the server accepts the move.

## Daily Movement

Daily adventure movement is based on the slowest unit in the hero army:

- Speed <= 3: 1500 PM
- Speed 4: 1560 PM
- Speed 5: 1630 PM
- Speed 6: 1700 PM
- Speed 7: 1760 PM
- Speed 8: 1830 PM
- Speed 9: 1900 PM
- Speed 10: 1960 PM
- Speed >= 11: 2000 PM
- Empty army: 2000 PM

Logistics, artifacts, stables, and Pathfinding/Orientation are intentionally out of scope until their systems exist.
