import {
  GameState, Faction, HeroClass, UnitType, BuildingType,
  Hero, Town, Player, GameMap, MapTile, PersistentCombat,
  ResourceBuilding, ResourceBuildingType, TavernHeroOffer, NeutralArmy, AdventureBuildingType, Gate, MapObject, Boat,
  AdventureBuildingState, MapLevelId,
} from "./types";
import type { GameActionLogEntry } from "./server/action-log";
import { normalizeArtifactBag } from "./artifacts";
import { isCreatureBankType } from "./creature-banks";
import { isExternalDwellingType, normalizeExternalDwellingState } from "./external-dwellings";
import { isSingleMapRewardBuilding } from "./adventure-buildings";
import { computeVisibleTiles, getPlayerVisionCenters, normalizeMapMovement } from "./engine";
import { normalizeMapLevel, positionLevel, SURFACE_LEVEL, UNDERGROUND_LEVEL } from "./map-levels";
import { createNeutralArmyStacksForTile, getDominantUnitType } from "./neutral-armies";
import { countSkillLevels, generateSkillChoices, sanitizePendingSkillEntry, type HeroSkills, type SkillId } from "./skills";
import { normalizeTownBuildings } from "./town-buildings";
import { normalizeScoreStats } from "./score";
import { normalizeVictoryCondition } from "./victory";
import { computeGrailHint, getGrailLocation, playerHasGrailEffect } from "./grail";

interface ApiPlayer {
  id: string;
  userId: string | null;
  user?: { name: string | null };
  isAi?: boolean;
  aiName?: string | null;
  faction: string;
  color: string;
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems?: number;
  sulfur: number;
  isAlive: boolean;
  turnOrder: number;
  exploredTiles: string[];
  heroes: ApiHero[];
  tavernHeroes?: TavernHeroOffer[];
  towns: ApiTown[];
  resourceBuildings?: ApiResourceBuilding[];
  turnProgressRatio?: number;
  scoreStats?: unknown;
  score?: number;
}

interface ApiTurn {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
  startedAt?: string | null;
}

