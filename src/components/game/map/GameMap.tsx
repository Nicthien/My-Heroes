"use client";

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { MapObjectData, MapRenderer } from "@/lib/rendering/mapRenderer";
import { getMapObjectHoverDescription } from "@/lib/rendering/phaser/mapObjectLayout";
import { GameState, Gate, Position, ResourceBuilding, UnitStack, UnitType, type MapLevelId } from "@/lib/game/types";
import { SURFACE_LEVEL, UNDERGROUND_LEVEL, normalizeExploredTileKey, normalizeMapLevel, withActiveMapLayer } from "@/lib/game/map-levels";
import { getAdventureBuildingExhaustion, getAdventureBuildingLabel } from "@/lib/game/adventure-buildings";
import { getExternalDwellingLabel, isExternalDwellingType } from "@/lib/game/external-dwellings";
import { getActiveCombatHeroIds, getCombatHeroIds } from "@/lib/game/combat/active-heroes";
import { RESOURCE_BUILDING_RULES, formatResourceName, formatResourceProduction } from "@/lib/game/economy";
import { UNIT_RULES } from "@/lib/game/economy";
import { useGameStore } from "@/lib/stores/gameStore";
import { GAME_CURSORS } from "@/lib/ui/cursors";
import {
  findPath,
  findPathToAdjacent,
  computeReachableTiles,
  computeEnemyDarknessTiles,
  computeExtraHeroScoutingTiles,
  computeExtraTownVisionTiles,
  computeVisibleTiles,
  getAdventurePathCost,
  getAdventureStepCost,
  getPlayerVisionCenters,
  isTileTraversable,
} from "@/lib/game/engine";
import { refreshGameState } from "@/lib/game/refresh";

const REACHABLE_TILE_COLOR = 0x2f80ff;
const REACHABLE_TILE_ALPHA = 0.34;
const TOUCH_PAN_START_THRESHOLD_PX = 14;
const TOUCH_PAN_CONTINUE_THRESHOLD_PX = 2;
const TOUCH_PINCH_ZOOM_THRESHOLD_PX = 8;
const ADVENTURE_CURSORS = {
  default: GAME_CURSORS.default,
  dragging: GAME_CURSORS.dragging,
  move: GAME_CURSORS.adventure.moveLand,
  visit: GAME_CURSORS.adventure.arriveLand,
  town: GAME_CURSORS.adventure.town,
  attack: GAME_CURSORS.adventure.attack,
  trade: GAME_CURSORS.adventure.trade,
  hero: GAME_CURSORS.adventure.hero,
  forbidden: GAME_CURSORS.forbidden,
} as const;
const RESOURCE_BUILDING_LABEL_BY_TYPE = new Map<string, string>(
  RESOURCE_BUILDING_RULES.map((rule) => [rule.type, rule.label])
);

type PendingMove = {
  heroId: string;
  destination: Position;
  path: Position[];
  finalDestination?: Position;
};

type AdventureChoiceValue = "attack" | "defense" | "spellPower" | "knowledge";

type AdventureChoice = {
  value: AdventureChoiceValue;
  label: string;
};

type PendingAdventureChoice = {
  heroId: string;
  buildingId: string;
  buildingType: string;
  message: string;
  choices: AdventureChoice[];
};

type MoveInteraction =
  | { type: "COLLECT"; resource: string; amount?: number; gold?: number; destination?: Position }
  | { type: "ADVENTURE_BUILDING"; buildingType: string; reward?: { gold?: number; resources?: Record<string, number> }; recruited?: { unitType: UnitType; count: number }; message?: string; destination?: Position; choices?: AdventureChoice[]; buildingId?: string; alreadyVisited?: boolean }
  | { type: "TELEPORT"; buildingType: "stargate" | "subterranean_gate"; from: Position; to: Position; message?: string; destination?: Position }
  | { type: "COMBAT"; targetId: string; targetType: "hero" | "monster" | "building" | "town" | "gate" | "creature_bank" | "artifact"; destination?: Position; targetPosition?: Position }
  | { type: "ARTIFACT"; artifactId: string; label: string; destination?: Position }
  | { type: "CAPTURE_BUILDING"; buildingType?: string; destination?: Position }
  | { type: "CAPTURE_TOWN"; destination?: Position }
  | { type: "CAPTURE_GATE"; gateId: string; destination?: Position }
  | { type: "EMBARK_BOAT" | "DISEMBARK_BOAT" | "BUILD_BOAT"; destination?: Position; message?: string }
  | { type: "STOP"; message: string; destination?: Position };

async function createMapRenderer(): Promise<MapRenderer> {
  const { PhaserMapRenderer } = await import("@/lib/rendering/phaser/PhaserMapRenderer");
  return new PhaserMapRenderer();
}

const allTileKeysCache = new Map<string, Set<string>>();

function getAllTileKeys(width: number, height: number) {
  const cacheKey = `${width}x${height}`;
  const cached = allTileKeysCache.get(cacheKey);
  if (cached) return cached;

  const allTiles = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allTiles.add(`${x},${y}`);
    }
  }
  allTileKeysCache.set(cacheKey, allTiles);
  return allTiles;
}

