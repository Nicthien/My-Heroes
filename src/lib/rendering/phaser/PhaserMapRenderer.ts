import Phaser from "phaser";
import { getAdventureBuildingLabel } from "@/lib/game/adventure-buildings";
import { getResourceBuildingLabel } from "@/lib/game/economy";
import { DecorItem, DecorKind, GameMap, MapObject, MapTile, Position, RoadType, TerrainType } from "@/lib/game/types";
import { UNIT_RULES } from "@/lib/game/units";
import { MapObjectData, MapRenderer, type RendererLoadingProgress } from "@/lib/rendering/mapRenderer";
import { BASE_HEIGHT, ELEVATION_SCALE, TILE_HEIGHT, TILE_WIDTH, cartToIso, isoToCart } from "@/lib/rendering/phaser/iso";
import { DIRECTIONAL_SPRITESHEETS, HERO_DIRECTIONS, MAP_SPRITES, MAP_SPRITE_PATHS, ROAD_TEXTURES, TERRAIN_TOP_TEXTURES, getBoatSpritesheet, getHeroSpritesheet, getMonsterSpritePath, getTownSpritePath, type DirectionalSpriteState, type DirectionalSpritesheet, type HeroDirection, type TerrainTopTexture } from "@/lib/rendering/phaser/assets";

const TERRAIN_TOP: Record<TerrainType, number> = {
  grass: 0x6dbf58,
  water: 0x2980b9,
  mountain: 0x9a9ea0,
  forest: 0x4a8f4b,
  dirt: 0xb0934a,
  sand: 0xf2cc7e,
  snow: 0xffffff,
  swamp: 0x6d7d4e,
  lava: 0xd04030,
};

const TERRAIN_SIDE_LIT: Record<TerrainType, number> = {
  grass: 0x7ecf68,
  water: 0x1a6090,
  mountain: 0xb0b4b6,
  forest: 0x5aaf5b,
  dirt: 0xc0a35a,
  sand: 0xffdc8e,
  snow: 0xffffff,
  swamp: 0x7d8d5e,
  lava: 0xe05040,
};

const TERRAIN_SIDE_DARK: Record<TerrainType, number> = {
  grass: 0x4a7c3f,
  water: 0x1a6090,
  mountain: 0x606568,
  forest: 0x2a6f2b,
  dirt: 0x7b5924,
  sand: 0xc4a44a,
  snow: 0xc0c0c0,
  swamp: 0x4d5d2e,
  lava: 0xa03020,
};

const RESOURCE_LABELS: Record<string, string> = {
  gold: "Or",
  wood: "Bois",
  ore: "Minerai",
  mercury: "Mercure",
  crystals: "Cristaux",
  gems: "Gemmes",
  sulfur: "Soufre",
};

type SpriteOrigin = {
  originX: number;
  originY: number;
};

const TILE_FOOT_OFFSET_Y = TILE_HEIGHT / 2;
const RESOURCE_BUILDING_SCALE = 1.24;
const RESOURCE_BUILDING_OFFSET_Y = TILE_FOOT_OFFSET_Y;
const RESOURCE_BUILDING_DISPLAY_SIZE = Math.round(52 * RESOURCE_BUILDING_SCALE);
const MAP_OBJECT_ORIGIN_X = 0.5;
const MAP_OBJECT_ORIGIN_Y = 1;
const MAP_OBJECT_FOOT_OFFSET_Y = TILE_FOOT_OFFSET_Y;
const RESOURCE_PICKUP_OFFSET_Y = -4;
const MONSTER_OFFSET_Y = 6;
const TOWN_OFFSET_Y = TILE_FOOT_OFFSET_Y + 7;
const HERO_OFFSET_Y = 6;
const TOWN_HERO_OFFSET_Y = TOWN_OFFSET_Y + 12;
const ADVENTURE_BUILDING_OFFSET_Y = 8;
const DEFAULT_SPRITE_ORIGIN: SpriteOrigin = { originX: MAP_OBJECT_ORIGIN_X, originY: MAP_OBJECT_ORIGIN_Y };
const HERO_SPRITE_ORIGIN: SpriteOrigin = { originX: 0.5, originY: 0.988 };
const BOAT_SPRITE_ORIGIN: SpriteOrigin = { originX: 0.5, originY: 0.925 };
const MONSTER_SPRITE_ORIGIN: SpriteOrigin = { originX: 0.507, originY: 0.865 };
const RESOURCE_BUILDING_ORIGIN: SpriteOrigin = { originX: 0.5, originY: 0.988 };
const RESOURCE_PICKUP_ORIGINS: Record<string, SpriteOrigin> = {
  gold: { originX: 0.51, originY: 0.576 },
  wood: { originX: 0.504, originY: 0.543 },
  ore: { originX: 0.498, originY: 0.557 },
  mercury: { originX: 0.488, originY: 0.561 },
  crystals: { originX: 0.5, originY: 0.506 },
  gems: { originX: 0.498, originY: 0.572 },
  sulfur: { originX: 0.48, originY: 0.586 },
};
const ADVENTURE_BUILDING_ORIGINS: Record<string, SpriteOrigin> = {
  campfire: { originX: 0.502, originY: 0.891 },
  lighthouse: { originX: 0.49, originY: 0.898 },
  observatory: { originX: 0.475, originY: 0.938 },
  stargate: { originX: 0.48, originY: 0.918 },
};
const TOWN_ORIGINS: Record<string, SpriteOrigin> = {
  castle: { originX: 0.495, originY: 0.904 },
  rampart: { originX: 0.502, originY: 0.901 },
  tower: { originX: 0.495, originY: 0.93 },
  inferno: { originX: 0.495, originY: 0.909 },
  necropolis: { originX: 0.497, originY: 0.898 },
  dungeon: { originX: 0.5, originY: 0.919 },
  stronghold: { originX: 0.498, originY: 0.927 },
  fortress: { originX: 0.499, originY: 0.919 },
  conflux: { originX: 0.498, originY: 0.927 },
};

function getMapObjectHoverText(object: MapObject) {
  if (object.type === "resource" && object.subtype) {
    return RESOURCE_LABELS[object.subtype] ?? object.subtype.slice(0, 3).toUpperCase();
  }

  if (object.type === "monster") return object.subtype && object.subtype in UNIT_RULES
    ? UNIT_RULES[object.subtype as keyof typeof UNIT_RULES].label
    : "Armée neutre";
  if (object.type === "building" && object.subtype) return getResourceBuildingLabel(object.subtype) ?? object.subtype;
  if (object.type === "adventure_building") return getAdventureBuildingLabel(object.subtype);
  if (object.type === "artifact") return "Artefact";

  return null;
}

function getMapObjectHoverY(object: MapObject, surfaceY: number) {
  if (object.type === "building") {
    return surfaceY + RESOURCE_BUILDING_OFFSET_Y - RESOURCE_BUILDING_DISPLAY_SIZE - 8;
  }

  if (object.type === "resource") return surfaceY + RESOURCE_PICKUP_OFFSET_Y - 38 - 6;
  if (object.type === "monster") return surfaceY + MONSTER_OFFSET_Y - 46 - 8;

  return surfaceY - 34;
}

function getOriginForMapTileObject(object: MapObject): SpriteOrigin {
  if (object.type === "resource" && object.subtype) {
    return RESOURCE_PICKUP_ORIGINS[object.subtype] ?? DEFAULT_SPRITE_ORIGIN;
  }
  if (object.type === "monster") return MONSTER_SPRITE_ORIGIN;
  return DEFAULT_SPRITE_ORIGIN;
}

function getOriginForObject(object: MapObjectData): SpriteOrigin {
  if (object.type === "hero") return object.onWater ? BOAT_SPRITE_ORIGIN : HERO_SPRITE_ORIGIN;
  if (object.type === "town") return TOWN_ORIGINS[object.faction] ?? DEFAULT_SPRITE_ORIGIN;
  if (object.type === "building") return RESOURCE_BUILDING_ORIGIN;
  if (object.type === "adventure_building" && object.buildingType) {
    return ADVENTURE_BUILDING_ORIGINS[object.buildingType] ?? DEFAULT_SPRITE_ORIGIN;
  }
  return DEFAULT_SPRITE_ORIGIN;
}

function isEmptyPassableTile(tile: MapTile) {
  return tile.isPassable && !tile.object && !tile.decor?.blocking;
}

const MIN_CAMERA_ZOOM = 0.65;
const MAX_CAMERA_ZOOM = 1.85;
const CAMERA_ZOOM_STEP = 1.15;
const TERRAIN_ANIMATION_INTERVAL_MS = 120;
const TERRAIN_EFFECT_VIEW_PADDING = 96;
const TERRAIN_ANIMATION_FRAME_COUNT = 6;
const TERRAIN_TEXTURE_WIDTH = 80;
const TERRAIN_TEXTURE_HEIGHT = 56;
const WATER_TEXTURE_PREFIX = "my-heroes-water";
const LAVA_TEXTURE_PREFIX = "my-heroes-lava";
const HOVER_LABEL_SAMPLE_MS = 40;
const BOARD_THICKNESS = 34;
const BOARD_LIP_EXTRA_HEIGHT = ELEVATION_SCALE;
const REACHABLE_TILE_COLOR = 0x2f80ff;
const REACHABLE_TILE_ALPHA = 0.34;
const VISUAL_ELEVATION_SCALE = 5;
const TERRAIN_TOP_TEXTURE_CROP_INSET = 2;
const TERRAIN_FACE_RENDER_ORDER: readonly TerrainFaceSide[] = ["left", "right"];
const MAP_LAYER_BASE_DEPTH = -100000;
const MAP_LAYER_COVER_DEPTH = -50000;
const MOVEMENT_SOUNDS = {
  horse: { key: "movement-horse-trot", path: "/sounds/movement/horse-trot.wav", volume: 0.3, minIntervalMs: 230 },
  boat: { key: "movement-boat-water", path: "/sounds/movement/boat-water.wav", volume: 0.26, minIntervalMs: 320 },
} as const;

type BrickWallOrientation = "x" | "y" | "diagonalDown" | "diagonalUp";
type MovementSoundKind = keyof typeof MOVEMENT_SOUNDS;

type WaterTileEffect = {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  frameOffset: number;
  frameIndex: number;
};

type LavaTileEffect = {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  frameOffset: number;
  frameIndex: number;
};

type TerrainSideExposure = {
  bottomDepth: number;
  neighborTerrain?: TerrainType;
};

type TerrainFaceSide = "left" | "right";

type TerrainSideVisibility = {
  left: TerrainSideExposure | null;
  right: TerrainSideExposure | null;
};

type TerrainSideFacePoints = {
  topA: Position;
  topB: Position;
  bottomA: Position;
  bottomB: Position;
};

type HeroSpriteAnimation = {
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  baseY: number;
  baseScaleX: number;
  baseScaleY: number;
  phase: number;
  mode: "mounted" | "boat" | "idle";
};

type RenderedHeroObject = {
  object: MapObjectData;
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  banner: Phaser.GameObjects.Graphics;
  animation: HeroSpriteAnimation;
  baseX: number;
  baseY: number;
  baseDisplayWidth: number;
  baseDisplayHeight: number;
  direction: HeroDirection;
};

type RenderedBadge = {
  background: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
};

type RenderedStaticObject = {
  object: MapObjectData;
  sprite?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Star;
  label?: Phaser.GameObjects.Text;
  banner?: Phaser.GameObjects.Graphics;
  badge?: RenderedBadge;
};

type FogTileState = 0 | 1 | 2;
type FogEdgeSide = "northWest" | "northEast" | "southEast" | "southWest";
type FogStampKey = "fog-near" | "fog-unexplored" | "fog-explored" | "fog-edge-nw" | "fog-edge-ne" | "fog-edge-se" | "fog-edge-sw";
type RoadSide = "northEast" | "southEast" | "southWest" | "northWest";
type RoadRenderStyle = {
  edge: number;
  fill: number;
  highlight: number;
  detail: number;
  shadowAlpha: number;
  halfWidth: number;
  outline: number;
  hubScale: number;
  detailDensity: number;
};

type RoadStampSpec = {
  texturePath: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  displayWidth: number;
  displayHeight: number;
  alpha: number;
};

type FogChunkBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type FogChunk = {
  chunkX: number;
  chunkY: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  bounds: FogChunkBounds;
  baseTexture: Phaser.GameObjects.RenderTexture;
  edgeTexture: Phaser.GameObjects.RenderTexture;
};

const ROAD_RENDER_STYLES: Record<RoadType | "bridge", RoadRenderStyle> = {
  dirt: {
    edge: 0x5e3c1e,
    fill: 0xb68445,
    highlight: 0xe3bb72,
    detail: 0x6a4520,
    shadowAlpha: 0.16,
    halfWidth: 5.8,
    outline: 2.3,
    hubScale: 1,
    detailDensity: 1,
  },
  gravel: {
    edge: 0x4d493f,
    fill: 0xb6afa4,
    highlight: 0xe9e3d3,
    detail: 0x716b61,
    shadowAlpha: 0.14,
    halfWidth: 5.4,
    outline: 2.1,
    hubScale: 0.96,
    detailDensity: 0.9,
  },
  paved: {
    edge: 0x4f463c,
    fill: 0xd8ccb7,
    highlight: 0xf4edde,
    detail: 0x887a68,
    shadowAlpha: 0.12,
    halfWidth: 5.1,
    outline: 2,
    hubScale: 0.94,
    detailDensity: 0.72,
  },
  bridge: {
    edge: 0x4c2d15,
    fill: 0x9e6a36,
    highlight: 0xc79253,
    detail: 0x6d4422,
    shadowAlpha: 0.18,
    halfWidth: 6.2,
    outline: 2.1,
    hubScale: 1.06,
    detailDensity: 1.05,
  },
};

const ROAD_STAMP_MASK_BY_SIDE: Record<RoadSide, 5 | 10> = {
  northEast: 5,
  southEast: 10,
  southWest: 5,
  northWest: 10,
};

const ROAD_TEXTURE_BITS: Record<RoadSide, number> = {
  northEast: 1,
  southEast: 2,
  southWest: 4,
  northWest: 8,
};

const DECOR_SPRITES: Partial<Record<DecorKind, string>> = {
  "grove-pine": MAP_SPRITES.decor.grove_pine,
  "grove-oak": MAP_SPRITES.decor.grove_oak,
  "grove-dead": MAP_SPRITES.decor.grove_dead,
  "boulder-cluster": MAP_SPRITES.decor.boulder_cluster,
};

const BLOCKING_DECOR_ORIGINS: Partial<Record<DecorKind, SpriteOrigin>> = {
  "grove-pine": { originX: 0.507, originY: 0.805 },
  "grove-oak": { originX: 0.514, originY: 0.809 },
  "grove-dead": { originX: 0.5, originY: 0.801 },
  "boulder-cluster": { originX: 0.514, originY: 0.84 },
};

const BLOCKING_DECOR_SPRITE_SIZE = 72;
const BLOCKING_DECOR_GROUND_OFFSET = 8;
const BLOCKING_DECOR_SPRITE_METRICS: Partial<Record<DecorKind, { size: number; groundOffset: number }>> = {
  "boulder-cluster": {
    size: 58,
    groundOffset: 8,
  },
};

const FOG_CHUNK_SIZE = 16;
const FOG_TILE_VISIBLE: FogTileState = 0;
const FOG_TILE_EXPLORED: FogTileState = 1;
const FOG_TILE_UNEXPLORED: FogTileState = 2;
const FOG_TILE_UNINITIALIZED = 255;
const FOG_STAMP_WIDTH = TILE_WIDTH + 16;
const FOG_STAMP_HEIGHT = TILE_HEIGHT + 16;
const FOG_STAMP_HALF_WIDTH = FOG_STAMP_WIDTH / 2;
const FOG_STAMP_HALF_HEIGHT = FOG_STAMP_HEIGHT / 2;
const FOG_CHUNK_MARGIN = 2;
const FOG_PLANE_CLEARANCE = 1;
const FOG_STAMP_CONFIG: Phaser.Types.Textures.StampConfig = {
  originX: 0.5,
  originY: 0.5,
};
const FOG_UNEXPLORED_STAMP_CONFIG: Phaser.Types.Textures.StampConfig = {
  originX: 0.5,
  originY: 0.5,
  scaleX: 1.12,
  scaleY: 1.12,
};
const FOG_STAMP_TEXTURE_KEYS: Record<FogStampKey, string> = {
  "fog-near": "my-heroes-fog-near",
  "fog-unexplored": "my-heroes-fog-unexplored",
  "fog-explored": "my-heroes-fog-explored",
  "fog-edge-nw": "my-heroes-fog-edge-nw",
  "fog-edge-ne": "my-heroes-fog-edge-ne",
  "fog-edge-se": "my-heroes-fog-edge-se",
  "fog-edge-sw": "my-heroes-fog-edge-sw",
};

class PhaserMapScene extends Phaser.Scene {
  map: GameMap | null = null;
  objects: MapObjectData[] = [];
  readyCallback?: () => void;
  loadingProgressCallback?: RendererLoadingProgress;

  private boardLayer!: Phaser.GameObjects.Container;
  private boardLipLayer!: Phaser.GameObjects.Container;
  private mapLayer!: Phaser.GameObjects.Container;
  private roadLayer!: Phaser.GameObjects.Container;
  private decorLayer!: Phaser.GameObjects.Container;
  private mapObjectLayer!: Phaser.GameObjects.Container;
  private reachableLayer!: Phaser.GameObjects.Container;
  private highlightLayer!: Phaser.GameObjects.Container;
  private objectLayer!: Phaser.GameObjects.Container;
  private movementLabelLayer!: Phaser.GameObjects.Container;
  private fogLayer!: Phaser.GameObjects.Container;
  private hoverLabelLayer!: Phaser.GameObjects.Container;
  private hoverLabelBackground?: Phaser.GameObjects.Graphics;
  private hoverLabelText?: Phaser.GameObjects.Text;
  private hoverLabelKey: string | null = null;
  private visibleTiles: Set<string> | null = null;
  private fogChunkColumns = 0;
  private fogChunkRows = 0;
  private fogChunks: FogChunk[] = [];
  private fogTileStates: Uint8Array | null = null;
  private fogPlaneDepth = BASE_HEIGHT + FOG_PLANE_CLEARANCE;
  private fogStampTextureKeys = FOG_STAMP_TEXTURE_KEYS;
  private reachableOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private highlightOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private waterTiles: WaterTileEffect[] = [];
  private lavaTiles: LavaTileEffect[] = [];
  private heroSpriteAnimations: HeroSpriteAnimation[] = [];
  private renderedHeroes = new Map<string, RenderedHeroObject>();
  private renderedStaticObjects = new Map<string, RenderedStaticObject>();
  private heroDirections = new Map<string, HeroDirection>();
  private lastMovementSoundAt: Record<MovementSoundKind, number> = { horse: -Infinity, boat: -Infinity };
  private lastTerrainAnimationAt = 0;
  private lastHoverLabelAt = 0;

  constructor() {
    super("MapScene");
  }