interface ApiActionLog {
  id: string;
  gameId: string;
  gamePlayerId: string | null;
  actorKind: GameActionLogEntry["actorKind"];
  turnNumber: number;
  actionType: string;
  category: string;
  summary: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface ApiHero {
  id: string;
  name: string;
  class?: string;
  specialty?: string | null;
  level: number;
  experience: number;
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
  morale?: number;
  luck?: number;
  mana?: number | null;
  hasSpellBook?: boolean;
  knownSpellIds?: string[] | null;
  artifacts?: unknown;
  skills?: unknown;
  warMachines?: unknown;
  x: number;
  y: number;
  mapLevel?: string | null;
  movement: number;
  maxMovement: number;
  armies: ApiArmy[];
}

interface ApiArmy {
  id: string;
  unitType: string;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

interface ApiNeutralArmy {
  id: string;
  status: string;
  x: number;
  y: number;
  mapLevel?: string | null;
  stacks?: ApiArmy[];
}

interface ApiGate {
  id: string;
  gamePlayerId: string | null;
  x: number;
  y: number;
  mapLevel?: string | null;
  guardianPower: number;
  garrison?: ApiArmy[];
}

interface ApiBoat {
  id: string;
  ownerId?: string | null;
  heroId?: string | null;
  faction?: string | null;
  x: number;
  y: number;
  mapLevel?: string | null;
}

interface ApiTown {
  id: string;
  name: string;
  townType?: string;
  x: number;
  y: number;
  mapLevel?: string | null;
  level: number;
  buildings: string[];
  garrison: string[];
  neutralGarrison?: ApiArmy[];
  isNeutral?: boolean;
  availableRecruits?: Record<string, number>;
  tavernOffer?: TavernHeroOffer[];
  lastBuiltTurn?: number | null;
}

interface ApiResourceBuilding {
  id: string;
  gamePlayerId: string | null;
  buildingType: string;
  x: number;
  y: number;
  mapLevel?: string | null;
  guardianPower: number;
}

interface ApiCombat {
  id: string;
  gameId: string;
  mode: "AUTO" | "MANUAL";
  status: "ACTIVE" | "RESOLVED";
  attackerPlayerId: string;
  defenderPlayerId?: string | null;
  attackerHeroId: string;
  defenderHeroId?: string | null;
  neutralArmyId?: string | null;
  gateId?: string | null;
  currentPlayerId?: string | null;
  currentUnitId?: string | null;
  round: number;
  x: number;
  y: number;
  mapLevel?: string | null;
  boardState: PersistentCombat["boardState"];
  turnQueue: string[];
  actionLog: string[];
  participants?: PersistentCombat["participants"];
  reinforcementRequests?: PersistentCombat["reinforcementRequests"];
  surrenderNegotiations?: PersistentCombat["surrenderNegotiations"];
  truces?: PersistentCombat["truces"];
  result?: PersistentCombat["result"];
  visibility?: PersistentCombat["visibility"];
}

const staticGameMaps = new Map<string, GameMap>();

function cloneGameMap(map: GameMap) {
  return structuredClone(map);
}

function shouldAlwaysKeepTileObject(object: MapTile["object"] | undefined) {
  return object?.type === "wall";
}

export function getCachedStaticGameMap(gameId: string) {
  return staticGameMaps.get(gameId) ?? null;
}

export function setCachedStaticGameMap(gameId: string, map: GameMap) {
  staticGameMaps.set(gameId, normalizeMapMovement(cloneGameMap(map)));
}

function getCompletedTurnPlayerIds(data: Record<string, unknown>, turnNumber: number) {
  return new Set(
    ((data.turns as ApiTurn[] | undefined) ?? [])
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );
}

function getTurnStartedAtByPlayer(data: Record<string, unknown>, turnNumber: number) {
  const map = new Map<string, string>();
  for (const turn of (data.turns as ApiTurn[] | undefined) ?? []) {
    if (turn.turnNumber === turnNumber && turn.startedAt) map.set(turn.gamePlayerId, turn.startedAt);
  }
  return map;
}

function getVisiblePendingSkillChoices(params: {
  gameId: string;
  heroId: string;
  heroLevel: number;
  heroClass: HeroClass;
  skills: HeroSkills;
  mapState: Record<string, unknown>;
}) {
  const pendingMap = (params.mapState.pendingSkillChoices as Record<string, Array<{ level: number; options: SkillId[] }>> | undefined) ?? {};
  const pendingRaw = pendingMap[params.heroId] ?? [];
  const pending = pendingRaw.map((entry) =>
    sanitizePendingSkillEntry(entry, params.skills, params.heroClass, `${params.gameId}:${params.heroId}:level:${entry.level}`),
  );
  const learnedFromLevels = countSkillLevels(params.skills);
  const expectedFromLevels = Math.max(0, Math.floor(Number(params.heroLevel ?? 1)) - 1);
  if (pending.length > 0 || learnedFromLevels >= expectedFromLevels) return pending;

  const level = learnedFromLevels + 2;
  const options = generateSkillChoices(params.skills, `${params.gameId}:${params.heroId}:level:${level}`, undefined, params.heroClass);
  return options.length > 0 ? [{ level, options }] : pending;
}

function mapPlayers(data: Record<string, unknown>, turnNumber: number) {
  const completedTurnPlayerIds = getCompletedTurnPlayerIds(data, turnNumber);
  const turnStartedAtByPlayer = getTurnStartedAtByPlayer(data, turnNumber);
  const mapState = (data.mapState as Record<string, unknown> | undefined) ?? {};
  const townSpellLibraries = (mapState.townSpellLibraries as Record<string, string[]> | undefined) ?? {};
  const townArtifactOffers = (mapState.townArtifactOffers as Record<string, string[]> | undefined) ?? {};

  return ((data.players as ApiPlayer[] | undefined) ?? []).map((player): Player => ({
    id: player.id,
    userId: player.userId,
    name: player.isAi ? player.aiName || "IA" : player.user?.name || "Joueur inconnu",
    isAi: player.isAi ?? false,
    faction: player.faction as Faction,
    color: player.color,
    resources: {
      gold: player.gold,
      wood: player.wood,
      ore: player.ore,
      mercury: player.mercury,
      crystals: player.crystals,
      gems: player.gems ?? 0,
      sulfur: player.sulfur,
    },
    heroes: player.heroes.map((hero): Hero => {
      const skills = (hero.skills as HeroSkills | undefined) ?? {};
      const pendingSkillChoices = getVisiblePendingSkillChoices({
        gameId: String(data.id ?? ""),
        heroId: hero.id,
        heroLevel: hero.level,
        heroClass: (hero.class ?? "knight") as HeroClass,
        skills,
        mapState,
      });
      return {
        id: hero.id,
        name: hero.name,
        class: (hero.class ?? "knight") as HeroClass,
        specialty: hero.specialty ?? undefined,
        level: hero.level,
        experience: hero.experience,
        stats: {
          attack: hero.attack,
          defense: hero.defense,
          spellPower: hero.spellPower,
          knowledge: hero.knowledge,
          morale: Number(hero.morale ?? 0),
          luck: Number(hero.luck ?? 0),
        },
        mana: hero.mana ?? hero.knowledge * 10,
        hasSpellBook: hero.hasSpellBook ?? true,
        knownSpellIds: hero.knownSpellIds ?? null,
        artifacts: normalizeArtifactBag(hero.artifacts),
        skills,
        warMachines: (hero.warMachines as { ballista?: boolean; firstAid?: boolean; ammoCart?: boolean } | undefined) ?? {},
        pendingSkillChoices,
        position: { x: hero.x, y: hero.y, level: normalizeMapLevel(hero.mapLevel) },
        movement: hero.movement,
        maxMovement: hero.maxMovement,
        armies: hero.armies.map((army) => ({
          id: army.id,
          unitType: army.unitType as UnitType,
          count: army.count,
          health: army.health,
          maxHealth: army.maxHealth,
          position: army.position,
        })),
      };
    }),
    tavernHeroes: player.tavernHeroes ?? [],
    towns: player.towns.map((town): Town => ({
      id: town.id,
      name: town.name,
      faction: player.faction as Faction,
      townType: town.townType as Faction | undefined,
      position: { x: town.x, y: town.y, level: normalizeMapLevel(town.mapLevel) },
      level: town.level,
      buildings: normalizeTownBuildings((town.buildings || []) as BuildingType[]),
      garrison: (town.garrison || []) as never[],
      neutralGarrison: (town.neutralGarrison ?? []).map((army) => ({
        id: army.id,
        unitType: army.unitType as UnitType,
        count: army.count,
        health: army.health,
        maxHealth: army.maxHealth,
        position: army.position,
      })),
      isNeutral: town.isNeutral ?? false,
      availableRecruits: (town.availableRecruits ?? {}) as Partial<Record<UnitType, number>>,
      tavernOffer: town.tavernOffer ?? [],
      lastBuiltTurn: town.lastBuiltTurn ?? null,
      spellLibrary: townSpellLibraries[town.id] ?? [],
      artifactOffer: townArtifactOffers[town.id] ?? [],
    })),
    resourceBuildings: (player.resourceBuildings ?? []).map((building): ResourceBuilding => ({
      id: building.id,
      type: building.buildingType as ResourceBuildingType,
      position: { x: building.x, y: building.y, level: normalizeMapLevel(building.mapLevel) },
      ownerId: building.gamePlayerId,
      guardianPower: building.guardianPower ?? 0,
    })),
    isAlive: player.isAlive,
    turnOrder: player.turnOrder,
    exploredTiles: player.exploredTiles ?? [],
    hasEndedTurn: completedTurnPlayerIds.has(player.id),
    turnStartedAt: turnStartedAtByPlayer.get(player.id) ?? null,
    turnProgressRatio: player.turnProgressRatio,
    scoreStats: normalizeScoreStats(player.scoreStats),
    score: player.score,
  }));
}

function mapNeutralArmies(data: Record<string, unknown>) {
  return ((data.neutralArmies as ApiNeutralArmy[] | undefined) ?? []).map((army): NeutralArmy => ({
    id: army.id,
    status: army.status,
    position: { x: army.x, y: army.y, level: normalizeMapLevel(army.mapLevel) },
    stacks: (army.stacks ?? []).map((stack) => ({
      id: stack.id,
      unitType: stack.unitType as UnitType,
      count: stack.count,
      health: stack.health,
      maxHealth: stack.maxHealth,
      position: stack.position,
    })),
  }));
}

function isLegacyGateMonsterObject(object: MapObject | undefined): object is MapObject & { type: "monster"; id: string } {
  return object?.type === "monster" && typeof object.id === "string" && object.id.includes("gate-mon-");
}

function isGateMapObject(object: MapObject | undefined): object is MapObject & { id: string } {
  return object?.type === "gate" && typeof object.id === "string";
}

function mapGates(data: Record<string, unknown>, neutralArmies: NeutralArmy[] = [], staticMapOverride?: GameMap): Gate[] {
  const gatesById = new Map<string, Gate>();
  for (const gate of ((data.gates as ApiGate[] | undefined) ?? []).map((gate): Gate => ({
    id: gate.id,
    ownerId: gate.gamePlayerId,
    position: { x: gate.x, y: gate.y, level: normalizeMapLevel(gate.mapLevel) },
    guardianPower: gate.guardianPower ?? 0,
    garrison: (gate.garrison ?? []).map((stack) => ({
      id: stack.id,
      unitType: stack.unitType as UnitType,
      count: stack.count,
      health: stack.health,
      maxHealth: stack.maxHealth,
      position: stack.position,
    })),
  }))) {
    gatesById.set(gate.id, gate);
  }

  const neutralArmiesById = new Map(neutralArmies.map((army) => [army.id, army]));
  const mapData = (data.mapData as GameMap | undefined) ?? staticMapOverride;
  for (const row of mapData?.tiles ?? []) {
    for (const tile of row) {
      const object = tile.object;
      if (!isLegacyGateMonsterObject(object) && !isGateMapObject(object)) continue;
      if (gatesById.has(object.id)) continue;
      const neutralArmy = neutralArmiesById.get(object.id);
      const fallbackGarrison = object.type === "gate"
        ? createNeutralArmyStacksForTile(tile, object.guardianPower ?? 100, object.id).map((stack) => ({
          id: `${object.id}-stack-${stack.position}`,
          unitType: stack.unitType,
          count: stack.count,
          health: stack.health,
          maxHealth: stack.maxHealth,
          position: stack.position,
        }))
        : [];
      gatesById.set(object.id, {
        id: object.id,
        ownerId: null,
        position: { x: tile.x, y: tile.y },
        guardianPower: object.guardianPower ?? 0,
        garrison: neutralArmy?.status === "ACTIVE" ? neutralArmy.stacks : fallbackGarrison,
      });
    }
  }

  return [...gatesById.values()];
}

function mapActiveCombats(data: Record<string, unknown>) {
  return ((data.combats as ApiCombat[] | undefined) ?? [])
    .filter((combat) => combat.status === "ACTIVE")
    .map((combat): PersistentCombat => ({
      id: combat.id,
      gameId: combat.gameId,
      mode: combat.mode,
      status: combat.status,
      attackerPlayerId: combat.attackerPlayerId,
      defenderPlayerId: combat.defenderPlayerId,
      attackerHeroId: combat.attackerHeroId,
      defenderHeroId: combat.defenderHeroId,
      neutralArmyId: combat.neutralArmyId,
      gateId: combat.gateId,
      currentPlayerId: combat.currentPlayerId,
      currentUnitId: combat.currentUnitId,
      round: combat.round,
      position: { x: combat.x, y: combat.y, level: normalizeMapLevel(combat.mapLevel) },
      boardState: combat.boardState,
      turnQueue: combat.turnQueue,
      actionLog: combat.actionLog,
      participants: combat.participants ?? [],
      reinforcementRequests: combat.reinforcementRequests ?? [],
      surrenderNegotiations: combat.surrenderNegotiations ?? [],
      truces: combat.truces ?? [],
      result: combat.result,
      visibility: combat.visibility ?? "full",
    }));
}

function mapBoats(data: Record<string, unknown>): Boat[] {
  return ((data.boats as ApiBoat[] | undefined) ?? []).map((boat): Boat => ({
    id: boat.id,
    ownerId: boat.ownerId ?? null,
    heroId: boat.heroId ?? null,
    faction: boat.faction ?? Faction.CASTLE,
    position: { x: boat.x, y: boat.y, level: normalizeMapLevel(boat.mapLevel) },
  }));
}

function mapActionLog(data: Record<string, unknown>): GameActionLogEntry[] {
  return ((data.actionLogs as ApiActionLog[] | undefined) ?? []).map((entry) => ({
    id: entry.id,
    gameId: entry.gameId,
    gamePlayerId: entry.gamePlayerId ?? null,
    actorKind: entry.actorKind,
    turnNumber: entry.turnNumber,
    actionType: entry.actionType,
    category: entry.category,
    summary: entry.summary,
    details: entry.details ?? {},
    createdAt: entry.createdAt,
  }));
}

function buildExploredSet(
  map: GameMap,
  currentPlayer: Player | undefined,
  revealMap: boolean
) {
  if (revealMap) {
    const explored = new Set<string>();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        explored.add(`${x},${y}`);
      }
    }
    return explored;
  }

