"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { MapObjectData, MapRenderer } from "@/lib/rendering/mapRenderer";
import { GameState, PersistentCombat, Position, ResourceBuilding } from "@/lib/game/types";
import { getAdventureBuildingLabel } from "@/lib/game/adventure-buildings";
import { RESOURCE_BUILDING_RULES, formatResourceName, formatResourceProduction } from "@/lib/game/economy";
import { useGameStore } from "@/lib/stores/gameStore";
import { findPath, computeReachableTiles, computeVisibleTiles, getPlayerVisionCenters, isTileTraversable } from "@/lib/game/engine";
import { refreshGameState } from "@/lib/game/refresh";

const REACHABLE_TILE_COLOR = 0x2f80ff;
const REACHABLE_TILE_ALPHA = 0.34;

type PendingMove = {
  heroId: string;
  destination: Position;
  path: Position[];
  finalDestination?: Position;
};

type MoveInteraction =
  | { type: "COLLECT"; resource: string; gold?: number; destination?: Position }
  | { type: "ADVENTURE_BUILDING"; buildingType: string; reward?: { gold?: number; resources?: Record<string, number> }; message?: string; destination?: Position }
  | { type: "TELEPORT"; buildingType: "stargate"; from: Position; to: Position; message?: string; destination?: Position }
  | { type: "COMBAT"; targetId: string; targetType: "hero" | "monster" | "building" | "town"; destination?: Position }
  | { type: "CAPTURE_BUILDING"; buildingType?: string; destination?: Position }
  | { type: "CAPTURE_TOWN"; destination?: Position }
  | { type: "STOP"; message: string; destination?: Position };

async function createMapRenderer(): Promise<MapRenderer> {
  const { PhaserMapRenderer } = await import("@/lib/rendering/phaser/PhaserMapRenderer");
  return new PhaserMapRenderer();
}

function getAllTileKeys(width: number, height: number) {
  const allTiles = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allTiles.add(`${x},${y}`);
    }
  }
  return allTiles;
}