  preload() {
    this.loadingProgressCallback?.(84, "Chargement des graphismes...");
    this.load.on("progress", (value: number) => {
      this.loadingProgressCallback?.(84 + value * 5, "Chargement des graphismes...");
    });
    this.load.once("complete", () => {
      this.loadingProgressCallback?.(89, "Preparation de la scene...");
    });

    for (const path of MAP_SPRITE_PATHS) {
      if (path.endsWith(".svg")) this.load.svg(path, path);
      else this.load.image(path, path);
    }
    for (const sound of Object.values(MOVEMENT_SOUNDS)) {
      this.load.audio(sound.key, sound.path);
    }
    for (const sheet of DIRECTIONAL_SPRITESHEETS) {
      this.load.spritesheet(sheet.key, sheet.path, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a1a2e);
    this.boardLayer = this.add.container(0, 0);
    this.boardLipLayer = this.add.container(0, 0);
    this.mapLayer = this.add.container(0, 0);
    this.roadLayer = this.add.container(0, 0);
    this.decorLayer = this.add.container(0, 0);
    this.mapObjectLayer = this.add.container(0, 0);
    this.reachableLayer = this.add.container(0, 0);
    this.highlightLayer = this.add.container(0, 0);
    this.objectLayer = this.add.container(0, 0);
    this.movementLabelLayer = this.add.container(0, 0);
    this.fogLayer = this.add.container(0, 0);
    this.hoverLabelLayer = this.add.container(0, 0);

    this.boardLayer.setDepth(-2);
    this.mapLayer.setDepth(0);
    this.roadLayer.setDepth(1);
    this.reachableLayer.setDepth(2);
    this.highlightLayer.setDepth(2);
    this.decorLayer.setDepth(3);
    this.mapObjectLayer.setDepth(4);
    this.boardLipLayer.setDepth(2);
    this.objectLayer.setDepth(10);
    this.movementLabelLayer.setDepth(12);
    this.fogLayer.setDepth(20);
    this.hoverLabelLayer.setDepth(30);
    generateTerrainAnimationTextures(this);
    generateFogStampTextures(this);
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const now = this.time.now;
      if (now - this.lastHoverLabelAt < HOVER_LABEL_SAMPLE_MS) return;
      this.lastHoverLabelAt = now;
      this.updateHoverLabel(pointer.x, pointer.y);
    });
    this.createDirectionalAnimations();
    this.readyCallback?.();
  }

  renderMap(map: GameMap) {
    this.map = map;
    this.fogPlaneDepth = getMaxTileDepth(map) + FOG_PLANE_CLEARANCE;
    this.waterTiles = [];
    this.lavaTiles = [];
    this.visibleTiles = null;
    this.fogTileStates = null;
    this.fogChunkColumns = 0;
    this.fogChunkRows = 0;
    this.fogLayer.removeAll(true);
    this.fogChunks = [];
    this.lastTerrainAnimationAt = 0;
    this.boardLayer.removeAll(true);
    this.boardLipLayer.removeAll(true);
    this.mapLayer.removeAll(true);
    this.roadLayer.removeAll(true);
    this.decorLayer.removeAll(true);
    this.mapObjectLayer.removeAll(true);
    this.objectLayer.removeAll(true);
    this.reachableOverlayObjects = [];
    this.highlightOverlayObjects = [];
    this.reachableLayer.removeAll(true);
    this.highlightLayer.removeAll(true);
    this.movementLabelLayer.removeAll(true);
    this.renderedHeroes.clear();
    this.renderedStaticObjects.clear();
    this.heroSpriteAnimations = [];
    this.clearHoverLabel();
    this.renderBoardFrame(map);
    const terrainBase = this.add.graphics();
    const terrainCover = this.add.graphics();
    const decorGraphics = this.add.graphics();
    terrainBase.setDepth(MAP_LAYER_BASE_DEPTH);
    terrainCover.setDepth(MAP_LAYER_COVER_DEPTH);
    this.mapLayer.add(terrainBase);
    decorGraphics.setDepth(Number.NEGATIVE_INFINITY);
    this.decorLayer.add(decorGraphics);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        const iso = cartToIso(x, y);
        this.renderTile(tile, iso.x, iso.y, terrainBase, terrainCover);
        const depth = getTileDepth(tile);
        if (tile.object?.type === "wall" && tile.object.subtype === "natural") {
          this.renderNaturalWall(tile, iso.x, iso.y - depth);
        }
        if (tile.decor) this.renderDecor(tile.decor, iso.x, iso.y - depth, decorGraphics);
      }
    }

    this.mapLayer.add(terrainCover);
    this.mapLayer.sort("depth");
    this.roadLayer.sort("depth");
    this.decorLayer.sort("depth");
    this.renderMapTileObjects();
    this.rebuildFogChunks();
    this.renderObjects();
  }

  update(time: number) {
    const view = this.cameras.main.worldView;

    if (time - this.lastTerrainAnimationAt >= TERRAIN_ANIMATION_INTERVAL_MS) {
      const frameIndex = Math.floor(time / TERRAIN_ANIMATION_INTERVAL_MS) % TERRAIN_ANIMATION_FRAME_COUNT;

      for (const water of this.waterTiles) {
        if (isTerrainEffectInView(water, view)) {
          updateTerrainEffectFrame(water, WATER_TEXTURE_PREFIX, frameIndex);
        }
      }

      for (const lava of this.lavaTiles) {
        if (isTerrainEffectInView(lava, view)) {
          updateTerrainEffectFrame(lava, LAVA_TEXTURE_PREFIX, frameIndex);
        }
      }

      this.lastTerrainAnimationAt = time;
    }

    for (const hero of this.heroSpriteAnimations) {
      if (hero.mode === "idle") continue;
      if (!isSpritePointInView(hero.sprite.x, hero.sprite.y, view)) continue;
      animateHeroSprite(hero, time);
    }
  }

  private renderBoardFrame(map: GameMap) {
    const corners = getMapOuterCorners(map);
    const boardLift = getMaxTileDepth(map) + BOARD_LIP_EXTRA_HEIGHT;
    const outerBase = getMapOuterCorners(map, 1);
    const outerTop = liftPolygon(outerBase, boardLift);
    const innerTop = liftPolygon(corners, boardLift);
    const side = outerBase.map((point) => ({ x: point.x, y: point.y + BOARD_THICKNESS }));

    const shadow = this.add.graphics();
    shadow.fillStyle(0x050307, 0.32);
    drawPolygonPath(shadow, side);
    shadow.fillPath();
    this.boardLayer.add(shadow);

    const outerWall = this.add.graphics();
    outerWall.fillStyle(0x3a2112, 1);
    outerWall.lineStyle(2, 0x170b05, 0.85);
    for (let i = 0; i < outerTop.length; i++) {
      const next = (i + 1) % outerTop.length;
      outerWall.beginPath();
      outerWall.moveTo(outerTop[i].x, outerTop[i].y);
      outerWall.lineTo(outerTop[next].x, outerTop[next].y);
      outerWall.lineTo(side[next].x, side[next].y);
      outerWall.lineTo(side[i].x, side[i].y);
      outerWall.closePath();
      outerWall.fillPath();
      outerWall.strokePath();
    }
    this.boardLayer.add(outerWall);

    const innerWall = this.add.graphics();
    innerWall.fillStyle(0x281509, 1);
    innerWall.lineStyle(2, 0x120803, 0.82);
    for (let i = 0; i < innerTop.length; i++) {
      const next = (i + 1) % innerTop.length;
      innerWall.beginPath();
      innerWall.moveTo(innerTop[i].x, innerTop[i].y);
      innerWall.lineTo(innerTop[next].x, innerTop[next].y);
      innerWall.lineTo(corners[next].x, corners[next].y);
      innerWall.lineTo(corners[i].x, corners[i].y);
      innerWall.closePath();
      innerWall.fillPath();
      innerWall.strokePath();
    }
    this.boardLipLayer.add(innerWall);

    const top = this.add.graphics();
    top.fillStyle(0x7a4a25, 1);
    top.lineStyle(3, 0x261308, 1);
    drawRingPath(top, outerTop, innerTop);

    top.lineStyle(2, 0xb77a3b, 0.55);
    drawPolygonPath(top, innerTop);
    top.strokePath();

    this.drawWoodGrain(top, outerTop, innerTop);
    this.drawCornerBolts(top, outerTop);
    this.boardLipLayer.add(top);
  }

  private drawWoodGrain(graphics: Phaser.GameObjects.Graphics, outer: Position[], inner: Position[]) {
    const grainColor = 0x2d1709;
    const highlightColor = 0xb98245;

    for (let i = 0; i < outer.length; i++) {
      const next = (i + 1) % outer.length;
      const edgeLength = Phaser.Math.Distance.Between(outer[i].x, outer[i].y, outer[next].x, outer[next].y);
      const plankCount = Math.max(3, Math.floor(edgeLength / 72));

      for (let p = 1; p < plankCount; p++) {
        const t = p / plankCount;
        const outside = lerpPoint(outer[i], outer[next], t);
        const inside = lerpPoint(inner[i], inner[next], t);
        graphics.lineStyle(1, grainColor, 0.34);
        graphics.beginPath();
        graphics.moveTo(outside.x, outside.y);
        graphics.lineTo(inside.x, inside.y);
        graphics.strokePath();
      }

      const grainLines = Math.max(4, Math.floor(edgeLength / 46));
      for (let g = 0; g < grainLines; g++) {
        const t = (g + 0.5) / grainLines;
        const outside = lerpPoint(outer[i], outer[next], t);
        const inside = lerpPoint(inner[i], inner[next], t);
        const start = lerpPoint(outside, inside, 0.24 + hashTile(i, g) * 0.14);
        const end = lerpPoint(outside, inside, 0.66 + hashTile(g, i) * 0.14);
        const bow = (hashTile(i + 9, g + 3) - 0.5) * 8;

        graphics.lineStyle(1, g % 3 === 0 ? highlightColor : grainColor, g % 3 === 0 ? 0.2 : 0.3);
        graphics.beginPath();
        graphics.moveTo(start.x, start.y);
        graphics.lineTo((start.x + end.x) / 2 + bow, (start.y + end.y) / 2 - bow * 0.35);
        graphics.lineTo(end.x, end.y);
        graphics.strokePath();
      }
    }
  }

  private drawCornerBolts(graphics: Phaser.GameObjects.Graphics, outer: Position[]) {
    const center = getPolygonCenter(outer);
    for (const corner of outer) {
      const bolt = lerpPoint(corner, center, 0.12);
      graphics.fillStyle(0x2b1a10, 0.9);
      graphics.fillCircle(bolt.x, bolt.y, 4);
      graphics.fillStyle(0xd0a66d, 0.35);
      graphics.fillCircle(bolt.x - 1, bolt.y - 1, 1.5);
    }
  }

  private drawRoad(_graphics: Phaser.GameObjects.Graphics, tile: MapTile, isoX: number, isoY: number) {
    const road = tile.road;
    if (!road) return;

    const isBridge = tile.terrain === TerrainType.WATER;
    const style = ROAD_RENDER_STYLES[isBridge ? "bridge" : road];
    const connections = this.getRoadConnections(tile);
    const center = { x: isoX, y: isoY };
    const anchors = getRoadAnchorPoints(isoX, isoY);

    for (const side of connections) {
      const anchor = extendRoadPoint(center, anchors[side], 1.15);
      this.drawRoadSegment(_graphics, center, anchor, style);
      this.drawRoadTextureStamp(center, anchor, isBridge ? "bridge" : road, tile.x, tile.y, side);
    }

    this.drawRoadCenterStamp(center, isBridge ? "bridge" : road, connections);
  }

  private getRoadConnections(tile: MapTile): RoadSide[] {
    const connections: RoadSide[] = [];
    if (this.hasRoad(tile.x, tile.y - 1)) connections.push("northEast");
    if (this.hasRoad(tile.x + 1, tile.y)) connections.push("southEast");
    if (this.hasRoad(tile.x, tile.y + 1)) connections.push("southWest");
    if (this.hasRoad(tile.x - 1, tile.y)) connections.push("northWest");

    if (connections.length > 0) return connections;
    return ["northEast", "southWest"];
  }

  private hasRoad(x: number, y: number) {
    return Boolean(this.map?.tiles[y]?.[x]?.road);
  }

  private drawRoadSegment(
    graphics: Phaser.GameObjects.Graphics,
    start: Position,
    end: Position,
    style: RoadRenderStyle
  ) {
    const shadowOffset = { x: 0, y: 1.3 };
    fillRoadStrip(graphics, offsetPoint(start, shadowOffset), offsetPoint(end, shadowOffset), style.halfWidth + style.outline * 0.45, 0x000000, style.shadowAlpha);
    fillRoadStrip(graphics, start, end, style.halfWidth + style.outline, style.edge, 1);
    fillRoadStrip(graphics, start, end, style.halfWidth, style.fill, 1);
    fillRoadStrip(graphics, start, end, style.halfWidth * 0.2, style.highlight, 0.12);
  }

  private drawRoadTextureStamp(
    start: Position,
    end: Position,
    kind: RoadType | "bridge",
    tileX: number,
    tileY: number,
    side: RoadSide
  ) {
    const stamp = getRoadStampSpec(kind, side);
    const midpoint = {
      x: Phaser.Math.Linear(start.x, end.x, 0.54),
      y: Phaser.Math.Linear(start.y, end.y, 0.54),
    };
    const jitter = (pseudoRandom(hashTile(tileX * 19 + ROAD_SIDE_SEEDS[side], tileY * 37 + ROAD_SIDE_SEEDS[side]), 1) - 0.5) * 1.4;
    const sprite = this.add.image(midpoint.x, midpoint.y + jitter, stamp.texturePath);
    sprite.setCrop(stamp.cropX, stamp.cropY, stamp.cropWidth, stamp.cropHeight);
    sprite.setDisplaySize(stamp.displayWidth, stamp.displayHeight);
    sprite.setOrigin(0.5);
    sprite.setAlpha(stamp.alpha);
    sprite.setDepth(midpoint.y + 0.28);
    this.roadLayer.add(sprite);
  }

  private drawRoadCenterStamp(
    center: Position,
    kind: RoadType | "bridge",
    connections: RoadSide[]
  ) {
    const stamp = getRoadCenterStampSpec(kind, connections);
    const sprite = this.add.image(center.x, center.y, stamp.texturePath);
    sprite.setCrop(stamp.cropX, stamp.cropY, stamp.cropWidth, stamp.cropHeight);
    sprite.setDisplaySize(stamp.displayWidth, stamp.displayHeight);
    sprite.setOrigin(0.5);
    sprite.setAlpha(stamp.alpha);
    sprite.setDepth(center.y + 0.29);
    this.roadLayer.add(sprite);
  }

  private renderDecor(
    decor: DecorItem,
    isoX: number,
    isoY: number,
    batchGraphics: Phaser.GameObjects.Graphics
  ) {
    const { type: kind } = decor;
    if (!isAllowedDecor(kind)) return;

    if (!decor.blocking) {
      return;
    }

    const variant = decor.variant ?? 0;
    const spritePath = DECOR_SPRITES[kind];
    if (spritePath) {
      const metrics = BLOCKING_DECOR_SPRITE_METRICS[kind] ?? {
        size: BLOCKING_DECOR_SPRITE_SIZE,
        groundOffset: BLOCKING_DECOR_GROUND_OFFSET,
      };
      const groundY = isoY + metrics.groundOffset;
      const sprite = this.add.image(isoX, groundY, spritePath);
      const origin = BLOCKING_DECOR_ORIGINS[kind] ?? DEFAULT_SPRITE_ORIGIN;
      sprite.setOrigin(origin.originX, origin.originY);
      sprite.setDisplaySize(metrics.size, metrics.size);
      sprite.setDepth(groundY);
      this.decorLayer.add(sprite);
      return;
    }

    const baseY = isoY + 2;
    const scale = 0.92 + variant * 0.08;

    this.drawDecorShadow(batchGraphics, isoX, baseY, kind);

    switch (kind) {
      case "tree-pine":
        this.drawPineTree(batchGraphics, isoX, baseY, scale);
        break;
      case "tree-oak":
        this.drawOakTree(batchGraphics, isoX, baseY, scale);
        break;
      case "tree-dead":
        this.drawDeadTree(batchGraphics, isoX, baseY, scale);
        break;
      case "grove-pine":
        this.drawPineGrove(batchGraphics, isoX, baseY, scale);
        break;
      case "grove-oak":
        this.drawOakGrove(batchGraphics, isoX, baseY, scale);
        break;
      case "grove-dead":
        this.drawDeadGrove(batchGraphics, isoX, baseY, scale);
        break;
      case "rock-large":
        this.drawRockCluster(batchGraphics, isoX, baseY, scale);
        break;
      case "rock-small":
        this.drawSmallRock(batchGraphics, isoX, baseY, scale);
        break;
      case "boulder-cluster":
        this.drawBoulderCluster(batchGraphics, isoX, baseY, scale);
        break;
      case "bush":
        this.drawBush(batchGraphics, isoX, baseY, scale);
        break;
      case "flower":
        this.drawFlowers(batchGraphics, isoX, baseY, scale, variant);
        break;
      case "grass-tuft":
        this.drawGrassTuft(batchGraphics, isoX, baseY, scale, variant);
        break;
    }
  }

  private renderNaturalWall(tile: MapTile, isoX: number, isoY: number) {
    const jitter = hashTile(tile.x, tile.y);
    const groundY = isoY;
    const sprite = this.add.image(isoX, groundY, pickNaturalWallTreeSprite(tile));
    sprite.setOrigin(MAP_OBJECT_ORIGIN_X, MAP_OBJECT_ORIGIN_Y);
    sprite.setDisplaySize(66 + jitter * 8, 72 + jitter * 8);
    sprite.setFlipX(jitter > 0.5);
    sprite.setDepth(groundY);
    this.decorLayer.add(sprite);
  }

  private drawNaturalWallStructuralFace(
    graphics: Phaser.GameObjects.Graphics,
    topA: Position,
    topB: Position,
    bottomA: Position,
    bottomB: Position,
    color: number,
    alpha: number
  ) {
    graphics.fillStyle(color, alpha);
    graphics.lineStyle(0.8, 0x0f2410, 0.24);
    graphics.beginPath();
    graphics.moveTo(topA.x, topA.y);
    graphics.lineTo(topB.x, topB.y);
    graphics.lineTo(bottomB.x, bottomB.y);
    graphics.lineTo(bottomA.x, bottomA.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    graphics.fillStyle(0x0d260f, 0.18);
    graphics.fillEllipse((topA.x + topB.x + bottomA.x + bottomB.x) / 4, (topA.y + topB.y + bottomA.y + bottomB.y) / 4 + 4, 24, 12);
  }

  private drawNaturalWallFace(
    graphics: Phaser.GameObjects.Graphics,
    topA: Position,
    topB: Position,
    bottomA: Position,
    bottomB: Position,
    color: number,
    alpha: number
  ) {
    graphics.fillStyle(color, alpha * 0.28);
    graphics.lineStyle(0.8, 0x13280f, 0.28);
    graphics.beginPath();
    graphics.moveTo(topA.x, topA.y);
    graphics.lineTo(topB.x, topB.y);
    graphics.lineTo(bottomB.x, bottomB.y);
    graphics.lineTo(bottomA.x, bottomA.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    const leafColors = [color, 0x3f7d38, 0x6ba851, 0x224a22];
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8;
      const top = lerpPoint(topA, topB, t);
      const bottom = lerpPoint(bottomA, bottomB, t);
      const center = lerpPoint(top, bottom, 0.34 + (i % 3) * 0.16);
      const wobble = (i % 2 === 0 ? -1 : 1) * 3;
      graphics.fillStyle(leafColors[i % leafColors.length], 0.72);
      graphics.fillEllipse(center.x + wobble, center.y, 18 - (i % 3) * 2, 11 + (i % 2) * 3);
      graphics.fillStyle(0xb7df8a, 0.16);
      graphics.fillEllipse(center.x - 4 + wobble, center.y - 3, 8, 4);
    }

    graphics.lineStyle(1.2, 0x143010, 0.24);
    graphics.beginPath();
    for (const t of [0.24, 0.52, 0.78]) {
      const a = lerpPoint(topA, bottomA, t);
      const b = lerpPoint(topB, bottomB, t + 0.04);
      graphics.moveTo(a.x, a.y);
      graphics.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 3);
      graphics.lineTo(b.x, b.y);
    }
    graphics.strokePath();
  }

  private drawNaturalWallCrown(
    graphics: Phaser.GameObjects.Graphics,
    north: Position,
    east: Position,
    south: Position,
    west: Position,
    jitter: number
  ) {
    const center = getPolygonCenter([north, east, south, west]);
    graphics.fillStyle(0x183c1a, 0.48);
    graphics.beginPath();
    graphics.moveTo(north.x, north.y + 8 - jitter * 2);
    graphics.lineTo((north.x + east.x) / 2 + 6, (north.y + east.y) / 2 - 8);
    graphics.lineTo(east.x - 5, east.y + 5);
    graphics.lineTo((east.x + south.x) / 2 + 7, (east.y + south.y) / 2 + 4);
    graphics.lineTo(south.x + 2, south.y + 4);
    graphics.lineTo((south.x + west.x) / 2 - 4, (south.y + west.y) / 2 + 9);
    graphics.lineTo(west.x + 5, west.y + 4);
    graphics.lineTo((west.x + north.x) / 2 - 8, (west.y + north.y) / 2 - 4);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(0x77b65a, 0.2);
    graphics.fillEllipse(center.x - 3, center.y + 2, 44, 22);
  }

  private drawNaturalWallTop(
    graphics: Phaser.GameObjects.Graphics,
    north: Position,
    east: Position,
    south: Position,
    west: Position,
    jitter: number
  ) {
    const center = getPolygonCenter([north, east, south, west]);
    const blobs = [
      { x: north.x, y: north.y + 12, w: 20, h: 13, c: 0x6aa34d },
      { x: west.x + 17, y: west.y + 5, w: 23, h: 15, c: 0x578f43 },
      { x: center.x - 8, y: center.y - 1, w: 28, h: 18, c: 0x73ad55 },
      { x: center.x + 10, y: center.y + 1 + jitter * 2, w: 28, h: 18, c: 0x619b49 },
      { x: east.x - 16, y: east.y + 6, w: 23, h: 15, c: 0x79b85a },
      { x: south.x - 6, y: south.y - 8, w: 30, h: 17, c: 0x4f823e },
      { x: south.x + 9, y: south.y - 7, w: 24, h: 14, c: 0x5d9446 },
    ];

    for (const blob of blobs) {
      graphics.fillStyle(0x142a12, 0.5);
      graphics.fillEllipse(blob.x, blob.y + 1, blob.w + 3, blob.h + 3);
      graphics.fillStyle(blob.c, 1);
      graphics.fillEllipse(blob.x, blob.y, blob.w, blob.h);
      graphics.fillStyle(0x9fca7b, 0.24);
      graphics.fillEllipse(blob.x - blob.w * 0.16, blob.y - blob.h * 0.18, blob.w * 0.45, blob.h * 0.34);
    }

    graphics.fillStyle(0x2f5f2b, 0.38);
    graphics.fillEllipse(center.x - 2, center.y + 9, 34, 9);

    graphics.fillStyle(0xb7dd8d, 0.78);
    graphics.fillCircle(west.x + 15, west.y + 3, 2);
    graphics.fillCircle(east.x - 13, east.y + 4 + jitter * 2, 1.7);
    graphics.fillCircle(center.x + 4, center.y - 5, 1.8);

    graphics.lineStyle(1.4, 0xc4e79b, 0.34);
    graphics.beginPath();
    graphics.moveTo(west.x + 13, west.y + 3);
    graphics.lineTo(center.x - 1, center.y - 6);
    graphics.lineTo(east.x - 11, east.y + 3);
    graphics.strokePath();
  }

  private drawDecorShadow(graphics: Phaser.GameObjects.Graphics, x: number, y: number, kind: DecorKind) {
    const width = kind.includes("tree") ? 18 : kind === "rock-large" ? 20 : 14;
    const alpha = kind === "flower" || kind === "grass-tuft" ? 0.1 : 0.18;
    graphics.fillStyle(0x16210f, alpha);
    graphics.fillEllipse(x, y - 1, width, 7);
  }

  private drawPineTree(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    graphics.fillStyle(0x5d3a1f, 1);
    graphics.fillRect(x - 2, y - 8 * scale, 4, 8 * scale);

    this.drawPineTier(graphics, x, y - 23 * scale, 10 * scale, 0x1f5a2d, 0x2f7a3b);
    this.drawPineTier(graphics, x, y - 16 * scale, 13 * scale, 0x246a32, 0x3f9148);
    this.drawPineTier(graphics, x, y - 9 * scale, 16 * scale, 0x2b7a3a, 0x4aa653);
  }

  private drawPineTier(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, dark: number, light: number) {
    graphics.fillStyle(dark, 1);
    graphics.fillTriangle(x, y - size, x - size, y + size * 0.45, x + size, y + size * 0.45);
    graphics.fillStyle(light, 0.45);
    graphics.fillTriangle(x - 1, y - size * 0.7, x - size * 0.55, y + size * 0.25, x + 2, y + size * 0.2);
  }

  private drawOakTree(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    graphics.fillStyle(0x6d4523, 1);
    graphics.fillRect(x - 2, y - 11 * scale, 4, 11 * scale);
    graphics.fillStyle(0x2f6f32, 1);
    graphics.fillCircle(x - 7 * scale, y - 14 * scale, 7 * scale);
    graphics.fillCircle(x + 6 * scale, y - 15 * scale, 8 * scale);
    graphics.fillCircle(x, y - 20 * scale, 8 * scale);
    graphics.fillStyle(0x4ca64f, 0.55);
    graphics.fillCircle(x - 4 * scale, y - 19 * scale, 4 * scale);
    graphics.fillCircle(x + 4 * scale, y - 17 * scale, 4 * scale);
  }

  private drawDeadTree(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    graphics.lineStyle(4, 0x4a2e1b, 1);
    graphics.beginPath();
    graphics.moveTo(x, y);
    graphics.lineTo(x, y - 20 * scale);
    graphics.strokePath();
    graphics.lineStyle(2, 0x6c4628, 1);
    graphics.beginPath();
    graphics.moveTo(x, y - 10 * scale);
    graphics.lineTo(x - 8 * scale, y - 17 * scale);
    graphics.moveTo(x, y - 13 * scale);
    graphics.lineTo(x + 9 * scale, y - 22 * scale);
    graphics.moveTo(x + 1, y - 7 * scale);
    graphics.lineTo(x + 6 * scale, y - 11 * scale);
    graphics.strokePath();
  }

  private drawPineGrove(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    this.drawObstacleBase(graphics, x, y + 1, scale, 0x29471f, 0x182d16, 0x102410);
    this.drawPineTree(graphics, x - 10 * scale, y + 1, scale * 0.92);
    this.drawPineTree(graphics, x + 9 * scale, y + 1, scale * 0.98);
    this.drawPineTree(graphics, x, y - 4 * scale, scale * 1.15);
    graphics.lineStyle(2, 0x123417, 0.75);
    graphics.beginPath();
    graphics.moveTo(x - 17 * scale, y - 4 * scale);
    graphics.lineTo(x, y - 33 * scale);
    graphics.lineTo(x + 18 * scale, y - 4 * scale);
    graphics.strokePath();
  }

  private drawOakGrove(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    this.drawObstacleBase(graphics, x, y + 1, scale, 0x315625, 0x1b3518, 0x132911);
    this.drawOakTree(graphics, x - 10 * scale, y + 1, scale * 0.9);
    this.drawOakTree(graphics, x + 9 * scale, y + 1, scale);
    this.drawOakTree(graphics, x, y - 4 * scale, scale * 1.08);
    graphics.fillStyle(0x173f1d, 0.7);
    graphics.fillEllipse(x, y - 17 * scale, 31 * scale, 21 * scale);
    graphics.fillStyle(0x5da85d, 0.28);
    graphics.fillEllipse(x - 6 * scale, y - 22 * scale, 15 * scale, 8 * scale);
  }

  private drawDeadGrove(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    this.drawObstacleBase(graphics, x, y + 1, scale, 0x4b3522, 0x2b1d13, 0x21150e);
    this.drawDeadTree(graphics, x - 10 * scale, y + 1, scale * 0.9);
    this.drawDeadTree(graphics, x + 9 * scale, y + 1, scale);
    this.drawDeadTree(graphics, x, y - 3 * scale, scale * 1.12);
    graphics.lineStyle(2, 0x21150d, 0.78);
    graphics.beginPath();
    graphics.moveTo(x - 17 * scale, y - 5 * scale);
    graphics.lineTo(x + 16 * scale, y - 7 * scale);
    graphics.strokePath();
  }

  private drawBoulderCluster(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    this.drawObstacleBase(graphics, x, y + 1, scale, 0x62686a, 0x3e4446, 0x2f3538);
    this.drawRockCluster(graphics, x - 4 * scale, y, scale * 1.1);
    graphics.fillStyle(0x4f5558, 1);
    graphics.fillCircle(x - 13 * scale, y - 5 * scale, 8 * scale);
    graphics.fillStyle(0x777d7e, 1);
    graphics.fillCircle(x + 12 * scale, y - 6 * scale, 9 * scale);
    graphics.fillStyle(0xa5a8a6, 0.42);
    graphics.fillCircle(x + 8 * scale, y - 10 * scale, 3 * scale);
    graphics.lineStyle(2, 0x2b2d2d, 0.9);
    graphics.beginPath();
    graphics.moveTo(x - 21 * scale, y - 2 * scale);
    graphics.lineTo(x - 8 * scale, y - 14 * scale);
    graphics.lineTo(x + 8 * scale, y - 15 * scale);
    graphics.lineTo(x + 22 * scale, y - 3 * scale);
    graphics.strokePath();
  }

  private drawObstacleBase(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    top: number,
    left: number,
    right: number
  ) {
    const halfW = 24 * scale;
    const halfH = 11 * scale;
    const drop = 7 * scale;

    graphics.fillStyle(0x070806, 0.32);
    graphics.fillEllipse(x, y + drop + 1, 56 * scale, 14 * scale);

    graphics.fillStyle(left, 1);
    graphics.beginPath();
    graphics.moveTo(x - halfW, y);
    graphics.lineTo(x, y + halfH);
    graphics.lineTo(x, y + halfH + drop);
    graphics.lineTo(x - halfW, y + drop);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(right, 1);
    graphics.beginPath();
    graphics.moveTo(x + halfW, y);
    graphics.lineTo(x, y + halfH);
    graphics.lineTo(x, y + halfH + drop);
    graphics.lineTo(x + halfW, y + drop);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(top, 1);
    drawDiamondPath(graphics, x, y);
    graphics.fillPath();
    graphics.lineStyle(1.5, 0x0b1209, 0.78);
    drawDiamondPath(graphics, x, y);
    graphics.strokePath();
  }

  private drawRockCluster(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    this.drawRock(graphics, x - 6 * scale, y - 4 * scale, 7 * scale, 5 * scale, 0x767d80);
    this.drawRock(graphics, x + 3 * scale, y - 6 * scale, 9 * scale, 7 * scale, 0x8b9294);
    this.drawRock(graphics, x + 9 * scale, y - 3 * scale, 5 * scale, 4 * scale, 0x686f72);
  }

  private drawSmallRock(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    this.drawRock(graphics, x, y - 4 * scale, 6 * scale, 4 * scale, 0x868d8f);
  }

  private drawRock(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, color: number) {
    graphics.fillStyle(color, 1);
    graphics.fillEllipse(x, y, width * 2, height * 2);
    graphics.fillStyle(0xb7bec0, 0.38);
    graphics.fillEllipse(x - width * 0.28, y - height * 0.35, width * 0.72, height * 0.5);
    graphics.lineStyle(1, 0x4f5759, 0.45);
    graphics.strokeEllipse(x, y, width * 2, height * 2);
  }

  private drawBush(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    graphics.fillStyle(0x2e682f, 1);
    graphics.fillCircle(x - 6 * scale, y - 5 * scale, 5 * scale);
    graphics.fillCircle(x, y - 8 * scale, 6 * scale);
    graphics.fillCircle(x + 6 * scale, y - 5 * scale, 5 * scale);
    graphics.fillStyle(0x55a34e, 0.45);
    graphics.fillCircle(x - 2 * scale, y - 10 * scale, 3 * scale);
    graphics.fillCircle(x + 5 * scale, y - 7 * scale, 2.5 * scale);
  }

  private drawFlowers(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, variant: number) {
    this.drawGrassTuft(graphics, x, y, scale * 0.85, variant);
    const colors = [0xff6f91, 0xffd166, 0xf6f7a8];
    for (let i = 0; i < 3; i++) {
      const px = x + (i - 1) * 4 * scale + (variant - 1);
      const py = y - (5 + (i % 2) * 2) * scale;
      graphics.fillStyle(colors[(variant + i) % colors.length], 1);
      graphics.fillCircle(px, py, 1.6 * scale);
      graphics.fillStyle(0xfff4b8, 0.7);
      graphics.fillCircle(px - 0.4, py - 0.4, 0.6 * scale);
    }
  }

  private drawGrassTuft(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, variant: number) {
    const blades = 5 + variant;
    graphics.lineStyle(1.5, 0x356f2f, 1);
    graphics.beginPath();
    for (let i = 0; i < blades; i++) {
      const offset = (i - (blades - 1) / 2) * 2.2 * scale;
      const lean = (i % 2 === 0 ? -1 : 1) * (1.4 + variant * 0.2) * scale;
      graphics.moveTo(x + offset, y);
      graphics.lineTo(x + offset + lean, y - (5 + (i % 3)) * scale);
    }
    graphics.strokePath();
    graphics.lineStyle(1, 0x6fbf5a, 0.6);
    graphics.beginPath();
    graphics.moveTo(x - 3 * scale, y - 1);
    graphics.lineTo(x - 4 * scale, y - 5 * scale);
    graphics.moveTo(x + 2 * scale, y - 1);
    graphics.lineTo(x + 3 * scale, y - 6 * scale);
    graphics.strokePath();
  }

  setObjects(objects: MapObjectData[]) {
    this.objects = objects;
    this.renderObjects();
  }

  setFog(visibleTiles: Set<string>, exploredTiles: Set<string>) {
    if (!this.map) return;
    this.visibleTiles = new Set(visibleTiles);
    const totalTiles = this.map.width * this.map.height;
    if (!this.fogTileStates || this.fogTileStates.length !== totalTiles || this.fogChunks.length === 0) {
      this.rebuildFogChunks();
      this.fogTileStates = new Uint8Array(totalTiles);
      this.fogTileStates.fill(FOG_TILE_UNINITIALIZED);
    }

    const dirtyChunkIndexes = new Set<number>();
    let mapObjectsDirty = false;
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const index = this.getFogTileIndex(x, y);
        const key = `${x},${y}`;
        const previousState = this.fogTileStates[index];
        const nextState = visibleTiles.has(key)
          ? FOG_TILE_VISIBLE
          : exploredTiles.has(key)
            ? FOG_TILE_EXPLORED
            : FOG_TILE_UNEXPLORED;

        if (previousState === nextState) continue;

        this.fogTileStates[index] = nextState;
        if ((previousState === FOG_TILE_VISIBLE) !== (nextState === FOG_TILE_VISIBLE)) {
          mapObjectsDirty = true;
        }
        this.markFogChunksDirtyForTile(dirtyChunkIndexes, x, y);
      }
    }

    if (mapObjectsDirty) this.renderMapTileObjects();
    if (dirtyChunkIndexes.size === 0) return;

    const sortedChunkIndexes = Array.from(dirtyChunkIndexes).sort((a, b) => a - b);
    for (const chunkIndex of sortedChunkIndexes) {
      const chunk = this.fogChunks[chunkIndex];
      if (chunk) this.redrawFogChunk(chunk);
    }
  }

  highlightPath(path: Position[]) {
    this.clearHighlights();
    this.drawDepthSortedDiamondOverlays(this.highlightOverlayObjects, path, 0xffff00, 0.08, 0.9, 2);
  }

  highlightPartialPath(reachable: Position[], unreachable: Position[], turnsLabel?: string) {
    this.clearDepthSortedOverlays(this.highlightOverlayObjects);
    this.highlightLayer.removeAll(true);
    this.movementLabelLayer.removeAll(true);
    this.drawDepthSortedDiamondOverlays(this.highlightOverlayObjects, reachable, 0xffff00, 0.08, 0.9, 2);
    this.drawDepthSortedDiamondOverlays(this.highlightOverlayObjects, unreachable, 0xff0000, 0.08, 0.9, 2);

    const labelTile = unreachable.at(-1) ?? reachable.at(-1);
    if (labelTile && turnsLabel) {
      const iso = cartToIso(labelTile.x, labelTile.y);
      const centerY = this.getSurfaceY(labelTile.x, labelTile.y);
      const badge = this.add.graphics();
      badge.fillStyle(0x1f1406, 0.82);
      badge.lineStyle(2, 0xffd166, 0.95);
      badge.fillCircle(iso.x, centerY, 12);
      badge.strokeCircle(iso.x, centerY, 12);
      this.movementLabelLayer.add(badge);

      const text = this.add.text(iso.x, centerY, turnsLabel, {
        color: "#ffffff",
        fontSize: "12px",
        fontStyle: "bold",
        stroke: "#1f1406",
        strokeThickness: 2,
      });
      text.setOrigin(0.5);
      this.movementLabelLayer.add(text);
    }
  }

  highlightTiles(tiles: Position[], color = REACHABLE_TILE_COLOR, alpha = REACHABLE_TILE_ALPHA) {
    this.clearReachable();
    this.drawDepthSortedDiamondOverlays(this.reachableOverlayObjects, tiles, color, Math.min(alpha, 0.08), 0.65, 1.5);
  }

  highlightTile(x: number, y: number, color = 0x00ff00) {
    this.clearHighlights();
    this.drawDepthSortedDiamondOverlays(this.highlightOverlayObjects, [{ x, y }], color, 0.08, 0.95, 2);
  }

  clearHighlights() {
    this.clearDepthSortedOverlays(this.highlightOverlayObjects);
    this.highlightLayer.removeAll(true);
    this.movementLabelLayer.removeAll(true);
  }

  clearReachable() {
    this.clearDepthSortedOverlays(this.reachableOverlayObjects);
    this.reachableLayer.removeAll(true);
  }

  centerOnTile(x: number, y: number) {
    const iso = cartToIso(x, y);
    const camera = this.cameras.main;
    camera.scrollX = iso.x - camera.width / 2;
    camera.scrollY = iso.y - camera.height / 2;
  }

  panCamera(dx: number, dy: number) {
    const camera = this.cameras.main;
    camera.scrollX -= dx / camera.zoom;
    camera.scrollY -= dy / camera.zoom;
  }

  zoomCamera(direction: number, screenX = this.cameras.main.width / 2, screenY = this.cameras.main.height / 2) {
    const camera = this.cameras.main;
    const before = camera.getWorldPoint(screenX, screenY);
    const factor = direction > 0 ? CAMERA_ZOOM_STEP : 1 / CAMERA_ZOOM_STEP;
    const nextZoom = Phaser.Math.Clamp(camera.zoom * factor, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);

    if (nextZoom === camera.zoom) return;

    camera.setZoom(nextZoom);
    const after = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
  }

  getTileAtScreen(screenX: number, screenY: number): Position | null {
    if (!this.map) return null;
    const world = this.cameras.main.getWorldPoint(screenX, screenY);
    let bestTile: Position | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const cart = isoToCart(world.x, world.y);
    const centerX = Math.round(cart.x);
    const centerY = Math.round(cart.y);

    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) continue;
        const iso = cartToIso(x, y);
        const surfaceY = this.getSurfaceY(x, y);
        const localX = world.x - iso.x;
        const localY = world.y - surfaceY;
        const score = Math.abs(localX) / (TILE_WIDTH / 2) + Math.abs(localY) / (TILE_HEIGHT / 2);
        if (score <= 1 && score < bestScore) {
          bestScore = score;
          bestTile = { x, y };
        }
      }
    }

    if (bestTile) return bestTile;

    if (centerX < 0 || centerX >= this.map.width || centerY < 0 || centerY >= this.map.height) {
      return null;
    }

    return { x: centerX, y: centerY };
  }

  getObjectsAtScreen(screenX: number, screenY: number) {
    const world = this.cameras.main.getWorldPoint(screenX, screenY);
    const objectHits = this.objects.filter((object) => this.isPointInsideObject(world.x, world.y, object));
    if (objectHits.length > 0) {
      return objectHits.sort((a, b) => this.getObjectDepth(b) - this.getObjectDepth(a));
    }

    const tile = this.getTileAtScreen(screenX, screenY);
    if (!tile) return [];
    return this.objects.filter((object) => object.x === tile.x && object.y === tile.y);
  }

  private isPointInsideObject(worldX: number, worldY: number, object: MapObjectData) {
    const bounds = this.getObjectHitBounds(object);
    if (!bounds) return false;

    return (
      worldX >= bounds.left &&
      worldX <= bounds.right &&
      worldY >= bounds.top &&
      worldY <= bounds.bottom
    );
  }

  private getObjectHitBounds(object: MapObjectData) {
    const visual = this.getObjectBounds(object);
    if (!visual) return null;

    const width = visual.right - visual.left;
    const height = visual.bottom - visual.top;
    const centerX = visual.left + width / 2;
    const bottom = visual.bottom;
    const scale = getObjectHitboxScale(object);
    const hitWidth = width * scale.width;
    const hitHeight = height * scale.height;

    return {
      left: centerX - hitWidth / 2,
      right: centerX + hitWidth / 2,
      top: bottom - hitHeight,
      bottom,
    };
  }

  private getObjectBounds(object: MapObjectData) {
    const iso = cartToIso(object.x, object.y);
    const surfaceY = this.getSurfaceY(object.x, object.y);
    const metrics = getObjectMetrics(object);
    if (!metrics) return null;

    const renderX = iso.x + (object.renderOffsetX ?? 0);
    const renderY = surfaceY + metrics.offsetY + (object.renderOffsetY ?? 0);
    const origin = getOriginForObject(object);
    return {
      left: renderX - metrics.width * origin.originX,
      right: renderX + metrics.width * (1 - origin.originX),
      top: renderY - metrics.height * origin.originY,
      bottom: renderY + metrics.height * (1 - origin.originY),
    };
  }

  private getObjectDepth(object: MapObjectData) {
    const metrics = getObjectMetrics(object);
    return this.getSurfaceY(object.x, object.y) + (metrics?.offsetY ?? 0) + (object.renderOffsetY ?? 0);
  }

  private renderTile(
    tile: MapTile,
    isoX: number,
    isoY: number,
    baseGraphics: Phaser.GameObjects.Graphics,
    coverGraphics: Phaser.GameObjects.Graphics
  ) {
    const depth = getTileDepth(tile);
    const topColor = TERRAIN_TOP[tile.terrain] ?? 0x333333;
    const sideLit = TERRAIN_SIDE_LIT[tile.terrain] ?? 0x333333;
    const sideDark = TERRAIN_SIDE_DARK[tile.terrain] ?? 0x333333;
    const terrainTexture = pickTerrainTexture(tile);
    const visibleSides = depth > 0 ? this.getVisibleTerrainSides(tile, depth) : null;

    if (depth > BASE_HEIGHT && tile.terrain !== TerrainType.WATER) {
      this.renderElevatedTerrainTile(tile, isoX, isoY, depth, topColor, sideLit, sideDark, terrainTexture, visibleSides);
      return;
    }

    if (visibleSides) {
      for (const side of TERRAIN_FACE_RENDER_ORDER) {
        const exposure = visibleSides[side];
        if (!exposure) continue;

        const points = getTerrainSideFacePoints(side, isoX, isoY, depth, exposure.bottomDepth);
        const baseColor = side === "left" ? sideLit : sideDark;
        coverGraphics.fillStyle(getTerrainSideFaceColor(tile.terrain, baseColor, exposure));
        coverGraphics.beginPath();
        coverGraphics.moveTo(points.topA.x, points.topA.y);
        coverGraphics.lineTo(points.topB.x, points.topB.y);
        coverGraphics.lineTo(points.bottomB.x, points.bottomB.y);
        coverGraphics.lineTo(points.bottomA.x, points.bottomA.y);
        coverGraphics.closePath();
        coverGraphics.fillPath();
      }

      drawTerrainSideDetails(coverGraphics, tile, visibleSides, isoX, isoY, depth);
    }

    const topStroke = getTerrainTopStroke(tile.terrain);
    baseGraphics.fillStyle(topColor, tile.terrain === TerrainType.WATER ? 0.7 : 1);
    baseGraphics.lineStyle(topStroke.width, topStroke.color, topStroke.alpha);
    drawDiamondPath(baseGraphics, isoX, isoY - depth);
    baseGraphics.fillPath();
    const renderedTopTexture = this.renderTerrainTopTexture(terrainTexture, tile, isoX, isoY - depth);
    if (tile.terrain === TerrainType.WATER) {
      this.addWaterAnimation(tile, isoX, isoY - depth);
    } else if (tile.terrain === TerrainType.LAVA) {
      if (!renderedTopTexture) drawTileTexture(baseGraphics, tile, isoX, isoY - depth);
      this.addLavaAnimation(tile, isoX, isoY - depth);
    } else {
      if (!renderedTopTexture) drawTileTexture(baseGraphics, tile, isoX, isoY - depth);
      if (!renderedTopTexture) {
        baseGraphics.lineStyle(topStroke.width, topStroke.color, topStroke.alpha);
        drawDiamondPath(baseGraphics, isoX, isoY - depth);
        baseGraphics.strokePath();
      }
      this.drawRoad(coverGraphics, tile, isoX, isoY - depth);
    }

    if (tile.terrain === TerrainType.WATER && tile.road) {
      this.drawRoad(coverGraphics, tile, isoX, isoY - depth);
    }

    if (visibleSides) {
      drawTerrainSideEdges(coverGraphics, tile, visibleSides, isoX, isoY, depth);
    }

  }

  private renderElevatedTerrainTile(
    tile: MapTile,
    isoX: number,
    isoY: number,
    depth: number,
    topColor: number,
    sideLit: number,
    sideDark: number,
    terrainTexture: TerrainTopTexture | null,
    visibleSides: TerrainSideVisibility | null
  ) {
    const tileGraphics = this.add.graphics();
    const tileDepth = isoY + 0.1;
    const topY = isoY - depth;
    tileGraphics.setDepth(tileDepth);

    if (visibleSides) {
      for (const side of TERRAIN_FACE_RENDER_ORDER) {
        const exposure = visibleSides[side];
        if (!exposure) continue;

        const points = getTerrainSideFacePoints(side, isoX, isoY, depth, exposure.bottomDepth);
        const baseColor = side === "left" ? sideLit : sideDark;
        tileGraphics.fillStyle(getTerrainSideFaceColor(tile.terrain, baseColor, exposure));
        tileGraphics.beginPath();
        tileGraphics.moveTo(points.topA.x, points.topA.y);
        tileGraphics.lineTo(points.topB.x, points.topB.y);
        tileGraphics.lineTo(points.bottomB.x, points.bottomB.y);
        tileGraphics.lineTo(points.bottomA.x, points.bottomA.y);
        tileGraphics.closePath();
        tileGraphics.fillPath();
      }

      drawTerrainSideDetails(tileGraphics, tile, visibleSides, isoX, isoY, depth);
    }

    const topStroke = getTerrainTopStroke(tile.terrain);
    tileGraphics.fillStyle(topColor, 1);
    tileGraphics.lineStyle(topStroke.width, topStroke.color, topStroke.alpha);
    drawDiamondPath(tileGraphics, isoX, topY);
    tileGraphics.fillPath();

    const renderedTopTexture = this.renderTerrainTopTexture(terrainTexture, tile, isoX, topY, tileDepth + 0.01);
    if (tile.terrain === TerrainType.LAVA) {
      if (!renderedTopTexture) drawTileTexture(tileGraphics, tile, isoX, topY);
      this.addLavaAnimation(tile, isoX, topY, tileDepth + 0.01);
    } else {
      if (!renderedTopTexture) drawTileTexture(tileGraphics, tile, isoX, topY);
      if (!renderedTopTexture) {
        tileGraphics.lineStyle(topStroke.width, topStroke.color, topStroke.alpha);
        drawDiamondPath(tileGraphics, isoX, topY);
        tileGraphics.strokePath();
      }
      this.drawRoad(tileGraphics, tile, isoX, topY);
    }

    if (visibleSides) {
      drawTerrainSideEdges(tileGraphics, tile, visibleSides, isoX, isoY, depth);
    }

    this.mapLayer.add(tileGraphics);

  }

  private renderMapTileObjects() {
    if (!this.map) return;

    this.mapObjectLayer.removeAll(true);
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.tiles[y]?.[x];
        if (!tile?.object || !this.shouldRenderMapTileObject(tile)) continue;

        const iso = cartToIso(x, y);
        this.renderMapObject(tile.object, iso.x, this.getSurfaceY(x, y));
      }
    }
    this.mapObjectLayer.sort("depth");
  }

  private shouldRenderMapTileObject(tile: MapTile) {
    return !this.visibleTiles || this.visibleTiles.has(`${tile.x},${tile.y}`);
  }

  private getVisibleTerrainSides(tile: MapTile, depth: number) {
    const southWest = this.map?.tiles[tile.y + 1]?.[tile.x];
    const southEast = this.map?.tiles[tile.y]?.[tile.x + 1];
    return {
      left: getTerrainSideExposure(depth, southWest),
      right: getTerrainSideExposure(depth, southEast),
    };
  }

  private renderTerrainTopTexture(
    texture: TerrainTopTexture | null,
    tile: MapTile,
    isoX: number,
    isoY: number,
    depth = isoY - 0.25,
    layer: Phaser.GameObjects.Container = this.mapLayer
  ) {
    if (!texture) return false;

    const transform = getTerrainTopTextureTransform(tile);
    const sprite = this.add.image(isoX, isoY, texture.path);
    applyTerrainTopTextureCrop(sprite);
    sprite.setOrigin(0.5);
    sprite.setDisplaySize(TILE_WIDTH, TILE_HEIGHT);
    sprite.setAngle(transform.angle);
    sprite.setFlip(transform.flipX, transform.flipY);
    sprite.setDepth(depth);
    layer.add(sprite);
    return true;
  }

  private addWaterAnimation(tile: MapTile, isoX: number, isoY: number, depth = isoY - 0.25) {
    const frameOffset = getTerrainFrameOffset(tile.x, tile.y);
    const sprite = this.add.image(isoX, isoY, getTerrainTextureKey(WATER_TEXTURE_PREFIX, frameOffset));
    sprite.setOrigin(0.5);
    sprite.setDepth(depth);
    this.waterTiles.push({ sprite, x: isoX, y: isoY, frameOffset, frameIndex: frameOffset });
    this.mapLayer.add(sprite);
  }

  private addLavaAnimation(tile: MapTile, isoX: number, isoY: number, depth = isoY - 0.25) {
    const frameOffset = getTerrainFrameOffset(tile.x, tile.y);
    const sprite = this.add.image(isoX, isoY, getTerrainTextureKey(LAVA_TEXTURE_PREFIX, frameOffset));
    sprite.setOrigin(0.5);
    sprite.setDepth(depth);
    this.lavaTiles.push({ sprite, x: isoX, y: isoY, frameOffset, frameIndex: frameOffset });
    this.mapLayer.add(sprite);
  }

  private renderMapObject(
    object: MapObject,
    isoX: number,
    isoY: number
  ) {
    if (object.type === "resource" && object.subtype) {
      const sprite = this.add.image(isoX, isoY + RESOURCE_PICKUP_OFFSET_Y, MAP_SPRITES.resources[object.subtype]);
      const origin = getOriginForMapTileObject(object);
      sprite.setOrigin(origin.originX, origin.originY);
      sprite.setDisplaySize(38, 38);
      sprite.setDepth(isoY + RESOURCE_PICKUP_OFFSET_Y);
      this.mapObjectLayer.add(sprite);
    } else if (object.type === "monster") {
      const sprite = this.add.image(isoX, isoY + MONSTER_OFFSET_Y, getMonsterSpritePath(object.subtype));
      const origin = getOriginForMapTileObject(object);
      sprite.setOrigin(origin.originX, origin.originY);
      sprite.setDisplaySize(46, 46);
      sprite.setDepth(isoY + MONSTER_OFFSET_Y);
      this.mapObjectLayer.add(sprite);
    } else if (object.type === "wall" && object.subtype === "brick") {
      this.addBrickRampartSprite(isoX, isoY);
    }
    // Note: natural walls are rendered via decorLayer.
  }

  private addBrickRampartSprite(isoX: number, isoY: number) {
    const placement = getBrickRampartPlacement();
    const sprite = this.add.image(isoX + placement.offsetX, isoY + placement.offsetY, MAP_SPRITES.decor.wall_rampart);
    sprite.setOrigin(placement.originX, MAP_OBJECT_ORIGIN_Y);
    sprite.setDisplaySize(placement.width, placement.height);
    sprite.setDepth(isoY + placement.offsetY);
    this.mapObjectLayer.add(sprite);
  }

  private drawBrickRampart(isoX: number, isoY: number, tile?: MapTile) {
    const graphics = this.add.graphics();
    const orientation = this.getWallOrientation(tile);
    const axis = getBrickWallAxis(orientation);
    const height = 54;
    const baseY = isoY + 13;
    const topY = baseY - height;
    const halfLength = axis.long;
    const halfWidth = axis.thick;
    const along = axis.along;
    const across = axis.across;

    const topA = {
      x: isoX - along.x * halfLength - across.x * halfWidth,
      y: topY - along.y * halfLength - across.y * halfWidth,
    };
    const topB = {
      x: isoX + along.x * halfLength - across.x * halfWidth,
      y: topY + along.y * halfLength - across.y * halfWidth,
    };
    const topC = {
      x: isoX + along.x * halfLength + across.x * halfWidth,
      y: topY + along.y * halfLength + across.y * halfWidth,
    };
    const topD = {
      x: isoX - along.x * halfLength + across.x * halfWidth,
      y: topY - along.y * halfLength + across.y * halfWidth,
    };
    const baseA = { x: topA.x, y: topA.y + height };
    const baseB = { x: topB.x, y: topB.y + height };
    const baseC = { x: topC.x, y: topC.y + height };
    const baseD = { x: topD.x, y: topD.y + height };

    graphics.fillStyle(0x050403, 0.22);
    graphics.fillEllipse(isoX, baseY + 5, axis.shadowWidth, 18);

    this.drawRampartFace(graphics, topD, topC, baseD, baseC, 0x5f584c);
    this.drawRampartFace(graphics, topC, topB, baseC, baseB, 0x4b443b);
    this.drawRampartFace(graphics, topA, topD, baseA, baseD, 0x756d5d);

    graphics.fillStyle(0xa79b82, 1);
    graphics.lineStyle(2, 0x2f2922, 0.9);
    graphics.beginPath();
    graphics.moveTo(topA.x, topA.y);
    graphics.lineTo(topB.x, topB.y);
    graphics.lineTo(topC.x, topC.y);
    graphics.lineTo(topD.x, topD.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    this.drawRampartTopStones(graphics, topA, topB, topC, topD);
    this.drawRampartCrenels(graphics, topA, topB, topC, topD, axis.crenelCount);

    graphics.setDepth(baseY + 5);
    this.mapObjectLayer.add(graphics);
  }

  private drawRampartFace(
    graphics: Phaser.GameObjects.Graphics,
    topA: Position,
    topB: Position,
    bottomA: Position,
    bottomB: Position,
    color: number
  ) {
    graphics.fillStyle(color, 1);
    graphics.lineStyle(1, 0x2f2922, 0.72);
    graphics.beginPath();
    graphics.moveTo(topA.x, topA.y);
    graphics.lineTo(topB.x, topB.y);
    graphics.lineTo(bottomB.x, bottomB.y);
    graphics.lineTo(bottomA.x, bottomA.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    graphics.lineStyle(1, 0x2b261f, 0.28);
    for (const t of [0.28, 0.52, 0.76]) {
      const left = lerpPoint(topA, bottomA, t);
      const right = lerpPoint(topB, bottomB, t);
      graphics.beginPath();
      graphics.moveTo(left.x + 2, left.y);
      graphics.lineTo(right.x - 2, right.y);
      graphics.strokePath();
    }

    graphics.lineStyle(1, 0xd4c69f, 0.18);
    const highlightA = lerpPoint(topA, bottomA, 0.12);
    const highlightB = lerpPoint(topB, bottomB, 0.12);
    graphics.beginPath();
    graphics.moveTo(highlightA.x + 2, highlightA.y);
    graphics.lineTo(highlightB.x - 2, highlightB.y);
    graphics.strokePath();
  }

  private drawRampartTopStones(
    graphics: Phaser.GameObjects.Graphics,
    topA: Position,
    topB: Position,
    topC: Position,
    topD: Position
  ) {
    graphics.lineStyle(1, 0x594f40, 0.45);
    for (const t of [0.25, 0.5, 0.75]) {
      const near = lerpPoint(topD, topC, t);
      const far = lerpPoint(topA, topB, t);
      graphics.beginPath();
      graphics.moveTo(near.x, near.y);
      graphics.lineTo(far.x, far.y);
      graphics.strokePath();
    }

    graphics.lineStyle(1, 0xd9cba4, 0.28);
    graphics.beginPath();
    graphics.moveTo(topA.x + (topB.x - topA.x) * 0.08, topA.y + (topB.y - topA.y) * 0.08 + 1);
    graphics.lineTo(topA.x + (topB.x - topA.x) * 0.92, topA.y + (topB.y - topA.y) * 0.92 + 1);
    graphics.strokePath();
  }

  private drawRampartCrenels(
    graphics: Phaser.GameObjects.Graphics,
    topA: Position,
    topB: Position,
    topC: Position,
    topD: Position,
    count: number
  ) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      const front = lerpPoint(topD, topC, t);
      const back = lerpPoint(topA, topB, t);
      const center = lerpPoint(front, back, 0.22);
      this.drawRampartCrenel(graphics, center.x, center.y - 8);
    }
  }

  private drawRampartCrenel(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    const top = { x, y: y - 10 };
    const right = { x: x + 7, y: y - 6 };
    const bottom = { x, y: y - 1 };
    const left = { x: x - 7, y: y - 6 };
    const drop = 11;

    this.drawRampartFace(graphics, left, bottom, { x: left.x, y: left.y + drop }, { x: bottom.x, y: bottom.y + drop }, 0x6d6556);
    this.drawRampartFace(graphics, bottom, right, { x: bottom.x, y: bottom.y + drop }, { x: right.x, y: right.y + drop }, 0x514a40);

    graphics.fillStyle(0xb0a286, 1);
    graphics.lineStyle(1, 0x302921, 0.9);
    graphics.beginPath();
    graphics.moveTo(top.x, top.y);
    graphics.lineTo(right.x, right.y);
    graphics.lineTo(bottom.x, bottom.y);
    graphics.lineTo(left.x, left.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  private drawBrickWall(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, tile?: MapTile) {
    const orientation = this.getWallOrientation(tile);
    this.drawWallSegment(graphics, isoX, isoY, orientation);
  }

  private drawBrickWallBlock(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, tile?: MapTile) {
    const topY = isoY - 24;
    const baseY = isoY + 4;
    const drop = baseY - topY;
    const north = { x: isoX, y: topY - TILE_HEIGHT / 2 };
    const east = { x: isoX + TILE_WIDTH / 2, y: topY };
    const south = { x: isoX, y: topY + TILE_HEIGHT / 2 };
    const west = { x: isoX - TILE_WIDTH / 2, y: topY };
    const baseNorth = { x: north.x, y: north.y + drop };
    const baseEast = { x: east.x, y: east.y + drop };
    const baseSouth = { x: south.x, y: south.y + drop };
    const baseWest = { x: west.x, y: west.y + drop };
    const exposed = this.getExposedWallSides(tile);

    graphics.fillStyle(0x050403, 0.24);
    drawDiamondPath(graphics, isoX, isoY + 6);
    graphics.fillPath();

    if (exposed.northEast) this.drawWallFace(graphics, north, east, baseNorth, baseEast, 0x5f5548, 0.86);
    if (exposed.southEast) this.drawWallFace(graphics, east, south, baseEast, baseSouth, 0x4f4539, 1);
    if (exposed.southWest) this.drawWallFace(graphics, south, west, baseSouth, baseWest, 0x3f372f, 1);
    if (exposed.northWest) this.drawWallFace(graphics, west, north, baseWest, baseNorth, 0x6e6252, 0.75);

    graphics.fillStyle(0x96876f, 1);
    graphics.lineStyle(1.5, 0x2b241d, 0.95);
    graphics.beginPath();
    graphics.moveTo(north.x, north.y);
    graphics.lineTo(east.x, east.y);
    graphics.lineTo(south.x, south.y);
    graphics.lineTo(west.x, west.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    this.drawWallTopMasonry(graphics, north, east, south, west);

    if (exposed.southEast) this.drawWallBattlements(graphics, east, south);
    if (exposed.southWest) this.drawWallBattlements(graphics, south, west);
    if (exposed.northEast) this.drawWallCapstones(graphics, north, east);
    if (exposed.northWest) this.drawWallCapstones(graphics, west, north);
  }

  private drawWallSegment(
    graphics: Phaser.GameObjects.Graphics,
    isoX: number,
    isoY: number,
    orientation: BrickWallOrientation
  ) {
    const { dir, normal } = getBrickWallVectors(orientation);
    const height = 13;
    const lift = { x: 0, y: -height };

    const a = { x: isoX - dir.x, y: isoY - dir.y + 5 };
    const b = { x: isoX + dir.x, y: isoY + dir.y + 5 };
    const c = { x: b.x + normal.x, y: b.y + normal.y };
    const d = { x: a.x + normal.x, y: a.y + normal.y };
    const at = { x: a.x + lift.x, y: a.y + lift.y };
    const bt = { x: b.x + lift.x, y: b.y + lift.y };
    const ct = { x: c.x + lift.x, y: c.y + lift.y };
    const dt = { x: d.x + lift.x, y: d.y + lift.y };

    graphics.fillStyle(0x060504, 0.2);
    graphics.beginPath();
    graphics.moveTo(a.x - normal.x * 0.55, a.y + 5);
    graphics.lineTo(b.x - normal.x * 0.55, b.y + 5);
    graphics.lineTo(c.x + normal.x * 0.65, c.y + 8);
    graphics.lineTo(d.x + normal.x * 0.65, d.y + 8);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(0x6b6254, 1);
    graphics.lineStyle(1, 0x322b23, 0.78);
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.lineTo(bt.x, bt.y);
    graphics.lineTo(at.x, at.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    graphics.fillStyle(0x4b4339, 1);
    graphics.beginPath();
    graphics.moveTo(d.x, d.y);
    graphics.lineTo(c.x, c.y);
    graphics.lineTo(ct.x, ct.y);
    graphics.lineTo(dt.x, dt.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    graphics.fillStyle(0x9a8c75, 1);
    graphics.beginPath();
    graphics.moveTo(at.x, at.y);
    graphics.lineTo(bt.x, bt.y);
    graphics.lineTo(ct.x, ct.y);
    graphics.lineTo(dt.x, dt.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    // Mortar joints on the front face — gives stone-block texture without
    // breaking the continuity of the parapet.
    graphics.fillStyle(0x766b58, 1);
    for (const t of [0.22, 0.5, 0.78]) {
      const edge = lerpPoint(at, bt, t);
      const inner = lerpPoint(dt, ct, t);
      const stone = lerpPoint(edge, inner, 0.46);
      graphics.beginPath();
      graphics.moveTo(stone.x - 5, stone.y - 2);
      graphics.lineTo(stone.x + 5, stone.y - 2);
      graphics.lineTo(stone.x + 7, stone.y + 2);
      graphics.lineTo(stone.x - 3, stone.y + 3);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
    }

    // A horizontal stone-course line halfway up the front face — adds a "real wall"
    // bond pattern without any spikes on top.
    graphics.lineStyle(1, 0x2f2923, 0.26);
    graphics.beginPath();
    graphics.moveTo(d.x + (c.x - d.x) * 0.06, d.y + (c.y - d.y) * 0.06 - height * 0.5);
    graphics.lineTo(d.x + (c.x - d.x) * 0.94, d.y + (c.y - d.y) * 0.94 - height * 0.5);
    graphics.strokePath();

    // Soft highlight along the front-top edge of the parapet for relief.
    graphics.lineStyle(1, 0xc5b791, 0.34);
    graphics.beginPath();
    graphics.moveTo(at.x + (bt.x - at.x) * 0.08, at.y + (bt.y - at.y) * 0.08 + 1);
    graphics.lineTo(at.x + (bt.x - at.x) * 0.92, at.y + (bt.y - at.y) * 0.92 + 1);
    graphics.strokePath();
  }

  private drawWallPillar(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number) {
    // Flat corner stone at intersections — flush with parapet height (no taller),
    // just a small reinforced block to mask the seam between two crossing segments.
    const cy = isoY + 4;
    const topY = isoY - 20 + 4;
    const baseY = cy + 4;

    // Faint ground shadow.
    graphics.fillStyle(0x060504, 0.22);
    graphics.fillEllipse(isoX, baseY + 2, 16, 6);

    // Body block (slightly wider than the slab thickness so it reads as a corner stone).
    graphics.fillStyle(0x4c4339, 1);
    graphics.lineStyle(1, 0x2d251d, 0.85);
    graphics.fillRect(isoX - 5, topY + 4, 10, baseY - topY - 4);
    graphics.strokeRect(isoX - 5, topY + 4, 10, baseY - topY - 4);

    // Parapet cap, same color/height as the slab tops — flush continuity.
    graphics.fillStyle(0x8f806a, 1);
    graphics.fillRect(isoX - 7, topY, 14, 5);
    graphics.strokeRect(isoX - 7, topY, 14, 5);

    // A subtle highlight on the cap edge.
    graphics.lineStyle(1, 0xb8aa8a, 0.35);
    graphics.beginPath();
    graphics.moveTo(isoX - 5, topY + 1);
    graphics.lineTo(isoX + 5, topY + 1);
    graphics.strokePath();
  }

  private getWallOrientation(tile?: MapTile): BrickWallOrientation {
    if (!tile || !this.map) return "x";

    const axes = [
      {
        orientation: "x" as const,
        count: this.countBrickWallNeighbors(tile, [
          [-1, 0],
          [1, 0],
        ]),
      },
      {
        orientation: "y" as const,
        count: this.countBrickWallNeighbors(tile, [
          [0, -1],
          [0, 1],
        ]),
      },
      {
        orientation: "diagonalDown" as const,
        count: this.countBrickWallNeighbors(tile, [
          [-1, -1],
          [1, 1],
        ]),
      },
      {
        orientation: "diagonalUp" as const,
        count: this.countBrickWallNeighbors(tile, [
          [-1, 1],
          [1, -1],
        ]),
      },
    ].sort((a, b) => b.count - a.count);

    return axes[0].count > 0 ? axes[0].orientation : "x";
  }

  private countBrickWallNeighbors(tile: MapTile, offsets: [number, number][]) {
    return offsets.reduce((total, [dx, dy]) => total + (this.isBrickWall(tile.x + dx, tile.y + dy) ? 1 : 0), 0);
  }

  private isWallJunction(tile?: MapTile) {
    if (!tile || !this.map) return false;

    const connectedAxes = [
      this.countBrickWallNeighbors(tile, [
        [-1, 0],
        [1, 0],
      ]),
      this.countBrickWallNeighbors(tile, [
        [0, -1],
        [0, 1],
      ]),
      this.countBrickWallNeighbors(tile, [
        [-1, -1],
        [1, 1],
      ]),
      this.countBrickWallNeighbors(tile, [
        [-1, 1],
        [1, -1],
      ]),
    ].filter((count) => count > 0);

    return connectedAxes.length > 1;
  }

  private getExposedWallSides(tile?: MapTile) {
    if (!tile || !this.map) {
      return { northEast: true, southEast: true, southWest: true, northWest: true };
    }

    return {
      northEast: !this.isBrickWall(tile.x, tile.y - 1),
      southEast: !this.isBrickWall(tile.x + 1, tile.y),
      southWest: !this.isBrickWall(tile.x, tile.y + 1),
      northWest: !this.isBrickWall(tile.x - 1, tile.y),
    };
  }

  private getExposedNaturalWallSides(tile?: MapTile) {
    if (!tile || !this.map) {
      return { northEast: true, southEast: true, southWest: true, northWest: true };
    }

    return {
      northEast: !this.isNaturalWall(tile.x, tile.y - 1),
      southEast: !this.isNaturalWall(tile.x + 1, tile.y),
      southWest: !this.isNaturalWall(tile.x, tile.y + 1),
      northWest: !this.isNaturalWall(tile.x - 1, tile.y),
    };
  }

  private isNaturalWall(x: number, y: number) {
    const object = this.map?.tiles[y]?.[x]?.object;
    return object?.type === "wall" && object.subtype === "natural";
  }

  private drawWallFace(
    graphics: Phaser.GameObjects.Graphics,
    topA: Position,
    topB: Position,
    bottomA: Position,
    bottomB: Position,
    color: number,
    alpha: number
  ) {
    graphics.fillStyle(color, alpha);
    graphics.lineStyle(1, 0x261f19, 0.8);
    graphics.beginPath();
    graphics.moveTo(topA.x, topA.y);
    graphics.lineTo(topB.x, topB.y);
    graphics.lineTo(bottomB.x, bottomB.y);
    graphics.lineTo(bottomA.x, bottomA.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    graphics.lineStyle(1, 0x2f281f, 0.28);
    for (let i = 1; i < 3; i++) {
      const t = i / 3;
      const a = lerpPoint(topA, bottomA, t);
      const b = lerpPoint(topB, bottomB, t);
      graphics.beginPath();
      graphics.moveTo(a.x, a.y);
      graphics.lineTo(b.x, b.y);
      graphics.strokePath();
    }

    for (let i = 1; i < 3; i++) {
      const t = i / 3;
      const a = lerpPoint(topA, topB, t);
      const b = lerpPoint(bottomA, bottomB, t);
      graphics.beginPath();
      graphics.moveTo(a.x, a.y);
      graphics.lineTo(b.x, b.y);
      graphics.strokePath();
    }
  }

  private drawWallTopMasonry(
    graphics: Phaser.GameObjects.Graphics,
    north: Position,
    east: Position,
    south: Position,
    west: Position
  ) {
    const nwA = lerpPoint(north, west, 0.42);
    const esA = lerpPoint(east, south, 0.42);
    const neA = lerpPoint(north, east, 0.42);
    const wsA = lerpPoint(west, south, 0.42);
    const nwB = lerpPoint(north, west, 0.72);
    const esB = lerpPoint(east, south, 0.72);
    const neB = lerpPoint(north, east, 0.72);
    const wsB = lerpPoint(west, south, 0.72);

    graphics.lineStyle(1, 0x544938, 0.45);
    graphics.beginPath();
    graphics.moveTo(nwA.x, nwA.y);
    graphics.lineTo(esA.x, esA.y);
    graphics.moveTo(neA.x, neA.y);
    graphics.lineTo(wsA.x, wsA.y);
    graphics.moveTo(nwB.x, nwB.y);
    graphics.lineTo(esB.x, esB.y);
    graphics.moveTo(neB.x, neB.y);
    graphics.lineTo(wsB.x, wsB.y);
    graphics.strokePath();

    graphics.lineStyle(1, 0xc4b28c, 0.28);
    graphics.beginPath();
    graphics.moveTo(north.x + 3, north.y + 3);
    graphics.lineTo(east.x - 5, east.y + 1);
    graphics.strokePath();
  }

  private drawWallBattlements(graphics: Phaser.GameObjects.Graphics, from: Position, to: Position) {
    for (const t of [0.32, 0.68]) {
      const center = lerpPoint(from, to, t);
      this.drawWallMerlon(graphics, center.x, center.y - 5);
    }
  }

  private drawWallCapstones(graphics: Phaser.GameObjects.Graphics, from: Position, to: Position) {
    graphics.lineStyle(2, 0x7a6d58, 0.65);
    graphics.beginPath();
    graphics.moveTo(from.x + (to.x - from.x) * 0.15, from.y + (to.y - from.y) * 0.15);
    graphics.lineTo(from.x + (to.x - from.x) * 0.85, from.y + (to.y - from.y) * 0.85);
    graphics.strokePath();
  }

  private drawWallMerlon(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    const north = { x, y: y - 5 };
    const east = { x: x + 7, y: y - 1 };
    const south = { x, y: y + 4 };
    const west = { x: x - 7, y: y - 1 };
    const drop = 7;

    this.drawWallFace(
      graphics,
      east,
      south,
      { x: east.x, y: east.y + drop },
      { x: south.x, y: south.y + drop },
      0x5b5042,
      1
    );
    this.drawWallFace(
      graphics,
      south,
      west,
      { x: south.x, y: south.y + drop },
      { x: west.x, y: west.y + drop },
      0x443b31,
      1
    );

    graphics.fillStyle(0xa69778, 1);
    graphics.lineStyle(1, 0x2c251d, 0.9);
    graphics.beginPath();
    graphics.moveTo(north.x, north.y);
    graphics.lineTo(east.x, east.y);
    graphics.lineTo(south.x, south.y);
    graphics.lineTo(west.x, west.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  private isBrickWall(x: number, y: number) {
    return this.map?.tiles[y]?.[x]?.object?.type === "wall" && this.map.tiles[y][x].object?.subtype === "brick";
  }

  private renderObjects() {
    if (!this.map || !this.objectLayer) return;
    this.clearHoverLabel();
    const nextHeroAnimations: HeroSpriteAnimation[] = [];
    const seenHeroIds = new Set<string>();
    const seenStaticIds = new Set<string>();

    for (const object of this.objects) {
      if (object.type === "hero") {
        seenHeroIds.add(object.id);
        const previous = this.renderedHeroes.get(object.id);
        let rendered: RenderedHeroObject | null | undefined = previous;

        if (!rendered || !previous || shouldRebuildHero(previous.object, object)) {
          this.destroyRenderedHero(object.id);
          rendered = this.createRenderedHero(object);
        } else {
          this.updateRenderedHeroObject(rendered, object);
        }

        if (rendered) {
          nextHeroAnimations.push(rendered.animation);
        }
        continue;
      }

      seenStaticIds.add(object.id);
      const previous = this.renderedStaticObjects.get(object.id);
      if (!previous || !areObjectsRenderEquivalent(previous.object, object)) {
        this.destroyRenderedStaticObject(object.id);
        this.createRenderedStaticObject(object);
      } else {
        previous.object = object;
      }
    }

    for (const heroId of Array.from(this.renderedHeroes.keys())) {
      if (!seenHeroIds.has(heroId)) {
        this.destroyRenderedHero(heroId);
      }
    }

    for (const objectId of Array.from(this.renderedStaticObjects.keys())) {
      if (!seenStaticIds.has(objectId)) {
        this.destroyRenderedStaticObject(objectId);
      }
    }

    this.heroSpriteAnimations = nextHeroAnimations;
    this.objectLayer.sort("depth");
  }

  private createRenderedHero(object: MapObjectData) {
    const metrics = getObjectMetrics(object);
    if (!metrics) return null;

    const iso = cartToIso(object.x, object.y);
    const surfaceY = this.getSurfaceY(object.x, object.y);
    const direction = this.heroDirections.get(object.id) ?? "se";
    const renderX = iso.x + (object.renderOffsetX ?? 0);
    const renderY = surfaceY + metrics.offsetY + (object.renderOffsetY ?? 0);
    const sprite = this.addHeroSprite(object, renderX, renderY, metrics.width, metrics.height, direction);
    if (!sprite) return null;

    const bannerMetrics = getHeroBannerMetrics(object);
    const animation = {
      sprite,
      baseY: sprite.y,
      baseScaleX: sprite.scaleX,
      baseScaleY: sprite.scaleY,
      phase: hashTile(object.x, object.y) * Math.PI * 2,
      mode: object.onWater ? "boat" : object.inTown ? "idle" : "mounted",
    } satisfies HeroSpriteAnimation;
    const banner = this.addHeroStandard(
      this.objectLayer,
      renderX - bannerMetrics.xOffset,
      renderY - bannerMetrics.baseOffsetY,
      object.color,
      bannerMetrics.width,
      bannerMetrics.height,
      bannerMetrics.poleHeight,
      renderY
    );
    const renderedHero = {
      object,
      sprite,
      banner,
      animation,
      baseX: sprite.x,
      baseY: sprite.y,
      baseDisplayWidth: sprite.displayWidth,
      baseDisplayHeight: sprite.displayHeight,
      direction,
    } satisfies RenderedHeroObject;

    this.renderedHeroes.set(object.id, renderedHero);
    return renderedHero;
  }

  private updateRenderedHeroObject(renderedHero: RenderedHeroObject, object: MapObjectData) {
    const metrics = getObjectMetrics(object);
    if (!metrics) return;

    renderedHero.object = object;
    renderedHero.animation.mode = object.onWater ? "boat" : object.inTown ? "idle" : "mounted";

    const origin = getOriginForObject(object);
    renderedHero.sprite.setOrigin(origin.originX, origin.originY);
    renderedHero.sprite.setDisplaySize(metrics.width, metrics.height);
    renderedHero.baseDisplayWidth = metrics.width;
    renderedHero.baseDisplayHeight = metrics.height;
    renderedHero.animation.baseScaleX = renderedHero.sprite.scaleX;
    renderedHero.animation.baseScaleY = renderedHero.sprite.scaleY;

    const iso = cartToIso(object.x, object.y);
    const surfaceY = this.getSurfaceY(object.x, object.y);
    const renderX = iso.x + (object.renderOffsetX ?? 0);
    const renderY = surfaceY + metrics.offsetY + (object.renderOffsetY ?? 0);

    renderedHero.baseX = renderX;
    renderedHero.baseY = renderY;
    this.updateRenderedHeroPosition(renderedHero, renderX, renderY);
    renderedHero.banner.destroy();

    const bannerMetrics = getHeroBannerMetrics(object);
    renderedHero.banner = this.addHeroStandard(
      this.objectLayer,
      renderX - bannerMetrics.xOffset,
      renderY - bannerMetrics.baseOffsetY,
      object.color,
      bannerMetrics.width,
      bannerMetrics.height,
      bannerMetrics.poleHeight,
      renderY
    );
    this.playHeroAnimation(renderedHero, "idle");
  }

  private destroyRenderedHero(heroId: string) {
    const renderedHero = this.renderedHeroes.get(heroId);
    if (!renderedHero) return;

    this.heroDirections.set(heroId, renderedHero.direction);
    renderedHero.banner.destroy();
    renderedHero.sprite.destroy();
    this.renderedHeroes.delete(heroId);
  }

  private createRenderedStaticObject(object: MapObjectData) {
    const iso = cartToIso(object.x, object.y);
    const surfaceY = this.getSurfaceY(object.x, object.y);
    const rendered: RenderedStaticObject = { object };

    if (object.type === "town") {
      const metrics = getObjectMetrics(object);
      if (!metrics) return null;
      const renderY = surfaceY + metrics.offsetY;
      rendered.sprite = this.addObjectSprite(object, iso.x, renderY, getTownSpritePath(object.faction), metrics.width, metrics.height, getOriginForObject(object)) ?? undefined;
      const bounds = this.getObjectBounds(object);
      if (bounds) {
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        rendered.banner = this.addBanner(this.objectLayer, bounds.left + width * 0.26, bounds.top + height * 0.48, object.color, 18, 12, renderY);
      }
    } else if (object.type === "building" && object.buildingType) {
      const metrics = getObjectMetrics(object);
      if (!metrics) return null;
      const renderY = surfaceY + metrics.offsetY;
      rendered.sprite = this.addObjectSprite(object, iso.x, renderY, MAP_SPRITES.buildings[object.buildingType], metrics.width, metrics.height, getOriginForObject(object)) ?? undefined;
      const bounds = this.getObjectBounds(object);
      if (bounds) {
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        if (object.playerId) {
          rendered.banner = this.addBanner(this.objectLayer, bounds.left + width * 0.43, bounds.top + height * 0.58, object.color, 12, 8, renderY);
        }
        if (object.guardianPower && object.guardianPower > 0) {
          rendered.badge = this.addBadge(this.objectLayer, bounds.left + width * 0.5, bounds.top + height * 0.28, String(Math.ceil(object.guardianPower / 100)), 0xff4444, renderY);
        }
      }
    } else if (object.type === "adventure_building" && object.buildingType) {
      const metrics = getObjectMetrics(object);
      if (!metrics) return null;
      rendered.sprite = this.addObjectSprite(object, iso.x, surfaceY + metrics.offsetY, MAP_SPRITES.adventureBuildings[object.buildingType], metrics.width, metrics.height, getOriginForObject(object)) ?? undefined;
    } else if (object.type === "combat") {
      const markerY = surfaceY - 60;
      const markerDepth = surfaceY + 1000;
      const marker = this.add.star(iso.x, markerY, 8, 9, 22, 0xff6b00, 1);
      marker.setStrokeStyle(2, 0xfff2a8, 1);
      marker.setDepth(markerDepth);
      this.objectLayer.add(marker);
      rendered.sprite = marker;
      const label = this.add.text(iso.x, markerY, "!", {
        color: "#ffffff",
        fontSize: "16px",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      });
      label.setOrigin(0.5);
      label.setDepth(markerDepth + 1);
      this.objectLayer.add(label);
      rendered.label = label;
    } else {
      return null;
    }

    this.renderedStaticObjects.set(object.id, rendered);
    return rendered;
  }

  private destroyRenderedStaticObject(objectId: string) {
    const rendered = this.renderedStaticObjects.get(objectId);
    if (!rendered) return;

    rendered.sprite?.destroy();
    rendered.label?.destroy();
    rendered.banner?.destroy();
    rendered.badge?.background.destroy();
    rendered.badge?.text.destroy();
    this.renderedStaticObjects.delete(objectId);
  }

  animateHeroMovement(heroId: string, path: Position[]) {
    const renderedHero = this.renderedHeroes.get(heroId);
    const metrics = renderedHero ? getObjectMetrics(renderedHero.object) : null;
    if (!renderedHero || !metrics || path.length < 2) return Promise.resolve();

    const startPosition = path[0];
    const firstStep = path[1];
    const leavingTown = Boolean(
      renderedHero.object.inTown &&
      firstStep &&
      (firstStep.x !== startPosition.x || firstStep.y !== startPosition.y)
    );
    const travelMetrics = leavingTown
      ? getHeroTravelMetrics(renderedHero.object)
      : metrics;

    this.setRenderedHeroSurface(renderedHero, this.isWaterPosition(startPosition), "walk");

    return new Promise<void>((resolve) => {
      let index = 1;
      const moveNext = () => {
        if (!this.isRenderedHeroUsable(renderedHero) || this.renderedHeroes.get(heroId) !== renderedHero) {
          resolve();
          return;
        }

        const from = path[index - 1];
        const to = path[index];
        if (!from || !to) {
          const finalPosition = path[path.length - 1] ?? startPosition;
          this.setRenderedHeroSurface(renderedHero, this.isWaterPosition(finalPosition), "idle");
          renderedHero.animation.mode = renderedHero.object.onWater
            ? "boat"
            : renderedHero.object.inTown
            ? "idle"
            : "mounted";
          this.heroDirections.set(heroId, renderedHero.direction);
          this.playHeroAnimation(renderedHero, "idle");
          resolve();
          return;
        }

        const start = this.getObjectRenderPoint(from, travelMetrics.offsetY);
        const end = this.getObjectRenderPoint(to, travelMetrics.offsetY);
        const tweenState = { x: start.x, y: start.y };
        const fromWater = this.isWaterPosition(from);
        const toWater = this.isWaterPosition(to);
        renderedHero.direction = getHeroDirection(from, to, renderedHero.direction);
        this.heroDirections.set(heroId, renderedHero.direction);
        this.setRenderedHeroSurface(renderedHero, fromWater, "walk");
        if (toWater && !fromWater) {
          this.setRenderedHeroSurface(renderedHero, true, "walk");
        }
        this.playMovementSound(this.getMovementSoundKind(fromWater, toWater));
        this.playHeroAnimation(renderedHero, "walk");
        this.updateRenderedHeroPosition(renderedHero, start.x, start.y);

        this.tweens.add({
          targets: tweenState,
          x: end.x,
          y: end.y,
          duration: 140,
          ease: "Sine.easeInOut",
          onUpdate: () => {
            if (!this.isRenderedHeroUsable(renderedHero)) return;
            this.updateRenderedHeroPosition(renderedHero, tweenState.x, tweenState.y);
          },
          onComplete: () => {
            if (!this.isRenderedHeroUsable(renderedHero) || this.renderedHeroes.get(heroId) !== renderedHero) {
              resolve();
              return;
            }
            this.updateRenderedHeroPosition(renderedHero, end.x, end.y);
            if (!toWater && fromWater) {
              this.setRenderedHeroSurface(renderedHero, false, "walk");
            }
            index += 1;
            moveNext();
          },
        });
      };

      if (leavingTown) {
        const start = this.getObjectRenderPoint(startPosition, travelMetrics.offsetY);
        this.promoteHeroFromTown(renderedHero, start.x, start.y, travelMetrics).then(moveNext);
      } else {
        moveNext();
      }
    });
  }

  private promoteHeroFromTown(renderedHero: RenderedHeroObject, x: number, y: number, metrics: NonNullable<ReturnType<typeof getObjectMetrics>>) {
    if (!this.isRenderedHeroUsable(renderedHero)) return Promise.resolve();

    const previousScaleX = renderedHero.sprite.scaleX;
    const previousScaleY = renderedHero.sprite.scaleY;
    renderedHero.object.inTown = false;
    renderedHero.sprite.setDisplaySize(metrics.width, metrics.height);
    renderedHero.baseDisplayWidth = metrics.width;
    renderedHero.baseDisplayHeight = metrics.height;
    const targetScaleX = renderedHero.sprite.scaleX;
    const targetScaleY = renderedHero.sprite.scaleY;
    renderedHero.sprite.scaleX = previousScaleX;
    renderedHero.sprite.scaleY = previousScaleY;
    renderedHero.animation.baseScaleX = targetScaleX;
    renderedHero.animation.baseScaleY = targetScaleY;
    this.updateRenderedHeroPosition(renderedHero, x, y);

    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: renderedHero.sprite,
        scaleX: targetScaleX,
        scaleY: targetScaleY,
        duration: 90,
        ease: "Sine.easeOut",
        onComplete: () => resolve(),
      });
    });
  }

  private getObjectRenderPoint(position: Position, offsetY: number) {
    const iso = cartToIso(position.x, position.y);
    return {
      x: iso.x,
      y: this.getSurfaceY(position.x, position.y) + offsetY,
    };
  }

  private isWaterPosition(position: Position) {
    return this.map?.tiles[position.y]?.[position.x]?.terrain === TerrainType.WATER;
  }

  private getMovementSoundKind(fromWater: boolean, toWater: boolean): MovementSoundKind {
    return fromWater || toWater ? "boat" : "horse";
  }

  private playMovementSound(kind: MovementSoundKind) {
    const soundConfig = MOVEMENT_SOUNDS[kind];
    const now = this.time.now;
    if (now - this.lastMovementSoundAt[kind] < soundConfig.minIntervalMs) {
      return;
    }

    let started = false;
    try {
      started = this.sound.play(soundConfig.key, {
        volume: soundConfig.volume,
      });
    } catch {
      return;
    }

    if (started) {
      this.lastMovementSoundAt[kind] = now;
    }
  }

  private updateRenderedHeroPosition(renderedHero: RenderedHeroObject, x: number, y: number) {
    if (!this.isRenderedHeroUsable(renderedHero)) return;

    renderedHero.sprite.x = x;
    renderedHero.sprite.setDepth(y);
    renderedHero.animation.baseY = y;
    renderedHero.banner.setPosition(x - renderedHero.baseX, y - renderedHero.baseY);
    renderedHero.banner.setDepth(y + 3);
    this.objectLayer.sort("depth");
  }

  private createDirectionalAnimations() {
    for (const sheet of DIRECTIONAL_SPRITESHEETS) {
      for (const [directionIndex, direction] of HERO_DIRECTIONS.entries()) {
        const rowOffset = directionIndex * sheet.columns;
        const directionIdleKey = getDirectionalAnimationKey(sheet, direction, "idle");
        if (!this.anims.exists(directionIdleKey)) {
          this.anims.create({
            key: directionIdleKey,
            frames: this.anims.generateFrameNumbers(sheet.key, { frames: [0, 1, 2, 3, 2, 1].map((frame) => rowOffset + frame) }),
            frameRate: 5,
            repeat: -1,
          });
        }

        const directionWalkKey = getDirectionalAnimationKey(sheet, direction, "walk");
        if (!this.anims.exists(directionWalkKey)) {
          this.anims.create({
            key: directionWalkKey,
            frames: this.anims.generateFrameNumbers(sheet.key, {
              frames: [4, 5, 6, 7, 8, 9, 10, 11].map((frame) => rowOffset + frame),
            }),
            frameRate: 12,
            repeat: -1,
          });
        }
      }
    }
  }

  private addHeroSprite(object: MapObjectData, x: number, y: number, width: number, height: number, direction: HeroDirection) {
    const sheet = object.onWater ? getBoatSpritesheet(object.faction) : getHeroSpritesheet(object.faction);
    const origin = getOriginForObject(object);

    const sprite = this.add.sprite(x, y, sheet.key, 0);
    sprite.setOrigin(origin.originX, origin.originY);
    sprite.setDisplaySize(width, height);
    sprite.setDepth(y);
    this.objectLayer.add(sprite);
    sprite.play(getDirectionalAnimationKey(sheet, direction, "idle"));
    return sprite;
  }

  private playHeroAnimation(renderedHero: RenderedHeroObject, state: DirectionalSpriteState) {
    const sheet = renderedHero.object.onWater
      ? getBoatSpritesheet(renderedHero.object.faction)
      : getHeroSpritesheet(renderedHero.object.faction);
    const sprite = renderedHero.sprite;
    if (!sheet || !(sprite instanceof Phaser.GameObjects.Sprite) || !sprite.scene || !sprite.active || !sprite.anims) return;
    const key = getDirectionalAnimationKey(sheet, renderedHero.direction, state);
    if (sprite.anims.currentAnim?.key === key) return;
    sprite.play(key);
  }

  private setRenderedHeroSurface(renderedHero: RenderedHeroObject, onWater: boolean, state: DirectionalSpriteState) {
    if (!this.isRenderedHeroUsable(renderedHero)) return;

    const nextOnWater = Boolean(onWater);
    const surfaceChanged = Boolean(renderedHero.object.onWater) !== nextOnWater;
    renderedHero.object.onWater = nextOnWater;
    renderedHero.animation.mode = nextOnWater ? "boat" : renderedHero.object.inTown && state === "idle" ? "idle" : "mounted";

    const metrics = getObjectMetrics(renderedHero.object);
    if (metrics) {
      renderedHero.sprite.setDisplaySize(metrics.width, metrics.height);
      renderedHero.baseDisplayWidth = metrics.width;
      renderedHero.baseDisplayHeight = metrics.height;
      renderedHero.animation.baseScaleX = renderedHero.sprite.scaleX;
      renderedHero.animation.baseScaleY = renderedHero.sprite.scaleY;
    }

    const sprite = renderedHero.sprite;
    if (!(sprite instanceof Phaser.GameObjects.Sprite)) return;

    const sheet = nextOnWater
      ? getBoatSpritesheet(renderedHero.object.faction)
      : getHeroSpritesheet(renderedHero.object.faction);
    if (!sheet) return;

    if (surfaceChanged) {
      const directionIndex = HERO_DIRECTIONS.indexOf(renderedHero.direction);
      const stateOffset = state === "walk" ? 4 : 0;
      sprite.stop();
      sprite.setTexture(sheet.key);
      sprite.setFrame(directionIndex * sheet.columns + stateOffset);
    }
    this.playHeroAnimation(renderedHero, state);
  }

  private isRenderedHeroUsable(renderedHero: RenderedHeroObject) {
    return Boolean(
      renderedHero.sprite &&
      renderedHero.sprite instanceof Phaser.GameObjects.Sprite &&
      renderedHero.sprite.scene &&
      renderedHero.sprite.active &&
      renderedHero.sprite.anims
    );
  }

  private addObjectSprite(
    object: MapObjectData,
    x: number,
    y: number,
    path: string | undefined,
    width: number,
    height: number,
    origin = getOriginForObject(object)
  ) {
    if (!path) return null;
    const sprite = this.add.image(x, y, path);
    sprite.setOrigin(origin.originX, origin.originY);
    sprite.setDisplaySize(width, height);
    sprite.setDepth(y);
    this.objectLayer.add(sprite);
    return sprite;
  }

  private updateHoverLabel(screenX: number, screenY: number) {
    const hover = this.getHoverLabel(screenX, screenY);
    if (!hover) {
      this.clearHoverLabel();
      return;
    }

    if (!this.hoverLabelText || !this.hoverLabelBackground) {
      this.hoverLabelBackground = this.add.graphics();
      this.hoverLabelText = this.add.text(0, 0, "", {
        color: "#ffffff",
        fontSize: "10px",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      });
      this.hoverLabelText.setOrigin(0.5);
      this.hoverLabelLayer.add(this.hoverLabelBackground);
      this.hoverLabelLayer.add(this.hoverLabelText);
    }

    if (this.hoverLabelKey !== hover.key) {
      this.hoverLabelText.setText(hover.text);
      this.hoverLabelKey = hover.key;
    }

    this.hoverLabelText.setPosition(hover.x, hover.y);
    this.hoverLabelText.setDepth(hover.y + 2);
    this.hoverLabelBackground.clear();
    this.hoverLabelBackground.fillStyle(0x0b0a08, 0.76);
    this.hoverLabelBackground.lineStyle(1, 0xffd166, 0.78);
    this.hoverLabelBackground.fillRoundedRect(
      hover.x - this.hoverLabelText.width / 2 - 5,
      hover.y - this.hoverLabelText.height / 2 - 3,
      this.hoverLabelText.width + 10,
      this.hoverLabelText.height + 6,
      4
    );
    this.hoverLabelBackground.strokeRoundedRect(
      hover.x - this.hoverLabelText.width / 2 - 5,
      hover.y - this.hoverLabelText.height / 2 - 3,
      this.hoverLabelText.width + 10,
      this.hoverLabelText.height + 6,
      4
    );
    this.hoverLabelBackground.setDepth(hover.y + 1);
  }

  private getHoverLabel(screenX: number, screenY: number) {
    const tile = this.getTileAtScreen(screenX, screenY);
    const tileData = tile ? this.map?.tiles[tile.y]?.[tile.x] : undefined;
    const mapObject = tileData?.object;

    if (tile && mapObject) {
      if (this.visibleTiles && !this.visibleTiles.has(`${tile.x},${tile.y}`)) return null;

      const text = getMapObjectHoverText(mapObject);
      if (text) {
        const iso = cartToIso(tile.x, tile.y);
        const surfaceY = this.getSurfaceY(tile.x, tile.y);
        return {
          key: `map:${mapObject.id}`,
          text,
          x: iso.x,
          y: getMapObjectHoverY(mapObject, surfaceY),
        };
      }
    }

    const objects = this.getObjectsAtScreen(screenX, screenY);
    const object = objects.find((item) =>
      item.name.trim().length > 0 &&
      (!tileData || !isEmptyPassableTile(tileData) || (item.x === tile?.x && item.y === tile?.y))
    );
    if (object) {
      const bounds = this.getObjectBounds(object);
      if (!bounds) return null;
      const iso = cartToIso(object.x, object.y);
      return {
        key: `object:${object.id}`,
        text: object.name,
        x: iso.x + (object.renderOffsetX ?? 0),
        y: bounds.top - 8,
      };
    }
    return null;
  }

  private clearHoverLabel() {
    this.hoverLabelKey = null;
    this.hoverLabelBackground?.clear();
    this.hoverLabelText?.setText("");
  }

  private addBanner(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    color: string,
    width: number,
    height: number,
    depth: number
  ) {
    const bannerColor = parseHexColor(color) ?? 0x808080;
    const graphics = this.add.graphics();
    const poleWidth = width <= 10 ? 1.35 : 2;
    const poleExtension = width <= 10 ? height + 13 : 0;
    graphics.lineStyle(poleWidth, 0x222222, 1);
    graphics.beginPath();
    graphics.moveTo(x, y + poleExtension);
    graphics.lineTo(x, y - height - 8);
    graphics.strokePath();

    graphics.fillStyle(bannerColor, 1);
    graphics.lineStyle(1, 0xffffff, 1);
    graphics.beginPath();
    graphics.moveTo(x, y - height - 8);
    graphics.lineTo(x + width, y - height - 5);
    graphics.lineTo(x + width - 3, y - height / 2 - 4);
    graphics.lineTo(x + width, y - 3);
    graphics.lineTo(x, y - 5);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
    graphics.setDepth(depth + 3);
    layer.add(graphics);
    return graphics;
  }

  private addHeroStandard(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    color: string,
    width: number,
    height: number,
    poleHeight: number,
    depth: number
  ) {
    const bannerColor = parseHexColor(color) ?? 0x808080;
    const graphics = this.add.graphics();
    const topY = y - poleHeight;

    graphics.lineStyle(1.35, 0x17120d, 0.95);
    graphics.beginPath();
    graphics.moveTo(x, y);
    graphics.lineTo(x, topY);
    graphics.strokePath();

    graphics.fillStyle(bannerColor, 1);
    graphics.lineStyle(1, 0xffffff, 0.95);
    graphics.beginPath();
    graphics.moveTo(x, topY + 2);
    graphics.lineTo(x + width, topY + 4);
    graphics.lineTo(x + width - 2, topY + height / 2 + 4);
    graphics.lineTo(x + width, topY + height + 4);
    graphics.lineTo(x, topY + height + 2);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
    graphics.setDepth(depth - 1);
    layer.add(graphics);
    return graphics;
  }

  private addBadge(layer: Phaser.GameObjects.Container, x: number, y: number, textValue: string, color: number, depth: number) {
    const badgeWidth = Math.max(16, textValue.length * 6 + 8);
    const background = this.add.graphics();
    background.fillStyle(0x120705, 0.72);
    background.lineStyle(1, color, 0.85);
    background.fillRoundedRect(x - badgeWidth / 2, y - 5, badgeWidth, 10, 3);
    background.strokeRoundedRect(x - badgeWidth / 2, y - 5, badgeWidth, 10, 3);
    background.setDepth(depth + 4);
    layer.add(background);

    const text = this.add.text(x, y, textValue, {
      color: "#ff6666",
      fontSize: "8px",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 1,
    });
    text.setOrigin(0.5);
    text.setDepth(depth + 5);
    layer.add(text);

    return { background, text } satisfies RenderedBadge;
  }

  private drawDiamond(layer: Phaser.GameObjects.Container, x: number, y: number, color: number, alpha: number) {
    const iso = cartToIso(x, y);
    const graphics = this.add.graphics();
    graphics.fillStyle(color, alpha);
    drawDiamondPath(graphics, iso.x, this.getSurfaceY(x, y));
    graphics.fillPath();
    layer.add(graphics);
  }

  private drawDiamonds(layer: Phaser.GameObjects.Container, tiles: Position[], color: number, alpha: number) {
    if (tiles.length === 0) return;

    const graphics = this.add.graphics();
    graphics.fillStyle(color, alpha);
    for (const tile of tiles) {
      const iso = cartToIso(tile.x, tile.y);
      drawDiamondPath(graphics, iso.x, this.getSurfaceY(tile.x, tile.y));
      graphics.fillPath();
    }
    layer.add(graphics);
  }

  private drawDiamondOverlay(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    color: number,
    fillAlpha: number,
    strokeAlpha: number,
    strokeWidth: number
  ) {
    const iso = cartToIso(x, y);
    const graphics = this.add.graphics();
    graphics.fillStyle(color, fillAlpha);
    drawDiamondPath(graphics, iso.x, this.getSurfaceY(x, y));
    graphics.fillPath();
    graphics.lineStyle(strokeWidth, color, strokeAlpha);
    drawDiamondPath(graphics, iso.x, this.getSurfaceY(x, y));
    graphics.strokePath();
    layer.add(graphics);
  }

  private drawDiamondOverlays(
    layer: Phaser.GameObjects.Container,
    tiles: Position[],
    color: number,
    fillAlpha: number,
    strokeAlpha: number,
    strokeWidth: number
  ) {
    if (tiles.length === 0) return;

    const graphics = this.add.graphics();
    graphics.fillStyle(color, fillAlpha);
    graphics.lineStyle(strokeWidth, color, strokeAlpha);
    for (const tile of tiles) {
      const iso = cartToIso(tile.x, tile.y);
      const surfaceY = this.getSurfaceY(tile.x, tile.y);
      drawDiamondPath(graphics, iso.x, surfaceY);
      graphics.fillPath();
      drawDiamondPath(graphics, iso.x, surfaceY);
      graphics.strokePath();
    }
    layer.add(graphics);
  }

  private drawDepthSortedDiamondOverlays(
    overlayObjects: Phaser.GameObjects.GameObject[],
    tiles: Position[],
    color: number,
    fillAlpha: number,
    strokeAlpha: number,
    strokeWidth: number
  ) {
    if (!this.map || tiles.length === 0) return;

    for (const tile of tiles) {
      const iso = cartToIso(tile.x, tile.y);
      const surfaceY = this.getSurfaceY(tile.x, tile.y);
      const graphics = this.add.graphics();
      graphics.fillStyle(color, fillAlpha);
      graphics.lineStyle(strokeWidth, color, strokeAlpha);
      drawDiamondPath(graphics, iso.x, surfaceY);
      graphics.fillPath();
      drawDiamondPath(graphics, iso.x, surfaceY);
      graphics.strokePath();
      graphics.setDepth(this.getTileOverlayDepth(tile.x, tile.y));
      this.mapLayer.add(graphics);
      overlayObjects.push(graphics);
    }

    this.mapLayer.sort("depth");
  }

  private clearDepthSortedOverlays(overlayObjects: Phaser.GameObjects.GameObject[]) {
    for (const overlayObject of overlayObjects) {
      overlayObject.destroy();
    }
    overlayObjects.length = 0;
  }

  private getTileOverlayDepth(x: number, y: number) {
    return cartToIso(x, y).y + 0.2;
  }

  getSurfaceY(x: number, y: number): number {
    const iso = cartToIso(x, y);
    if (!this.map) return iso.y;
    const tile = this.map.tiles[y]?.[x];
    if (!tile) return iso.y;
    return iso.y - getTileDepth(tile);
  }

  private getFogSurfaceY(x: number, y: number): number {
    const iso = cartToIso(x, y);
    return iso.y - this.fogPlaneDepth;
  }

  private rebuildFogChunks() {
    this.fogLayer.removeAll(true);
    this.fogChunks = [];
    this.fogChunkColumns = 0;
    this.fogChunkRows = 0;

    if (!this.map) return;

    this.fogChunkColumns = Math.ceil(this.map.width / FOG_CHUNK_SIZE);
    this.fogChunkRows = Math.ceil(this.map.height / FOG_CHUNK_SIZE);

    for (let chunkY = 0; chunkY < this.fogChunkRows; chunkY++) {
      for (let chunkX = 0; chunkX < this.fogChunkColumns; chunkX++) {
        const startX = chunkX * FOG_CHUNK_SIZE;
        const startY = chunkY * FOG_CHUNK_SIZE;
        const endX = Math.min(startX + FOG_CHUNK_SIZE, this.map.width);
        const endY = Math.min(startY + FOG_CHUNK_SIZE, this.map.height);
        const bounds = this.getFogChunkBounds(startX, startY, endX, endY);
        const baseTexture = this.add.renderTexture(bounds.left, bounds.top, bounds.width, bounds.height);
        const edgeTexture = this.add.renderTexture(bounds.left, bounds.top, bounds.width, bounds.height);

        baseTexture.setOrigin(0, 0);
        edgeTexture.setOrigin(0, 0);
        baseTexture.setDepth(0);
        edgeTexture.setDepth(1);

        this.fogLayer.add(baseTexture);
        this.fogLayer.add(edgeTexture);

        this.fogChunks.push({
          chunkX,
          chunkY,
          startX,
          startY,
          endX,
          endY,
          bounds,
          baseTexture,
          edgeTexture,
        });
      }
    }

    this.fogLayer.sort("depth");
  }

  private getFogChunkBounds(startX: number, startY: number, endX: number, endY: number): FogChunkBounds {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const iso = cartToIso(x, y);
        const ySurface = this.getFogSurfaceY(x, y);
        left = Math.min(left, iso.x - FOG_STAMP_HALF_WIDTH);
        top = Math.min(top, ySurface - FOG_STAMP_HALF_HEIGHT);
        right = Math.max(right, iso.x + FOG_STAMP_HALF_WIDTH);
        bottom = Math.max(bottom, ySurface + FOG_STAMP_HALF_HEIGHT);
      }
    }

    const normalizedLeft = Math.floor(left - FOG_CHUNK_MARGIN);
    const normalizedTop = Math.floor(top - FOG_CHUNK_MARGIN);
    const normalizedRight = Math.ceil(right + FOG_CHUNK_MARGIN);
    const normalizedBottom = Math.ceil(bottom + FOG_CHUNK_MARGIN);

    return {
      left: normalizedLeft,
      top: normalizedTop,
      width: Math.max(1, normalizedRight - normalizedLeft),
      height: Math.max(1, normalizedBottom - normalizedTop),
    };
  }

  private redrawFogChunk(chunk: FogChunk) {
    const { baseTexture, edgeTexture, bounds } = chunk;

    baseTexture.clear();
    edgeTexture.clear();

    for (let y = chunk.startY; y < chunk.endY; y++) {
      for (let x = chunk.startX; x < chunk.endX; x++) {
        const state = this.getFogTileState(x, y);
        if (state === FOG_TILE_VISIBLE) continue;

        const iso = cartToIso(x, y);
        const localX = iso.x - bounds.left;
        const localY = this.getFogSurfaceY(x, y) - bounds.top;
        const stampKey = this.getFogBaseStampKey(x, y, state);
        const stampConfig = stampKey === "fog-unexplored" ? FOG_UNEXPLORED_STAMP_CONFIG : FOG_STAMP_CONFIG;
        baseTexture.stamp(this.getFogStampTextureKey(stampKey), undefined, localX, localY, stampConfig);
      }
    }

    for (let y = chunk.startY; y < chunk.endY; y++) {
      for (let x = chunk.startX; x < chunk.endX; x++) {
        if (this.getFogTileState(x, y) !== FOG_TILE_VISIBLE) continue;

        const iso = cartToIso(x, y);
        const localX = iso.x - bounds.left;
        const localY = this.getFogSurfaceY(x, y) - bounds.top;

        if (x > 0 && this.getFogTileState(x - 1, y) !== FOG_TILE_VISIBLE) {
          edgeTexture.stamp(this.getFogStampTextureKey("fog-edge-nw"), undefined, localX, localY, FOG_STAMP_CONFIG);
        }
        if (y > 0 && this.getFogTileState(x, y - 1) !== FOG_TILE_VISIBLE) {
          edgeTexture.stamp(this.getFogStampTextureKey("fog-edge-ne"), undefined, localX, localY, FOG_STAMP_CONFIG);
        }
        if (x < this.map!.width - 1 && this.getFogTileState(x + 1, y) !== FOG_TILE_VISIBLE) {
          edgeTexture.stamp(this.getFogStampTextureKey("fog-edge-se"), undefined, localX, localY, FOG_STAMP_CONFIG);
        }
        if (y < this.map!.height - 1 && this.getFogTileState(x, y + 1) !== FOG_TILE_VISIBLE) {
          edgeTexture.stamp(this.getFogStampTextureKey("fog-edge-sw"), undefined, localX, localY, FOG_STAMP_CONFIG);
        }
      }
    }

    baseTexture.render();
    edgeTexture.render();
  }

  private getFogTileIndex(x: number, y: number) {
    return y * this.map!.width + x;
  }

  private getFogTileState(x: number, y: number): FogTileState {
    if (!this.fogTileStates) return FOG_TILE_VISIBLE;
    return this.fogTileStates[this.getFogTileIndex(x, y)] as FogTileState;
  }

  private markFogChunksDirtyForTile(dirtyChunkIndexes: Set<number>, x: number, y: number) {
    this.markFogChunkDirty(dirtyChunkIndexes, x, y);
    this.markFogChunkDirty(dirtyChunkIndexes, x - 1, y);
    this.markFogChunkDirty(dirtyChunkIndexes, x + 1, y);
    this.markFogChunkDirty(dirtyChunkIndexes, x, y - 1);
    this.markFogChunkDirty(dirtyChunkIndexes, x, y + 1);
    this.markFogChunkDirty(dirtyChunkIndexes, x - 1, y - 1);
    this.markFogChunkDirty(dirtyChunkIndexes, x + 1, y - 1);
    this.markFogChunkDirty(dirtyChunkIndexes, x - 1, y + 1);
    this.markFogChunkDirty(dirtyChunkIndexes, x + 1, y + 1);
  }

  private markFogChunkDirty(dirtyChunkIndexes: Set<number>, x: number, y: number) {
    if (!this.map) return;
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) return;

    const chunkX = Math.floor(x / FOG_CHUNK_SIZE);
    const chunkY = Math.floor(y / FOG_CHUNK_SIZE);
    dirtyChunkIndexes.add(chunkY * this.fogChunkColumns + chunkX);
  }

  private getFogStampTextureKey(key: FogStampKey) {
    return this.fogStampTextureKeys[key];
  }

  private getFogBaseStampKey(x: number, y: number, state: FogTileState): FogStampKey {
    if (this.hasVisibleFogNeighbor(x, y)) return "fog-near";
    if (state === FOG_TILE_EXPLORED) return "fog-explored";
    return "fog-unexplored";
  }

  private hasVisibleFogNeighbor(x: number, y: number) {
    return (
      this.isFogTileVisible(x - 1, y) ||
      this.isFogTileVisible(x + 1, y) ||
      this.isFogTileVisible(x, y - 1) ||
      this.isFogTileVisible(x, y + 1) ||
      this.isFogTileVisible(x - 1, y - 1) ||
      this.isFogTileVisible(x + 1, y - 1) ||
      this.isFogTileVisible(x - 1, y + 1) ||
      this.isFogTileVisible(x + 1, y + 1)
    );
  }

  private isFogTileVisible(x: number, y: number) {
    if (!this.map) return false;
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) return false;
    return this.getFogTileState(x, y) === FOG_TILE_VISIBLE;
  }
}