  const explored = new Set(currentPlayer?.exploredTiles ?? []);
  if (!currentPlayer) return explored;

  for (const key of computeVisibleTiles(map, getPlayerVisionCenters(currentPlayer), 5)) {
    explored.add(key);
  }

  return explored;
}

// Per-level explored set keyed by legacy `${x},${y}` coordinates. Unlike
// buildExploredSet (which mixes all of the player's vision centers and is used
// for the surface to preserve historical behavior), this filters explored tiles
// and vision to a single map level so the underground layer is fogged on its own.
function buildLayerExploredSet(
  map: GameMap,
  currentPlayer: Player | undefined,
  revealMap: boolean,
  level: MapLevelId
) {
  const explored = new Set<string>();
  if (revealMap) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) explored.add(`${x},${y}`);
    }
    return explored;
  }
  if (!currentPlayer) return explored;

  const prefix = `${level}:`;
  for (const key of currentPlayer.exploredTiles ?? []) {
    if (key.startsWith(prefix)) explored.add(key.slice(prefix.length));
  }

  const centers = getPlayerVisionCenters({
    heroes: currentPlayer.heroes.filter((hero) => positionLevel(hero.position) === level),
    towns: currentPlayer.towns.filter((town) => positionLevel(town.position) === level),
  });
  for (const key of computeVisibleTiles(map, centers, 5)) explored.add(key);

  return explored;
}

