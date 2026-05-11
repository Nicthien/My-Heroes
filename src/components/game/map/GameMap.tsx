"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { IsometricRenderer, MapObjectData } from "@/lib/rendering/isometric/renderer";
import { PersistentCombat, Position, ResourceBuilding } from "@/lib/game/types";
import { RESOURCE_BUILDING_RULES } from "@/lib/game/economy";
import { useGameStore } from "@/lib/stores/gameStore";
import { findPath, computeVisibleTiles, getPlayerVisionCenters } from "@/lib/game/engine";
import { refreshGameState } from "@/lib/game/refresh";

export default function GameMapComponent() {
  const { data: session } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<IsometricRenderer | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const didInitialCenter = useRef(false);
  const renderedMapKeyRef = useRef<string | null>(null);
  const lastCenteredHeroIdRef = useRef<string | null>(null);
  const pendingMoveRef = useRef<{
    heroId: string;
    destination: Position;
    path: Position[];
  } | null>(null);
  const pendingAttackRef = useRef<{
    heroId: string;
    targetId: string;
    destination: Position;
    path: Position[];
  } | null>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef<Position>({ x: 0, y: 0 });
  const { gameState, selectedHeroId, selectedTownId, selectHero, selectTown, setCombatMessage, setPendingCombat, setPendingJoinCombat, setActiveCombat, activeCombat } = useGameStore();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const renderer = new IsometricRenderer();
    rendererRef.current = renderer;

    const initPromise = renderer.init(container).then(() => {
      if (cancelled) {
        renderer.destroy();
      }
    });
    initPromiseRef.current = initPromise;

    return () => {
      cancelled = true;
      initPromiseRef.current = null;
      rendererRef.current = null;
      if (renderer.isReady()) renderer.destroy();
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
      renderer.setObjects(buildObjects(gameState, currentPlayer));

      // Fog of war
      if (activeCombat) {
        const allTiles = new Set<string>();
        for (let y = 0; y < gameState.map.height; y++) {
          for (let x = 0; x < gameState.map.width; x++) {
            allTiles.add(`${x},${y}`);
          }
        }
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
        const allTiles = new Set<string>();
        for (let y = 0; y < gameState.map.height; y++) {
          for (let x = 0; x < gameState.map.width; x++) {
            allTiles.add(`${x},${y}`);
          }
        }
        renderer.setFog(allTiles, allTiles);
      }

      if (!didInitialCenter.current) {
        const firstHero = currentPlayer?.heroes[0];
        if (firstHero) {
          renderer.centerOnTile(firstHero.position.x, firstHero.position.y);
          useGameStore.getState().selectHero(firstHero.id);
        }
        didInitialCenter.current = true;
      }
    });
  }, [gameState, session?.user?.id, activeCombat]);

  useEffect(() => {
    if (!rendererRef.current?.isReady() || !gameState || !selectedHeroId) return;
    if (lastCenteredHeroIdRef.current === selectedHeroId) return;

    const hero = gameState.players.flatMap((p) => p.heroes).find((h) => h.id === selectedHeroId);
    if (hero) {
      rendererRef.current.centerOnTile(hero.position.x, hero.position.y);
      lastCenteredHeroIdRef.current = selectedHeroId;
    }
  }, [selectedHeroId, gameState]);

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

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!rendererRef.current || !gameState) return;
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

    const objects = rendererRef.current.getObjectsAtScreen(screenX, screenY);
    const tile = rendererRef.current.getTileAtScreen(screenX, screenY);

      if (objects.length > 0) {
      const selectedObject = selectObjectOnTile(
        objects,
        selectedHeroId,
        selectedTownId
      );

      if (!selectedObject) return;

      const obj = selectedObject;
      if (obj.type === "combat") {
        const combat = gameState.activeCombats?.find((item) => item.id === obj.id);
        if (!combat) return;
        if (selectedHeroId && myPlayer) {
          const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
          if (!hero) return;
          const destination = { x: obj.x, y: obj.y };
          const path = findPath(gameState.map, hero.position, destination, hero.movement);
          if (path.length <= 1) {
            rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
            setTimeout(() => rendererRef.current?.clearHighlights(), 500);
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
            setCombatMessage("Vous avez déjà terminé votre tour.");
            pendingAttackRef.current = null;
            rendererRef.current.clearHighlights();
            return;
          }
          const existingParticipant = combat.participants?.find((participant) => participant.playerId === myPlayer.id);
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          setPendingJoinCombat({ combatId: combat.id, heroId: selectedHeroId, side: existingParticipant?.side });
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
          rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
          setTimeout(() => rendererRef.current?.clearHighlights(), 500);
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
          setCombatMessage("Vous avez déjà terminé votre tour.");
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        pendingAttackRef.current = null;
        rendererRef.current.clearHighlights();
        setPendingCombat({ attackerHeroId: selectedHeroId, targetId: obj.id, targetType: "hero" });
        return;
      }

      if (isEnemyTown && selectedHeroId) {
        const hero = myPlayer.heroes.find((item) => item.id === selectedHeroId);
        if (!hero) return;

        const destination = { x: obj.x, y: obj.y };
        const path = findPath(gameState.map, hero.position, destination, hero.movement);
        if (path.length <= 1) {
          rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
          setTimeout(() => rendererRef.current?.clearHighlights(), 500);
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
          setCombatMessage("Vous avez déjà terminé votre tour.");
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        fetch(`/api/games/${gameState.id}/action`, {
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
              setCombatMessage(await getApiErrorMessage(response));
              return null;
            }
            return response.json();
          })
          .then((data) => {
            if (!data) return;
            pendingAttackRef.current = null;
            rendererRef.current?.clearHighlights();

            refreshGameState(gameState.id, session?.user?.id).then((state) => {
              if (state) useGameStore.getState().setGameState(state);
            });

            useGameStore.getState().setCombatMessage("Château capturé.");
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
          rendererRef.current.highlightTile(destination.x, destination.y, 0xff0000);
          setTimeout(() => rendererRef.current?.clearHighlights(), 500);
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
          rendererRef.current.highlightTile(destination.x, destination.y, 0x00ff00);
          const buildingRule = RESOURCE_BUILDING_RULES.find((r) => r.type === obj.buildingType);
          const label = buildingRule ? buildingRule.label : obj.name || "Bâtiment";
          if (!obj.playerId) {
            setCombatMessage(`Cliquez à nouveau pour capturer : ${label}`);
          } else {
            setCombatMessage(`Cliquez à nouveau pour capturer : ${label} (ennemi)`);
          }
          return;
        }

        if (!canAct) {
          setCombatMessage("Vous avez déjà terminé votre tour.");
          pendingAttackRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        pendingAttackRef.current = null;
        rendererRef.current.clearHighlights();

        fetch(`/api/games/${gameState.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "CAPTURE_BUILDING",
            heroId: selectedHeroId,
            buildingId: obj.id,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              if (data.interaction?.resource === "defeat") {
                setCombatMessage("Défaite... Les gardiens ont vaincu votre héros.");
              } else {
                setCombatMessage(data.error || "Capture impossible.");
              }
              return null;
            }
            return response.json();
          })
          .then((data) => {
            if (!data) return;
            refreshGameState(gameState.id, session?.user?.id).then((state) => {
              if (state) useGameStore.getState().setGameState(state);
            });
            if (data.interaction?.type === "CAPTURE_BUILDING") {
              setCombatMessage(`Bâtiment capturé ! (${data.interaction.production || ""})`);
            } else {
              setCombatMessage("Bâtiment capturé.");
            }
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
        setCombatMessage(`${label}${ownerStr} — Production hebdomadaire: ${buildingRule ? Object.entries(buildingRule.production).map(([k, v]) => `+${v} ${k}`).join(", ") : "aucune"}`);
      }
      return;
    }

    if (tile && selectedHeroId) {
      const hero = gameState.players
        .flatMap((p) => p.heroes)
        .find((h) => h.id === selectedHeroId);
      if (!hero) return;

      const path = findPath(gameState.map, hero.position, tile, hero.movement);
      if (path.length > 1) {
        const targetTile = gameState.map.tiles[tile.y]?.[tile.x];
        if (targetTile?.object?.type === "monster") {
          pendingMoveRef.current = null;
          pendingAttackRef.current = null;
          rendererRef.current.highlightPath(path);
          rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
          if (!canAct) {
            setCombatMessage("Vous avez déjà terminé votre tour.");
            return;
          }
          setPendingCombat({ attackerHeroId: selectedHeroId, targetId: targetTile.object.id, targetType: "monster" });
          return;
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
          setCombatMessage("Vous avez déjà terminé votre tour.");
          pendingMoveRef.current = null;
          rendererRef.current.clearHighlights();
          return;
        }

        rendererRef.current.highlightPath(path);
        fetch(`/api/games/${gameState.id}/action`, {
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
              setCombatMessage(await getApiErrorMessage(res));
              return null;
            }
            return res.json();
          })
          .then((data) => {
            if (!data) return;
            pendingMoveRef.current = null;
            rendererRef.current?.clearHighlights();

            // Recharger immédiatement le serveur pour avoir la vraie carte
            refreshGameState(gameState.id, session?.user?.id).then((state) => {
              if (state) useGameStore.getState().setGameState(state);
            });

            if (data.interaction?.type === "COLLECT") {
              const r = data.interaction.resource;
              const msg = r === "gold"
                ? `+${data.interaction.gold} Or trouvé !`
                : `+${r === "wood" || r === "ore" ? 2 : 1} ${r} collecté(e) !`;
              useGameStore.getState().setCombatMessage(msg);
            } else if (data.interaction?.type === "FIGHT") {
              if (data.interaction.resource === "victory") {
                useGameStore.getState().setCombatMessage(`Victoire ! Monstre vaincu (+${data.interaction.gold} XP).`);
              } else {
                useGameStore.getState().setCombatMessage("Défaite... Votre héros a péri contre le monstre.");
              }
            }
          });
      } else {
        rendererRef.current.highlightTile(tile.x, tile.y, 0xff0000);
        setTimeout(() => rendererRef.current?.clearHighlights(), 500);
      }
    }
  }, [gameState, selectedHeroId, selectedTownId, selectHero, selectTown, setCombatMessage, setPendingCombat, setPendingJoinCombat, setActiveCombat, session?.user?.id]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
    />
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

  const hero = objects.find((obj) => obj.type === "hero");
  const town = objects.find((obj) => obj.type === "town");

  if (selectedTownId && hero) return hero;
  if (selectedHeroId && town) return town;

  return hero ?? town ?? objects[0];
}

function getMapRenderKey(map: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>["map"]) {
  const parts = [`${map.width}x${map.height}`];

  for (const row of map.tiles) {
    for (const tile of row) {
      parts.push(`${tile.terrain}:${tile.elevation}:${tile.object?.id ?? ""}`);
    }
  }

  return parts.join("|");
}

function buildObjects(gameState: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>, currentPlayer: { id: string; exploredTiles: string[]; heroes: { position: { x: number; y: number } }[]; towns: { position: { x: number; y: number } }[] } | undefined): MapObjectData[] {
  const objects: MapObjectData[] = [];
  const exploredSet = new Set(currentPlayer?.exploredTiles ?? []);
  const visiblePositions = new Set<string>();
  const heroCombatIds = new Map<string, string>();

  for (const combat of gameState.activeCombats ?? []) {
    for (const heroId of getCombatHeroIds(combat)) {
      heroCombatIds.set(heroId, combat.id);
    }
  }

  if (currentPlayer) {
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
      });
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
        faction: town.faction as string,
        color: player.color,
        name: town.name,
      });
    }
  }

  // Resource buildings from map tiles + ownership data
  const allBuildings: ResourceBuilding[] = gameState.players.flatMap((p) => p.resourceBuildings);
  if (gameState.map?.tiles) {
    for (let y = 0; y < gameState.map.height; y++) {
      for (let x = 0; x < gameState.map.width; x++) {
        const tile = gameState.map.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "building") continue;
        const key = `${x},${y}`;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        const building = allBuildings.find((b) => b.position.x === x && b.position.y === y);
        const owner = building?.ownerId
          ? gameState.players.find((p) => p.id === building.ownerId || p.resourceBuildings.some((rb) => rb.id === building.id))
          : undefined;

        objects.push({
          type: "building",
          id: tile.object.id,
          playerId: owner?.id ?? null,
          x,
          y,
          faction: owner?.faction as string ?? "",
          color: owner?.color ?? "",
          name: building?.type ?? tile.object.subtype ?? "",
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