export class PhaserMapRenderer implements MapRenderer {
  private game: Phaser.Game | null = null;
  private scene: PhaserMapScene | null = null;
  private initialized = false;
  private destroyed = false;
  private readyResolve: (() => void) | null = null;

  async init(container: HTMLDivElement, onLoadingProgress?: RendererLoadingProgress) {
    this.destroyed = false;
    onLoadingProgress?.(82, "Creation du canvas...");
    container.querySelectorAll("canvas").forEach((canvas) => canvas.remove());

    const scene = new PhaserMapScene();
    this.scene = scene;
    scene.loadingProgressCallback = onLoadingProgress;

    const ready = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
      scene.readyCallback = resolve;
    });

    try {
      this.game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: container,
        width: container.clientWidth || window.innerWidth || 1024,
        height: container.clientHeight || window.innerHeight || 768,
        backgroundColor: "#1a1a2e",
        antialias: false,
        antialiasGL: false,
        roundPixels: true,
        powerPreference: "high-performance",
        audio: {
          disableWebAudio: true,
        },
        scene,
        scale: {
          mode: Phaser.Scale.RESIZE,
          parent: container,
        },
      });

      await ready;
      this.readyResolve = null;
      if (this.destroyed) return;
      onLoadingProgress?.(90, "Affichage de la carte...");
      this.initialized = true;
    } catch (error) {
      this.destroyed = true;
      this.initialized = false;
      this.game?.destroy(true);
      this.game = null;
      this.scene = null;
      this.readyResolve = null;
      throw error;
    }
  }

  isReady() {
    return this.initialized && !this.destroyed && Boolean(this.scene);
  }

  renderMap(map: GameMap) {
    if (this.isReady()) this.scene?.renderMap(map);
  }

  setObjects(objects: MapObjectData[]) {
    if (this.isReady()) this.scene?.setObjects(objects);
  }

  setFog(visibleTiles: Set<string>, exploredTiles: Set<string>) {
    if (this.isReady()) this.scene?.setFog(visibleTiles, exploredTiles);
  }

  animateHeroMovement(heroId: string, path: Position[]) {
    return this.isReady() ? this.scene?.animateHeroMovement(heroId, path) ?? Promise.resolve() : Promise.resolve();
  }

  highlightPath(path: Position[]) {
    if (this.isReady()) this.scene?.highlightPath(path);
  }

  highlightPartialPath(reachable: Position[], unreachable: Position[], turnsLabel?: string) {
    if (this.isReady()) this.scene?.highlightPartialPath(reachable, unreachable, turnsLabel);
  }

  highlightTiles(tiles: Position[], color?: number, alpha?: number) {
    if (this.isReady()) this.scene?.highlightTiles(tiles, color, alpha);
  }

  highlightTile(x: number, y: number, color?: number) {
    if (this.isReady()) this.scene?.highlightTile(x, y, color);
  }

  clearHighlights() {
    if (this.isReady()) this.scene?.clearHighlights();
  }

  clearReachable() {
    if (this.isReady()) this.scene?.clearReachable();
  }

  centerOnTile(x: number, y: number) {
    if (this.isReady()) this.scene?.centerOnTile(x, y);
  }

  panCamera(dx: number, dy: number) {
    if (this.isReady()) this.scene?.panCamera(dx, dy);
  }

  zoomCamera(direction: number, screenX?: number, screenY?: number) {
    if (this.isReady()) this.scene?.zoomCamera(direction, screenX, screenY);
  }

  getTileAtScreen(screenX: number, screenY: number) {
    return this.isReady() ? this.scene?.getTileAtScreen(screenX, screenY) ?? null : null;
  }

  getObjectsAtScreen(screenX: number, screenY: number) {
    return this.isReady() ? this.scene?.getObjectsAtScreen(screenX, screenY) ?? [] : [];
  }

  destroy() {
    if (this.destroyed && !this.game && !this.scene) return;
    this.destroyed = true;
    this.initialized = false;
    this.readyResolve?.();
    this.readyResolve = null;
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
  }
}

