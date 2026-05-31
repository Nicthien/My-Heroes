// Cube face directions used by the iso renderer live in `isoCube.ts`.

// Camera & zoom
export const MIN_CAMERA_ZOOM = 0.65;
export const MAX_CAMERA_ZOOM = 1.85;
export const CAMERA_ZOOM_STEP = 1.15;

// Terrain animation (water/lava ripples)
export const TERRAIN_ANIMATION_INTERVAL_MS = 120;
export const WATER_ANIMATION_INTERVAL_MS = 560;
export const WATERFALL_ANIMATION_INTERVAL_MS = 260;
export const TERRAIN_EFFECT_VIEW_PADDING = 96;
export const TERRAIN_ANIMATION_FRAME_COUNT = 6;
export const TERRAIN_TEXTURE_WIDTH = 80;
export const TERRAIN_TEXTURE_HEIGHT = 56;
export const LAVA_TEXTURE_PREFIX = "my-heroes-lava";
export const DETAILED_TERRAIN_TEXTURE_MAX_TILE_COUNT = 96 * 96;

// Fog animation
export const FOG_DRIFT_MAX_TILE_COUNT = 144 * 144;

// Hover label sampling
export const HOVER_LABEL_SAMPLE_MS = 40;
export const HOVER_LABEL_LINGER_MS = 5000;

// Reachable tile highlight
export const REACHABLE_TILE_COLOR = 0x2f80ff;
export const REACHABLE_TILE_ALPHA = 0.34;

// Elevation/depth tuning
export const VISUAL_ELEVATION_SCALE = 5;
export const TERRAIN_TOP_TEXTURE_CROP_INSET = 2;
export const TERRAIN_FACE_RENDER_ORDER = ["SW", "SE"] as const;
export const MAP_LAYER_BASE_DEPTH = -100000;
export const MAP_LAYER_COVER_DEPTH = -50000;

// Movement sound effects keyed by mount kind
export const MOVEMENT_SOUNDS = {
  horse: { key: "movement-horse-trot", path: "/sounds/movement/horse-trot.wav", volume: 0.3, minIntervalMs: 230 },
  boat: { key: "movement-boat-water", path: "/sounds/movement/boat-water.wav", volume: 0.26, minIntervalMs: 320 },
} as const;

export type MovementSoundKind = keyof typeof MOVEMENT_SOUNDS;
