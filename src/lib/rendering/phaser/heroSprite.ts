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
  faction: string;
  mode: "mounted" | "boat" | "idle";
};

type HeroMotionProfile = {
  idleBob: number;
  idleAngle: number;
  idleScale: number;
  idleSpeed: number;
  mountedBob: number;
  mountedAngle: number;
  mountedScale: number;
  mountedSpeed: number;
  boatBob: number;
  boatAngle: number;
  boatScale: number;
  boatSpeed: number;
};

const DEFAULT_PROFILE: HeroMotionProfile = {
  idleBob: 0.28,
  idleAngle: 0.22,
  idleScale: 0.004,
  idleSpeed: 1,
  mountedBob: 0.34,
  mountedAngle: 0.7,
  mountedScale: 0.006,
  mountedSpeed: 1,
  boatBob: 1.5,
  boatAngle: 1.6,
  boatScale: 0.008,
  boatSpeed: 1,
};

const HERO_MOTION_PROFILES: Record<string, Partial<HeroMotionProfile>> = {
  castle: {
    mountedBob: 0.28,
    mountedAngle: 0.58,
  },
  rampart: {
    idleBob: 0.34,
    mountedBob: 0.42,
    mountedSpeed: 1.08,
  },
  tower: {
    idleBob: 0.48,
    idleAngle: 0.18,
    idleScale: 0.006,
    mountedBob: 0.24,
    mountedAngle: 0.46,
  },
  inferno: {
    mountedBob: 0.52,
    mountedAngle: 1.05,
    mountedScale: 0.009,
    mountedSpeed: 1.1,
  },
  necropolis: {
    idleBob: 0.62,
    idleAngle: 0.12,
    idleScale: 0.008,
    idleSpeed: 0.82,
    mountedBob: 0.22,
    mountedAngle: 0.38,
    mountedSpeed: 0.88,
  },
  dungeon: {
    mountedBob: 0.4,
    mountedAngle: 0.88,
    mountedSpeed: 1.05,
  },
  stronghold: {
    mountedBob: 0.68,
    mountedAngle: 1.14,
    mountedScale: 0.01,
    mountedSpeed: 1.18,
  },
  fortress: {
    mountedBob: 0.46,
    mountedAngle: 0.92,
    mountedSpeed: 0.94,
    boatBob: 1.8,
  },
  conflux: {
    idleBob: 0.78,
    idleAngle: 0.16,
    idleScale: 0.01,
    idleSpeed: 1.18,
    mountedBob: 0.2,
    mountedAngle: 0.34,
    boatBob: 1.9,
    boatAngle: 1.2,
    boatScale: 0.012,
  },
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
  const profile = {
    ...DEFAULT_PROFILE,
    ...(HERO_MOTION_PROFILES[hero.faction] ?? {}),
  };

  if (hero.mode === "mounted") {
    const breath = time / (900 / profile.mountedSpeed) + hero.phase;
    hero.sprite.y = hero.baseY + Math.sin(breath * 1.4) * profile.mountedBob;
    hero.sprite.angle = Math.sin(breath) * profile.mountedAngle;
    hero.sprite.scaleX = hero.baseScaleX;
    hero.sprite.scaleY = hero.baseScaleY * (1 + Math.cos(breath * 1.4) * profile.mountedScale);
    return;
  }

  if (hero.mode === "boat") {
    const wave = time / (700 / profile.boatSpeed) + hero.phase;
    hero.sprite.y = hero.baseY + Math.sin(wave) * profile.boatBob;
    hero.sprite.angle = Math.sin(wave * 0.8) * profile.boatAngle;
    hero.sprite.scaleX = hero.baseScaleX;
    hero.sprite.scaleY = hero.baseScaleY * (1 + Math.cos(wave * 0.8) * profile.boatScale);
    return;
  }

  const idle = time / (1400 / profile.idleSpeed) + hero.phase;
  hero.sprite.y = hero.baseY + Math.sin(idle) * profile.idleBob;
  hero.sprite.angle = Math.sin(idle * 0.7) * profile.idleAngle;
  hero.sprite.scaleX = hero.baseScaleX;
  hero.sprite.scaleY = hero.baseScaleY * (1 + Math.cos(idle) * profile.idleScale);
}