export default function GameMapComponent() {
  const { data: session } = useSession();
  const [rendererReadyVersion, setRendererReadyVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const didInitialCenter = useRef(false);
  const didAutoSelectActiveHero = useRef(false);
  const autoSelectGameIdRef = useRef<string | null>(null);
  const renderedMapKeyRef = useRef<string | null>(null);
  const lastCenteredHeroIdRef = useRef<string | null>(null);
  const pendingMoveRef = useRef<PendingMove | null>(null);
  const pendingAttackRef = useRef<{
    heroId: string;
    targetId: string;
    destination: Position;
    path: Position[];
  } | null>(null);
  const isSyncingMoveRef = useRef(false);
  const isDragging = useRef(false);
  const lastMouse = useRef<Position>({ x: 0, y: 0 });
  const { gameState, selectedHeroId, selectedTownId, selectHero, selectTown, setCombatMessage, setPendingCombat, setPendingJoinCombat, setActiveCombat, activeCombat, cameraTarget, zoomRequest, devRevealMap } = useGameStore();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let activeRenderer: MapRenderer | null = null;

    const initPromise = createMapRenderer().then(async (renderer) => {
      activeRenderer = renderer;
      if (cancelled) {
        renderer.destroy();
        return;
      }

      rendererRef.current = renderer;

      await renderer.init(container);

      if (cancelled) {
        rendererRef.current?.destroy();
        return;
      }

      setRendererReadyVersion((version) => version + 1);
    });
    initPromiseRef.current = initPromise;

    return () => {
      cancelled = true;
      initPromiseRef.current = null;
      rendererRef.current = null;
      if (activeRenderer?.isReady()) activeRenderer.destroy();
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !gameState?.map) return;

    const currentPlayer = gameState.players.find(
      (player) => player.userId === session?.user?.id
    );

    initPromiseRef.current?.then(() => {
      if (rendererRef.current !== renderer || !renderer.isReady()) return;
      
      const mapKey = getMapRenderKey(gameState.map);
      if (renderedMapKeyRef.current !== mapKey) {
        renderer.renderMap(gameState.map);
        renderedMapKeyRef.current = mapKey;
      }
      renderer.setObjects(buildObjects(gameState, currentPlayer, devRevealMap));

      // Fog of war
      if (activeCombat || devRevealMap) {
        const allTiles = getAllTileKeys(gameState.map.width, gameState.map.height);
        renderer.setFog(allTiles, allTiles);
      } else if (currentPlayer) {
        const visibleTiles = computeVisibleTiles(gameState.map, getPlayerVisionCenters(currentPlayer), 5);
        const exploredSet = new Set<string>(currentPlayer.exploredTiles);
        for (const key of visibleTiles) {
          exploredSet.add(key);
        }
        renderer.setFog(visibleTiles, exploredSet);
      } else {
        // No current player (spectator?) - no fog
        const allTiles = getAllTileKeys(gameState.map.width, gameState.map.height);
        renderer.setFog(allTiles, allTiles);
      }

      if (!didInitialCenter.current) {
        const firstTown = currentPlayer?.towns[0];
        const firstHero = currentPlayer?.heroes[0];
        const centerTarget = gameState.status === "PENDING" ? firstTown : firstHero;
        if (centerTarget) {
          renderer.centerOnTile(centerTarget.position.x, centerTarget.position.y);
          if (gameState.status !== "PENDING" && firstHero) {
            useGameStore.getState().selectHero(firstHero.id);
          }
        }
        didInitialCenter.current = true;
      }
    });
  }, [gameState, session?.user?.id, activeCombat, rendererReadyVersion, devRevealMap]);

  useEffect(() => {
    if (!rendererRef.current?.isReady() || !gameState) return;
    if (devRevealMap) {
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

    const reachableTiles = Array.from(computeReachableTiles(gameState.map, hero.position, hero.movement))
      .map((key) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y };
      });
    rendererRef.current.highlightTiles(reachableTiles, REACHABLE_TILE_COLOR, REACHABLE_TILE_ALPHA);

    if (lastCenteredHeroIdRef.current !== selectedHeroId) {
      rendererRef.current.centerOnTile(hero.position.x, hero.position.y);
      lastCenteredHeroIdRef.current = selectedHeroId;
    }
  }, [selectedHeroId, gameState, rendererReadyVersion, devRevealMap]);

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
    renderer.zoomCamera(zoomRequest.direction);
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
    if (!gameState || gameState.status !== "ACTIVE") {
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
    const firstHero = currentPlayer?.heroes[0];
    if (!firstHero) return;

    didAutoSelectActiveHero.current = true;
    selectHero(firstHero.id);
    rendererRef.current?.centerOnTile(firstHero.position.x, firstHero.position.y);
  }, [gameState, selectedHeroId, selectedTownId, selectHero, session?.user?.id, rendererReadyVersion]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2 || e.button === 1) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current || !rendererRef.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      rendererRef.current.panCamera(dx, dy);
      lastMouse.current = { x: e.clientX, y: e.clientY };
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
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
      });
      return true;
    }

    pendingMoveRef.current = null;
    pendingAttackRef.current = null;
    rendererRef.current?.clearHighlights();

    if (interaction.type === "COLLECT") {
      const msg = interaction.resource === "gold"
        ? `+${interaction.gold ?? 500} Or trouve !`
        : `+${interaction.resource === "wood" || interaction.resource === "ore" ? 2 : 1} ${formatResourceName(interaction.resource)} collecte(e) !`;
      setCombatMessage(msg);
      return true;
    }

    if (interaction.type === "CAPTURE_BUILDING") {
      setCombatMessage(`Batiment capture : ${RESOURCE_BUILDING_RULES.find((rule) => rule.type === interaction.buildingType)?.label ?? "Batiment"}.`);
      return true;
    }

    if (interaction.type === "CAPTURE_TOWN") {
      setCombatMessage("Chateau capture.");
      return true;
    }

    if (interaction.type === "ADVENTURE_BUILDING") {
      if (interaction.reward) {
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
      rendererRef.current?.centerOnTile(interaction.to.x, interaction.to.y);
      return true;
    }

    setCombatMessage(interaction.message);
    return true;
  }, [setCombatMessage, setPendingCombat]);

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

  const handleClick = useCallback((e: React.MouseEvent) => {
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

    const objects = rendererRef.current.getObjectsAtScreen(screenX, screenY);
    const tile = rendererRef.current.getTileAtScreen(screenX, screenY);

    if (isSyncingMoveRef.current) {
      return;
    }

    const handleOutOfRange = (heroSrc: { id: string; position: Position; movement: number; maxMovement: number }, destination: Position): "handled" | "inaccessible" => {
      const renderer = rendererRef.current;
      if (!renderer || !gameState) return "inaccessible";
      if (destination.x === heroSrc.position.x && destination.y === heroSrc.position.y) {
        return "inaccessible";
      }

      let fullPath = findPath(gameState.map, heroSrc.position, destination, Number.POSITIVE_INFINITY);
      if (fullPath.length <= 1) {
        // Destination impassable / disconnected: try adjacent tiles
        const candidates = [
          { x: destination.x + 1, y: destination.y },
          { x: destination.x - 1, y: destination.y },
          { x: destination.x, y: destination.y + 1 },
          { x: destination.x, y: destination.y - 1 },
        ];
        let best: Position[] = [];
        for (const c of candidates) {
          if (c.x < 0 || c.x >= gameState.map.width || c.y < 0 || c.y >= gameState.map.height) continue;
          if (!isTileTraversable(gameState.map.tiles[c.y][c.x])) continue;
          const p = findPath(gameState.map, heroSrc.position, c, Number.POSITIVE_INFINITY);
          if (p.length > 1 && (best.length === 0 || getPathMovementCost(gameState.map, p) < getPathMovementCost(gameState.map, best))) {
            best = p;
          }
        }
        if (best.length <= 1) return "inaccessible";
        fullPath = best;
      }

      let usedCost = 0;
      let splitIndex = 0;
      for (let i = 1; i < fullPath.length; i++) {
        const t = gameState.map.tiles[fullPath[i].y]?.[fullPath[i].x];
        const c = t?.movementCost ?? 1;
        if (usedCost + c > heroSrc.movement) break;
        usedCost += c;
        splitIndex = i;
      }

      const reachable = fullPath.slice(0, splitIndex + 1);
      const unreachable = fullPath.slice(splitIndex + 1);
      const totalCost = getPathMovementCost(gameState.map, fullPath);
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
          await animateHeroMovement(rendererRef.current, heroSrc.id, movePath);
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

      if (objects.length > 0) {
      const selectedObject = selectObjectOnTile(
        objects,
        selectedHeroId,
        selectedTownId
      );

      if (!selectedObject) return;

      const obj = selectedObject;
      if (obj.type === "town" && selectedHeroId && e.detail >= 2) {
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current.clearHighlights();
        selectTown(obj.id);
        return;
      }

      if (obj.type === "combat") {
        const combat = gameState.activeCombats?.find((item) => item.id === obj.id);
        if (!combat) return;
        if (selectedHeroId && myPlayer) {
          const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
          if (!hero) return;
          const destination = { x: obj.x, y: obj.y };
          const path = findPath(gameState.map, hero.position, destination, hero.movement);
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
        setActiveCombat(combat);
        return;
      }
      const isEnemyHero =
        obj.type === "hero" && myPlayer && obj.playerId !== myPlayer.id;
      const isEnemyTown =
        obj.type === "town" && myPlayer && obj.playerId !== myPlayer.id;

      if (isEnemyHero && selectedHeroId) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;

        const destination = { x: obj.x, y: obj.y };
        const path = findPath(gameState.map, hero.position, destination, hero.movement);
        if (path.length <= 1) {
          if (handleOutOfRange(hero, destination) === "inaccessible") {
            rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
          }
          return;
        }

        const pendingAttack = pendingAttackRef.current;
        const isConfirmingAttack =
          pendingAttack?.heroId === selectedHeroId &&
          pendingAttack.targetId === obj.id;

        if (!isConfirmingAttack) {
          pendingMoveRef.current = null;
          pendingAttackRef.current = {
            heroId: selectedHeroId,
            targetId: obj.id,
            destination,
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
        setPendingCombat({ attackerHeroId: selectedHeroId, targetId: obj.id, targetType: "hero", destination, path });
        return;
      }

      if (isEnemyTown && selectedHeroId) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;

        const destination = { x: obj.x, y: obj.y };
        const path = findPath(gameState.map, hero.position, destination, hero.movement);
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
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const message = await getApiErrorMessage(response);
              const normalizedMessage = message
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
              if (normalizedMessage.includes("garde")) {
                pendingAttackRef.current = null;
                rendererRef.current?.clearHighlights();
                setPendingCombat({ attackerHeroId: selectedHeroId, targetId: obj.id, targetType: "town", destination, path });
              } else {
                setCombatMessage(message);
              }
              return null;
            }
            return response.json();
          })
          .then((data) => {
            if (!data) return;
            pendingAttackRef.current = null;
            rendererRef.current?.clearHighlights();

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

        const destination = { x: obj.x, y: obj.y };
        if (destination.x === hero.position.x && destination.y === hero.position.y) {
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          setCombatMessage("Ce héros est déjà dans ce château.");
          return;
        }

        const path = findPath(gameState.map, hero.position, destination, hero.movement);
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
            await animateHeroMovement(rendererRef.current, selectedHeroId, path);
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

        const destination = { x: obj.x, y: obj.y };
        const path = findPath(gameState.map, hero.position, destination, hero.movement);
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

        const guardianPower = gameState.map.tiles[destination.y]?.[destination.x]?.object?.guardianPower ?? 0;
        if (guardianPower > 0) {
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current.highlightPath(path);
          rendererRef.current.highlightTile(destination.x, destination.y, 0xff6600);
          setPendingCombat({ attackerHeroId: selectedHeroId, targetId: obj.id, targetType: "building", destination, path });
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
          body: JSON.stringify({ type: "CAPTURE_BUILDING", heroId: selectedHeroId, buildingId: obj.id }),
        })
          .then(async (r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return;
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
        const destination = { x: obj.x, y: obj.y };
        const path = findPath(gameState.map, hero.position, destination, hero.movement);
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
          setCombatMessage(`Cliquez a nouveau pour visiter : ${obj.name || getAdventureBuildingLabel(obj.buildingType)}`);
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
            await animateHeroMovement(rendererRef.current, selectedHeroId, path);
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

      if (obj.type === "hero") {
        pendingMoveRef.current = null;
        pendingAttackRef.current = null;
        rendererRef.current?.clearHighlights();
        selectHero(obj.id);
      } else if (obj.type === "town") {
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

      const targetTile = gameState.map.tiles[tile.y]?.[tile.x];
      if (!isTileTraversable(targetTile)) {
        rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
        setCombatMessage(targetTile?.object?.type === "wall" ? "Passage bloque par un mur." : "Terrain infranchissable.");
        setTimeout(() => rendererRef.current?.clearHighlights(), 650);
        return;
      }

      const path = findPath(gameState.map, hero.position, tile, hero.movement);
      if (path.length > 1) {
        if (targetTile?.object?.type === "monster") {
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current.highlightPath(path);
          rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
          if (!canAct) {
            setCombatMessage(blockedTurnMessage);
            return;
          }
          setPendingCombat({ attackerHeroId: selectedHeroId, targetId: targetTile.object.id, targetType: "monster", destination: tile, path });
          return;
        }

        if (targetTile?.object?.type === "building") {
          const isMyBuilding = myPlayer?.resourceBuildings.some((b) => b.id === targetTile.object!.id);
          if (!isMyBuilding) {
            if (!canAct) {
              setCombatMessage(blockedTurnMessage);
              return;
            }

            const guardianPower = targetTile.object?.guardianPower ?? 0;
            if (guardianPower > 0) {
              pendingMoveRef.current = null;
              pendingAttackRef.current = null;
              rendererRef.current.highlightPath(path);
              rendererRef.current.highlightTile(tile.x, tile.y, 0xff6600);
              setPendingCombat({ attackerHeroId: selectedHeroId, targetId: targetTile.object.id, targetType: "building", destination: tile, path });
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
              body: JSON.stringify({ type: "CAPTURE_BUILDING", heroId: selectedHeroId, buildingId: targetTile.object.id }),
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
              .then((data) => {
                if (!data) return;
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
            await animateHeroMovement(rendererRef.current, selectedHeroId, path);
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
  }, [gameState, selectedHeroId, selectedTownId, selectHero, selectTown, setCombatMessage, setPendingCombat, setPendingJoinCombat, setActiveCombat, handleMoveInteraction, session?.user?.id, devRevealMap]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
    </div>
  );
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

function animateHeroMovement(renderer: MapRenderer | null, heroId: string, path: Position[]) {
  return renderer?.animateHeroMovement(heroId, path) ?? Promise.resolve();
}

function redrawPendingMove(renderer: MapRenderer, gameState: GameState, pending: PendingMove): PendingMove | null {
  const hero = gameState.players.flatMap((player) => player.heroes).find((item) => item.id === pending.heroId);
  if (!hero) {
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
    const tile = gameState.map.tiles[fullPath[i].y]?.[fullPath[i].x];
    const cost = tile?.movementCost ?? 1;
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

function getPathMovementCost(map: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>["map"], path: Position[]) {
  return path.slice(1).reduce((total, position) => {
    const tile = map.tiles[position.y]?.[position.x];
    return total + (tile?.movementCost ?? 1);
  }, 0);
}

function getMapRenderKey(map: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>["map"]) {
  const parts = [`${map.width}x${map.height}`];

  for (const row of map.tiles) {
    for (const tile of row) {
      parts.push(`${tile.terrain}:${tile.elevation}:${tile.object?.id ?? ""}:${tile.object?.subtype ?? ""}`);
    }
  }

  return parts.join("|");
}

function buildObjects(
  gameState: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>,
  currentPlayer: { id: string; exploredTiles: string[]; heroes: { position: { x: number; y: number } }[]; towns: { position: { x: number; y: number } }[] } | undefined,
  revealMap = false
): MapObjectData[] {
  const objects: MapObjectData[] = [];
  const exploredSet = new Set(currentPlayer?.exploredTiles ?? []);
  const visiblePositions = new Set<string>();
  const heroCombatIds = new Map<string, string>();

  for (const combat of gameState.activeCombats ?? []) {
    for (const heroId of getCombatHeroIds(combat)) {
      heroCombatIds.set(heroId, combat.id);
    }
  }

  if (revealMap) {
    for (let y = 0; y < gameState.map.height; y++) {
      for (let x = 0; x < gameState.map.width; x++) {
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
    const townPositions = new Set(player.towns.map((town) => `${town.position.x},${town.position.y}`));

    if (gameState.status !== "PENDING") {
      for (const hero of player.heroes) {
        const key = `${hero.position.x},${hero.position.y}`;
        if (!isCurrentPlayer && !visiblePositions.has(key)) continue;
        objects.push({
          type: "hero",
          id: hero.id,
          playerId: player.id,
          x: hero.position.x,
          y: hero.position.y,
          faction: player.faction as string,
          color: player.color,
          name: hero.name,
          onWater: gameState.map.tiles[hero.position.y]?.[hero.position.x]?.terrain === "water",
          inTown: townPositions.has(key),
        });
      }
    }
    for (const town of player.towns) {
      const key = `${town.position.x},${town.position.y}`;
      // Show own towns always, enemy towns only if explored
      if (!isCurrentPlayer && !exploredSet.has(key)) continue;
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

  const knownTownPositions = new Set(
    gameState.players
      .flatMap((player) => player.towns)
      .map((town) => `${town.position.x},${town.position.y}`)
  );

  if (gameState.map?.tiles) {
    for (let y = 0; y < gameState.map.height; y++) {
      for (let x = 0; x < gameState.map.width; x++) {
        const tile = gameState.map.tiles[y]?.[x];
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
  const allBuildings: ResourceBuilding[] = gameState.players.flatMap((p) => p.resourceBuildings);
  if (gameState.map?.tiles) {
    for (let y = 0; y < gameState.map.height; y++) {
      for (let x = 0; x < gameState.map.width; x++) {
        const tile = gameState.map.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "building") continue;
        const tileObject = tile.object;
        const key = `${x},${y}`;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        const building = allBuildings.find((b) => b.position.x === x && b.position.y === y);
        const owner = building?.ownerId
          ? gameState.players.find((p) => p.id === building.ownerId || p.resourceBuildings.some((rb) => rb.id === building.id))
          : undefined;

        objects.push({
          type: "building",
          id: tileObject.id,
          playerId: owner?.id ?? null,
          x,
          y,
          faction: owner?.faction as string ?? "",
          color: owner?.color ?? "",
          name: RESOURCE_BUILDING_RULES.find((r) => r.type === (building?.type ?? tileObject.subtype))?.label ?? building?.type ?? tileObject.subtype ?? "",
          buildingType: tileObject.subtype,
          guardianPower: tileObject.guardianPower ?? building?.guardianPower ?? 0,
        });
      }
    }
  }

  if (gameState.map?.tiles) {
    for (let y = 0; y < gameState.map.height; y++) {
      for (let x = 0; x < gameState.map.width; x++) {
        const tile = gameState.map.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "adventure_building") continue;
        const key = `${x},${y}`;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        objects.push({
          type: "adventure_building",
          id: tile.object.id,
          playerId: null,
          x,
          y,
          faction: "",
          color: "",
          name: tile.object.name ?? getAdventureBuildingLabel(tile.object.subtype),
          buildingType: tile.object.subtype,
        });
      }
    }
  }

  for (const combat of gameState.activeCombats ?? []) {
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
    for (const hero of player.heroes) {
      const combatId = heroCombatIds.get(hero.id);
      if (!combatId) continue;
      const key = `${hero.position.x},${hero.position.y}`;
      if (!isCurrentPlayer && !visiblePositions.has(key) && !exploredSet.has(key)) continue;
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

function getCombatHeroIds(combat: PersistentCombat) {
  const heroIds = new Set<string>();
  heroIds.add(combat.attackerHeroId);
  if (combat.defenderHeroId) heroIds.add(combat.defenderHeroId);
  for (const participant of combat.participants ?? []) {
    heroIds.add(participant.heroId);
  }

  return heroIds;
}
