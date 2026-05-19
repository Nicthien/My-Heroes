import {
  canMoveAdventureStep,
  areAdventurePositionsAdjacent,
  computeReachableTiles,
  findPath,
  findPathToAdjacent,
  getAdventurePathCost,
  getAdventurePathCostAvoiding,
  getAdventureStepCost,
  getDailyAdventureMovement,
  getMinimumAdjacentAdventureStepCost,
  getUsableAdventureMovement,
} from "../src/lib/game/engine";
import { GameMap, MapTile, TerrainType, UnitType } from "../src/lib/game/types";

function tile(x: number, y: number, terrain = TerrainType.GRASS): MapTile {
  return {
    x,
    y,
    terrain,
    elevation: 0,
    isPassable: terrain !== TerrainType.LAVA,
    movementCost: terrain === TerrainType.GRASS ? 100 : 999,
  };
}

function map(width: number, height: number): GameMap {
  return {
    width,
    height,
    tiles: Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => tile(x, y))
    ),
  };
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const diagonalMap = map(2, 2);
assert(getAdventureStepCost(diagonalMap, { x: 0, y: 0 }, { x: 1, y: 1 }) === 141, "grass diagonal should cost 141 PM");

const roadMap = map(2, 2);
roadMap.tiles[0][1].road = "paved";
roadMap.tiles[1][1].road = "paved";
assert(getAdventureStepCost(roadMap, { x: 0, y: 0 }, { x: 1, y: 0 }) === 50, "paved orthogonal should cost 50 PM");
assert(getAdventureStepCost(roadMap, { x: 0, y: 0 }, { x: 1, y: 1 }) === 70, "paved diagonal should cost 70 PM");

const routeMap = map(5, 2);
for (const x of [1, 2, 3]) routeMap.tiles[0][x].road = "paved";
const routePath = findPath(routeMap, { x: 0, y: 1 }, { x: 4, y: 1 }, Number.POSITIVE_INFINITY);
assert(routePath.some((p) => p.y === 0), "pathfinding should prefer cheaper road detour");
assert(getAdventurePathCost(routeMap, routePath) < 400, "road detour should be cheaper than straight grass");

const blockedMap = map(2, 2);
blockedMap.tiles[0][1].object = { type: "wall", id: "wall-a" };
blockedMap.tiles[0][1].isPassable = false;
blockedMap.tiles[1][0].object = { type: "wall", id: "wall-b" };
blockedMap.tiles[1][0].isPassable = false;
assert(!canMoveAdventureStep(blockedMap, { x: 0, y: 0 }, { x: 1, y: 1 }), "diagonal through touching obstacles should be blocked");

const combatBlockMap = map(4, 1);
combatBlockMap.tiles[0][1].object = { type: "monster", id: "guard" };
const approachPath = findPathToAdjacent(combatBlockMap, { x: 0, y: 0 }, { x: 1, y: 0 }, 100);
assert(approachPath.length === 1 && approachPath[0].x === 0 && approachPath[0].y === 0, "combat approach should stop before adjacent blocker");
assert(areAdventurePositionsAdjacent(approachPath[0], { x: 1, y: 0 }), "combat approach destination should be adjacent to target");
assert(!Number.isFinite(getAdventurePathCostAvoiding(combatBlockMap, [{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 1, y: 0 }])), "combat path cannot enter blocked target");

const gateMap = map(3, 1);
gateMap.tiles[0][1].object = { type: "gate", id: "gate-a" };
gateMap.tiles[0][1].road = "paved";
assert(canMoveAdventureStep(gateMap, { x: 0, y: 0 }, { x: 1, y: 0 }), "empty or allied gates should be traversable by movement helpers");
assert(getAdventureStepCost(gateMap, { x: 0, y: 0 }, { x: 1, y: 0 }) === 50, "gate road tile should keep road movement cost");

const reachable = computeReachableTiles(diagonalMap, { x: 0, y: 0 }, 100);
assert(reachable.has("1,0"), "orthogonal grass tile should be reachable with 100 PM");
assert(!reachable.has("1,1"), "diagonal grass tile should not be reachable with only 100 PM");
assert(getMinimumAdjacentAdventureStepCost(diagonalMap, { x: 0, y: 0 }) === 100, "cheapest adjacent grass step should cost 100 PM");
assert(getUsableAdventureMovement(diagonalMap, { x: 0, y: 0 }, 99) === 0, "movement below cheapest adjacent step should be exhausted");
assert(getUsableAdventureMovement(diagonalMap, { x: 0, y: 0 }, 100) === 100, "movement matching cheapest adjacent step should remain usable");

assert(getDailyAdventureMovement([{ unitType: UnitType.DWARF }]) === 1500, "slow army should get 1500 PM");
assert(getDailyAdventureMovement([{ unitType: UnitType.ARCHANGEL }]) === 2000, "fast army should get 2000 PM");
assert(getDailyAdventureMovement([]) === 2000, "empty army should get 2000 PM");

console.log("Adventure movement rules validated.");