function getTileDepth(tile: MapTile) {
  return tile.terrain === TerrainType.WATER
    ? 2
    : BASE_HEIGHT + Math.max(0, tile.elevation) * VISUAL_ELEVATION_SCALE;
}

function getMaxTileDepth(map: GameMap) {
  let maxDepth = 0;
  for (const row of map.tiles) {
    for (const tile of row) {
      maxDepth = Math.max(maxDepth, getTileDepth(tile));
    }
  }
  return maxDepth || BASE_HEIGHT;
}

function getTerrainSideExposure(depth: number, neighbor: MapTile | undefined): TerrainSideExposure | null {
  const bottomDepth = neighbor ? getTileDepth(neighbor) : 0;
  return bottomDepth < depth ? { bottomDepth, neighborTerrain: neighbor?.terrain } : null;
}

function getTerrainSideFaceColor(terrain: TerrainType, baseColor: number, exposure: TerrainSideExposure) {
  const surfaceColor = TERRAIN_TOP[terrain] ?? baseColor;
  const neighborColor = exposure.neighborTerrain ? TERRAIN_TOP[exposure.neighborTerrain] ?? surfaceColor : surfaceColor;
  const surfaceBlend = terrain === TerrainType.MOUNTAIN ? 0.28 : 0.18;
  const neighborBlend = terrain === TerrainType.MOUNTAIN ? 0.08 : 0.05;
  return blendRgb(blendRgb(baseColor, surfaceColor, surfaceBlend), neighborColor, neighborBlend);
}