function applyDynamicMapState(
  targetMap: GameMap,
  staticMap: GameMap,
  players: Player[],
  currentPlayer: Player | undefined,
  neutralArmies: NeutralArmy[],
  mapStateValue: unknown,
  revealMap: boolean
) {
  const mapState = (mapStateValue as Record<string, unknown>) ?? {};
  const collected = new Set<string>((mapState.collected as string[]) ?? []);
  const killed = new Set<string>((mapState.killed as string[]) ?? []);
  const visitedAdventureBuildings = new Set<string>((mapState.visitedAdventureBuildings as string[]) ?? []);
  const defeatedArtifacts = new Set<string>((mapState.defeatedArtifacts as string[]) ?? []);
  const defeatedCreatureBanks = new Set(
    Object.entries((mapState.creatureBanks as Record<string, { defeated?: boolean; claimed?: boolean }> | undefined) ?? {})
      .filter(([, state]) => state.defeated || state.claimed)
      .map(([bankId]) => bankId)
  );
  const externalDwellings = (mapState.externalDwellings as Record<string, { ownerId?: string | null; unitType?: UnitType; available?: number }> | undefined) ?? {};
  const defeatedNeutralArmies = new Set(
    neutralArmies
      .filter((army) => army.status !== "ACTIVE")
      .map((army) => army.id)
  );
  const dominantNeutralUnits = new Map(
    neutralArmies
      .filter((army) => army.status === "ACTIVE")
      .map((army) => [army.id, getDominantUnitType(army.stacks)] as const)
      .filter((entry): entry is readonly [string, UnitType] => Boolean(entry[1]))
  );
  const gates = (mapState.gates as Gate[] | undefined) ?? [];
  const allBuildings = players.flatMap((player) => player.resourceBuildings);
  const buildingsById = new Map<string, ResourceBuilding>(
    allBuildings.map((building) => [building.id, building])
  );
  const buildingsByPosition = new Map<string, ResourceBuilding>(
    allBuildings.map((building) => [`${building.position.x},${building.position.y}`, building])
  );
  const gatesById = new Map<string, Gate>(gates.map((gate) => [gate.id, gate]));
  const gatesByPosition = new Map<string, Gate>(
    gates.map((gate) => [`${gate.position.x},${gate.position.y}`, gate])
  );

  const processLayer = (targetTiles: MapTile[][], staticTiles: MapTile[][], exploredSet: Set<string>) => {
  for (let y = 0; y < targetTiles.length; y++) {
    const targetRow = targetTiles[y];
    const staticRow = staticTiles[y];
    if (!targetRow || !staticRow) continue;
    for (let x = 0; x < targetRow.length; x++) {
      const tile = targetRow[x] as MapTile | undefined;
      const sourceTile = staticRow[x] as MapTile | undefined;
      if (!tile || !sourceTile) continue;

      tile.object = sourceTile.object ? { ...sourceTile.object } : undefined;
      tile.isPassable = sourceTile.isPassable;
      tile.movementCost = sourceTile.movementCost;

      const key = `${x},${y}`;
      const isExplored = revealMap || exploredSet.has(key);
      const gateData = gatesByPosition.get(key);

      if (!tile.object && gateData) {
        tile.object = {
          type: "gate",
          id: gateData.id,
          ownerId: gateData.ownerId,
          guardianPower: gateData.guardianPower,
        };
      }

      if (tile.object) {
        const object = tile.object;
        if (isLegacyGateMonsterObject(object)) {
          const legacyGate = gatesById.get(object.id) ?? gateData;
          tile.object = {
            type: "gate",
            id: legacyGate?.id ?? object.id,
            subtype: object.subtype,
            ownerId: legacyGate?.ownerId ?? null,
            guardianPower: legacyGate?.guardianPower ?? object.guardianPower ?? 0,
          };
          if (!isExplored) {
            delete tile.object;
          }
        } else if (object.type === "resource" && collected.has(object.id)) {
          delete tile.object;
        } else if (object.type === "artifact" && collected.has(object.id)) {
          delete tile.object;
        } else if (object.type === "artifact" && defeatedArtifacts.has(object.id)) {
          object.guardianPower = 0;
        } else if (object.type === "monster" && (killed.has(object.id) || defeatedNeutralArmies.has(object.id))) {
          delete tile.object;
        } else if (
          object.type === "adventure_building" &&
          (object.subtype === AdventureBuildingType.CAMPFIRE || isSingleMapRewardBuilding(object.subtype)) &&
          visitedAdventureBuildings.has(object.id)
        ) {
          delete tile.object;
        } else if (
          object.type === "adventure_building" &&
          isCreatureBankType(object.subtype) &&
          defeatedCreatureBanks.has(object.id)
        ) {
          delete tile.object;
        } else if (
          object.type === "adventure_building" &&
          isExternalDwellingType(object.subtype)
        ) {
          const dwellingState = normalizeExternalDwellingState(object, externalDwellings[object.id]);
          if (dwellingState) {
            object.ownerId = dwellingState.ownerId;
            object.targetId = dwellingState.unitType;
            object.amount = dwellingState.available;
          }
        } else if (object.type === "monster") {
          const dominantUnitType = dominantNeutralUnits.get(object.id);
          if (dominantUnitType) object.subtype = dominantUnitType;
        } else if (object.type === "building") {
          const buildingData = buildingsById.get(object.id) ?? buildingsByPosition.get(key);
          if (buildingData) {
            object.guardianPower = buildingData.guardianPower;
          }
          if (!isExplored) {
            delete tile.object;
          }
        } else if (object.type === "gate") {
          const currentGateData = gatesById.get(object.id) ?? gateData;
          if (currentGateData) {
            object.id = currentGateData.id;
            object.ownerId = currentGateData.ownerId;
            object.guardianPower = currentGateData.guardianPower;
          }
          if (!isExplored) {
            delete tile.object;
          }
        } else if (!isExplored && !shouldAlwaysKeepTileObject(object)) {
          delete tile.object;
        }
      }

      if (!isExplored) {
        tile.isPassable = false;
        tile.movementCost = 999;
      }
    }
  }
  };

  // The renderer draws map.levels[level].tiles via withActiveMapLayer, but the DB
  // JSON round-trip de-aliases that array from the top-level map.tiles it was
  // generated as a reference to. Clean each layer's own array so dynamic removals
  // (defeated monsters, collected resources, captured gates) reach what's drawn.
  const surfaceLayer = targetMap.levels?.[SURFACE_LEVEL];
  const surfaceTargetTiles = surfaceLayer?.tiles ?? targetMap.tiles;
  const surfaceStaticTiles = staticMap.levels?.[SURFACE_LEVEL]?.tiles ?? staticMap.tiles;
  processLayer(surfaceTargetTiles, surfaceStaticTiles, buildExploredSet(targetMap, currentPlayer, revealMap));
  // Re-point the top-level tiles at the surface array we just cleaned, so any
  // consumer reading map.tiles directly stays in sync with the rendered surface.
  if (surfaceLayer && surfaceTargetTiles !== targetMap.tiles) {
    targetMap.tiles = surfaceTargetTiles;
  }

  const undergroundLayer = targetMap.levels?.[UNDERGROUND_LEVEL];
  const undergroundStaticTiles = staticMap.levels?.[UNDERGROUND_LEVEL]?.tiles;
  if (undergroundLayer && undergroundStaticTiles) {
    processLayer(
      undergroundLayer.tiles,
      undergroundStaticTiles,
      buildLayerExploredSet(targetMap, currentPlayer, revealMap, UNDERGROUND_LEVEL)
    );
  }
}

