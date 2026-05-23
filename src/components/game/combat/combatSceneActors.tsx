"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { isCreatureBankType } from "@/lib/game/creature-banks";
import { isExternalDwellingType } from "@/lib/game/external-dwellings";
import type { GameState, MapObject, PersistentCombat, UnitType } from "@/lib/game/types";
import {
  HERO_DIRECTIONS,
  MAP_SPRITES,
  getHeroSpritesheet,
  getTownSpritePath,
  type HeroDirection,
  type HeroSpritesheet,
} from "@/lib/rendering/phaser/assets";
import { ISO_GRID_WIDTH } from "./combatLayout";

type SceneHero = {
  kind: "hero";
  id: string;
  name: string;
  faction: string;
  direction: HeroDirection;
  side: "attacker" | "defender";
};

type SceneTarget = {
  kind: "target";
  id: string;
  name: string;
  spritePath: string;
  variant: "town" | "building" | "adventure_building" | "gate";
};

type SceneActor = SceneHero | SceneTarget;

const HERO_DISPLAY_SIZE = 144;
const TARGET_DISPLAY_SIZE = {
  town: { width: 264, height: 200 },
  building: { width: 156, height: 156 },
  adventure_building: { width: 164, height: 164 },
  gate: { width: 176, height: 192 },
} satisfies Record<SceneTarget["variant"], { width: number; height: number }>;

const ACTOR_BOTTOM_Y = 222;
const ATTACKER_LEFT_X = 78;
const DEFENDER_RIGHT_MARGIN_X = 80;

export function CombatSceneActors({ combat, gameState }: { combat: PersistentCombat; gameState: GameState }) {
  const attacker = resolveCombatHero(combat.attackerHeroId, "attacker", "SE", gameState);
  const rightActor =
    (combat.defenderHeroId ? resolveCombatHero(combat.defenderHeroId, "defender", "SW", gameState) : null) ??
    resolveCombatTarget(combat, gameState);

  return (
    <div className="pointer-events-none absolute inset-0 z-[12]" aria-hidden="true">
      {attacker && <SceneActorView actor={attacker} anchor="left" />}
      {rightActor && <SceneActorView actor={rightActor} anchor="right" />}
    </div>
  );
}

function SceneActorView({ actor, anchor }: { actor: SceneActor; anchor: "left" | "right" }) {
  const size = actor.kind === "hero" ? { width: HERO_DISPLAY_SIZE, height: HERO_DISPLAY_SIZE } : TARGET_DISPLAY_SIZE[actor.variant];
  const x = anchor === "left" ? ATTACKER_LEFT_X : ISO_GRID_WIDTH - DEFENDER_RIGHT_MARGIN_X - size.width;
  const y = ACTOR_BOTTOM_Y - size.height;

  return (
    <span
      className="absolute block drop-shadow-[0_24px_18px_rgba(0,0,0,0.48)]"
      style={{ left: x, top: y, width: size.width, height: size.height }}
      title={actor.name}
    >
      <span className="absolute inset-x-8 bottom-0 h-8 rounded-[50%] bg-black/35 blur-md" />
      {actor.kind === "hero" ? (
        <HeroSceneSprite actor={actor} />
      ) : (
        <Image
          src={actor.spritePath}
          alt=""
          width={size.width}
          height={size.height}
          unoptimized
          className="relative h-full w-full object-contain [image-rendering:pixelated]"
          draggable={false}
        />
      )}
    </span>
  );
}

function HeroSceneSprite({ actor }: { actor: SceneHero }) {
  const sheet = getHeroSpritesheet(actor.faction);
  const style = getHeroFrameStyle(sheet, actor.direction, HERO_DISPLAY_SIZE, HERO_DISPLAY_SIZE);

  return (
    <span className="relative block overflow-hidden [image-rendering:pixelated]" style={{ width: HERO_DISPLAY_SIZE, height: HERO_DISPLAY_SIZE }}>
      <Image
        src={sheet.path}
        alt=""
        width={sheet.frameWidth * sheet.columns}
        height={sheet.frameHeight * HERO_DIRECTIONS.length}
        unoptimized
        className="max-w-none select-none"
        draggable={false}
        style={style}
      />
    </span>
  );
}

function getHeroFrameStyle(
  sheet: HeroSpritesheet,
  direction: HeroDirection,
  displayWidth: number,
  displayHeight: number,
): CSSProperties {
  const directionIndex = Math.max(0, HERO_DIRECTIONS.indexOf(direction));
  const scaleX = displayWidth / sheet.frameWidth;
  const scaleY = displayHeight / sheet.frameHeight;

  return {
    width: sheet.frameWidth * sheet.columns * scaleX,
    height: sheet.frameHeight * HERO_DIRECTIONS.length * scaleY,
    transform: `translate(${-0 * sheet.frameWidth * scaleX}px, ${-directionIndex * sheet.frameHeight * scaleY}px)`,
  };
}

function resolveCombatHero(
  heroId: string | null | undefined,
  side: SceneHero["side"],
  direction: HeroDirection,
  gameState: GameState,
): SceneHero | null {
  if (!heroId) return null;

  for (const player of gameState.players) {
    const hero = player.heroes.find((item) => item.id === heroId);
    if (!hero) continue;
    return {
      kind: "hero",
      id: hero.id,
      name: hero.name,
      faction: player.faction,
      direction,
      side,
    };
  }

  return null;
}

function resolveCombatTarget(combat: PersistentCombat, gameState: GameState): SceneTarget | null {
  const tile = gameState.map.tiles[combat.position.y]?.[combat.position.x];
  const object = tile?.object;
  if (!object) return null;

  if (object.type === "town") {
    return {
      kind: "target",
      id: object.id,
      name: object.name ?? "Chateau neutre",
      spritePath: getTownSpritePath(resolveTownFaction(object, gameState)),
      variant: "town",
    };
  }

  if (object.type === "building" && object.subtype) {
    const spritePath = MAP_SPRITES.buildings[object.subtype];
    if (!spritePath) return null;
    return {
      kind: "target",
      id: object.id,
      name: object.name ?? object.subtype,
      spritePath,
      variant: "building",
    };
  }

  if (object.type === "gate") {
    return {
      kind: "target",
      id: object.id,
      name: object.name ?? "Porte",
      spritePath: MAP_SPRITES.gate,
      variant: "gate",
    };
  }

  if (object.type === "adventure_building" && object.subtype) {
    const spritePath = getAdventureTargetSpritePath(object);
    if (!spritePath) return null;
    return {
      kind: "target",
      id: object.id,
      name: object.name ?? object.subtype,
      spritePath,
      variant: "adventure_building",
    };
  }

  return null;
}

function resolveTownFaction(object: MapObject, gameState: GameState) {
  const town = gameState.players.flatMap((player) => player.towns).find((item) => item.id === object.id);
  return town?.townType ?? town?.faction ?? object.subtype ?? "castle";
}

function getAdventureTargetSpritePath(object: MapObject) {
  if (!object.subtype) return null;
  if (isExternalDwellingType(object.subtype)) {
    return object.targetId
      ? MAP_SPRITES.externalDwellings[object.targetId as UnitType] ?? MAP_SPRITES.adventureBuildings.external_dwelling
      : MAP_SPRITES.adventureBuildings.external_dwelling;
  }
  if (isCreatureBankType(object.subtype)) return MAP_SPRITES.adventureBuildings[object.subtype] ?? null;
  return MAP_SPRITES.adventureBuildings[object.subtype] ?? null;
}