function getTerrainTopStroke(terrain: TerrainType) {
  if (terrain === TerrainType.WATER) return { width: 0, color: 0x000000, alpha: 0 };
  if (terrain === TerrainType.MOUNTAIN) return { width: 0.8, color: 0x384144, alpha: 0.34 };
  if (terrain === TerrainType.SAND) return { width: 0.8, color: 0x7b5b2d, alpha: 0.24 };
  return { width: 0.8, color: 0x1f241f, alpha: 0.28 };
}

function getTerrainSideFacePoints(
  side: TerrainFaceSide,
  isoX: number,
  isoY: number,
  depth: number,
  bottomDepth: number
): TerrainSideFacePoints {
  const eastTop = { x: isoX + TILE_WIDTH / 2, y: isoY - depth };
  const southTop = { x: isoX, y: isoY + TILE_HEIGHT / 2 - depth };
  const westTop = { x: isoX - TILE_WIDTH / 2, y: isoY - depth };
  const eastBottom = { x: isoX + TILE_WIDTH / 2, y: isoY - bottomDepth };
  const southBottom = { x: isoX, y: isoY + TILE_HEIGHT / 2 - bottomDepth };
  const westBottom = { x: isoX - TILE_WIDTH / 2, y: isoY - bottomDepth };

  switch (side) {
    case "left":
      return { topA: westTop, topB: southTop, bottomA: westBottom, bottomB: southBottom };
    case "right":
    default:
      return { topA: southTop, topB: eastTop, bottomA: southBottom, bottomB: eastBottom };
  }
}