function readTurnTimeLimit(gameConfig: unknown): number | null {
  const raw = Number((gameConfig as Record<string, unknown> | null | undefined)?.turnTimeLimit);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function mapApiToGameState(
  data: Record<string, unknown>,
  currentUserId?: string,
  options: { revealMap?: boolean } = {}
): GameState {
  const turnNumber = data.turnNumber as number;
  const players = mapPlayers(data, turnNumber);
  const neutralArmies = mapNeutralArmies(data);
  const gates = mapGates(data, neutralArmies);
  const boats = mapBoats(data);
  const activeCombats = mapActiveCombats(data);
  const actionLog = mapActionLog(data);
  const currentPlayer = players.find((player) => player.userId === currentUserId);
  const mapId = data.id as string;
  const normalizedStaticMap = normalizeMapMovement(cloneGameMap(data.mapData as GameMap));

  staticGameMaps.set(mapId, normalizedStaticMap);

  // A finished game reveals the whole map for everyone (end-of-game review).
  // A built Tower Grail (Celestial Vessel) reveals it permanently for its owner.
  const revealMap = Boolean(options.revealMap)
    || data.status === "COMPLETED"
    || (currentPlayer ? playerHasGrailEffect(currentPlayer, "revealMap") : false);

  const map = cloneGameMap(normalizedStaticMap);
  applyDynamicMapState(
    map,
    normalizedStaticMap,
    players,
    currentPlayer,
    neutralArmies,
    { ...((data.mapState as Record<string, unknown> | undefined) ?? {}), gates },
    revealMap
  );

  const adventureVisits = extractAdventureVisitState(data.mapState);
  const grailHint = buildGrailHint(normalizedStaticMap, data, currentPlayer, adventureVisits, revealMap);

  return {
    id: mapId,
    status: data.status as GameState["status"],
    isEphemeral: Boolean(data.isEphemeral),
    maxPlayers: (data.maxPlayers as number) ?? 8,
    players,
    map,
    turnNumber,
    calendar: getGameCalendar(turnNumber),
    currentTurnPlayerId: (data.currentTurnPlayerId as string) || "",
    turnTimeLimit: readTurnTimeLimit(data.gameConfig),
    currentTurnStartedAt: (data.currentTurnStartedAt as string | null | undefined) ?? null,
    winnerId: data.winnerId as string | undefined,
    victoryCondition: normalizeVictoryCondition((data.gameConfig as Record<string, unknown> | null)?.victory),
    neutralArmies,
    gates,
    boats,
    activeCombats,
    adventureVisits,
    actionLog,
    grailHint,
  };
}

export function mergeGameDynamicState(
  baseGameState: GameState,
  data: Record<string, unknown>,
  currentUserId?: string,
  options: { revealMap?: boolean } = {}
): GameState {
  const staticMap = getCachedStaticGameMap(baseGameState.id);
  if (!staticMap) return baseGameState;

  const turnNumber = data.turnNumber as number;
  const players = mapPlayers(data, turnNumber);
  const neutralArmies = mapNeutralArmies(data);
  const gates = mapGates(data, neutralArmies, staticMap);
  const boats = mapBoats(data);
  const activeCombats = mapActiveCombats(data);
  const actionLog = mapActionLog(data);
  const currentPlayer = players.find((player) => player.userId === currentUserId);

  // A finished game reveals the whole map for everyone (end-of-game review).
  // A built Tower Grail (Celestial Vessel) reveals it permanently for its owner.
  const revealMap = Boolean(options.revealMap)
    || data.status === "COMPLETED"
    || (currentPlayer ? playerHasGrailEffect(currentPlayer, "revealMap") : false);

  applyDynamicMapState(
    baseGameState.map,
    staticMap,
    players,
    currentPlayer,
    neutralArmies,
    { ...((data.mapState as Record<string, unknown> | undefined) ?? {}), gates },
    revealMap
  );

  return {
    ...baseGameState,
    isEphemeral: Boolean(data.isEphemeral),
    status: (data.status as GameState["status"]) ?? baseGameState.status,
    players,
    turnNumber,
    calendar: getGameCalendar(turnNumber),
    currentTurnPlayerId: (data.currentTurnPlayerId as string) || baseGameState.currentTurnPlayerId,
    currentTurnStartedAt: (data.currentTurnStartedAt as string | null | undefined) ?? baseGameState.currentTurnStartedAt ?? null,
    winnerId: (data.winnerId as string | undefined) ?? baseGameState.winnerId,
    neutralArmies,
    gates,
    boats,
    activeCombats,
    adventureVisits: extractAdventureVisitState(data.mapState),
    actionLog,
    grailHint: buildGrailHint(staticMap, data, currentPlayer, extractAdventureVisitState(data.mapState), revealMap),
  };
}

/**
 * Sanitized per-player Grail hint. The exact buried tile is only included once
 * the player has earned the reveal (or the game/map is fully revealed); before
 * that only the shrinking probable zone is exposed.
 */
function buildGrailHint(
  map: GameMap,
  data: Record<string, unknown>,
  currentPlayer: Player | undefined,
  adventureVisits: AdventureBuildingState,
  revealMap: boolean,
) {
  // The server computes and sanitizes the hint (the raw buried location never
  // reaches the client). Prefer it when present; only fall back to a local
  // computation for dev mocks / cached payloads that still embed the location.
  if ("grailHint" in data) return (data.grailHint as import("./grail").GrailHint | null) ?? null;
  const grailLocation = getGrailLocation(data.gameConfig);
  if (!grailLocation) return null;
  const dug = Boolean((data.mapState as Record<string, unknown> | undefined)?.grailFound);
  if (revealMap) {
    return { obelisksTotal: 0, obelisksVisited: 0, revealed: true, dug, mapLevel: grailLocation.mapLevel, tile: { x: grailLocation.x, y: grailLocation.y } };
  }
  const visited = currentPlayer ? adventureVisits.playerAdventureVisits?.[currentPlayer.id] ?? [] : [];
  return computeGrailHint(map, grailLocation, visited, dug);
}

function extractAdventureVisitState(rawMapState: unknown): AdventureBuildingState {
  const mapState = (rawMapState as Record<string, unknown> | undefined) ?? {};
  return {
    visitedAdventureBuildings: (mapState.visitedAdventureBuildings as string[] | undefined) ?? [],
    playerAdventureVisits: (mapState.playerAdventureVisits as Record<string, string[]> | undefined) ?? {},
    heroAdventureVisits: (mapState.heroAdventureVisits as Record<string, string[]> | undefined) ?? {},
    signaledLighthouses: (mapState.signaledLighthouses as Record<string, string[]> | undefined) ?? {},
    mysticalGardenVisits: (mapState.mysticalGardenVisits as Record<string, string> | undefined) ?? {},
    weeklyAdventureVisits: (mapState.weeklyAdventureVisits as Record<string, string> | undefined) ?? {},
  };
}

function getGameCalendar(dayNumber: number) {
  const zeroBasedDay = Math.max(0, dayNumber - 1);
  return {
    dayNumber,
    dayOfWeek: (zeroBasedDay % 7) + 1,
    weekNumber: Math.floor(zeroBasedDay / 7) + 1,
    weekOfMonth: (Math.floor(zeroBasedDay / 7) % 4) + 1,
    monthNumber: Math.floor(zeroBasedDay / 28) + 1,
    monthOfYear: (Math.floor(zeroBasedDay / 28) % 12) + 1,
    yearNumber: Math.floor(zeroBasedDay / 336) + 1,
  };
}
