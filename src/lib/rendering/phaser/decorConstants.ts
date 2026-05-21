import type { DecorKind } from "@/lib/game/types";
import { MAP_SPRITES } from "@/lib/rendering/phaser/assets";
import type { SpriteOrigin } from "@/lib/rendering/phaser/mapObjectLayout";

export const DECOR_SPRITES: Partial<Record<DecorKind, string>> = {
  "grove-pine": MAP_SPRITES.decor.grove_pine,
  "grove-oak": MAP_SPRITES.decor.grove_oak,
  "grove-dead": MAP_SPRITES.decor.grove_dead,
  "boulder-cluster": MAP_SPRITES.decor.boulder_cluster,
};

export const BLOCKING_DECOR_ORIGINS: Partial<Record<DecorKind, SpriteOrigin>> = {
  "grove-pine": { originX: 0.507, originY: 0.805 },
  "grove-oak": { originX: 0.514, originY: 0.809 },
  "grove-dead": { originX: 0.5, originY: 0.801 },
  "boulder-cluster": { originX: 0.514, originY: 0.84 },
};

export const BLOCKING_DECOR_SPRITE_SIZE = 72;
export const BLOCKING_DECOR_GROUND_OFFSET = 8;

export const BLOCKING_DECOR_SPRITE_METRICS: Partial<Record<DecorKind, { size: number; groundOffset: number }>> = {
  "boulder-cluster": {
    size: 58,
    groundOffset: 8,
  },
};