function drawTerrainSideDetails(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  visibleSides: TerrainSideVisibility,
  isoX: number,
  isoY: number,
  depth: number
) {
  for (const side of TERRAIN_FACE_RENDER_ORDER) {
    const exposure = visibleSides[side];
    if (!exposure) continue;
    drawTerrainSideDetailLines(graphics, tile, side, isoX, isoY, depth, exposure.bottomDepth);
  }
}

function drawTerrainSideEdges(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  visibleSides: TerrainSideVisibility,
  isoX: number,
  isoY: number,
  depth: number
) {
  const edgeColor = tile.terrain === TerrainType.MOUNTAIN ? 0x303a3d : 0x1f241f;
  const lipColor = tile.terrain === TerrainType.MOUNTAIN ? 0xe0e5e1 : 0xffffff;
  const bottomColor = tile.terrain === TerrainType.MOUNTAIN ? 0x151b1d : 0x161916;
  const edgeAlpha = tile.terrain === TerrainType.MOUNTAIN ? 0.5 : 0.56;
  const bottomAlpha = tile.terrain === TerrainType.MOUNTAIN ? 0.28 : 0.32;
  const lipAlpha = tile.terrain === TerrainType.MOUNTAIN ? 0.24 : 0.32;

  for (const side of TERRAIN_FACE_RENDER_ORDER) {
    const exposure = visibleSides[side];
    if (!exposure) continue;

    const points = getTerrainSideFacePoints(side, isoX, isoY, depth, exposure.bottomDepth);

    graphics.lineStyle(1.1, edgeColor, edgeAlpha);
    graphics.beginPath();
    graphics.moveTo(points.topA.x, points.topA.y);
    graphics.lineTo(points.bottomA.x, points.bottomA.y);
    graphics.moveTo(points.topB.x, points.topB.y);
    graphics.lineTo(points.bottomB.x, points.bottomB.y);
    graphics.strokePath();

    graphics.lineStyle(1, bottomColor, bottomAlpha);
    graphics.beginPath();
    graphics.moveTo(points.bottomA.x, points.bottomA.y);
    graphics.lineTo(points.bottomB.x, points.bottomB.y);
    graphics.strokePath();

    graphics.lineStyle(1, lipColor, lipAlpha);
    graphics.beginPath();
    graphics.moveTo(points.topA.x, points.topA.y);
    graphics.lineTo(points.topB.x, points.topB.y);
    graphics.strokePath();
  }
}

