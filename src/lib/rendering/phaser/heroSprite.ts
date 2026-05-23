import Phaser from "phaser";
import type { Position } from "@/lib/game/types";
import type {
  DirectionalSpriteState,
  DirectionalSpritesheet,
  HeroDirection,
} from "@/lib/rendering/phaser/assets";

export type HeroSpriteAnimation = {
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  baseY: number;
  baseScaleX: number;
  baseScaleY: number;
  phase: number;
  mode: "mounted" | "boat" | "idle";
};

export function getHeroDirection(from: Position, to: Position, fallback: HeroDirection): HeroDirection {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  if (dx === 0 && dy === 0) return fallback;
  if (dx === 0 && dy > 0) return "SW";
  if (dx === 0 && dy < 0) return "NE";
  if (dx > 0 && dy === 0) return "SE";
  if (dx < 0 && dy === 0) return "NW";
  if (dx > 0 && dy > 0) return "S";
  if (dx < 0 && dy < 0) return "N";
  if (dx > 0 && dy < 0) return "E";
  return "W";
}

export function getDirectionalAnimationKey(sheet: DirectionalSpritesheet, direction: HeroDirection, state: DirectionalSpriteState) {
  return `${sheet.animationPrefix}-${direction}-${state}`;
}

export function animateHeroSprite(hero: HeroSpriteAnimation, time: number) {
  if (hero.mode === "mounted") {
    const breath = time / 900 + hero.phase;
    hero.sprite.y = hero.baseY;
    hero.sprite.angle = Math.sin(breath) * 0.7;
    hero.sprite.scaleX = hero.baseScaleX;
    hero.sprite.scaleY = hero.baseScaleY;
    return;
  }

  if (hero.mode === "boat") {
    const wave = time / 700 + hero.phase;
    hero.sprite.y = hero.baseY + Math.sin(wave) * 1.5;
    hero.sprite.angle = Math.sin(wave * 0.8) * 1.6;
    hero.sprite.scaleX = hero.baseScaleX;
    hero.sprite.scaleY = hero.baseScaleY;
    return;
  }

  hero.sprite.y = hero.baseY;
  hero.sprite.angle = 0;
  hero.sprite.scaleX = hero.baseScaleX;
  hero.sprite.scaleY = hero.baseScaleY;
}