export default function GameMapComponent() {
  const { data: session } = useSession();
  const [rendererReadyVersion, setRendererReadyVersion] = useState(0);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [pendingAdventureChoice, setPendingAdventureChoice] = useState<PendingAdventureChoice | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const loadingFinishTimeoutRef = useRef<number | null>(null);
  const completedLoadingNonceRef = useRef(0);
  const didInitialCenter = useRef(false);
  const didAutoSelectActiveHero = useRef(false);
  const autoSelectGameIdRef = useRef<string | null>(null);
  const renderedMapRef = useRef<GameState["map"] | null>(null);
  const lastGateRenderKeyRef = useRef<string>("");
  const lastFogVisibleRef = useRef<Set<string> | null>(null);
  const lastFogExploredRef = useRef<Set<string> | null>(null);
  const lastCenteredHeroIdRef = useRef<string | null>(null);
  const pendingMoveRef = useRef<PendingMove | null>(null);
  const pendingAttackRef = useRef<{
    heroId: string;
    targetId: string;
    destination: Position;
    path: Position[];
  } | null>(null);
  const touchPointersRef = useRef(new Map<number, Position>());
  const touchGestureRef = useRef<{ dragged: boolean; lastDistance: number; lastCenter: Position | null; startCenter: Position | null }>({
    dragged: false,
    lastDistance: 0,
    lastCenter: null,
    startCenter: null,
  });
  const suppressNextClickRef = useRef(false);
  const dispatchingTouchTapRef = useRef(false);
  const ignoreNextNativeTouchClickRef = useRef(false);
  const isSyncingMoveRef = useRef(false);
  const isDragging = useRef(false);
  const lastMouse = useRef<Position>({ x: 0, y: 0 });
  const gameState = useGameStore((state) => state.gameState);
  const selectedHeroId = useGameStore((state) => state.selectedHeroId);
  const activeMapLevel = useGameStore((state) => state.activeMapLevel);
  const setActiveMapLevel = useGameStore((state) => state.setActiveMapLevel);
  const selectedTownId = useGameStore((state) => state.selectedTownId);
  const selectHero = useGameStore((state) => state.selectHero);
  const selectTown = useGameStore((state) => state.selectTown);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const setPendingCombat = useGameStore((state) => state.setPendingCombat);
  const setPendingJoinCombat = useGameStore((state) => state.setPendingJoinCombat);
  const setActiveCombat = useGameStore((state) => state.setActiveCombat);
  const activeCombat = useGameStore((state) => state.activeCombat);
  const cameraTarget = useGameStore((state) => state.cameraTarget);
  const zoomRequest = useGameStore((state) => state.zoomRequest);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const adminObserverMode = useGameStore((state) => state.adminObserverMode);
  const revealMap = devRevealMap || adminObserverMode;
  const devTeleportArmed = useGameStore((state) => state.devTeleportArmed);
  const devInfiniteMana = useGameStore((state) => state.devInfiniteMana);
  const pendingAdventureSpell = useGameStore((state) => state.pendingAdventureSpell);
  const setPendingAdventureSpell = useGameStore((state) => state.setPendingAdventureSpell);
  const spellRevealHighlight = useGameStore((state) => state.spellRevealHighlight);
  const setSpellRevealHighlight = useGameStore((state) => state.setSpellRevealHighlight);
  const activeCombatHeroIds = useMemo(
    () => getActiveCombatHeroIds(gameState?.activeCombats),
    [gameState?.activeCombats]
  );
  const activeMap = useMemo(
    () => gameState ? withActiveMapLayer(gameState.map, activeMapLevel) : null,
    [activeMapLevel, gameState],
  );
  const hasUnderground = Boolean(gameState?.map.levels?.underground);
  const selectedHeroReachableTileKeys = useMemo(() => {
    if (!gameState || !activeMap || revealMap || !selectedHeroId) return null;
    const hero = gameState.players.flatMap((p) => p.heroes).find((h) => h.id === selectedHeroId);
    if (!hero || activeCombatHeroIds.has(hero.id)) return null;
    if (normalizeMapLevel(hero.position.level) !== activeMapLevel) return null;
    return computeReachableTiles(activeMap, hero.position, hero.movement);
  }, [activeCombatHeroIds, activeMap, activeMapLevel, revealMap, gameState, selectedHeroId]);
  const selectedHeroReachableTiles = useMemo(() => {
    if (!selectedHeroReachableTileKeys) return [];
    return Array.from(selectedHeroReachableTileKeys).map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y };
    });
  }, [selectedHeroReachableTileKeys]);

  useEffect(() => {
    renderedMapRef.current = null;
  }, [activeMapLevel]);

  useEffect(() => {
    if (gameState && !hasUnderground && activeMapLevel !== SURFACE_LEVEL) {
      setActiveMapLevel(SURFACE_LEVEL);
    }
  }, [activeMapLevel, gameState, hasUnderground, setActiveMapLevel]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer?.isReady() || !gameState) return;
    const myPlayer = gameState.players.find((player) => player.userId === session?.user?.id);
    if (!spellRevealHighlight || spellRevealHighlight.turnNumber !== gameState.turnNumber || myPlayer?.hasEndedTurn) {
      renderer.clearSpellRevealHighlights();
      if (spellRevealHighlight && (spellRevealHighlight.turnNumber !== gameState.turnNumber || myPlayer?.hasEndedTurn)) {
        setSpellRevealHighlight(null);
      }
      return;
    }

    renderer.setSpellRevealHighlights(spellRevealHighlight.tiles, 0x7dd3fc, 0.24, spellRevealHighlight.hints);
  }, [gameState, rendererReadyVersion, session?.user?.id, setSpellRevealHighlight, spellRevealHighlight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let activeRenderer: MapRenderer | null = null;
    let optimisticProgress = 78;
    let rendererLoadingTimer: number | null = null;

    const updateRendererLoading = (progress: number, message?: string) => {
      if (cancelled) return;
      const loadingState = useGameStore.getState();
      if (loadingState.isLoading && completedLoadingNonceRef.current < loadingState.loadingNonce) {
        loadingState.updateLoadingProgress(progress, message);
      }
    };

    const stopRendererLoadingTimer = () => {
      if (rendererLoadingTimer) {
        window.clearInterval(rendererLoadingTimer);
        rendererLoadingTimer = null;
      }
    };

    updateRendererLoading(78, "Preparation du moteur de rendu...");
    rendererLoadingTimer = window.setInterval(() => {
      optimisticProgress = Math.min(87, optimisticProgress + 1);
      updateRendererLoading(
        optimisticProgress,
        optimisticProgress < 82
          ? "Chargement du moteur graphique..."
          : optimisticProgress < 86
            ? "Chargement des graphismes..."
            : "Finalisation du rendu..."
      );
      if (optimisticProgress >= 87) stopRendererLoadingTimer();
    }, 700);

    const initPromise = createMapRenderer().then(async (renderer) => {
      activeRenderer = renderer;
      if (cancelled) {
        renderer.destroy();
        return;
      }

      rendererRef.current = renderer;
      updateRendererLoading(82, "Moteur graphique charge...");

      await renderer.init(container, updateRendererLoading);
      stopRendererLoadingTimer();

      if (cancelled) {
        renderer.destroy();
        return;
      }

      const currentLoadingState = useGameStore.getState();
      if (currentLoadingState.isLoading) {
        currentLoadingState.updateLoadingProgress(90, "Affichage de la carte...");
      }

      setRendererReadyVersion((version) => version + 1);
    });
    initPromiseRef.current = initPromise;

    return () => {
      cancelled = true;
      stopRendererLoadingTimer();
      if (loadingFinishTimeoutRef.current) {
        window.clearTimeout(loadingFinishTimeoutRef.current);
        loadingFinishTimeoutRef.current = null;
      }
      initPromiseRef.current = null;
      rendererRef.current = null;
      renderedMapRef.current = null;
      lastGateRenderKeyRef.current = "";
      lastFogVisibleRef.current = null;
      lastFogExploredRef.current = null;
      activeRenderer?.destroy();
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !gameState?.map || !activeMap) return;
    const renderMap = activeMap;

    const currentPlayer = gameState.players.find(
      (player) => player.userId === session?.user?.id
    );

    initPromiseRef.current?.then(() => {
      if (rendererRef.current !== renderer || !renderer.isReady()) return;

      const currentLoadingState = useGameStore.getState();
      if (currentLoadingState.isLoading && completedLoadingNonceRef.current < currentLoadingState.loadingNonce) {
        currentLoadingState.updateLoadingProgress(88, "Mise à jour de la carte...");
      }

      const reportMapLoading = (progress: number, message: string) => {
        const loadingState = useGameStore.getState();
        if (loadingState.isLoading && completedLoadingNonceRef.current < loadingState.loadingNonce) {
          loadingState.updateLoadingProgress(progress, message);
        }
      };

      const gateRenderKey = (gameState.gates ?? [])
        .map((gate) => `${gate.id}:${gate.ownerId ?? "neutral"}:${gate.garrison.reduce((total, unit) => total + unit.count, 0)}`)
        .sort()
        .join("|");
      if (lastGateRenderKeyRef.current !== gateRenderKey) {
        renderedMapRef.current = null;
        lastGateRenderKeyRef.current = gateRenderKey;
      }

      const mapReferenceChanged = renderedMapRef.current !== renderMap;
      if (mapReferenceChanged) {
        reportMapLoading(91, "Construction du terrain...");
      }
      // Incremental sync mutates the existing map object with dynamic tile.object
      // updates. Always let Phaser compare signatures so resources, monsters, and
      // gates re-render even when the GameMap reference stays stable.
      renderer.renderMap(renderMap);
      if (mapReferenceChanged) {
        reportMapLoading(94, "Placement des objets...");
        renderedMapRef.current = renderMap;
        lastFogVisibleRef.current = null;
        lastFogExploredRef.current = null;
      }
      renderer.setObjects(buildObjects(gameState, currentPlayer, revealMap, selectedHeroId, activeMapLevel, renderMap));
      reportMapLoading(95, "Calcul de la visibilite...");

      let visibleTiles: Set<string>;
      let exploredTiles: Set<string>;
      if (activeCombat || revealMap || currentPlayer?.isAlive === false) {
        const allTiles = getAllTileKeys(renderMap.width, renderMap.height);
        visibleTiles = allTiles;
        exploredTiles = allTiles;
      } else if (currentPlayer) {
        const currentLayerPlayer = {
          ...currentPlayer,
          heroes: currentPlayer.heroes.filter((hero) => normalizeMapLevel(hero.position.level) === activeMapLevel),
          towns: currentPlayer.towns.filter((town) => normalizeMapLevel(town.position.level) === activeMapLevel),
        };
        visibleTiles = computeVisibleTiles(renderMap, getPlayerVisionCenters(currentLayerPlayer), 5);
        for (const key of computeExtraTownVisionTiles(renderMap, currentLayerPlayer.towns.map((t) => ({ position: t.position, townType: (t as { townType?: string }).townType, buildings: t.buildings })), 9)) {
          visibleTiles.add(key);
        }
        for (const key of computeExtraHeroScoutingTiles(renderMap, currentLayerPlayer.heroes.map((h) => ({ position: h.position, skills: h.skills })), 5)) {
          visibleTiles.add(key);
        }
        const enemyTowns = gameState.players
          .filter((p) => p.id !== currentPlayer.id)
          .flatMap((p) => p.towns.filter((t) => normalizeMapLevel(t.position.level) === activeMapLevel).map((t) => ({ position: t.position, townType: (t as { townType?: string }).townType, buildings: t.buildings })));
        const darkness = computeEnemyDarknessTiles(renderMap, enemyTowns, 8);
        if (darkness.size > 0) {
          const heroCloseSet = computeVisibleTiles(renderMap, currentLayerPlayer.heroes.map((h) => h.position), 3);
          for (const key of darkness) {
            if (!heroCloseSet.has(key)) visibleTiles.delete(key);
          }
        }
        exploredTiles = new Set<string>(
          currentPlayer.exploredTiles
            .map(normalizeExploredTileKey)
            .filter((key) => key.startsWith(`${activeMapLevel}:`))
            .map((key) => key.slice(key.indexOf(":") + 1))
        );
        for (const key of visibleTiles) {
          exploredTiles.add(key);
        }
      } else {
        const allTiles = getAllTileKeys(renderMap.width, renderMap.height);
        visibleTiles = allTiles;
        exploredTiles = allTiles;
      }

      if (
        !areTileKeySetsEqual(lastFogVisibleRef.current, visibleTiles) ||
        !areTileKeySetsEqual(lastFogExploredRef.current, exploredTiles)
      ) {
        reportMapLoading(97, "Application du brouillard de guerre...");
        renderer.setFog(visibleTiles, exploredTiles, activeMapLevel === UNDERGROUND_LEVEL ? "underground" : "surface");
        reportMapLoading(98, "Centrage de la camera...");
        lastFogVisibleRef.current = visibleTiles;
        lastFogExploredRef.current = exploredTiles;
      }

      if (!didInitialCenter.current) {
        const firstTown = currentPlayer?.towns[0] ?? (adminObserverMode ? gameState.players.flatMap((player) => player.towns)[0] : undefined);
        const firstHero = currentPlayer?.heroes[0] ?? (adminObserverMode ? gameState.players.flatMap((player) => player.heroes)[0] : undefined);
        const centerTarget = gameState.status === "PENDING" ? firstTown : firstHero;
        if (centerTarget) {
          renderer.centerOnTile(centerTarget.position.x, centerTarget.position.y);
          if (!adminObserverMode && gameState.status !== "PENDING" && firstHero && currentPlayer?.isAlive !== false) {
            useGameStore.getState().selectHero(firstHero.id);
          }
        }
        didInitialCenter.current = true;
      }

      const loadingState = useGameStore.getState();
      if (loadingState.isLoading && completedLoadingNonceRef.current < loadingState.loadingNonce) {
        completedLoadingNonceRef.current = loadingState.loadingNonce;
        loadingState.updateLoadingProgress(100, "Carte prete");
        if (loadingFinishTimeoutRef.current) {
          window.clearTimeout(loadingFinishTimeoutRef.current);
        }
        loadingFinishTimeoutRef.current = window.setTimeout(() => {
          const latestLoadingState = useGameStore.getState();
          if (latestLoadingState.loadingNonce === completedLoadingNonceRef.current) {
            latestLoadingState.setLoading(false);
          }
          loadingFinishTimeoutRef.current = null;
        }, 150);
      }
    });
  }, [activeMap, activeMapLevel, adminObserverMode, gameState, session?.user?.id, activeCombat, rendererReadyVersion, revealMap, selectedHeroId]);

  useEffect(() => {
    if (!rendererRef.current?.isReady() || !gameState) return;
    if (revealMap) {
      rendererRef.current.clearReachable();
      return;
    }
    if (!selectedHeroId) {
      rendererRef.current.clearReachable();
      return;
    }

    const hero = gameState.players.flatMap((p) => p.heroes).find((h) => h.id === selectedHeroId);
    if (!hero) {
      rendererRef.current.clearReachable();
      return;
    }
    if (activeCombatHeroIds.has(hero.id)) {
      rendererRef.current.clearReachable();
      return;
    }

    rendererRef.current.highlightTiles(selectedHeroReachableTiles, REACHABLE_TILE_COLOR, REACHABLE_TILE_ALPHA);

    if (lastCenteredHeroIdRef.current !== selectedHeroId) {
      rendererRef.current.followHero(selectedHeroId);
      lastCenteredHeroIdRef.current = selectedHeroId;
    }
  }, [selectedHeroId, gameState, rendererReadyVersion, revealMap, activeCombatHeroIds, selectedHeroReachableTiles]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer?.isReady()) return;
    renderer.followHero(selectedHeroId);
    if (selectedHeroId) return;

    pendingMoveRef.current = null;
    pendingAttackRef.current = null;
    renderer.clearHighlights();
    setPendingCombat(null);
    setPendingJoinCombat(null);
  }, [selectedHeroId, rendererReadyVersion, setPendingCombat, setPendingJoinCombat]);

  useEffect(() => {
    if (!cameraTarget) return;
    const renderer = rendererRef.current;
    if (!renderer?.isReady()) return;
    renderer.centerOnTile(cameraTarget.x, cameraTarget.y);
  }, [cameraTarget, rendererReadyVersion]);

  useEffect(() => {
    if (!zoomRequest) return;
    const renderer = rendererRef.current;
    if (!renderer?.isReady()) return;
    const state = useGameStore.getState();
    renderer.zoomCamera(zoomRequest.direction);
    if (state.selectedHeroId) {
      renderer.followHero(state.selectedHeroId);
    }
  }, [zoomRequest, rendererReadyVersion]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer?.isReady() || !gameState) return;

    const pending = pendingMoveRef.current;
    if (!pending) return;

    pendingMoveRef.current = redrawPendingMove(renderer, gameState, pending);
  }, [gameState, rendererReadyVersion]);

  useEffect(() => {
    if (gameState?.status !== "PENDING") return;

    pendingMoveRef.current = null;
    pendingAttackRef.current = null;
    rendererRef.current?.clearHighlights();
    rendererRef.current?.clearReachable();
    useGameStore.setState({
      selectedHeroId: null,
      selectedTownId: null,
      pendingCombat: null,
      pendingJoinCombat: null,
      activeCombat: null,
      isCombatMode: false,
    });
  }, [gameState?.status, rendererReadyVersion]);

  useEffect(() => {
    if (adminObserverMode || !gameState || gameState.status !== "ACTIVE") {
      didAutoSelectActiveHero.current = false;
      autoSelectGameIdRef.current = null;
      return;
    }

    if (autoSelectGameIdRef.current !== gameState.id) {
      didAutoSelectActiveHero.current = false;
      autoSelectGameIdRef.current = gameState.id;
    }

    if (selectedHeroId || selectedTownId) {
      if (selectedHeroId) didAutoSelectActiveHero.current = true;
      return;
    }

    if (didAutoSelectActiveHero.current) return;

    const currentPlayer = gameState.players.find(
      (player) => player.userId === session?.user?.id
    );
    if (currentPlayer?.isAlive === false) return;

    const firstHero = currentPlayer?.heroes.find((hero) => !activeCombatHeroIds.has(hero.id));
    if (!firstHero) return;

    didAutoSelectActiveHero.current = true;
    selectHero(firstHero.id);
    rendererRef.current?.centerOnTile(firstHero.position.x, firstHero.position.y);
  }, [adminObserverMode, gameState, selectedHeroId, selectedTownId, selectHero, session?.user?.id, rendererReadyVersion, activeCombatHeroIds]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2 || e.button === 1) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setMapContainerCursor(containerRef.current, ADVENTURE_CURSORS.dragging);
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const renderer = rendererRef.current;
      const container = containerRef.current;
      if (!renderer || !container) return;

      if (isDragging.current) {
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        renderer.panCamera(dx, dy);
        lastMouse.current = { x: e.clientX, y: e.clientY };
        setMapContainerCursor(container, ADVENTURE_CURSORS.dragging);
        return;
      }

      const rect = container.getBoundingClientRect();
      const currentPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);
      setMapContainerCursor(container, getAdventureMapCursor({
        renderer,
        gameState,
        selectedHeroId,
        selectedTownId,
        currentPlayerId: currentPlayer?.id ?? null,
        visibleTiles: lastFogVisibleRef.current,
        reachableTileKeys: selectedHeroReachableTileKeys,
        activeCombatHeroIds,
        screenX: e.clientX - rect.left,
        screenY: e.clientY - rect.top,
      }));
    },
    [activeCombatHeroIds, gameState, selectedHeroId, selectedHeroReachableTileKeys, selectedTownId, session?.user?.id]
  );

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isDragging.current = false;
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!container || !renderer) return;

    const rect = container.getBoundingClientRect();
    const currentPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);
    setMapContainerCursor(container, getAdventureMapCursor({
      renderer,
      gameState,
      selectedHeroId,
      selectedTownId,
      currentPlayerId: currentPlayer?.id ?? null,
      visibleTiles: lastFogVisibleRef.current,
      reachableTileKeys: selectedHeroReachableTileKeys,
      activeCombatHeroIds,
      screenX: e.clientX - rect.left,
      screenY: e.clientY - rect.top,
    }));
  }, [activeCombatHeroIds, gameState, selectedHeroId, selectedHeroReachableTileKeys, selectedTownId, session?.user?.id]);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    setMapContainerCursor(containerRef.current, ADVENTURE_CURSORS.default);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    touchGestureRef.current = {
      dragged: false,
      lastDistance: getTouchDistance(touchPointersRef.current),
      lastCenter: getTouchCenter(touchPointersRef.current),
      startCenter: getTouchCenter(touchPointersRef.current),
    };
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || !touchPointersRef.current.has(event.pointerId)) return;
    const renderer = rendererRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!renderer || !rect) return;

    touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const center = getTouchCenter(touchPointersRef.current);
    const distance = getTouchDistance(touchPointersRef.current);
    const gesture = touchGestureRef.current;

    if (touchPointersRef.current.size >= 2 && center && gesture.lastCenter) {
      const dx = center.x - gesture.lastCenter.x;
      const dy = center.y - gesture.lastCenter.y;
      if (Math.abs(dx) + Math.abs(dy) > TOUCH_PAN_CONTINUE_THRESHOLD_PX) renderer.panCamera(dx, dy);
      if (distance > 0 && gesture.lastDistance > 0) {
        const delta = distance - gesture.lastDistance;
        if (Math.abs(delta) > TOUCH_PINCH_ZOOM_THRESHOLD_PX) {
          renderer.zoomCamera(delta > 0 ? 1 : -1, center.x - rect.left, center.y - rect.top);
        }
      }
      gesture.dragged = true;
      gesture.lastDistance = distance;
      gesture.lastCenter = center;
      gesture.startCenter = gesture.startCenter ?? center;
      suppressNextClickRef.current = true;
      return;
    }

    if (touchPointersRef.current.size === 1 && center && gesture.lastCenter) {
      const dx = center.x - gesture.lastCenter.x;
      const dy = center.y - gesture.lastCenter.y;
      const start = gesture.startCenter ?? gesture.lastCenter;
      const totalDistance = Math.hypot(center.x - start.x, center.y - start.y);
      const shouldPan = gesture.dragged || totalDistance > TOUCH_PAN_START_THRESHOLD_PX;
      if (shouldPan && Math.hypot(dx, dy) > TOUCH_PAN_CONTINUE_THRESHOLD_PX) {
        renderer.panCamera(dx, dy);
        gesture.dragged = true;
        suppressNextClickRef.current = true;
      }
      gesture.lastCenter = center;
    }
  }, []);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    const shouldDispatchTap = touchPointersRef.current.size === 1 && !touchGestureRef.current.dragged;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (shouldDispatchTap) {
      dispatchingTouchTapRef.current = true;
      event.currentTarget.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
      }));
      dispatchingTouchTapRef.current = false;
      ignoreNextNativeTouchClickRef.current = true;
      window.setTimeout(() => {
        ignoreNextNativeTouchClickRef.current = false;
      }, 350);
    }
    touchPointersRef.current.delete(event.pointerId);
    touchGestureRef.current = {
      dragged: false,
      lastDistance: getTouchDistance(touchPointersRef.current),
      lastCenter: getTouchCenter(touchPointersRef.current),
      startCenter: getTouchCenter(touchPointersRef.current),
    };
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.cancelable) e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.zoomCamera(
      e.deltaY < 0 ? 1 : -1,
      e.clientX - rect.left,
      e.clientY - rect.top
    );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleMoveInteraction = useCallback((heroId: string, interaction: MoveInteraction | null | undefined) => {
    if (!interaction) return false;

    if (interaction.type === "COMBAT") {
      pendingMoveRef.current = null;
      pendingAttackRef.current = null;
      rendererRef.current?.clearHighlights();
      setPendingCombat({
        attackerHeroId: heroId,
        targetId: interaction.targetId,
        targetType: interaction.targetType,
        destination: interaction.destination,
        targetPosition: interaction.targetPosition,
      });
      return true;
    }

    pendingMoveRef.current = null;
    pendingAttackRef.current = null;
    rendererRef.current?.clearHighlights();

    if (interaction.type === "COLLECT") {
      const amount = getCollectInteractionAmount(interaction);
      const msg = interaction.resource === "gold"
        ? `+${amount} Or trouve !`
        : `+${amount} ${formatResourceName(interaction.resource)} collecté(e) !`;
      setCombatMessage(msg);
      return true;
    }

    if (interaction.type === "ARTIFACT") {
      setCombatMessage(`${interaction.label} recupere.`);
      return true;
    }

    if (interaction.type === "CAPTURE_BUILDING") {
      setCombatMessage(`Bâtiment capture : ${RESOURCE_BUILDING_RULES.find((rule) => rule.type === interaction.buildingType)?.label ?? "Bâtiment"}.`);
      return true;
    }

    if (interaction.type === "CAPTURE_TOWN") {
      setCombatMessage("Chateau capture.");
      return true;
    }

    if (interaction.type === "CAPTURE_GATE") {
      setCombatMessage("Porte controlee.");
      setSelectedGateId(interaction.gateId);
      return true;
    }

    if (interaction.type === "ADVENTURE_BUILDING") {
      if (interaction.alreadyVisited) {
        return true;
      }
      if (interaction.choices?.length && interaction.buildingId) {
        setPendingAdventureChoice({
          heroId,
          buildingId: interaction.buildingId,
          buildingType: interaction.buildingType,
          message: interaction.message ?? getAdventureBuildingLabel(interaction.buildingType),
          choices: interaction.choices,
        });
        setCombatMessage(interaction.message ?? getAdventureBuildingLabel(interaction.buildingType));
        return true;
      }
      if (interaction.recruited) {
        const rule = UNIT_RULES[interaction.recruited.unitType];
        setCombatMessage(interaction.message ?? `${interaction.recruited.count} ${rule?.label ?? "creature(s)"} recruté(e)s.`);
      } else if (interaction.reward) {
        const parts = [];
        if (interaction.reward.gold) parts.push(`+${interaction.reward.gold} Or`);
        for (const [resource, amount] of Object.entries(interaction.reward.resources ?? {})) {
          parts.push(`+${amount} ${formatResourceName(resource)}`);
        }
        setCombatMessage(parts.length > 0 ? parts.join(", ") : interaction.message ?? getAdventureBuildingLabel(interaction.buildingType));
      } else {
        setCombatMessage(interaction.message ?? getAdventureBuildingLabel(interaction.buildingType));
      }
      return true;
    }

    if (interaction.type === "TELEPORT") {
      setCombatMessage(interaction.message ?? "Teleportation effectuee.");
      setActiveMapLevel(normalizeMapLevel(interaction.to.level));
      renderedMapRef.current = null;
      rendererRef.current?.centerOnTile(interaction.to.x, interaction.to.y);
      return true;
    }

    setCombatMessage(interaction.message ?? "Action effectuee.");
    return true;
  }, [setActiveMapLevel, setCombatMessage, setPendingCombat]);

  const resolveAdventureChoice = useCallback(async (choice: AdventureChoiceValue) => {
    if (!gameState || !pendingAdventureChoice) return;
    isSyncingMoveRef.current = true;
    useGameStore.getState().setMovePending(true);
    try {
      const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "VISIT_ADVENTURE_BUILDING",
          heroId: pendingAdventureChoice.heroId,
          buildingId: pendingAdventureChoice.buildingId,
          choice,
        }),
      });
      if (!response.ok) {
        setCombatMessage(await getApiErrorMessage(response));
        return;
      }
      const data = await response.json();
      setPendingAdventureChoice(null);
      handleMoveInteraction(pendingAdventureChoice.heroId, data.interaction as MoveInteraction | null | undefined);
      const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
      if (refreshed) useGameStore.getState().setGameState(refreshed);
    } finally {
      isSyncingMoveRef.current = false;
      useGameStore.getState().setMovePending(false);
    }
  }, [devRevealMap, gameState, handleMoveInteraction, pendingAdventureChoice, session?.user?.id, setCombatMessage]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!rendererRef.current || !gameState) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const objects = rendererRef.current.getObjectsAtScreen(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    const town = objects.find((obj) => obj.type === "town");
    if (!town) return;

    pendingMoveRef.current = null;
    pendingAttackRef.current = null;
    rendererRef.current.clearHighlights();
    selectTown(town.id);
  }, [gameState, selectTown]);

  const collectArtifact = useCallback(async (gameId: string, heroId: string, targetPosition: Position, path: Position[]) => {
    isSyncingMoveRef.current = true;
    useGameStore.getState().setMovePending(true);
    try {
      const response = await fetchWithSupabaseAuth(`/api/games/${gameId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "COLLECT_ARTIFACT", heroId, targetPosition, path }),
      });
      if (!response.ok) {
        setCombatMessage(await getApiErrorMessage(response));
        return;
      }
      const data = await response.json();
      handleMoveInteraction(heroId, data.interaction as MoveInteraction | null | undefined);
      const refreshed = await refreshGameState(gameId, session?.user?.id, { revealMap: devRevealMap });
      if (refreshed) useGameStore.getState().setGameState(refreshed);
    } finally {
      isSyncingMoveRef.current = false;
      useGameStore.getState().setMovePending(false);
    }
  }, [devRevealMap, handleMoveInteraction, session?.user?.id, setCombatMessage]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (ignoreNextNativeTouchClickRef.current && !dispatchingTouchTapRef.current) {
      ignoreNextNativeTouchClickRef.current = false;
      e.preventDefault();
      return;
    }
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      e.preventDefault();
      return;
    }
    if (!rendererRef.current || !gameState) return;
    if (gameState.status === "PENDING") {
      pendingMoveRef.current = null;
      pendingAttackRef.current = null;
      isSyncingMoveRef.current = false;
      rendererRef.current.clearHighlights();
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const myPlayer = gameState.players.find(
      (player) => player.userId === session?.user?.id
    );
    const canAct = Boolean(
      myPlayer && gameState.status === "ACTIVE" && myPlayer.isAlive && !myPlayer.hasEndedTurn
    );
    const blockedTurnMessage = myPlayer?.hasEndedTurn
      ? "Vous avez déjà terminé votre tour."
      : "Vous ne pouvez pas jouer pour le moment.";

    const tile = rendererRef.current.getTileAtScreen(screenX, screenY);
    const mapForAction = activeMap ?? gameState.map;
    const targetTile = tile ? mapForAction.tiles[tile.y]?.[tile.x] : undefined;
    let objects = filterClickThroughTownSpriteHits(
      rendererRef.current.getObjectsAtScreen(screenX, screenY),
      tile,
      targetTile,
      selectedHeroId
    );

    if (devTeleportArmed) {
      if (!tile) return;
      if (!selectedHeroId) {
        setCombatMessage("Sélectionnez un héros avant de le téléporter.");
        useGameStore.getState().setDevTeleportArmed(false);
        return;
      }

      pendingMoveRef.current = null;
      pendingAttackRef.current = null;
      rendererRef.current.clearHighlights();
      isSyncingMoveRef.current = true;
      useGameStore.getState().setMovePending(true);
      useGameStore.getState().setDevTeleportArmed(false);
      fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DEV_TELEPORT_HERO",
          heroId: selectedHeroId,
          position: { x: tile.x, y: tile.y },
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            setCombatMessage(await getApiErrorMessage(response));
            return null;
          }
          return refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
        })
        .then((state) => {
          if (state) {
            useGameStore.getState().setGameState(state);
            setCombatMessage("Héros téléporté.");
          }
        })
        .finally(() => {
          isSyncingMoveRef.current = false;
          useGameStore.getState().setMovePending(false);
        });
      return;
    }

    const selectedHeroForLayer = selectedHeroId
      ? myPlayer?.heroes.find((hero) => hero.id === selectedHeroId)
      : null;
    if (selectedHeroForLayer && normalizeMapLevel(selectedHeroForLayer.position.level) !== activeMapLevel) {
      setCombatMessage(activeMapLevel === UNDERGROUND_LEVEL ? "Ce héros est à la surface." : "Ce héros est dans le souterrain.");
      return;
    }

    if (pendingAdventureSpell) {
      if (!tile) return;
      const hero = myPlayer?.heroes.find((item) => item.id === pendingAdventureSpell.heroId);
      if (!hero) {
        setPendingAdventureSpell(null);
        setCombatMessage("Héros lanceur indisponible.");
        return;
      }
      if (!canAct) {
        setCombatMessage(blockedTurnMessage);
        return;
      }
      if (activeCombatHeroIds.has(hero.id)) {
        setPendingAdventureSpell(null);
        setCombatMessage("Ce héros est déjà engagé dans un combat.");
        return;
      }

      pendingMoveRef.current = null;
      pendingAttackRef.current = null;
      rendererRef.current.clearHighlights();
      isSyncingMoveRef.current = true;
      useGameStore.getState().setMovePending(true);
      fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CAST_ADVENTURE_SPELL",
          heroId: hero.id,
          spellId: pendingAdventureSpell.spellId,
          target: { x: tile.x, y: tile.y },
          ...(devInfiniteMana ? { devInfiniteManaHeroId: hero.id } : {}),
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            setCombatMessage(await getApiErrorMessage(response));
            rendererRef.current?.highlightTile(tile.x, tile.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 650);
            return null;
          }
          const data = await response.json();
          setPendingAdventureSpell(null);
          const revealedTiles = normalizeRevealedTiles(data?.interaction?.revealedTiles);
          const revealHints = normalizeRevealHints(data?.interaction?.revealHints);
          if (revealedTiles.length > 0) {
            setSpellRevealHighlight({ turnNumber: gameState.turnNumber, tiles: revealedTiles, hints: revealHints, label: pendingAdventureSpell.label });
          }
          const message = typeof data?.interaction?.message === "string"
            ? data.interaction.message
            : `${pendingAdventureSpell.label} lance.`;
          setCombatMessage(message);
          return refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
        })
        .then((state) => {
          if (state) useGameStore.getState().setGameState(state);
        })
        .finally(() => {
          isSyncingMoveRef.current = false;
          useGameStore.getState().setMovePending(false);
        });
      return;
    }

    if (isSyncingMoveRef.current) {
      return;
    }

    const handleOutOfRange = (heroSrc: { id: string; position: Position; movement: number; maxMovement: number }, destination: Position): "handled" | "inaccessible" => {
      const renderer = rendererRef.current;
      if (!renderer || !gameState) return "inaccessible";
      if (activeCombatHeroIds.has(heroSrc.id)) {
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        renderer.clearHighlights();
        setCombatMessage("Ce héros est déjà engagé dans un combat.");
        return "handled";
      }
      if (destination.x === heroSrc.position.x && destination.y === heroSrc.position.y) {
        return "inaccessible";
      }

      let fullPath = findPath(mapForAction, heroSrc.position, destination, Number.POSITIVE_INFINITY);
      if (fullPath.length <= 1) {
        // Destination impassable / disconnected: try adjacent tiles
        const candidates = getAdjacentPositions(destination);
        let best: Position[] = [];
        for (const c of candidates) {
          if (c.x < 0 || c.x >= mapForAction.width || c.y < 0 || c.y >= mapForAction.height) continue;
          if (!isTileTraversable(mapForAction.tiles[c.y][c.x])) continue;
          const p = findPath(mapForAction, heroSrc.position, c, Number.POSITIVE_INFINITY);
          if (p.length > 1 && (best.length === 0 || getPathMovementCost(mapForAction, p) < getPathMovementCost(mapForAction, best))) {
            best = p;
          }
        }
        if (best.length <= 1) return "inaccessible";
        fullPath = best;
      }

      let usedCost = 0;
      let splitIndex = 0;
      for (let i = 1; i < fullPath.length; i++) {
        const c = getAdventureStepCost(mapForAction, fullPath[i - 1], fullPath[i]);
        if (usedCost + c > heroSrc.movement) break;
        usedCost += c;
        splitIndex = i;
      }

      const reachable = fullPath.slice(0, splitIndex + 1);
      const unreachable = fullPath.slice(splitIndex + 1);
      const totalCost = getPathMovementCost(mapForAction, fullPath);
      const remaining = totalCost - usedCost;
      const maxMove = heroSrc.maxMovement > 0 ? heroSrc.maxMovement : 1;
      const additionalTurns = Math.max(1, Math.ceil(remaining / maxMove));
      const turnsLabel = `${additionalTurns + (splitIndex > 0 ? 1 : 0)}`;

      if (splitIndex === 0) {
        renderer.highlightPartialPath([heroSrc.position], unreachable, turnsLabel);
        pendingAttackRef.current = null;
        pendingMoveRef.current = {
          heroId: heroSrc.id,
          destination: heroSrc.position,
          path: [heroSrc.position],
          finalDestination: destination,
        };
        return "handled";
      }

      const partialDestination = reachable[reachable.length - 1];
      renderer.highlightPartialPath(reachable, unreachable, turnsLabel);

      pendingAttackRef.current = null;
      const pendingMove = pendingMoveRef.current;
      const isConfirmingMove =
        pendingMove?.heroId === heroSrc.id &&
        pendingMove.destination.x === partialDestination.x &&
        pendingMove.destination.y === partialDestination.y;

      if (!isConfirmingMove) {
        pendingMoveRef.current = {
          heroId: heroSrc.id,
          destination: partialDestination,
          path: reachable,
          finalDestination: destination,
        };
        return "handled";
      }

      if (!canAct) {
        setCombatMessage(blockedTurnMessage);
        pendingMoveRef.current = null;
        renderer.clearHighlights();
        return "handled";
      }

      const movePath = reachable;
      isSyncingMoveRef.current = true;
      useGameStore.getState().setMovePending(true);
      fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MOVE_HERO",
          heroId: heroSrc.id,
          path: movePath.map((p: Position) => ({ x: p.x, y: p.y })),
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            isSyncingMoveRef.current = false;
            useGameStore.getState().setMovePending(false);
            setCombatMessage(await getApiErrorMessage(res));
            return null;
          }
          return res.json();
        })
        .then(async (data) => {
          if (!data) return;
          const acceptedPath = getAcceptedMovePath(data, movePath);
          await animateHeroMovement(rendererRef.current, heroSrc.id, acceptedPath);
          const interaction = data.interaction as MoveInteraction | null | undefined;
          if (handleMoveInteraction(heroSrc.id, interaction)) {
            refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap })
              .then((state) => {
                if (state) useGameStore.getState().setGameState(state);
              })
              .finally(() => {
                isSyncingMoveRef.current = false;
                useGameStore.getState().setMovePending(false);
              });
            return;
          }
          pendingMoveRef.current = {
            heroId: heroSrc.id,
            destination: movePath[movePath.length - 1],
            path: movePath,
            finalDestination: destination,
          };
          refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap })
            .then((state) => {
              if (!state) return;
              useGameStore.getState().setGameState(state);
              const renderer = rendererRef.current;
              const pending = pendingMoveRef.current;
              if (renderer?.isReady() && pending) {
                pendingMoveRef.current = redrawPendingMove(renderer, state, pending);
              }
            })
            .finally(() => {
              isSyncingMoveRef.current = false;
              useGameStore.getState().setMovePending(false);
            });
        })
        .catch(() => {
          isSyncingMoveRef.current = false;
          useGameStore.getState().setMovePending(false);
          setCombatMessage("Deplacement impossible pour le moment.");
        });
      return "handled";
    };

    const blockIfHeroInCombat = (heroId: string) => {
      if (!activeCombatHeroIds.has(heroId)) return false;
      pendingMoveRef.current = null;
      pendingAttackRef.current = null;
      rendererRef.current?.clearHighlights();
      setCombatMessage("Ce héros est déjà engagé dans un combat.");
      return true;
    };

    if (targetTile?.object?.type === "gate" && tile && selectedHeroId && myPlayer) {
      const gate = findGateAt(gameState, targetTile.object.id, tile);
      const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
      const heroOnGate = Boolean(gate && hero && hero.position.x === gate.position.x && hero.position.y === gate.position.y);
      const shouldTreatGateAsGround = Boolean(
        gate &&
        hero &&
        (
          (gate.ownerId === myPlayer.id && !heroOnGate) ||
          (gate.ownerId !== myPlayer.id && gate.garrison.every((unit) => unit.count <= 0))
        )
      );
      if (shouldTreatGateAsGround) {
        objects = objects.filter((object) => object.type !== "gate");
      }
    }

    if (targetTile?.object?.type === "gate" && tile && selectedHeroId && myPlayer) {
      const gate = findGateAt(gameState, targetTile.object.id, tile);
      const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
      if (gate && hero) {
        const isOwnedGate = gate.ownerId === myPlayer.id;
        const garrisonCount = gate.garrison.reduce((total, unit) => total + unit.count, 0);
        const heroOnGate = hero.position.x === gate.position.x && hero.position.y === gate.position.y;

        if (isOwnedGate && heroOnGate) {
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current?.clearHighlights();
          setSelectedGateId(gate.id);
          return;
        }

        if (garrisonCount === 0 && gate.ownerId !== myPlayer.id && heroOnGate) {
          if (blockIfHeroInCombat(hero.id)) return;
          if (!canAct) {
            setCombatMessage(blockedTurnMessage);
            return;
          }
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current?.clearHighlights();

          isSyncingMoveRef.current = true;
          useGameStore.getState().setMovePending(true);
          fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "CAPTURE_GATE",
              gateId: gate.id,
              heroId: hero.id,
            }),
          })
            .then(async (response) => {
              if (!response.ok) {
                setCombatMessage(await getApiErrorMessage(response));
                return null;
              }
              setCombatMessage("Porte controlee.");
              return refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
            })
            .then((state) => {
              if (state) useGameStore.getState().setGameState(state);
              setSelectedGateId(gate.id);
            })
            .finally(() => {
              isSyncingMoveRef.current = false;
              useGameStore.getState().setMovePending(false);
          });
          return;
        }

        if (garrisonCount > 0 && !isOwnedGate) {
          if (blockIfHeroInCombat(hero.id)) return;
          const approach = getCombatApproach(mapForAction, hero.position, gate.position, hero.movement);
          if (!approach) {
            rendererRef.current?.highlightTile(gate.position.x, gate.position.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
            return;
          }
          if (!canAct) {
            setCombatMessage(blockedTurnMessage);
            return;
          }
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current?.clearHighlights();
          rendererRef.current?.highlightPath(approach.path);
          rendererRef.current?.highlightTile(gate.position.x, gate.position.y, 0xff6600);
          setPendingCombat({
            attackerHeroId: selectedHeroId,
            targetId: gate.id,
            targetType: "gate",
            destination: approach.destination,
            targetPosition: gate.position,
            path: approach.path,
          });
          return;
        }

        // Owned-distant gates and empty unowned gates fall through to normal movement.
      }
    }

    if (objects.length > 0) {
      const selectedObject = selectObjectOnTile(
        objects,
        selectedHeroId,
        selectedTownId
      );

      if (!selectedObject) return;

      const obj = selectedObject;
      if (adminObserverMode && obj.type === "hero") {
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current?.clearHighlights();
        selectHero(obj.id);
        return;
      }
      if (adminObserverMode && obj.type === "town") {
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current?.clearHighlights();
        selectTown(obj.id);
        return;
      }

      if (obj.type === "combat") {
        const combat = gameState.activeCombats?.find((item) => item.id === obj.id);
        if (!combat) return;
        const isCombatOpenable = myPlayer?.isAlive === false || combat.visibility !== "joinable_summary";
        if (selectedHeroId && myPlayer) {
          const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
          if (!hero) return;
          if (activeCombatHeroIds.has(hero.id)) {
            pendingMoveRef.current = null;
            pendingAttackRef.current = null;
            rendererRef.current.clearHighlights();
            if (getCombatHeroIds(combat).has(hero.id)) {
              if (isCombatOpenable) setActiveCombat(combat);
            } else {
              setCombatMessage("Ce héros est déjà engagé dans un combat.");
            }
            return;
          }
          const destination = { x: obj.x, y: obj.y };
          const path = findPath(mapForAction, hero.position, destination, hero.movement);
          if (path.length <= 1) {
            if (handleOutOfRange(hero, destination) === "inaccessible") {
              rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
              setTimeout(() => rendererRef.current?.clearHighlights(), 500);
            }
            return;
          }
          const pendingJoin = pendingAttackRef.current;
          const isConfirmingJoin = pendingJoin?.heroId === selectedHeroId && pendingJoin.targetId === combat.id;
          if (!isConfirmingJoin) {
            pendingMoveRef.current = null;
            pendingAttackRef.current = { heroId: selectedHeroId, targetId: combat.id, destination, path };
            rendererRef.current.highlightPath(path);
            rendererRef.current.highlightTile(destination.x, destination.y, 0xffa500);
            setCombatMessage("Cliquez à nouveau pour rejoindre ce combat.");
            return;
          }
          if (!canAct) {
            setCombatMessage(blockedTurnMessage);
            pendingAttackRef.current = null;
            rendererRef.current.clearHighlights();
            return;
          }
          const existingParticipant = combat.participants?.find((participant) => participant.playerId === myPlayer.id);
          const inferredSide: "attacker" | "defender" | undefined =
            existingParticipant?.side ??
            (combat.attackerPlayerId === myPlayer.id
              ? "attacker"
              : combat.defenderPlayerId === myPlayer.id
              ? "defender"
              : undefined);
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          setPendingJoinCombat({ combatId: combat.id, heroId: selectedHeroId, side: inferredSide });
          return;
        }
        if (isCombatOpenable) {
          setActiveCombat(combat);
        } else {
          setCombatMessage("Sélectionnez un héros pour rejoindre ce combat.");
        }
        return;
      }
      if (obj.type === "boat" && selectedHeroId && myPlayer) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;
        if (blockIfHeroInCombat(hero.id)) return;
        const isAdjacent = Math.abs(hero.position.x - obj.x) <= 1 && Math.abs(hero.position.y - obj.y) <= 1;
        if (!isAdjacent) {
          rendererRef.current.highlightTile(obj.x, obj.y, 0xff0000);
          setCombatMessage("Le bateau est trop eloigne.");
          setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          return;
        }
        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          return;
        }
        isSyncingMoveRef.current = true;
        useGameStore.getState().setMovePending(true);
        fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "EMBARK_BOAT", heroId: selectedHeroId, boatId: obj.id }),
        })
          .then(async (response) => {
            if (!response.ok) {
              setCombatMessage(await getApiErrorMessage(response));
              return null;
            }
            return response.json();
          })
          .then(async (data) => {
            if (!data) return;
            setCombatMessage(data.interaction?.message ?? "Embarquement effectue.");
            const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
            if (refreshed) useGameStore.getState().setGameState(refreshed);
          })
          .finally(() => {
            isSyncingMoveRef.current = false;
            useGameStore.getState().setMovePending(false);
          });
        return;
      }
      const isEnemyHero =
        obj.type === "hero" && myPlayer && obj.playerId !== myPlayer.id;
      const isEnemyTown =
        obj.type === "town" && myPlayer && obj.playerId !== myPlayer.id;

      if (isEnemyHero && selectedHeroId) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;
        if (blockIfHeroInCombat(hero.id)) return;

        const destination = { x: obj.x, y: obj.y };
        const approach = getCombatApproach(mapForAction, hero.position, destination, hero.movement);
        if (!approach) {
          if (handleOutOfRange(hero, destination) === "inaccessible") {
            rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          }
          return;
        }
        const path = approach.path;
        const approachDestination = approach.destination;

        const pendingAttack = pendingAttackRef.current;
        const isConfirmingAttack =
          pendingAttack?.heroId === selectedHeroId &&
          pendingAttack.targetId === obj.id;

        if (!isConfirmingAttack) {
          pendingMoveRef.current = null;
          pendingAttackRef.current = {
            heroId: selectedHeroId,
            targetId: obj.id,
            destination: approachDestination,
            path,
          };
          rendererRef.current.highlightPath(path);
          rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
          return;
        }

        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        pendingAttackRef.current = null;
        rendererRef.current.clearHighlights();
        setPendingCombat({ attackerHeroId: selectedHeroId, targetId: obj.id, targetType: "hero", destination: approachDestination, targetPosition: destination, path });
        return;
      }

      if (isEnemyTown && selectedHeroId) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;
        if (blockIfHeroInCombat(hero.id)) return;

        const destination = { x: obj.x, y: obj.y };
        const path = findPath(mapForAction, hero.position, destination, hero.movement);
        if (path.length <= 1) {
          if (handleOutOfRange(hero, destination) === "inaccessible") {
            rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          }
          return;
        }

        const pendingCapture = pendingAttackRef.current;
        const isConfirmingCapture =
          pendingCapture?.heroId === selectedHeroId &&
          pendingCapture.targetId === obj.id;

        if (!isConfirmingCapture) {
          pendingMoveRef.current = null;
          pendingAttackRef.current = {
            heroId: selectedHeroId,
            targetId: obj.id,
            destination,
            path,
          };
          rendererRef.current.highlightPath(path);
          rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
          setCombatMessage("Cliquez à nouveau pour capturer ce château.");
          return;
        }

        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "CAPTURE_TOWN",
            heroId: selectedHeroId,
            townId: obj.id,
            destination,
            path: path.map((p: Position) => ({ x: p.x, y: p.y })),
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const message = await getApiErrorMessage(response);
              console.warn("[CAPTURE_TOWN]", response.status, message);
              const normalizedMessage = message
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
              if (normalizedMessage.includes("garde")) {
                pendingAttackRef.current = null;
                rendererRef.current?.clearHighlights();
                const approach = getCombatApproach(mapForAction, hero.position, destination, hero.movement);
                if (approach) {
                  setPendingCombat({
                    attackerHeroId: selectedHeroId,
                    targetId: obj.id,
                    targetType: "town",
                    destination: approach.destination,
                    targetPosition: destination,
                    path: approach.path,
                  });
                } else {
                  setCombatMessage(message);
                }
              } else {
                setCombatMessage(message);
              }
              return null;
            }
            return response.json();
          })
          .then(async (data) => {
            if (!data) return;
            pendingAttackRef.current = null;
            rendererRef.current?.clearHighlights();
          const acceptedPath = getAcceptedMovePath(data, path);
          await animateHeroMovement(rendererRef.current, selectedHeroId, acceptedPath);

            refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap }).then((state) => {
              if (state) useGameStore.getState().setGameState(state);
              useGameStore.getState().selectTown(obj.id);
            });

            useGameStore.getState().setCombatMessage("Château capturé.");
          });
        return;
      }

      if (obj.type === "town" && selectedHeroId && myPlayer && obj.playerId === myPlayer.id) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;
        if (blockIfHeroInCombat(hero.id)) return;

        const destination = { x: obj.x, y: obj.y };
        if (destination.x === hero.position.x && destination.y === hero.position.y) {
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          setCombatMessage("Ce héros est déjà dans ce château.");
          return;
        }

        const path = findPath(mapForAction, hero.position, destination, hero.movement);
        if (path.length <= 1) {
          if (handleOutOfRange(hero, destination) === "inaccessible") {
            rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          }
          return;
        }

        pendingAttackRef.current = null;
        const pendingMove = pendingMoveRef.current;
        const isConfirmingMove =
          pendingMove?.heroId === selectedHeroId &&
          pendingMove.destination.x === destination.x &&
          pendingMove.destination.y === destination.y;

        if (!isConfirmingMove) {
          pendingMoveRef.current = {
            heroId: selectedHeroId,
            destination,
            path,
          };
          rendererRef.current.highlightPath(path);
          rendererRef.current.highlightTile(destination.x, destination.y, 0x32d583);
          setCombatMessage("Cliquez à nouveau pour entrer dans ce château.");
          return;
        }

        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          pendingMoveRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        rendererRef.current.highlightPath(path);
        isSyncingMoveRef.current = true;
        useGameStore.getState().setMovePending(true);
        fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "MOVE_HERO",
            heroId: selectedHeroId,
            path: path.map((p: Position) => ({ x: p.x, y: p.y })),
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              isSyncingMoveRef.current = false;
              useGameStore.getState().setMovePending(false);
              setCombatMessage(await getApiErrorMessage(res));
              return null;
            }
            return res.json();
          })
          .then(async (data) => {
            if (!data) return;
            const acceptedPath = getAcceptedMovePath(data, path);
            await animateHeroMovement(rendererRef.current, selectedHeroId, acceptedPath);
            const interaction = data.interaction as MoveInteraction | null | undefined;
            const handledInteraction = handleMoveInteraction(selectedHeroId, interaction);
            if (!handledInteraction) {
              pendingMoveRef.current = null;
              rendererRef.current?.clearHighlights();
            }
            setCombatMessage("Héros entré dans le château.");

            refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap })
              .then((state) => {
                if (state) useGameStore.getState().setGameState(state);
                useGameStore.getState().selectTown(obj.id);
              })
              .finally(() => {
                isSyncingMoveRef.current = false;
                useGameStore.getState().setMovePending(false);
              });
          })
          .catch(() => {
            isSyncingMoveRef.current = false;
            useGameStore.getState().setMovePending(false);
            setCombatMessage("Deplacement impossible pour le moment.");
          });
        return;
      }

      const isNeutralOrEnemyBuilding =
        obj.type === "building" && myPlayer && obj.playerId !== myPlayer.id;
      if (isNeutralOrEnemyBuilding && selectedHeroId) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;
        if (blockIfHeroInCombat(hero.id)) return;

        const destination = { x: obj.x, y: obj.y };
        const guardianPower = mapForAction.tiles[destination.y]?.[destination.x]?.object?.guardianPower ?? 0;
        if (guardianPower > 0) {
          const approach = getCombatApproach(mapForAction, hero.position, destination, hero.movement);
          if (!approach) {
            rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
            return;
          }
          if (!canAct) {
            setCombatMessage(blockedTurnMessage);
            return;
          }
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current.highlightPath(approach.path);
          rendererRef.current.highlightTile(destination.x, destination.y, 0xff6600);
          setPendingCombat({
            attackerHeroId: selectedHeroId,
            targetId: obj.id,
            targetType: "building",
            destination: approach.destination,
            targetPosition: destination,
            path: approach.path,
          });
          return;
        }

        const path = findPath(mapForAction, hero.position, destination, hero.movement);
        if (path.length <= 1) {
          if (handleOutOfRange(hero, destination) === "inaccessible") {
            rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          }
          return;
        }

        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          return;
        }

        // Pas de gardiens — double-clic pour confirmer la capture
        const pendingCapture = pendingAttackRef.current;
        const isConfirmingCapture =
          pendingCapture?.heroId === selectedHeroId && pendingCapture.targetId === obj.id;

        if (!isConfirmingCapture) {
          pendingMoveRef.current = null;
          pendingAttackRef.current = { heroId: selectedHeroId, targetId: obj.id, destination, path };
          rendererRef.current.highlightPath(path);
          rendererRef.current.highlightTile(destination.x, destination.y, 0x00ff00);
          const buildingRule = RESOURCE_BUILDING_RULES.find((r) => r.type === obj.buildingType);
          const label = buildingRule?.label ?? obj.name ?? "Bâtiment";
          setCombatMessage(`Cliquez à nouveau pour capturer : ${label}${obj.playerId ? " (ennemi)" : ""}`);
          return;
        }

        pendingAttackRef.current = null;
        rendererRef.current.clearHighlights();
        fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "CAPTURE_BUILDING",
            heroId: selectedHeroId,
            buildingId: obj.id,
            path: path.map((p: Position) => ({ x: p.x, y: p.y })),
          }),
        })
          .then(async (r) => (r.ok ? r.json() : null))
          .then(async (data) => {
            if (!data) return;
            const acceptedPath = getAcceptedMovePath(data, path);
            await animateHeroMovement(rendererRef.current, selectedHeroId, acceptedPath);
            refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap }).then((s) => {
              if (s) useGameStore.getState().setGameState(s);
            });
            setCombatMessage(data.interaction?.type === "CAPTURE_BUILDING"
              ? `Bâtiment capturé : ${RESOURCE_BUILDING_RULES.find((r) => r.type === data.interaction.buildingType)?.label ?? "Bâtiment"}.`
              : "Bâtiment capturé.");
          });
        return;
      }

      if (obj.type === "adventure_building" && selectedHeroId && myPlayer) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;
        if (blockIfHeroInCombat(hero.id)) return;
        const destination = { x: obj.x, y: obj.y };
        const path = findPath(mapForAction, hero.position, destination, hero.movement);
        if (path.length <= 1) {
          if (handleOutOfRange(hero, destination) === "inaccessible") {
            rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          }
          return;
        }

        const pendingAdventure = pendingMoveRef.current;
        const isConfirmingAdventure =
          pendingAdventure?.heroId === selectedHeroId &&
          pendingAdventure.destination.x === destination.x &&
          pendingAdventure.destination.y === destination.y;

        if (!isConfirmingAdventure) {
          pendingAttackRef.current = null;
          pendingMoveRef.current = { heroId: selectedHeroId, destination, path };
          rendererRef.current.highlightPath(path);
          rendererRef.current.highlightTile(destination.x, destination.y, 0x22d3ee);
          if (!obj.visited) {
            setCombatMessage(`Cliquez à nouveau pour visiter : ${obj.name || getAdventureBuildingLabel(obj.buildingType)}`);
          }
          return;
        }

        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          pendingMoveRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        isSyncingMoveRef.current = true;
        useGameStore.getState().setMovePending(true);
        fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "MOVE_HERO",
            heroId: selectedHeroId,
            path: path.map((p: Position) => ({ x: p.x, y: p.y })),
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              isSyncingMoveRef.current = false;
              useGameStore.getState().setMovePending(false);
              setCombatMessage(await getApiErrorMessage(res));
              return null;
            }
            return res.json();
          })
          .then(async (data) => {
            if (!data) return;
            const acceptedPath = getAcceptedMovePath(data, path);
            await animateHeroMovement(rendererRef.current, selectedHeroId, acceptedPath);
            handleMoveInteraction(selectedHeroId, data.interaction as MoveInteraction | null | undefined);
            refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap })
              .then((state) => {
                if (state) useGameStore.getState().setGameState(state);
              })
              .finally(() => {
                isSyncingMoveRef.current = false;
                useGameStore.getState().setMovePending(false);
              });
          })
          .catch(() => {
            isSyncingMoveRef.current = false;
            useGameStore.getState().setMovePending(false);
            setCombatMessage("Deplacement impossible pour le moment.");
          });
        return;
      }

      if (obj.type === "gate") {
        pendingAttackRef.current = null;
        rendererRef.current?.clearHighlights();
        const gate = findGateAt(gameState, obj.id, { x: obj.x, y: obj.y });
        const isOwnedGate = Boolean(gate && myPlayer && gate.ownerId === myPlayer.id);
        const hasAdjacentHero = Boolean(
          gate && myPlayer?.heroes.some((hero) => areAdjacentOrSame(hero.position, gate.position))
        );

        if (isOwnedGate) {
          if (hasAdjacentHero && gate) {
            setSelectedGateId(gate.id);
            return;
          }
        } else {
          const garrisonCount = (gate?.garrison ?? []).reduce((total, unit) => total + unit.count, 0);
          if (selectedHeroId && myPlayer && gate) {
            const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
            if (!hero) return;
            if (blockIfHeroInCombat(hero.id)) return;

            if (garrisonCount > 0) {
              const destination = { x: obj.x, y: obj.y };
              const approach = getCombatApproach(mapForAction, hero.position, destination, hero.movement);
              if (!approach) {
                rendererRef.current?.highlightTile(destination.x, destination.y, 0xff0000);
                setTimeout(() => rendererRef.current?.clearHighlights(), 500);
                return;
              }
              if (!canAct) {
                setCombatMessage(blockedTurnMessage);
                return;
              }
              rendererRef.current?.highlightPath(approach.path);
              rendererRef.current?.highlightTile(destination.x, destination.y, 0xff6600);
              setPendingCombat({
                attackerHeroId: selectedHeroId,
                targetId: gate.id,
                targetType: "gate",
                destination: approach.destination,
                targetPosition: destination,
                path: approach.path,
              });
              return;
            }

            if (hero.position.x !== gate.position.x || hero.position.y !== gate.position.y) {
              const destination = gate.position;
              const path = findPath(mapForAction, hero.position, destination, hero.movement);
              if (path.length <= 1) {
                if (handleOutOfRange(hero, destination) === "inaccessible") {
                  rendererRef.current?.highlightTile(destination.x, destination.y, 0xff0000);
                  setTimeout(() => rendererRef.current?.clearHighlights(), 500);
                }
                return;
              }

              pendingAttackRef.current = null;
              const pendingMove = pendingMoveRef.current;
              const isConfirmingMove =
                pendingMove?.heroId === selectedHeroId &&
                pendingMove.destination.x === destination.x &&
                pendingMove.destination.y === destination.y;

              if (!isConfirmingMove) {
                pendingMoveRef.current = { heroId: selectedHeroId, destination, path };
                rendererRef.current?.highlightPath(path);
                return;
              }

              if (!canAct) {
                setCombatMessage(blockedTurnMessage);
                pendingMoveRef.current = null;
                rendererRef.current?.clearHighlights();
                return;
              }

              rendererRef.current?.highlightPath(path);
              isSyncingMoveRef.current = true;
              useGameStore.getState().setMovePending(true);
              fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "MOVE_HERO",
                  heroId: selectedHeroId,
                  path: path.map((point: Position) => ({ x: point.x, y: point.y })),
                }),
              })
                .then(async (response) => {
                  if (!response.ok) {
                    isSyncingMoveRef.current = false;
                    useGameStore.getState().setMovePending(false);
                    setCombatMessage(await getApiErrorMessage(response));
                    return null;
                  }
                  return response.json();
                })
                .then(async (data) => {
                  if (!data) return;
                  const acceptedPath = getAcceptedMovePath(data, path);
                  await animateHeroMovement(rendererRef.current, selectedHeroId, acceptedPath);
                  handleMoveInteraction(selectedHeroId, data.interaction as MoveInteraction | null | undefined);
                  refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap })
                    .then((state) => {
                      if (state) useGameStore.getState().setGameState(state);
                    })
                    .finally(() => {
                      isSyncingMoveRef.current = false;
                      useGameStore.getState().setMovePending(false);
                    });
                })
                .catch(() => {
                  isSyncingMoveRef.current = false;
                  useGameStore.getState().setMovePending(false);
                  setCombatMessage("Deplacement impossible pour le moment.");
                });
              return;
            }

            if (!canAct) {
              setCombatMessage(blockedTurnMessage);
              return;
            }

            isSyncingMoveRef.current = true;
            useGameStore.getState().setMovePending(true);
            fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "CAPTURE_GATE",
                gateId: gate.id,
                heroId: hero.id,
              }),
            })
              .then(async (response) => {
                if (!response.ok) {
                  setCombatMessage(await getApiErrorMessage(response));
                  return null;
                }
                setCombatMessage("Porte controlee.");
                return refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
              })
              .then((state) => {
                if (state) useGameStore.getState().setGameState(state);
                setSelectedGateId(gate.id);
              })
              .finally(() => {
                isSyncingMoveRef.current = false;
                useGameStore.getState().setMovePending(false);
            });
            return;
          }
          if (garrisonCount > 0) setCombatMessage(`Porte gardée : ${garrisonCount} unité(s).`);
        }
      } else if (obj.type === "hero" && myPlayer && obj.playerId === myPlayer.id) {
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current?.clearHighlights();
        selectHero(obj.id);
      } else if (obj.type === "town" && myPlayer && obj.playerId === myPlayer.id) {
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current?.clearHighlights();
        selectTown(obj.id);
      } else if (obj.type === "building") {
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current?.clearHighlights();
        const buildingRule = RESOURCE_BUILDING_RULES.find((r) => r.type === obj.buildingType);
        const label = buildingRule ? buildingRule.label : obj.name || "Bâtiment";
        const ownerStr = obj.playerId ? (obj.playerId === myPlayer?.id ? " (vous)" : " (ennemi)") : " (neutre)";
        setCombatMessage(`${label}${ownerStr} — Production hebdomadaire: ${buildingRule ? formatResourceProduction(buildingRule.production) : "aucune"}`);
      }
      return;
    }

    if (tile && selectedHeroId) {
      const hero = gameState.players
        .flatMap((p) => p.heroes)
        .find((h) => h.id === selectedHeroId);
      if (!hero) return;
      if (blockIfHeroInCombat(hero.id)) return;

      const targetTile = mapForAction.tiles[tile.y]?.[tile.x];
      if (targetTile?.object?.type === "artifact") {
        const approach = getCombatApproach(mapForAction, hero.position, tile, hero.movement);
        if (!approach) {
          rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
          setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          return;
        }
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current.highlightPath(approach.path);
        rendererRef.current.highlightTile(tile.x, tile.y, 0xa78bfa);
        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          return;
        }
        const guardianPower = Number(targetTile.object.guardianPower ?? 0);
        if (guardianPower > 0) {
          setPendingCombat({
            attackerHeroId: selectedHeroId,
            targetId: targetTile.object.id,
            targetType: "artifact",
            destination: approach.destination,
            targetPosition: tile,
            path: approach.path,
          });
          return;
        }
        void collectArtifact(gameState.id, selectedHeroId, tile, approach.path);
        return;
      }
      if (!isTileTraversable(targetTile)) {
        rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
        setCombatMessage(
          targetTile?.object?.type === "wall"
            ? "Passage bloque par un mur."
            : targetTile?.object?.type === "town_footprint"
            ? "La porte du château se trouve au sud."
            : "Terrain infranchissable."
        );
        setTimeout(() => rendererRef.current?.clearHighlights(), 650);
        return;
      }

      if (targetTile?.object?.type === "monster") {
        const approach = getCombatApproach(mapForAction, hero.position, tile, hero.movement);
        if (!approach) {
          rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
          setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          return;
        }
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current.highlightPath(approach.path);
        rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          return;
        }
        setPendingCombat({
          attackerHeroId: selectedHeroId,
          targetId: targetTile.object.id,
          targetType: "monster",
          destination: approach.destination,
          targetPosition: tile,
          path: approach.path,
        });
        return;
      }

      if (targetTile?.object?.type === "gate") {
        const gate = findGateAt(gameState, targetTile.object.id, tile);
        const heroOnGate = Boolean(gate && hero.position.x === gate.position.x && hero.position.y === gate.position.y);
        if (gate && gate.ownerId === myPlayer?.id && heroOnGate) {
          setSelectedGateId(gate.id);
          return;
        }

        // Owned-but-hero-not-on-it and non-owned gates fall through: the move flow handles
        // pathfinding, and MOVE_HERO triggers combat or capture on arrival.
      }

      if (targetTile?.object?.type === "building") {
        const isMyBuilding = myPlayer?.resourceBuildings.some((b) => b.id === targetTile.object!.id);
        const guardianPower = targetTile.object?.guardianPower ?? 0;
        if (!isMyBuilding && guardianPower > 0) {
          const approach = getCombatApproach(mapForAction, hero.position, tile, hero.movement);
          if (!approach) {
            rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
            return;
          }
          if (!canAct) {
            setCombatMessage(blockedTurnMessage);
            return;
          }
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current.highlightPath(approach.path);
          rendererRef.current.highlightTile(tile.x, tile.y, 0xff6600);
          setPendingCombat({
            attackerHeroId: selectedHeroId,
            targetId: targetTile.object.id,
            targetType: "building",
            destination: approach.destination,
            targetPosition: tile,
            path: approach.path,
          });
          return;
        }
      }

      const heroBoat = gameState.boats?.find((boat) => boat.heroId === hero.id);
      if (heroBoat && targetTile && targetTile.terrain !== "water" && isTileTraversable(targetTile)) {
        const isAdjacent = Math.abs(hero.position.x - tile.x) <= 1 && Math.abs(hero.position.y - tile.y) <= 1;
        if (!isAdjacent) {
          rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
          setCombatMessage("La rive est trop eloignee.");
          setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          return;
        }
        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          return;
        }
        isSyncingMoveRef.current = true;
        useGameStore.getState().setMovePending(true);
        fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "DISEMBARK_BOAT", heroId: hero.id, position: tile }),
        })
          .then(async (response) => {
            if (!response.ok) {
              setCombatMessage(await getApiErrorMessage(response));
              return null;
            }
            return response.json();
          })
          .then(async (data) => {
            if (!data) return;
            setCombatMessage(data.interaction?.message ?? "Debarquement effectue.");
            const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
            if (refreshed) useGameStore.getState().setGameState(refreshed);
          })
          .finally(() => {
            isSyncingMoveRef.current = false;
            useGameStore.getState().setMovePending(false);
          });
        return;
      }

      const path = findPath(mapForAction, hero.position, tile, hero.movement);
      if (path.length > 1) {
        if (targetTile?.object?.type === "building") {
          const isMyBuilding = myPlayer?.resourceBuildings.some((b) => b.id === targetTile.object!.id);
          if (!isMyBuilding) {
            if (!canAct) {
              setCombatMessage(blockedTurnMessage);
              return;
            }

            const guardianPower = targetTile.object?.guardianPower ?? 0;
            if (guardianPower > 0) {
              const approach = getCombatApproach(mapForAction, hero.position, tile, hero.movement);
              if (!approach) {
                rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
                setTimeout(() => rendererRef.current?.clearHighlights(), 500);
                return;
              }
              pendingMoveRef.current = null;
              pendingAttackRef.current = null;
              rendererRef.current.highlightPath(approach.path);
              rendererRef.current.highlightTile(tile.x, tile.y, 0xff6600);
              setPendingCombat({
                attackerHeroId: selectedHeroId,
                targetId: targetTile.object.id,
                targetType: "building",
                destination: approach.destination,
                targetPosition: tile,
                path: approach.path,
              });
              return;
            }

            // Pas de gardiens — double-clic pour confirmer la capture
            const pendingCapture = pendingAttackRef.current;
            const isConfirmingCapture =
              pendingCapture?.heroId === selectedHeroId &&
              pendingCapture.targetId === targetTile.object.id;

            if (!isConfirmingCapture) {
              pendingMoveRef.current = null;
              pendingAttackRef.current = { heroId: selectedHeroId, targetId: targetTile.object.id, destination: tile, path };
              rendererRef.current.highlightPath(path);
              rendererRef.current.highlightTile(tile.x, tile.y, 0x00ff00);
              const buildingRule = RESOURCE_BUILDING_RULES.find((r) => r.type === targetTile.object!.subtype);
              setCombatMessage(`Cliquez à nouveau pour capturer : ${buildingRule?.label ?? "Bâtiment"}`);
              return;
            }

            pendingAttackRef.current = null;
            rendererRef.current.clearHighlights();
            fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "CAPTURE_BUILDING",
                heroId: selectedHeroId,
                buildingId: targetTile.object.id,
                path: path.map((p: Position) => ({ x: p.x, y: p.y })),
              }),
            })
              .then(async (response) => {
                if (!response.ok) {
                  const data = await response.json().catch(() => ({}));
                  setCombatMessage(data.interaction?.resource === "defeat"
                    ? "Défaite... Les gardiens ont vaincu votre héros."
                    : data.error || "Capture impossible.");
                  return null;
                }
                return response.json();
              })
              .then(async (data) => {
                if (!data) return;
                const acceptedPath = getAcceptedMovePath(data, path);
                await animateHeroMovement(rendererRef.current, selectedHeroId, acceptedPath);
                refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap }).then((state) => {
                  if (state) useGameStore.getState().setGameState(state);
                });
                setCombatMessage(data.interaction?.type === "CAPTURE_BUILDING"
                  ? `Bâtiment capturé : ${RESOURCE_BUILDING_RULES.find((r) => r.type === data.interaction.buildingType)?.label ?? "Bâtiment"}.`
                  : "Bâtiment capturé.");
              });
            return;
          }
        }

        pendingAttackRef.current = null;
        const pendingMove = pendingMoveRef.current;
        const isConfirmingMove =
          pendingMove?.heroId === selectedHeroId &&
          pendingMove.destination.x === tile.x &&
          pendingMove.destination.y === tile.y;

        if (!isConfirmingMove) {
          pendingMoveRef.current = {
            heroId: selectedHeroId,
            destination: tile,
            path,
          };
          rendererRef.current.highlightPath(path);
          return;
        }

        if (!canAct) {
          setCombatMessage(blockedTurnMessage);
          pendingMoveRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        rendererRef.current.highlightPath(path);
        isSyncingMoveRef.current = true;
        useGameStore.getState().setMovePending(true);
        fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "MOVE_HERO",
            heroId: selectedHeroId,
            path: path.map((p: Position) => ({ x: p.x, y: p.y })),
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              isSyncingMoveRef.current = false;
              useGameStore.getState().setMovePending(false);
              setCombatMessage(await getApiErrorMessage(res));
              return null;
            }
            return res.json();
          })
          .then(async (data) => {
            if (!data) return;
            const acceptedPath = getAcceptedMovePath(data, path);
            await animateHeroMovement(rendererRef.current, selectedHeroId, acceptedPath);
            const interaction = data.interaction as MoveInteraction | null | undefined;
            const handledInteraction = handleMoveInteraction(selectedHeroId, interaction);
            if (!handledInteraction) {
              pendingMoveRef.current = null;
              rendererRef.current?.clearHighlights();
            }

            refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap })
              .then((state) => {
                if (state) useGameStore.getState().setGameState(state);
              })
              .finally(() => {
                isSyncingMoveRef.current = false;
                useGameStore.getState().setMovePending(false);
              });

            if (!handledInteraction && data.interaction?.type === "COLLECT") {
              const r = data.interaction.resource;
              const msg = r === "gold"
                ? `+${data.interaction.gold} Or trouvé !`
                : `+${r === "wood" || r === "ore" ? 2 : 1} ${formatResourceName(r)} collecté(e) !`;
              useGameStore.getState().setCombatMessage(msg);
            } else if (data.interaction?.type === "FIGHT") {
              if (data.interaction.resource === "victory") {
                useGameStore.getState().setCombatMessage(`Victoire ! Monstre vaincu (+${data.interaction.gold} XP).`);
              } else {
                useGameStore.getState().setCombatMessage("Défaite... Votre héros a péri contre le monstre.");
              }
            }
          })
          .catch(() => {
            isSyncingMoveRef.current = false;
            useGameStore.getState().setMovePending(false);
            setCombatMessage("Deplacement impossible pour le moment.");
          });
      } else {
        if (tile.x === hero.position.x && tile.y === hero.position.y) {
          return;
        }
        if (handleOutOfRange(hero, tile) === "inaccessible") {
          rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
          setTimeout(() => rendererRef.current?.clearHighlights(), 500);
        }
      }
    }
  }, [activeMap, activeMapLevel, adminObserverMode, gameState, selectedHeroId, selectedTownId, selectHero, selectTown, setCombatMessage, setPendingCombat, setPendingJoinCombat, setPendingAdventureSpell, setSpellRevealHighlight, setActiveCombat, handleMoveInteraction, collectArtifact, session?.user?.id, devRevealMap, devTeleportArmed, devInfiniteMana, pendingAdventureSpell, activeCombatHeroIds]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {gameState && selectedGateId && (
        <GateGarrisonModal
          gameState={gameState}
          gateId={selectedGateId}
          currentUserId={session?.user?.id}
          revealMap={devRevealMap}
          onClose={() => setSelectedGateId(null)}
          onMessage={setCombatMessage}
        />
      )}
      {pendingAdventureChoice && (
        <AdventureChoiceModal
          choice={pendingAdventureChoice}
          onChoose={(value) => void resolveAdventureChoice(value)}
          onClose={() => setPendingAdventureChoice(null)}
        />
      )}
    </div>
  );
}

function AdventureChoiceModal({
  choice,
  onChoose,
  onClose,
}: {
  choice: PendingAdventureChoice;
  onChoose: (value: AdventureChoiceValue) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded border border-amber-500/50 bg-stone-950/95 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-amber-100">{getAdventureBuildingLabel(choice.buildingType)}</h2>
            <p className="mt-1 text-sm leading-snug text-stone-300">{choice.message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded border border-stone-700 bg-stone-900 text-stone-200 hover:border-amber-400"
            aria-label="Fermer"
          >
            x
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {choice.choices.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onChoose(item.value)}
              className="h-10 rounded border border-amber-600/50 bg-amber-500/15 px-3 text-sm font-black text-amber-100 hover:bg-amber-500/25"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GateGarrisonModal({
  gameState,
  gateId,
  currentUserId,
  revealMap,
  onClose,
  onMessage,
}: {
  gameState: GameState;
  gateId: string;
  currentUserId?: string;
  revealMap: boolean;
  onClose: () => void;
  onMessage: (message: string | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const [transferDialog, setTransferDialog] = useState<{
    type: "TRANSFER_GATE_GARRISON_TO_HERO" | "TRANSFER_HERO_TO_GATE_GARRISON";
    unitType: UnitType;
    count: number;
  } | null>(null);
  const gate = gameState.gates?.find((item) => item.id === gateId);
  const player = gameState.players.find((item) => item.userId === currentUserId);
  const adjacentHeroes = gate && player
    ? player.heroes.filter((hero) => areAdjacentOrSame(hero.position, gate.position))
    : [];
  const hero = adjacentHeroes[0];
  const isOwned = Boolean(gate && player && gate.ownerId === player.id);

  if (!gate) return null;

  const activeTransferStack = transferDialog
    ? (transferDialog.type === "TRANSFER_GATE_GARRISON_TO_HERO" ? gate.garrison : hero?.armies ?? [])
        .find((unit) => unit.unitType === transferDialog.unitType)
    : undefined;
  const activeTransferMax = activeTransferStack?.count ?? 0;
  const activeTransferCount = Math.min(Math.max(1, transferDialog?.count ?? 1), Math.max(1, activeTransferMax));
  const activeTransferLabel = transferDialog?.type === "TRANSFER_GATE_GARRISON_TO_HERO"
    ? hero ? `Vers : ${hero.name}` : "Vers : héros"
    : "Vers : garnison";
  const activeTransferAction = transferDialog?.type === "TRANSFER_GATE_GARRISON_TO_HERO" ? "Reprendre" : "Déposer";

  const openTransferDialog = (
    type: "TRANSFER_GATE_GARRISON_TO_HERO" | "TRANSFER_HERO_TO_GATE_GARRISON",
    unit: UnitStack
  ) => {
    if (!hero || !isOwned || pending) return;
    setTransferDialog({ type, unitType: unit.unitType as UnitType, count: unit.count });
  };

  const transfer = async () => {
    if (!hero || !isOwned || pending || !transferDialog || !activeTransferStack) return;
    const count = Math.min(activeTransferMax, Math.max(1, Math.floor(activeTransferCount)));
    if (!Number.isFinite(count) || count <= 0) return;

    setPending(true);
    const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: transferDialog.type,
        gateId: gate.id,
        heroId: hero.id,
        unitType: activeTransferStack.unitType,
        count,
      }),
    });
    if (!response.ok) {
      onMessage(await getApiErrorMessage(response));
      setPending(false);
      return;
    }

    const state = await refreshGameState(gameState.id, currentUserId, { revealMap });
    if (state) useGameStore.getState().setGameState(state);
    setTransferDialog(null);
    setPending(false);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[min(92vw,42rem)] rounded-xl border border-amber-600 bg-stone-950 p-5 text-amber-100 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-amber-400/80">Porte fortifiée</div>
            <h2 className="mt-1 text-xl font-black text-amber-100">Garnison de passage</h2>
          </div>
          <button type="button" className="rounded-md border border-stone-600 px-3 py-1 text-sm text-stone-200 hover:bg-stone-800" onClick={onClose}>
            Fermer
          </button>
        </div>

        {!isOwned && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            Cette porte ne vous appartient pas.
          </div>
        )}
        {isOwned && !hero && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            Placez un héros allié adjacent à la porte pour modifier la garnison.
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <GateStackList
            title="Dans la porte"
            empty="Aucune unité en garnison."
            stacks={gate.garrison}
            actionLabel="Reprendre"
            disabled={!isOwned || !hero || pending}
            onTransfer={(unit) => openTransferDialog("TRANSFER_GATE_GARRISON_TO_HERO", unit)}
          />
          <GateStackList
            title={hero ? `Avec ${hero.name}` : "Héros adjacent"}
            empty="Aucune unité disponible."
            stacks={hero?.armies ?? []}
            actionLabel="Deposer"
            disabled={!isOwned || !hero || pending}
            onTransfer={(unit) => openTransferDialog("TRANSFER_HERO_TO_GATE_GARRISON", unit)}
          />
        </div>

      </div>
      {transferDialog && activeTransferStack && activeTransferMax > 0 && (
        <form
          className="absolute left-1/2 top-1/2 z-10 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-amber-900/80 bg-black/90 px-3 py-4 text-amber-100 shadow-2xl shadow-black/80"
          onSubmit={(event) => {
            event.preventDefault();
            void transfer();
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3 text-base font-black">
            <span className="text-amber-100">Nombre</span>
            <span className="text-yellow-300">Max {activeTransferMax}</span>
          </div>
          <input
            type="number"
            min={1}
            max={activeTransferMax}
            value={activeTransferCount}
            onChange={(event) => {
              const next = Math.min(
                Math.max(1, Math.floor(Number(event.currentTarget.value) || 1)),
                activeTransferMax
              );
              setTransferDialog({ ...transferDialog, count: next });
            }}
            className="h-12 w-full rounded-lg border border-orange-600/90 bg-black px-3 text-center text-xl font-black tabular-nums text-amber-50 outline-none focus:border-yellow-300 focus:ring-1 focus:ring-yellow-300/70"
            autoFocus
          />
          <div className="mt-3 text-center text-base font-black text-amber-200/80">
            {activeTransferLabel}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className="h-11 rounded-lg border border-orange-600/90 bg-black/70 text-base font-black text-amber-100 transition hover:border-yellow-300 hover:text-yellow-100 disabled:cursor-not-allowed disabled:border-stone-700 disabled:text-stone-500"
              onClick={() => setTransferDialog(null)}
              disabled={pending}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="h-11 rounded-lg border border-orange-500 bg-gradient-to-b from-orange-500 to-orange-800 text-base font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:from-orange-400 hover:to-orange-700 disabled:cursor-not-allowed disabled:border-stone-700 disabled:from-stone-800 disabled:to-stone-900 disabled:text-stone-500"
              disabled={pending}
            >
              {activeTransferAction}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function GateStackList({
  title,
  empty,
  stacks,
  actionLabel,
  disabled,
  onTransfer,
}: {
  title: string;
  empty: string;
  stacks: UnitStack[];
  actionLabel: string;
  disabled: boolean;
  onTransfer: (unit: UnitStack) => void;
}) {
  return (
    <section className="rounded-lg border border-amber-700/40 bg-black/35 p-3">
      <div className="text-[11px] font-black uppercase tracking-wider text-amber-300/80">{title}</div>
      {stacks.length === 0 ? (
        <div className="mt-3 rounded-md border border-amber-800/40 bg-black/30 px-3 py-2 text-xs text-amber-200/60">{empty}</div>
      ) : (
        <div className="mt-3 space-y-2">
          {stacks.map((unit) => (
            <div key={unit.id} className="flex items-center justify-between gap-3 rounded-md border border-stone-700 bg-stone-900/80 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-amber-100">{UNIT_RULES[unit.unitType as UnitType]?.label ?? unit.unitType}</div>
                <div className="text-xs text-amber-200/60">{unit.count} unité(s)</div>
              </div>
              <button
                type="button"
                disabled={disabled}
                className="shrink-0 rounded-md border border-sky-500/50 bg-sky-900 px-3 py-1.5 text-xs font-bold text-sky-50 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-800 disabled:text-stone-500"
                onClick={() => onTransfer(unit)}
              >
                {actionLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function findGateAt(gameState: GameState, gateId: string, position: Position): Gate | undefined {
  const fromState = gameState.gates?.find((gate) =>
    gate.id === gateId || (gate.position.x === position.x && gate.position.y === position.y)
  );
  if (fromState) return fromState;

  const tile = gameState.map.tiles[position.y]?.[position.x];
  const object = tile?.object;
  if (object?.type !== "gate") return undefined;
  return {
    id: object.id,
    ownerId: object.ownerId ?? null,
    position: { x: position.x, y: position.y },
    guardianPower: object.guardianPower ?? 0,
    garrison: [],
  };
}

function areAdjacentOrSame(a: Position, b: Position) {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

function setMapContainerCursor(container: HTMLDivElement | null, cursor: string) {
  if (!container) return;
  container.style.cursor = cursor;
  container.querySelectorAll("canvas").forEach((canvas) => {
    canvas.style.cursor = cursor;
  });
}

function getAdventureMapCursor({
  renderer,
  gameState,
  selectedHeroId,
  selectedTownId,
  currentPlayerId,
  visibleTiles,
  reachableTileKeys,
  activeCombatHeroIds,
  screenX,
  screenY,
}: {
  renderer: MapRenderer;
  gameState: ReturnType<typeof useGameStore.getState>["gameState"];
  selectedHeroId: string | null;
  selectedTownId: string | null;
  currentPlayerId: string | null;
  visibleTiles: Set<string> | null;
  reachableTileKeys: Set<string> | null;
  activeCombatHeroIds: Set<string>;
  screenX: number;
  screenY: number;
}) {
  if (!gameState || !selectedHeroId) return ADVENTURE_CURSORS.default;

  const hero = gameState.players.flatMap((player) => player.heroes).find((item) => item.id === selectedHeroId);
  if (!hero) return ADVENTURE_CURSORS.default;
  if (activeCombatHeroIds.has(hero.id)) return ADVENTURE_CURSORS.forbidden;

  const tile = renderer.getTileAtScreen(screenX, screenY);
  if (!tile) return ADVENTURE_CURSORS.default;

  const targetTile = gameState.map.tiles[tile.y]?.[tile.x];
  if (!targetTile) return ADVENTURE_CURSORS.forbidden;

  const tileKey = `${tile.x},${tile.y}`;
  const isReachableTile = reachableTileKeys?.has(tileKey) ?? false;

  const objects = filterClickThroughTownSpriteHits(
    renderer.getObjectsAtScreen(screenX, screenY),
    tile,
    targetTile,
    selectedHeroId
  );
  const selectedObject = selectObjectOnTile(objects, selectedHeroId, selectedTownId);
  const objectCursor = selectedObject
    ? getAdventureObjectCursor(selectedObject, gameState, currentPlayerId)
    : null;

  if (objectCursor) return objectCursor;

  if (targetTile.object?.type === "gate") {
    const gate = findGateAt(gameState, targetTile.object.id, tile);
    if (gate?.ownerId === currentPlayerId) return ADVENTURE_CURSORS.town;
    return (gate?.garrison ?? []).some((unit) => unit.count > 0) ? ADVENTURE_CURSORS.attack : ADVENTURE_CURSORS.move;
  }

  const tileObjectCursor = getAdventureTileObjectCursor(targetTile.object?.type);
  if (tileObjectCursor) return tileObjectCursor;

  if (isReachableTile) return ADVENTURE_CURSORS.move;
  if (visibleTiles && !visibleTiles.has(tileKey)) return ADVENTURE_CURSORS.forbidden;

  return isTileTraversable(targetTile)
    ? ADVENTURE_CURSORS.move
    : ADVENTURE_CURSORS.forbidden;
}

function getAdventureObjectCursor(
  object: MapObjectData,
  gameState: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>,
  currentPlayerId: string | null
) {
  if (object.type === "combat") return ADVENTURE_CURSORS.attack;
  if (object.type === "boat") return ADVENTURE_CURSORS.move;
  if (object.type === "gate") {
    const gate = findGateAt(gameState, object.id, { x: object.x, y: object.y });
    if (gate?.ownerId === currentPlayerId) return ADVENTURE_CURSORS.town;
    return (gate?.garrison ?? []).some((unit) => unit.count > 0) ? ADVENTURE_CURSORS.attack : ADVENTURE_CURSORS.move;
  }
  if (object.type === "adventure_building") return ADVENTURE_CURSORS.visit;
  if (object.type === "building") return ADVENTURE_CURSORS.visit;
  if (object.type === "town") {
    return object.playerId === currentPlayerId
      ? ADVENTURE_CURSORS.town
      : ADVENTURE_CURSORS.attack;
  }
  if (object.type === "hero" && currentPlayerId && object.playerId !== currentPlayerId) {
    return ADVENTURE_CURSORS.attack;
  }
  if (object.type === "hero") {
    return object.playerId === currentPlayerId ? ADVENTURE_CURSORS.hero : ADVENTURE_CURSORS.trade;
  }

  return null;
}

function getAdventureTileObjectCursor(type: string | undefined) {
  if (type === "monster" || type === "combat" || type === "gate") return ADVENTURE_CURSORS.attack;
  if (type === "resource") return ADVENTURE_CURSORS.visit;
  if (type === "building") return ADVENTURE_CURSORS.visit;
  if (type === "adventure_building") return ADVENTURE_CURSORS.visit;
  if (type === "wall" || type === "town_footprint") return ADVENTURE_CURSORS.forbidden;

  return null;
}

async function getApiErrorMessage(response: Response) {
  try {
    const data = await response.json();
    if (typeof data?.error === "string") return data.error;
  } catch {
    // Fall through to the generic message when the API did not return JSON.
  }

  return "Action impossible pour le moment.";
}

function normalizeRevealedTiles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const x = Number((item as { x?: unknown })?.x);
    const y = Number((item as { y?: unknown })?.y);
    return Number.isInteger(x) && Number.isInteger(y) ? [{ x, y }] : [];
  });
}

function normalizeRevealHints(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const x = Number((item as { x?: unknown })?.x);
    const y = Number((item as { y?: unknown })?.y);
    const kind = String((item as { kind?: unknown })?.kind ?? "");
    const subtype = (item as { subtype?: unknown })?.subtype;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return [];
    if (!["resource", "building", "artifact", "hero", "town"].includes(kind)) return [];
    return [{ x, y, kind: kind as "resource" | "building" | "artifact" | "hero" | "town", subtype: typeof subtype === "string" ? subtype : undefined }];
  });
}

function animateHeroMovement(renderer: MapRenderer | null, heroId: string, path: Position[]) {
  return renderer?.animateHeroMovement(heroId, path) ?? Promise.resolve();
}

function getAcceptedMovePath(data: unknown, fallbackPath: Position[]): Position[] {
  const path = (data as { path?: unknown })?.path;
  if (!Array.isArray(path) || path.length < 1) return fallbackPath;
  return path
    .map((position) => ({
      x: Number((position as Position).x),
      y: Number((position as Position).y),
    }))
    .filter((position) => Number.isFinite(position.x) && Number.isFinite(position.y));
}

function getCollectInteractionAmount(interaction: Extract<MoveInteraction, { type: "COLLECT" }>) {
  if (Number.isFinite(interaction.amount) && Number(interaction.amount) > 0) return Number(interaction.amount);
  if (interaction.resource === "gold") return interaction.gold ?? 500;
  if (interaction.resource === "wood" || interaction.resource === "ore") return 5;
  if (
    interaction.resource === "mercury" ||
    interaction.resource === "crystals" ||
    interaction.resource === "gems" ||
    interaction.resource === "sulfur"
  ) {
    return 3;
  }
  return 1;
}

function getTouchCenter(points: Map<number, Position>): Position | null {
  if (points.size === 0) return null;
  let x = 0;
  let y = 0;
  for (const point of points.values()) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.size, y: y / points.size };
}

function getTouchDistance(points: Map<number, Position>) {
  const [first, second] = Array.from(points.values());
  if (!first || !second) return 0;
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function redrawPendingMove(renderer: MapRenderer, gameState: GameState, pending: PendingMove): PendingMove | null {
  const hero = gameState.players.flatMap((player) => player.heroes).find((item) => item.id === pending.heroId);
  if (!hero) {
    renderer.clearHighlights();
    return null;
  }
  if (getActiveCombatHeroIds(gameState.activeCombats).has(hero.id)) {
    renderer.clearHighlights();
    return null;
  }

  const target = pending.finalDestination ?? pending.destination;
  if (hero.position.x === target.x && hero.position.y === target.y) {
    renderer.clearHighlights();
    return null;
  }

  const fullPath = findPath(gameState.map, hero.position, target, Number.POSITIVE_INFINITY);
  if (fullPath.length <= 1) {
    renderer.clearHighlights();
    return null;
  }

  let usedCost = 0;
  let splitIndex = 0;
  for (let i = 1; i < fullPath.length; i++) {
    const cost = getAdventureStepCost(gameState.map, fullPath[i - 1], fullPath[i]);
    if (usedCost + cost > hero.movement) break;
    usedCost += cost;
    splitIndex = i;
  }

  if (splitIndex === fullPath.length - 1) {
    renderer.highlightPath(fullPath);
    return {
      heroId: pending.heroId,
      destination: target,
      path: fullPath,
    };
  }

  const reachable = fullPath.slice(0, splitIndex + 1);
  const unreachable = fullPath.slice(splitIndex + 1);
  const totalCost = getPathMovementCost(gameState.map, fullPath);
  const remaining = totalCost - usedCost;
  const maxMove = hero.maxMovement > 0 ? hero.maxMovement : 1;
  const additionalTurns = Math.max(1, Math.ceil(remaining / maxMove));
  const turnsLabel = `${additionalTurns + (splitIndex > 0 ? 1 : 0)}`;
  const partialDestination = reachable[reachable.length - 1];

  renderer.highlightPartialPath(reachable, unreachable, turnsLabel);
  return {
    heroId: pending.heroId,
    destination: partialDestination,
    path: reachable,
    finalDestination: target,
  };
}

function selectObjectOnTile(
  objects: MapObjectData[],
  selectedHeroId: string | null,
  selectedTownId: string | null
) {
  if (objects.length === 1) return objects[0];

  const combat = objects.find((obj) => obj.type === "combat");
  if (combat) return combat;

  const gate = objects.find((obj) => obj.type === "gate");
  if (gate) return gate;

  const boat = objects.find((obj) => obj.type === "boat");
  if (boat) return boat;

  const enemyBuilding = objects.find((obj) => obj.type === "building" && !obj.playerId);
  if (enemyBuilding) return enemyBuilding;

  const adventureBuilding = objects.find((obj) => obj.type === "adventure_building");
  if (adventureBuilding) return adventureBuilding;

  const hero = objects.find((obj) => obj.type === "hero");
  const town = objects.find((obj) => obj.type === "town");

  if (selectedTownId && hero) return hero;
  if (selectedHeroId && town) return town;

  return hero ?? town ?? objects[0];
}

function filterClickThroughTownSpriteHits(
  objects: MapObjectData[],
  tile: Position | null,
  targetTile: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>["map"]["tiles"][number][number] | undefined,
  selectedHeroId: string | null
) {
  if (!selectedHeroId || !tile || !targetTile || !isTileTraversable(targetTile)) return objects;

  return objects.filter((object) =>
    (object.type !== "town" && object.type !== "gate") ||
    (object.x === tile.x && object.y === tile.y)
  );
}

function getPathMovementCost(map: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>["map"], path: Position[]) {
  return getAdventurePathCost(map, path);
}

function getCombatApproach(
  map: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>["map"],
  start: Position,
  target: Position,
  movement: number
): { destination: Position; path: Position[]; targetPosition: Position } | null {
  const path = findPathToAdjacent(map, start, target, movement);
  const destination = path[path.length - 1];
  return destination ? { destination, path, targetPosition: target } : null;
}

function getAdjacentPositions(position: Position): Position[] {
  const positions: Position[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      positions.push({ x: position.x + dx, y: position.y + dy });
    }
  }
  return positions;
}

function areTileKeySetsEqual(left: Set<string> | null, right: Set<string>) {
  if (!left) return false;
  if (left.size !== right.size) return false;

  for (const key of right) {
    if (!left.has(key)) return false;
  }

  return true;
}

function buildObjects(
  gameState: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>,
  currentPlayer: { id: string; isAlive?: boolean; exploredTiles: string[]; heroes: { position: Position }[]; towns: { position: Position }[] } | undefined,
  revealMap = false,
  selectedHeroId?: string | null,
  activeMapLevel: MapLevelId = SURFACE_LEVEL,
  activeMap = withActiveMapLayer(gameState.map, activeMapLevel),
): MapObjectData[] {
  const adventureVisits = gameState.adventureVisits;
  const exhaustionCtx = currentPlayer && adventureVisits ? {
    playerId: currentPlayer.id,
    selectedHeroId: selectedHeroId ?? null,
    turnNumber: gameState.turnNumber ?? 1,
    visitedAdventureBuildings: new Set(adventureVisits.visitedAdventureBuildings ?? []),
    playerAdventureVisits: adventureVisits.playerAdventureVisits ?? {},
    heroAdventureVisits: adventureVisits.heroAdventureVisits ?? {},
    weeklyAdventureVisits: adventureVisits.weeklyAdventureVisits ?? {},
    mysticalGardenVisits: adventureVisits.mysticalGardenVisits ?? {},
  } : null;
  const objects: MapObjectData[] = [];
  const exploredSet = new Set(
    (currentPlayer?.exploredTiles ?? [])
      .map(normalizeExploredTileKey)
      .filter((key) => key.startsWith(`${activeMapLevel}:`))
      .map((key) => key.slice(key.indexOf(":") + 1))
  );
  const visiblePositions = new Set<string>();
  const heroCombatIds = new Map<string, string>();
  const embarkedHeroIds = new Set((gameState.boats ?? []).map((boat) => boat.heroId).filter(Boolean));

  for (const combat of gameState.activeCombats ?? []) {
    for (const heroId of getCombatHeroIds(combat)) {
      heroCombatIds.set(heroId, combat.id);
    }
  }

  if (revealMap || currentPlayer?.isAlive === false) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const key = `${x},${y}`;
        exploredSet.add(key);
        visiblePositions.add(key);
      }
    }
  } else if (currentPlayer) {
    for (const center of getPlayerVisionCenters(currentPlayer)) {
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= 5) {
            visiblePositions.add(`${center.x + dx},${center.y + dy}`);
          }
        }
      }
    }
  }

  for (const player of gameState.players) {
    const isCurrentPlayer = player.id === currentPlayer?.id;
    const layerTowns = player.towns.filter((town) => normalizeMapLevel(town.position.level) === activeMapLevel);
    const layerHeroes = player.heroes.filter((hero) => normalizeMapLevel(hero.position.level) === activeMapLevel);
    const townPositions = new Set(layerTowns.map((town) => `${town.position.x},${town.position.y}`));
    const heroesByTown = new Map<string, typeof player.heroes>();
    for (const town of layerTowns) {
      const key = `${town.position.x},${town.position.y}`;
      heroesByTown.set(
        key,
        layerHeroes.filter((hero) => hero.position.x === town.position.x && hero.position.y === town.position.y)
      );
    }

    if (gameState.status !== "PENDING") {
      for (const hero of layerHeroes) {
        const key = `${hero.position.x},${hero.position.y}`;
        if (!isCurrentPlayer && currentPlayer?.isAlive !== false && !visiblePositions.has(key)) continue;
        const townHeroes = heroesByTown.get(key) ?? [];
        const townHeroIndex = townHeroes.findIndex((item) => item.id === hero.id);
        const townHeroOffset = townHeroIndex >= 0
          ? getTownHeroRenderOffset(townHeroIndex, townHeroes.length)
          : null;
        objects.push({
          type: "hero",
          id: hero.id,
          playerId: player.id,
          x: hero.position.x,
          y: hero.position.y,
          faction: player.faction as string,
          color: player.color,
          name: hero.name,
          onWater: embarkedHeroIds.has(hero.id),
          inTown: townPositions.has(key),
          renderOffsetX: townHeroOffset?.x,
          renderOffsetY: townHeroOffset?.y,
        });
      }
    }
    for (const town of layerTowns) {
      const key = `${town.position.x},${town.position.y}`;
      // Show own towns always, enemy towns only if explored
      if (!isCurrentPlayer && currentPlayer?.isAlive !== false && !exploredSet.has(key)) continue;
      objects.push({
        type: "town",
        id: town.id,
        playerId: player.id,
        x: town.position.x,
        y: town.position.y,
        faction: (town.townType ?? town.faction) as string,
        color: player.color,
        name: town.name,
      });
    }
  }

  for (const boat of gameState.boats ?? []) {
    if (boat.heroId) continue;
    if (normalizeMapLevel(boat.position.level) !== activeMapLevel) continue;
    const key = `${boat.position.x},${boat.position.y}`;
    if (currentPlayer?.isAlive !== false && !exploredSet.has(key) && !visiblePositions.has(key)) continue;
    objects.push({
      type: "boat",
      id: boat.id,
      playerId: boat.ownerId,
      x: boat.position.x,
      y: boat.position.y,
      faction: String(boat.faction ?? "castle"),
      color: "#f8fafc",
      name: "Bateau",
      onWater: true,
    });
  }

  const knownTownPositions = new Set(
    gameState.players
      .flatMap((player) => player.towns)
      .map((town) => `${town.position.x},${town.position.y}`)
  );
  const buildingByPosition = new Map<string, ResourceBuilding>();
  const ownerByBuildingId = new Map<string, (typeof gameState.players)[number]>();
  const playerById = new Map(gameState.players.map((player) => [player.id, player]));

  for (const player of gameState.players) {
    for (const building of player.resourceBuildings) {
      if (normalizeMapLevel(building.position.level) !== activeMapLevel) continue;
      buildingByPosition.set(`${building.position.x},${building.position.y}`, building);
      ownerByBuildingId.set(building.id, player);
    }
  }

  if (activeMap?.tiles) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const tile = activeMap.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "town") continue;
        const key = `${x},${y}`;
        if (knownTownPositions.has(key)) continue;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        objects.push({
          type: "town",
          id: tile.object.id,
          playerId: null,
          x,
          y,
          faction: tile.object.subtype ?? "neutral",
          color: "#a8a29e",
          name: tile.object.name ?? "Chateau neutre",
        });
      }
    }
  }

  // Resource buildings from map tiles + ownership data
  if (activeMap?.tiles) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const tile = activeMap.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "building") continue;
        const tileObject = tile.object;
        const key = `${x},${y}`;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        const building = buildingByPosition.get(key);
        const owner = building ? ownerByBuildingId.get(building.id) : undefined;
        const buildingType = building?.type ?? tileObject.subtype;

        objects.push({
          type: "building",
          id: tileObject.id,
          playerId: owner?.id ?? null,
          x,
          y,
          faction: owner?.faction as string ?? "",
          color: owner?.color ?? "",
          name: RESOURCE_BUILDING_LABEL_BY_TYPE.get(buildingType ?? "") ?? buildingType ?? "",
          buildingType: tileObject.subtype,
          guardianPower: tileObject.guardianPower ?? building?.guardianPower ?? 0,
        });
      }
    }
  }

  if (activeMap?.tiles) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const tile = activeMap.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "adventure_building") continue;
        const key = `${x},${y}`;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        const exhaustion = exhaustionCtx ? getAdventureBuildingExhaustion({
          ...exhaustionCtx,
          buildingId: tile.object.id,
          subtype: tile.object.subtype,
        }) : { exhausted: false };
        const baseDescription = getMapObjectHoverDescription(tile.object) ?? undefined;
        const description = exhaustion.exhausted
          ? (baseDescription ? `${baseDescription}\n${exhaustion.reason}` : exhaustion.reason)
          : baseDescription;

        objects.push({
          type: "adventure_building",
          id: tile.object.id,
          playerId: tile.object.ownerId ?? null,
          x,
          y,
          faction: tile.object.ownerId ? (playerById.get(tile.object.ownerId)?.faction as string ?? "") : "",
          color: tile.object.ownerId ? (playerById.get(tile.object.ownerId)?.color ?? "") : "",
          name: isExternalDwellingType(tile.object.subtype)
            ? getExternalDwellingLabel(tile.object.targetId)
            : tile.object.name ?? getAdventureBuildingLabel(tile.object.subtype),
          description,
          buildingType: tile.object.subtype,
          dwellingUnitType: isExternalDwellingType(tile.object.subtype) ? tile.object.targetId : undefined,
          guardianPower: tile.object.guardianPower ?? 0,
          visited: exhaustion.exhausted,
        });
      }
    }
  }

  const gatePositions = new Set<string>();
  for (const gate of gameState.gates ?? []) {
    if (normalizeMapLevel(gate.position.level) !== activeMapLevel) continue;
    const key = `${gate.position.x},${gate.position.y}`;
    if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;
    gatePositions.add(key);
    const owner = gate.ownerId ? playerById.get(gate.ownerId) : undefined;
    objects.push({
      type: "gate",
      id: gate.id,
      playerId: gate.ownerId,
      x: gate.position.x,
      y: gate.position.y,
      faction: owner?.faction as string ?? "",
      color: owner?.color ?? "",
      name: owner ? "Porte controlee" : "Porte neutre",
      guardianPower: gate.guardianPower,
    });
  }

  if (activeMap?.tiles) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const tile = activeMap.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "gate") continue;
        const key = `${x},${y}`;
        if (gatePositions.has(key)) continue;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        objects.push({
          type: "gate",
          id: tile.object.id,
          playerId: tile.object.ownerId ?? null,
          x,
          y,
          faction: "",
          color: "",
          name: tile.object.ownerId ? "Porte controlee" : "Porte neutre",
          guardianPower: tile.object.guardianPower ?? 0,
        });
      }
    }
  }

  for (const combat of gameState.activeCombats ?? []) {
    if (normalizeMapLevel(combat.position.level) !== activeMapLevel) continue;
    const key = `${combat.position.x},${combat.position.y}`;
    if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;
    objects.push({
      type: "combat",
      id: combat.id,
      playerId: combat.attackerPlayerId,
      x: combat.position.x,
      y: combat.position.y,
      faction: "castle",
      color: "#f97316",
      name: "Combat en cours",
    });
  }

  for (const player of gameState.players) {
    const isCurrentPlayer = player.id === currentPlayer?.id;
    for (const hero of player.heroes.filter((item) => normalizeMapLevel(item.position.level) === activeMapLevel)) {
      const combatId = heroCombatIds.get(hero.id);
      if (!combatId) continue;
      const key = `${hero.position.x},${hero.position.y}`;
      if (!isCurrentPlayer && currentPlayer?.isAlive !== false && !visiblePositions.has(key) && !exploredSet.has(key)) continue;
      objects.push({
        type: "combat",
        id: combatId,
        playerId: player.id,
        x: hero.position.x,
        y: hero.position.y,
        faction: player.faction as string,
        color: "#f97316",
        name: "Héros en combat",
      });
    }
  }

  return objects;
}

function getTownHeroRenderOffset(index: number, total: number) {
  const clampedTotal = Math.max(1, total);
  const rowSize = clampedTotal <= 5 ? clampedTotal : Math.ceil(clampedTotal / 2);
  const row = Math.floor(index / rowSize);
  const column = index % rowSize;
  const itemsInRow = row === 0 ? Math.min(rowSize, clampedTotal) : clampedTotal - rowSize;
  const centered = column - (Math.max(1, itemsInRow) - 1) / 2;

  return {
    x: centered * 18,
    y: row * 13,
  };
}