function drawTerrainSideDetailLines(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  side: TerrainFaceSide,
  isoX: number,
  isoY: number,
  depth: number,
  bottomDepth: number
) {
  const drop = depth - bottomDepth;
  if (drop <= 0) return;

  const { topA, topB, bottomA, bottomB } = getTerrainSideFacePoints(side, isoX, isoY, depth, bottomDepth);

  const palette = getTerrainSideDetailPalette(tile.terrain);
  const seed = hashTile(tile.x + (side === "left" ? 17 : 43), tile.y + (side === "left" ? 61 : 29));

  graphics.lineStyle(1, palette.highlight, side === "left" ? palette.highlightAlpha : palette.highlightAlpha * 0.82);
  graphics.beginPath();
  graphics.moveTo(topA.x, topA.y);
  graphics.lineTo(topB.x, topB.y);
  graphics.strokePath();

  if (tile.terrain === TerrainType.MOUNTAIN) {
    drawMountainCliffDetails(graphics, topA, topB, bottomA, bottomB, seed, side);
    return;
  }

  graphics.lineStyle(1, palette.strata, palette.strataAlpha);
  graphics.beginPath();
  for (const t of [0.22, 0.38, 0.55, 0.72, 0.86]) {
    const offset = (seed - 0.5) * 0.05;
    const left = lerpPoint(topA, bottomA, Math.max(0.08, Math.min(0.94, t + offset)));
    const right = lerpPoint(topB, bottomB, Math.max(0.08, Math.min(0.94, t - offset)));
    const inset = 3 + ((Math.floor(seed * 100 + t * 37) % 3) * 2);
    graphics.moveTo(Phaser.Math.Linear(left.x, right.x, inset / TILE_WIDTH), Phaser.Math.Linear(left.y, right.y, inset / TILE_WIDTH));
    graphics.lineTo(Phaser.Math.Linear(right.x, left.x, inset / TILE_WIDTH), Phaser.Math.Linear(right.y, left.y, inset / TILE_WIDTH));
  }
  graphics.strokePath();

  const chipCount = 3;
  for (let i = 0; i < chipCount; i++) {
    const t = 0.18 + ((seed * 13 + i * 0.23) % 0.64);
    const u = 0.2 + ((seed * 19 + i * 0.31) % 0.58);
    const left = lerpPoint(topA, bottomA, t);
    const right = lerpPoint(topB, bottomB, t + 0.05);
    const center = lerpPoint(left, right, u);
    const width = 3 + ((i + Math.floor(seed * 10)) % 3);
    const height = 1.5 + (i % 2);

    graphics.fillStyle(i % 2 === 0 ? palette.chipLight : palette.chipDark, i % 2 === 0 ? palette.chipLightAlpha : palette.chipDarkAlpha);
    graphics.beginPath();
    graphics.moveTo(center.x - width, center.y);
    graphics.lineTo(center.x, center.y - height);
    graphics.lineTo(center.x + width, center.y);
    graphics.lineTo(center.x, center.y + height);
    graphics.closePath();
    graphics.fillPath();
  }
}

function drawMountainCliffDetails(
  graphics: Phaser.GameObjects.Graphics,
  topA: Position,
  topB: Position,
  bottomA: Position,
  bottomB: Position,
  seed: number,
  side: TerrainFaceSide
) {
  const point = (u: number, v: number) => {
    const left = lerpPoint(topA, bottomA, v);
    const right = lerpPoint(topB, bottomB, v);
    return lerpPoint(left, right, u);
  };

  const facets = [
    { u: 0.18, v: 0.18, w: 0.18, h: 0.16, color: 0xb9c0bc, alpha: 0.28 },
    { u: 0.48, v: 0.24, w: 0.22, h: 0.19, color: 0x495154, alpha: 0.22 },
    { u: 0.76, v: 0.2, w: 0.16, h: 0.17, color: 0xcbd0cc, alpha: 0.22 },
    { u: 0.26, v: 0.54, w: 0.24, h: 0.2, color: 0x3c4447, alpha: 0.2 },
    { u: 0.61, v: 0.58, w: 0.24, h: 0.22, color: 0xa7afab, alpha: 0.24 },
    { u: 0.82, v: 0.72, w: 0.16, h: 0.14, color: 0x2f373a, alpha: 0.18 },
  ];

  for (const [index, facet] of facets.entries()) {
    const drift = ((seed * 31 + index * 0.137) % 0.08) - 0.04;
    const skew = side === "left" ? 0.05 : -0.05;
    const a = point(Math.max(0.04, facet.u - facet.w / 2 + drift), Math.max(0.06, facet.v - facet.h / 2));
    const b = point(Math.min(0.96, facet.u + facet.w / 2 + drift + skew), Math.max(0.08, facet.v - facet.h * 0.2));
    const c = point(Math.min(0.96, facet.u + facet.w * 0.2 + drift), Math.min(0.94, facet.v + facet.h / 2));
    const d = point(Math.max(0.04, facet.u - facet.w * 0.45 + drift - skew), Math.min(0.92, facet.v + facet.h * 0.2));

    graphics.fillStyle(facet.color, facet.alpha);
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.lineTo(c.x, c.y);
    graphics.lineTo(d.x, d.y);
    graphics.closePath();
    graphics.fillPath();
  }

  graphics.lineStyle(1, 0x242b2d, 0.26);
  graphics.beginPath();
  for (const [startU, startV, endU, endV] of [
    [0.12, 0.22, 0.34, 0.5],
    [0.44, 0.14, 0.37, 0.42],
    [0.66, 0.32, 0.88, 0.58],
    [0.28, 0.64, 0.56, 0.82],
  ] as const) {
    const start = point(startU, startV);
    const end = point(endU, endV);
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
  }
  graphics.strokePath();

  graphics.lineStyle(1, 0xd9dfdc, 0.2);
  graphics.beginPath();
  const lipA = point(0.08, 0.1);
  const lipB = point(0.88, 0.08);
  graphics.moveTo(lipA.x, lipA.y);
  graphics.lineTo(lipB.x, lipB.y);
  graphics.strokePath();
}

function getTerrainSideDetailPalette(terrain: TerrainType) {
  switch (terrain) {
    case TerrainType.MOUNTAIN:
      return {
        highlight: 0xd7ddd9,
        highlightAlpha: 0.38,
        strata: 0x2e3638,
        strataAlpha: 0.22,
        chipLight: 0xc2c8c3,
        chipLightAlpha: 0.28,
        chipDark: 0x2e3435,
        chipDarkAlpha: 0.22,
      };
    case TerrainType.SNOW:
      return {
        highlight: 0xffffff,
        highlightAlpha: 0.32,
        strata: 0x8db0c1,
        strataAlpha: 0.16,
        chipLight: 0xffffff,
        chipLightAlpha: 0.22,
        chipDark: 0x81a6b8,
        chipDarkAlpha: 0.16,
      };
    case TerrainType.SAND:
      return {
        highlight: 0xffe2a0,
        highlightAlpha: 0.26,
        strata: 0x88652e,
        strataAlpha: 0.14,
        chipLight: 0xf6d17c,
        chipLightAlpha: 0.22,
        chipDark: 0x7c5b27,
        chipDarkAlpha: 0.14,
      };
    default:
      return {
        highlight: 0xffffff,
        highlightAlpha: 0.24,
        strata: 0x1f241f,
        strataAlpha: 0.14,
        chipLight: 0xd4d0b0,
        chipLightAlpha: 0.16,
        chipDark: 0x1f241f,
        chipDarkAlpha: 0.12,
      };
  }
}

function blendRgb(from: number, to: number, amount: number) {
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;

  return (
    (Math.round(Phaser.Math.Linear(fromR, toR, amount)) << 16) |
    (Math.round(Phaser.Math.Linear(fromG, toG, amount)) << 8) |
    Math.round(Phaser.Math.Linear(fromB, toB, amount))
  );
}

function getBrickRampartPlacement() {
  return {
    width: 58,
    height: 64,
    originX: 0.5,
    offsetX: 0,
    offsetY: 16,
  };
}

function getBrickWallAxis(orientation: BrickWallOrientation): {
  along: Position;
  across: Position;
  long: number;
  thick: number;
  shadowWidth: number;
  crenelCount: number;
} {
  switch (orientation) {
    case "diagonalDown":
      return {
        along: { x: 0, y: 1 },
        across: { x: 1, y: 0 },
        long: 18,
        thick: 13,
        shadowWidth: 38,
        crenelCount: 3,
      };
    case "diagonalUp":
      return {
        along: { x: 1, y: 0 },
        across: { x: 0, y: 1 },
        long: 24,
        thick: 10,
        shadowWidth: 58,
        crenelCount: 3,
      };
    case "y":
      return {
        along: { x: -0.9, y: 0.46 },
        across: { x: 0.46, y: 0.9 },
        long: 25,
        thick: 10,
        shadowWidth: 58,
        crenelCount: 3,
      };
    case "x":
    default:
      return {
        along: { x: 0.9, y: 0.46 },
        across: { x: -0.46, y: 0.9 },
        long: 25,
        thick: 10,
        shadowWidth: 58,
        crenelCount: 3,
      };
  }
}

function getBrickWallVectors(orientation: BrickWallOrientation): { dir: Position; normal: Position } {
  switch (orientation) {
    case "y":
      return { dir: { x: -26, y: 13 }, normal: { x: 10, y: 5 } };
    case "diagonalDown":
      return { dir: { x: 0, y: 25 }, normal: { x: 14, y: 0 } };
    case "diagonalUp":
      return { dir: { x: 28, y: 0 }, normal: { x: 0, y: 10 } };
    case "x":
    default:
      return { dir: { x: 26, y: 13 }, normal: { x: -10, y: 5 } };
  }
}

function drawDiamondPath(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
  graphics.beginPath();
  graphics.moveTo(x, y - TILE_HEIGHT / 2);
  graphics.lineTo(x + TILE_WIDTH / 2, y);
  graphics.lineTo(x, y + TILE_HEIGHT / 2);
  graphics.lineTo(x - TILE_WIDTH / 2, y);
  graphics.closePath();
}

function isTerrainEffectInView(
  effect: WaterTileEffect | LavaTileEffect,
  view: Phaser.Geom.Rectangle
) {
  return (
    effect.x >= view.x - TERRAIN_EFFECT_VIEW_PADDING &&
    effect.x <= view.x + view.width + TERRAIN_EFFECT_VIEW_PADDING &&
    effect.y >= view.y - TERRAIN_EFFECT_VIEW_PADDING &&
    effect.y <= view.y + view.height + TERRAIN_EFFECT_VIEW_PADDING
  );
}

function isSpritePointInView(x: number, y: number, view: Phaser.Geom.Rectangle) {
  return (
    x >= view.x - TERRAIN_EFFECT_VIEW_PADDING &&
    x <= view.x + view.width + TERRAIN_EFFECT_VIEW_PADDING &&
    y >= view.y - TERRAIN_EFFECT_VIEW_PADDING &&
    y <= view.y + view.height + TERRAIN_EFFECT_VIEW_PADDING
  );
}

function areObjectsRenderEquivalent(left: MapObjectData, right: MapObjectData) {
  return (
    left.type === right.type &&
    left.id === right.id &&
    left.playerId === right.playerId &&
    left.x === right.x &&
    left.y === right.y &&
    left.faction === right.faction &&
    left.color === right.color &&
    left.name === right.name &&
    Boolean(left.onWater) === Boolean(right.onWater) &&
    Boolean(left.inTown) === Boolean(right.inTown) &&
    (left.renderOffsetX ?? 0) === (right.renderOffsetX ?? 0) &&
    (left.renderOffsetY ?? 0) === (right.renderOffsetY ?? 0) &&
    (left.buildingType ?? "") === (right.buildingType ?? "") &&
    (left.guardianPower ?? 0) === (right.guardianPower ?? 0)
  );
}

function shouldRebuildHero(left: MapObjectData, right: MapObjectData) {
  return (
    left.type !== right.type ||
    left.id !== right.id ||
    left.faction !== right.faction ||
    left.color !== right.color ||
    Boolean(left.onWater) !== Boolean(right.onWater) ||
    Boolean(left.inTown) !== Boolean(right.inTown)
  );
}

function generateTerrainAnimationTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(getTerrainTextureKey(WATER_TEXTURE_PREFIX, 0))) {
    generateTerrainTextureFrames(scene, WATER_TEXTURE_PREFIX, drawWaterAnimation);
  }
  if (!scene.textures.exists(getTerrainTextureKey(LAVA_TEXTURE_PREFIX, 0))) {
    generateTerrainTextureFrames(scene, LAVA_TEXTURE_PREFIX, drawLavaAnimation);
  }
}

function generateFogStampTextures(scene: Phaser.Scene) {
  const centerX = FOG_STAMP_WIDTH / 2;
  const centerY = FOG_STAMP_HEIGHT / 2;

  for (const [stampKey, textureKey] of Object.entries(FOG_STAMP_TEXTURE_KEYS) as [FogStampKey, string][]) {
    if (scene.textures.exists(textureKey)) continue;

    const graphics = scene.add.graphics();
    switch (stampKey) {
      case "fog-near":
        drawFogNearTileVisual(graphics, centerX, centerY);
        break;
      case "fog-unexplored":
        drawFogTileVisual(graphics, centerX, centerY, false);
        break;
      case "fog-explored":
        drawFogTileVisual(graphics, centerX, centerY, true);
        break;
      case "fog-edge-nw":
        drawFogFrontierEdgeVisual(graphics, centerX, centerY, "northWest");
        break;
      case "fog-edge-ne":
        drawFogFrontierEdgeVisual(graphics, centerX, centerY, "northEast");
        break;
      case "fog-edge-se":
        drawFogFrontierEdgeVisual(graphics, centerX, centerY, "southEast");
        break;
      case "fog-edge-sw":
        drawFogFrontierEdgeVisual(graphics, centerX, centerY, "southWest");
        break;
    }
    graphics.generateTexture(textureKey, FOG_STAMP_WIDTH, FOG_STAMP_HEIGHT);
    graphics.destroy();
  }
}

function generateTerrainTextureFrames(
  scene: Phaser.Scene,
  prefix: string,
  drawFrame: (graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, seed: number, time: number) => void
) {
  const centerX = TERRAIN_TEXTURE_WIDTH / 2;
  const centerY = TERRAIN_TEXTURE_HEIGHT / 2;

  for (let frame = 0; frame < TERRAIN_ANIMATION_FRAME_COUNT; frame++) {
    const key = getTerrainTextureKey(prefix, frame);
    if (scene.textures.exists(key)) continue;

    const graphics = scene.add.graphics();
    drawFrame(graphics, centerX, centerY, 0, frame * TERRAIN_ANIMATION_INTERVAL_MS);
    graphics.generateTexture(key, TERRAIN_TEXTURE_WIDTH, TERRAIN_TEXTURE_HEIGHT);
    graphics.destroy();
  }
}

function updateTerrainEffectFrame(
  effect: WaterTileEffect | LavaTileEffect,
  texturePrefix: string,
  baseFrameIndex: number
) {
  const nextFrameIndex = (baseFrameIndex + effect.frameOffset) % TERRAIN_ANIMATION_FRAME_COUNT;
  if (effect.frameIndex === nextFrameIndex) return;

  effect.frameIndex = nextFrameIndex;
  effect.sprite.setTexture(getTerrainTextureKey(texturePrefix, nextFrameIndex));
}

function getTerrainFrameOffset(x: number, y: number) {
  return Math.floor(hashTile(x, y) * TERRAIN_ANIMATION_FRAME_COUNT) % TERRAIN_ANIMATION_FRAME_COUNT;
}

function getTerrainTextureKey(prefix: string, frame: number) {
  return `${prefix}-${frame}`;
}

const ROAD_SIDE_SEEDS: Record<RoadSide, number> = {
  northEast: 11,
  southEast: 29,
  southWest: 47,
  northWest: 71,
};

function getRoadStampSpec(kind: RoadType | "bridge", side: RoadSide): RoadStampSpec {
  const mask = ROAD_STAMP_MASK_BY_SIDE[side];
  const texturePath = ROAD_TEXTURES[kind][mask];

  if (kind === "paved") {
    return {
      texturePath,
      cropX: mask === 5 ? 38 : 30,
      cropY: 17,
      cropWidth: 58,
      cropHeight: 24,
      displayWidth: 44,
      displayHeight: 18,
      alpha: 0.92,
    };
  }

  if (kind === "bridge") {
    return {
      texturePath,
      cropX: mask === 5 ? 32 : 24,
      cropY: 18,
      cropWidth: 64,
      cropHeight: 28,
      displayWidth: 48,
      displayHeight: 21,
      alpha: 0.95,
    };
  }

  return {
    texturePath,
    cropX: mask === 5 ? 34 : 26,
    cropY: 18,
    cropWidth: 64,
    cropHeight: 28,
    displayWidth: kind === "gravel" ? 46 : 47,
    displayHeight: kind === "gravel" ? 20 : 21,
    alpha: 0.9,
  };
}

function getRoadCenterStampSpec(kind: RoadType | "bridge", connections: RoadSide[]): RoadStampSpec {
  const mask = connections.reduce((value, side) => value | ROAD_TEXTURE_BITS[side], 0);
  const texturePath = ROAD_TEXTURES[kind][mask] ?? ROAD_TEXTURES[kind][5];

  if (kind === "paved") {
    return {
      texturePath,
      cropX: 40,
      cropY: 16,
      cropWidth: 48,
      cropHeight: 28,
      displayWidth: 31,
      displayHeight: 18,
      alpha: 0.96,
    };
  }

  if (kind === "bridge") {
    return {
      texturePath,
      cropX: 38,
      cropY: 15,
      cropWidth: 52,
      cropHeight: 30,
      displayWidth: 34,
      displayHeight: 20,
      alpha: 0.96,
    };
  }

  return {
    texturePath,
    cropX: 38,
    cropY: 16,
    cropWidth: 52,
    cropHeight: 30,
    displayWidth: kind === "gravel" ? 33 : 34,
    displayHeight: kind === "gravel" ? 19 : 20,
    alpha: 0.94,
  };
}

function getRoadAnchorPoints(x: number, y: number): Record<RoadSide, Position> {
  return {
    northEast: { x: x + TILE_WIDTH * 0.25, y: y - TILE_HEIGHT * 0.25 },
    southEast: { x: x + TILE_WIDTH * 0.25, y: y + TILE_HEIGHT * 0.25 },
    southWest: { x: x - TILE_WIDTH * 0.25, y: y + TILE_HEIGHT * 0.25 },
    northWest: { x: x - TILE_WIDTH * 0.25, y: y - TILE_HEIGHT * 0.25 },
  };
}

function extendRoadPoint(from: Position, to: Position, amount: number): Position {
  const vector = getRoadVector(from, to);
  return {
    x: to.x + vector.direction.x * amount,
    y: to.y + vector.direction.y * amount,
  };
}

function getRoadVector(from: Position, to: Position) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    direction: { x: dx / length, y: dy / length },
    normal: { x: -dy / length, y: dx / length },
    length,
  };
}

function offsetPoint(point: Position, offset: Position): Position {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

function scalePoint(point: Position, amount: number): Position {
  return {
    x: point.x * amount,
    y: point.y * amount,
  };
}

function fillRoadStrip(
  graphics: Phaser.GameObjects.Graphics,
  from: Position,
  to: Position,
  halfWidth: number,
  color: number,
  alpha: number
) {
  const vector = getRoadVector(from, to);
  const normal = scalePoint(vector.normal, halfWidth);
  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(from.x + normal.x, from.y + normal.y);
  graphics.lineTo(to.x + normal.x, to.y + normal.y);
  graphics.lineTo(to.x - normal.x, to.y - normal.y);
  graphics.lineTo(from.x - normal.x, from.y - normal.y);
  graphics.closePath();
  graphics.fillPath();
}

function pseudoRandom(seed: number, index: number) {
  const value = Math.sin((seed + index * 17.371) * 43758.5453123);
  return value - Math.floor(value);
}

function drawFogTileVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, explored: boolean) {
  if (explored) {
    graphics.fillStyle(0x000000, 0.28);
    drawFogDiamondPath(graphics, x, y, 0);
    graphics.fillPath();
  } else {
    const jitter = 0.5;
    graphics.fillStyle(0x010205, 1);
    drawFogDiamondPath(graphics, x, y, 4);
    graphics.fillPath();

    graphics.fillStyle(0x030611, 1);
    graphics.fillEllipse(x - 12 + jitter * 18, y - 4, 44, 17);
    graphics.fillEllipse(x + 10 - jitter * 16, y + 5, 36, 13);

    graphics.lineStyle(1, 0x0a1020, 0.9);
    drawFogDiamondPath(graphics, x, y, 4);
    graphics.strokePath();
  }
}

function drawFogNearTileVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
  graphics.fillStyle(0x000000, 0.18);
  drawFogDiamondPath(graphics, x, y, 0);
  graphics.fillPath();
}

function drawFogFrontierEdgeVisual(graphics: Phaser.GameObjects.Graphics, x: number, y: number, side: FogEdgeSide) {
  const points = getDiamondPoints(x, y);
  const edge = getFogEdge(points, side);

  fillEdgeStrip(graphics, edge.a, edge.b, { x, y }, 0.42, 0xb9c9d0, 0.06);
  fillEdgeStrip(graphics, edge.a, edge.b, { x, y }, 0.26, 0x6f8490, 0.08);
  fillEdgeStrip(graphics, edge.a, edge.b, { x, y }, 0.12, 0xf4fbff, 0.04);
}

function drawFogDiamondPath(graphics: Phaser.GameObjects.Graphics, x: number, y: number, padding: number) {
  graphics.beginPath();
  graphics.moveTo(x, y - TILE_HEIGHT / 2 - padding * 0.5);
  graphics.lineTo(x + TILE_WIDTH / 2 + padding, y);
  graphics.lineTo(x, y + TILE_HEIGHT / 2 + padding * 0.5);
  graphics.lineTo(x - TILE_WIDTH / 2 - padding, y);
  graphics.closePath();
}

function getDiamondPoints(x: number, y: number) {
  return {
    north: { x, y: y - TILE_HEIGHT / 2 },
    east: { x: x + TILE_WIDTH / 2, y },
    south: { x, y: y + TILE_HEIGHT / 2 },
    west: { x: x - TILE_WIDTH / 2, y },
  };
}

function getFogEdge(points: ReturnType<typeof getDiamondPoints>, side: FogEdgeSide) {
  switch (side) {
    case "northWest":
      return { a: points.north, b: points.west };
    case "northEast":
      return { a: points.north, b: points.east };
    case "southEast":
      return { a: points.east, b: points.south };
    case "southWest":
      return { a: points.south, b: points.west };
  }
}

function fillEdgeStrip(
  graphics: Phaser.GameObjects.Graphics,
  a: Position,
  b: Position,
  center: Position,
  amount: number,
  color: number,
  alpha: number
) {
  const innerA = lerpPoint(a, center, amount);
  const innerB = lerpPoint(b, center, amount);

  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(a.x, a.y);
  graphics.lineTo(b.x, b.y);
  graphics.lineTo(innerB.x, innerB.y);
  graphics.lineTo(innerA.x, innerA.y);
  graphics.closePath();
  graphics.fillPath();
}

function drawPolygonPath(graphics: Phaser.GameObjects.Graphics, points: Position[]) {
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath();
}

function drawRingPath(graphics: Phaser.GameObjects.Graphics, outer: Position[], inner: Position[]) {
  for (let i = 0; i < outer.length; i++) {
    const next = (i + 1) % outer.length;
    graphics.beginPath();
    graphics.moveTo(outer[i].x, outer[i].y);
    graphics.lineTo(outer[next].x, outer[next].y);
    graphics.lineTo(inner[next].x, inner[next].y);
    graphics.lineTo(inner[i].x, inner[i].y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }
}

function getMapOuterCorners(map: GameMap, paddingTiles = 0): Position[] {
  const min = -paddingTiles;
  const maxX = map.width - 1 + paddingTiles;
  const maxY = map.height - 1 + paddingTiles;
  const top = cartToIso(min, min);
  const right = cartToIso(maxX, min);
  const bottom = cartToIso(maxX, maxY);
  const left = cartToIso(min, maxY);

  return [
    { x: top.x, y: top.y - TILE_HEIGHT / 2 },
    { x: right.x + TILE_WIDTH / 2, y: right.y },
    { x: bottom.x, y: bottom.y + TILE_HEIGHT / 2 },
    { x: left.x - TILE_WIDTH / 2, y: left.y },
  ];
}

function liftPolygon(points: Position[], height: number): Position[] {
  return points.map((point) => ({ x: point.x, y: point.y - height }));
}

function getPolygonCenter(points: Position[]): Position {
  return points.reduce(
    (center, point) => ({
      x: center.x + point.x / points.length,
      y: center.y + point.y / points.length,
    }),
    { x: 0, y: 0 }
  );
}

function lerpPoint(from: Position, to: Position, amount: number): Position {
  return {
    x: Phaser.Math.Linear(from.x, to.x, amount),
    y: Phaser.Math.Linear(from.y, to.y, amount),
  };
}

function parseHexColor(color: string): number | null {
  const normalized = color.trim().replace(/^#/, "");
  const hex = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

function pickTerrainTexture(tile: MapTile): TerrainTopTexture | null {
  if (tile.terrain === TerrainType.WATER) return null;

  const textures = TERRAIN_TOP_TEXTURES[tile.terrain] as readonly TerrainTopTexture[] | undefined;
  if (!textures || textures.length === 0) return null;

  if (tile.road) {
    return findTextureByTag(textures, "clean") ?? textures[0];
  }

  const decorTags = getDecorTextureTags(tile.decor);
  const matchingTextures = decorTags.length > 0
    ? textures.filter((texture) => decorTags.some((tag) => texture.tags.includes(tag)))
    : [];
  const pool = matchingTextures.length > 0 ? matchingTextures : textures;
  const variantOffset = tile.decor && !tile.decor.blocking ? (tile.decor.variant ?? 0) : 0;
  const index = Math.floor(hashTile(tile.x + variantOffset * 11, tile.y + pool.length * 7) * pool.length);

  return pool[index] ?? textures[0];
}

function findTextureByTag(textures: readonly TerrainTopTexture[], tag: string) {
  return textures.find((texture) => texture.tags.includes(tag));
}

function getDecorTextureTags(decor: DecorItem | undefined): string[] {
  if (!decor || decor.blocking) return [];

  switch (decor.type) {
    case "grass-tuft":
      return ["grass"];
    case "flower":
      return ["flower"];
    case "rock-small":
    case "rock-large":
      return ["rock"];
    case "bush":
      return ["grass", "moss"];
    case "tree-pine":
      return ["needle", "moss"];
    case "tree-oak":
      return ["leaf", "moss"];
    case "tree-dead":
      return ["root", "leaf"];
    default:
      return [];
  }
}

function pickNaturalWallTreeSprite(tile: MapTile) {
  const roll = hashTile(tile.x + 37, tile.y + 73);

  if (tile.terrain === TerrainType.SNOW || tile.terrain === TerrainType.MOUNTAIN) {
    return roll > 0.82 ? MAP_SPRITES.decor.grove_dead : MAP_SPRITES.decor.grove_pine;
  }

  if (tile.terrain === TerrainType.SWAMP || tile.terrain === TerrainType.LAVA) {
    return roll > 0.72 ? MAP_SPRITES.decor.grove_pine : MAP_SPRITES.decor.grove_dead;
  }

  if (tile.terrain === TerrainType.FOREST) {
    return roll > 0.45 ? MAP_SPRITES.decor.grove_pine : MAP_SPRITES.decor.grove_oak;
  }

  return roll > 0.64 ? MAP_SPRITES.decor.grove_pine : MAP_SPRITES.decor.grove_oak;
}

function getTerrainTopTextureTransform(tile: MapTile) {
  const value = Math.floor(hashTile(tile.x + 101, tile.y + 211) * 8);
  return {
    angle: value >= 4 ? 180 : 0,
    flipX: value % 2 === 1,
    flipY: value % 4 >= 2,
  };
}

function applyTerrainTopTextureCrop(sprite: Phaser.GameObjects.Image) {
  const frameWidth = sprite.frame.width;
  const frameHeight = sprite.frame.height;
  const cropInsetX = Math.min(TERRAIN_TOP_TEXTURE_CROP_INSET, Math.max(0, Math.floor(frameWidth / 8)));
  const cropInsetY = Math.min(TERRAIN_TOP_TEXTURE_CROP_INSET, Math.max(0, Math.floor(frameHeight / 8)));

  if (cropInsetX <= 0 && cropInsetY <= 0) return;

  const cropWidth = Math.max(1, frameWidth - cropInsetX * 2);
  const cropHeight = Math.max(1, frameHeight - cropInsetY * 2);
  sprite.setCrop(cropInsetX, cropInsetY, cropWidth, cropHeight);
}

function drawTileTexture(graphics: Phaser.GameObjects.Graphics, tile: MapTile, isoX: number, isoY: number) {
  const jitter = hashTile(tile.x, tile.y);
  if (tile.terrain === TerrainType.WATER) {
    graphics.lineStyle(1, 0x6fb7d8, 0.22);
    graphics.beginPath();
    graphics.moveTo(isoX - 13, isoY - 1 + jitter * 2);
    graphics.lineTo(isoX + 13, isoY - 1 + jitter * 2);
    graphics.moveTo(isoX - 8, isoY + 5 - jitter * 2);
    graphics.lineTo(isoX + 8, isoY + 5 - jitter * 2);
    graphics.strokePath();
    return;
  }

  if (tile.terrain === TerrainType.SAND) {
    graphics.fillStyle(0x7b5b37, 0.18);
    graphics.fillCircle(isoX - 8 + jitter * 4, isoY + 3, 1.5);
    graphics.fillCircle(isoX + 7, isoY - 4 + jitter * 3, 1.2);
    drawScenicDecorTexture(graphics, tile, isoX, isoY, jitter);
    return;
  }

  if (tile.terrain === TerrainType.MOUNTAIN) {
    graphics.lineStyle(1, 0x3f3f3f, 0.32);
    graphics.beginPath();
    graphics.moveTo(isoX - 12, isoY + 3);
    graphics.lineTo(isoX - 2, isoY - 7);
    graphics.lineTo(isoX + 10, isoY + 4);
    graphics.strokePath();
    drawScenicDecorTexture(graphics, tile, isoX, isoY, jitter);
    return;
  }

  if (tile.terrain === TerrainType.FOREST) {
    graphics.fillStyle(0x17461f, 0.24);
    graphics.fillCircle(isoX - 7, isoY, 3);
    graphics.fillCircle(isoX + 4, isoY - 3, 2.5);
    drawScenicDecorTexture(graphics, tile, isoX, isoY, jitter);
    return;
  }

  if (tile.terrain === TerrainType.LAVA) {
    graphics.lineStyle(2, 0xff5a1f, 0.35);
    graphics.beginPath();
    graphics.moveTo(isoX - 11, isoY + 2);
    graphics.lineTo(isoX - 2, isoY - 2);
    graphics.lineTo(isoX + 9, isoY + 3);
    graphics.strokePath();
    return;
  }

  drawScenicDecorTexture(graphics, tile, isoX, isoY, jitter);
}

function drawScenicDecorTexture(
  graphics: Phaser.GameObjects.Graphics,
  tile: MapTile,
  isoX: number,
  isoY: number,
  jitter: number
) {
  const decor = tile.decor;
  if (!decor || decor.blocking || !isAllowedDecor(decor.type)) return;

  const variant = decor.variant ?? 0;
  const offset = ((variant % 3) - 1) * 3;
  const lean = jitter > 0.5 ? 1 : -1;

  switch (decor.type) {
    case "tree-pine":
      drawNeedleTexture(graphics, isoX + offset, isoY, lean);
      break;
    case "tree-oak":
      drawLeafTexture(graphics, isoX + offset, isoY, 0x2f7a34, 0x7fc96a);
      break;
    case "tree-dead":
      drawTwigTexture(graphics, isoX + offset, isoY, lean);
      break;
    case "rock-large":
      drawRockTexture(graphics, isoX + offset, isoY, 1);
      break;
    case "rock-small":
      drawRockTexture(graphics, isoX + offset, isoY, 0.62);
      break;
    case "bush":
      drawLeafTexture(graphics, isoX + offset, isoY + 1, 0x2d7430, 0x9ad877);
      break;
    case "flower":
      drawFlowerTexture(graphics, isoX + offset, isoY, variant);
      break;
    case "grass-tuft":
      drawGrassTexture(graphics, isoX + offset, isoY, variant);
      break;
  }
}

function drawNeedleTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, lean: number) {
  graphics.fillStyle(0x174d22, 0.28);
  graphics.fillEllipse(isoX, isoY + 3, 30, 9);
  graphics.lineStyle(2, 0x2f8b3f, 0.6);
  graphics.beginPath();
  graphics.moveTo(isoX - 16, isoY + 4);
  graphics.lineTo(isoX - 6 + lean, isoY - 4);
  graphics.lineTo(isoX + 3, isoY + 5);
  graphics.moveTo(isoX - 6, isoY + 6);
  graphics.lineTo(isoX + 6 + lean, isoY - 5);
  graphics.lineTo(isoX + 17, isoY + 4);
  graphics.strokePath();
  graphics.lineStyle(1, 0xa8d483, 0.22);
  graphics.beginPath();
  graphics.moveTo(isoX - 12, isoY + 2);
  graphics.lineTo(isoX + 13, isoY + 2);
  graphics.strokePath();
}

function drawLeafTexture(
  graphics: Phaser.GameObjects.Graphics,
  isoX: number,
  isoY: number,
  baseColor: number,
  highlightColor: number
) {
  graphics.fillStyle(0x0d2a12, 0.2);
  graphics.fillEllipse(isoX, isoY + 4, 32, 9);
  graphics.fillStyle(baseColor, 0.42);
  graphics.fillCircle(isoX - 9, isoY + 1, 5);
  graphics.fillCircle(isoX + 1, isoY - 3, 6);
  graphics.fillCircle(isoX + 11, isoY + 2, 4.5);
  graphics.fillEllipse(isoX + 1, isoY + 4, 25, 8);
  graphics.fillStyle(highlightColor, 0.22);
  graphics.fillCircle(isoX - 3, isoY - 4, 2.2);
  graphics.fillCircle(isoX + 9, isoY, 1.8);
}

function drawTwigTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, lean: number) {
  graphics.fillStyle(0x1f130b, 0.18);
  graphics.fillEllipse(isoX, isoY + 5, 34, 7);
  graphics.lineStyle(2, 0x6f4b2d, 0.62);
  graphics.beginPath();
  graphics.moveTo(isoX - 15, isoY + 4);
  graphics.lineTo(isoX - 4, isoY - 2);
  graphics.lineTo(isoX + 13, isoY + 4);
  graphics.moveTo(isoX - 4, isoY - 2);
  graphics.lineTo(isoX + lean * 2, isoY - 9);
  graphics.moveTo(isoX + 4, isoY + 1);
  graphics.lineTo(isoX + 14, isoY - 5);
  graphics.strokePath();
  graphics.lineStyle(1, 0xb98955, 0.32);
  graphics.beginPath();
  graphics.moveTo(isoX - 10, isoY + 2);
  graphics.lineTo(isoX + 8, isoY + 3);
  graphics.strokePath();
}

function drawRockTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, scale: number) {
  drawFlatRock(graphics, isoX - 9 * scale, isoY + 2, 9 * scale, 4 * scale, 0x7d8587);
  drawFlatRock(graphics, isoX + 3 * scale, isoY - 2, 12 * scale, 5 * scale, 0xa1aaa9);
  drawFlatRock(graphics, isoX + 13 * scale, isoY + 4, 7 * scale, 3.5 * scale, 0x626b6e);
}

function drawFlatRock(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number
) {
  graphics.fillStyle(0x101516, 0.16);
  graphics.fillEllipse(x, y + height * 0.8, width * 2, height * 1.2);
  graphics.fillStyle(color, 0.72);
  graphics.beginPath();
  graphics.moveTo(x - width, y + height * 0.2);
  graphics.lineTo(x - width * 0.35, y - height);
  graphics.lineTo(x + width * 0.35, y - height * 0.75);
  graphics.lineTo(x + width, y);
  graphics.lineTo(x + width * 0.55, y + height);
  graphics.lineTo(x - width * 0.55, y + height);
  graphics.closePath();
  graphics.fillPath();
  graphics.fillStyle(0xffffff, 0.16);
  graphics.fillCircle(x - width * 0.25, y - height * 0.35, Math.max(1, height * 0.25));
}

function drawFlowerTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, variant: number) {
  drawGrassTexture(graphics, isoX, isoY, variant);
  const colors = [0xff7da2, 0xffd166, 0x9ad7ff, 0xf6f7a8];
  const points = [
    [isoX - 9, isoY + 2],
    [isoX - 1, isoY - 2],
    [isoX + 8, isoY + 3],
    [isoX + 15, isoY + 6],
  ];
  for (let i = 0; i < points.length; i++) {
    graphics.fillStyle(colors[(i + variant) % colors.length], 0.88);
    graphics.fillCircle(points[i][0], points[i][1], 1.4);
  }
}

function drawGrassTexture(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, variant: number) {
  graphics.fillStyle(0x0a2a0d, 0.14);
  graphics.fillEllipse(isoX, isoY + 6, 32, 6);
  graphics.lineStyle(1, 0x2f7d34, 0.7);
  graphics.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = isoX - 16 + i * 4;
    const h = 5 + ((i + variant) % 4);
    const lean = i % 2 === 0 ? -2 : 2;
    graphics.moveTo(x, isoY + 6);
    graphics.lineTo(x + lean, isoY + 6 - h);
  }
  graphics.strokePath();
  graphics.lineStyle(1, 0x9bd36d, 0.22);
  graphics.beginPath();
  graphics.moveTo(isoX - 13, isoY + 4);
  graphics.lineTo(isoX + 13, isoY + 5);
  graphics.strokePath();
}

function drawWaterAnimation(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, seed: number, time: number) {
  const phase = time * 0.0012 + seed * Math.PI * 2;
  const pulse = (Math.sin(phase * 1.4) + 1) / 2;
  const drift = ((phase * 9) % 18) - 9;

  graphics.clear();
  graphics.fillStyle(0x6cc9ee, 0.08 + pulse * 0.05);
  drawDiamondPath(graphics, isoX, isoY);
  graphics.fillPath();

  graphics.lineStyle(1, 0xb8ecff, 0.18 + pulse * 0.14);
  graphics.beginPath();
  graphics.moveTo(isoX - 20 + drift * 0.45, isoY - 7 + Math.sin(phase) * 1.5);
  graphics.lineTo(isoX - 5 + drift * 0.45, isoY - 12 + Math.cos(phase) * 1.1);
  graphics.lineTo(isoX + 16 + drift * 0.45, isoY - 7 + Math.sin(phase + 1.2) * 1.4);
  graphics.moveTo(isoX - 14 - drift * 0.35, isoY + 4 + Math.cos(phase * 1.2) * 1.2);
  graphics.lineTo(isoX + 2 - drift * 0.35, isoY + 8 + Math.sin(phase + 0.7) * 1.2);
  graphics.lineTo(isoX + 18 - drift * 0.35, isoY + 4 + Math.cos(phase + 1.6) * 1.2);
  graphics.strokePath();

  graphics.lineStyle(1, 0x104b74, 0.14);
  graphics.beginPath();
  graphics.moveTo(isoX - 24, isoY + 12 + Math.sin(phase + 2.1) * 1.2);
  graphics.lineTo(isoX - 6, isoY + 15 + Math.cos(phase + 1.3) * 0.9);
  graphics.lineTo(isoX + 24, isoY + 11 + Math.sin(phase + 0.4) * 1.2);
  graphics.strokePath();
}

function drawLavaAnimation(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, seed: number, time: number) {
  const phase = time * 0.0017 + seed * Math.PI * 2;
  const pulse = (Math.sin(phase * 2.1) + 1) / 2;
  const ember = (Math.sin(phase * 3.4 + seed * 5) + 1) / 2;

  graphics.clear();
  graphics.fillStyle(0xff7a1f, 0.08 + pulse * 0.1);
  drawDiamondPath(graphics, isoX, isoY);
  graphics.fillPath();

  graphics.lineStyle(2, 0xffd15c, 0.32 + pulse * 0.28);
  graphics.beginPath();
  graphics.moveTo(isoX - 24, isoY - 1 + Math.sin(phase) * 2);
  graphics.lineTo(isoX - 12, isoY - 6 + Math.cos(phase * 0.9) * 2);
  graphics.lineTo(isoX + 1, isoY - 2 + Math.sin(phase + 1.1) * 2);
  graphics.lineTo(isoX + 20, isoY - 8 + Math.cos(phase + 0.8) * 2);
  graphics.moveTo(isoX - 15, isoY + 8 + Math.cos(phase + 1.7) * 2);
  graphics.lineTo(isoX - 2, isoY + 3 + Math.sin(phase * 1.1) * 2);
  graphics.lineTo(isoX + 15, isoY + 9 + Math.cos(phase + 2.4) * 2);
  graphics.strokePath();

  graphics.lineStyle(1, 0x6f170f, 0.3);
  graphics.beginPath();
  graphics.moveTo(isoX - 28, isoY + 11 + Math.sin(phase + 0.5));
  graphics.lineTo(isoX - 8, isoY + 15 + Math.cos(phase + 0.2));
  graphics.lineTo(isoX + 24, isoY + 10 + Math.sin(phase + 1.8));
  graphics.strokePath();

  graphics.fillStyle(0xfff0a3, 0.2 + ember * 0.28);
  graphics.fillCircle(isoX - 9 + Math.sin(phase * 1.6) * 3, isoY - 3 + Math.cos(phase) * 2, 1.4);
  graphics.fillCircle(isoX + 10 + Math.cos(phase * 1.2) * 3, isoY + 4 + Math.sin(phase * 1.3) * 2, 1.1);
}

function hashTile(x: number, y: number): number {
  const n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967295;
}

function isAllowedDecor(kind: DecorKind) {
  return (
    kind === "tree-pine" ||
    kind === "tree-oak" ||
    kind === "tree-dead" ||
    kind === "grove-pine" ||
    kind === "grove-oak" ||
    kind === "grove-dead" ||
    kind === "rock-large" ||
    kind === "rock-small" ||
    kind === "boulder-cluster" ||
    kind === "bush" ||
    kind === "flower" ||
    kind === "grass-tuft"
  );
}

function getObjectMetrics(object: MapObjectData) {
  if (object.type === "hero") {
    const sheet = object.onWater ? getBoatSpritesheet(object.faction) : getHeroSpritesheet(object.faction);
    if (sheet) return object.inTown
      ? { width: sheet.townDisplayWidth, height: sheet.townDisplayHeight, offsetY: TOWN_HERO_OFFSET_Y }
      : { width: sheet.displayWidth, height: sheet.displayHeight, offsetY: object.onWater ? MAP_OBJECT_FOOT_OFFSET_Y : HERO_OFFSET_Y };
    return object.inTown
      ? { width: 30, height: 30, offsetY: TOWN_HERO_OFFSET_Y }
      : { width: 44, height: 44, offsetY: HERO_OFFSET_Y };
  }
  if (object.type === "town") return { width: 146, height: 110, offsetY: TOWN_OFFSET_Y };
  if (object.type === "building") return { width: RESOURCE_BUILDING_DISPLAY_SIZE, height: RESOURCE_BUILDING_DISPLAY_SIZE, offsetY: RESOURCE_BUILDING_OFFSET_Y };
  if (object.type === "adventure_building") return object.buildingType === "stargate"
    ? { width: 56, height: 56, offsetY: ADVENTURE_BUILDING_OFFSET_Y }
    : { width: 50, height: 50, offsetY: ADVENTURE_BUILDING_OFFSET_Y };
  if (object.type === "combat") return { width: 48, height: 48, offsetY: MAP_OBJECT_FOOT_OFFSET_Y };
  return null;
}

function getObjectHitboxScale(object: MapObjectData) {
  if (object.type === "town") return { width: 0.62, height: 0.58 };
  if (object.type === "hero") return object.inTown
    ? { width: 0.72, height: 0.88 }
    : { width: 0.64, height: 0.82 };
  if (object.type === "building") return { width: 0.72, height: 0.74 };
  if (object.type === "adventure_building") return { width: 0.72, height: 0.72 };
  if (object.type === "combat") return { width: 0.78, height: 0.78 };
  return { width: 0.8, height: 0.8 };
}

function getHeroTravelMetrics(object: MapObjectData) {
  return getObjectMetrics({ ...object, inTown: false }) ?? getObjectMetrics(object)!;
}

function getHeroBannerMetrics(object: MapObjectData) {
  if (object.inTown) return { xOffset: 7, baseOffsetY: 10, poleHeight: 27, width: 7, height: 5 };
  return { xOffset: 10, baseOffsetY: 8, poleHeight: 42, width: 9, height: 6 };
}

function getHeroDirection(from: Position, to: Position, fallback: HeroDirection): HeroDirection {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  if (dx === 0 && dy === 0) return fallback;
  if (dx === 0 && dy > 0) return "sw";
  if (dx === 0 && dy < 0) return "ne";
  if (dx > 0 && dy === 0) return "se";
  if (dx < 0 && dy === 0) return "nw";
  if (dx > 0 && dy > 0) return "s";
  if (dx < 0 && dy < 0) return "n";
  if (dx > 0 && dy < 0) return "e";
  return "w";
}

function getDirectionalAnimationKey(sheet: DirectionalSpritesheet, direction: HeroDirection, state: DirectionalSpriteState) {
  return `${sheet.animationPrefix}-${direction}-${state}`;
}

function animateHeroSprite(hero: HeroSpriteAnimation, time: number) {
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
