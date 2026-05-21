import Phaser from "phaser";
import { getSavedAudioMuted, getSavedEffectsVolume } from "@/lib/audio/musicPreferences";
import { DecorItem, GameMap, MapObject, MapTile, Position, RoadType, TerrainType } from "@/lib/game/types";
import { MapObjectData, MapRenderer, type RendererLoadingProgress } from "@/lib/rendering/mapRenderer";
import { BASE_HEIGHT, TILE_HEIGHT, TILE_WIDTH, cartToIso, isoToCart } from "@/lib/rendering/phaser/iso";
import { DIRECTIONAL_SPRITESHEETS, HERO_DIRECTIONS, MAP_SPRITES, MAP_SPRITE_PATHS, getBoatSpritesheet, getHeroSpritesheet, getMonsterSpritePath, getTownSpritePath, type DirectionalSpriteState, type HeroDirection, type TerrainTopTexture } from "@/lib/rendering/phaser/assets";
import {
  DEFAULT_SPRITE_ORIGIN,
  GATE_DEPTH_CLEARANCE,
  GATE_DISPLAY_HEIGHT,
  GATE_DISPLAY_WIDTH,
  GATE_OFFSET_Y,
  GATE_ORIGIN_X,
  GATE_ORIGIN_Y,
  MAP_OBJECT_ORIGIN_X,
  MAP_OBJECT_ORIGIN_Y,
  MONSTER_OFFSET_Y,
  RESOURCE_PICKUP_OFFSET_Y,
  getMapObjectHoverText,
  getMapObjectHoverY,
  getOriginForMapTileObject,
  getOriginForObject,
  isEmptyPassableTile,
} from "@/lib/rendering/phaser/mapObjectLayout";
import { TERRAIN_SIDE_DARK, TERRAIN_SIDE_LIT, TERRAIN_TOP } from "@/lib/rendering/phaser/terrainColors";
import {
  ROAD_RENDER_STYLES,
  ROAD_SIDE_SEEDS,
  type RoadSide,
} from "@/lib/rendering/phaser/roadConstants";
import {
  FOG_CHUNK_MARGIN,
  FOG_CHUNK_SIZE,
  FOG_PLANE_CLEARANCE,
  FOG_STAMP_CONFIG,
  FOG_STAMP_HALF_HEIGHT,
  FOG_STAMP_HALF_WIDTH,
  FOG_STAMP_TEXTURE_KEYS,
  FOG_TILE_EXPLORED,
  FOG_TILE_UNEXPLORED,
  FOG_TILE_UNINITIALIZED,
  FOG_TILE_VISIBLE,
  FOG_UNEXPLORED_STAMP_CONFIG,
  type FogChunk,
  type FogChunkBounds,
  type FogStampKey,
  type FogTileState,
} from "@/lib/rendering/phaser/fogConstants";
import {
  BOARD_LIP_EXTRA_HEIGHT,
  BOARD_THICKNESS,
  CAMERA_ZOOM_STEP,
  HOVER_LABEL_SAMPLE_MS,
  LAVA_TEXTURE_PREFIX,
  MAP_LAYER_BASE_DEPTH,
  MAP_LAYER_COVER_DEPTH,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  MOVEMENT_SOUNDS,
  REACHABLE_TILE_ALPHA,
  REACHABLE_TILE_COLOR,
  TERRAIN_ANIMATION_FRAME_COUNT,
  TERRAIN_ANIMATION_INTERVAL_MS,
  TERRAIN_FACE_RENDER_ORDER,
  WATER_TEXTURE_PREFIX,
  type MovementSoundKind,
} from "@/lib/rendering/phaser/mapRenderSettings";
import {
  BLOCKING_DECOR_GROUND_OFFSET,
  BLOCKING_DECOR_ORIGINS,
  BLOCKING_DECOR_SPRITE_METRICS,
  BLOCKING_DECOR_SPRITE_SIZE,
  DECOR_SPRITES,
} from "@/lib/rendering/phaser/decorConstants";
import {
  extendRoadPoint,
  getRoadAnchorPoints,
  getRoadCenterStampSpec,
  getRoadStampSpec,
} from "@/lib/rendering/phaser/roadGeometry";
import { generateFogStampTextures } from "@/lib/rendering/phaser/fogRender";
import { drawDiamondPath, hashTile, lerpPoint, pseudoRandom } from "@/lib/rendering/phaser/pointMath";
import {
  generateTerrainAnimationTextures,
  getTerrainFrameOffset,
  getTerrainTextureKey,
  updateTerrainEffectFrame,
  type LavaTileEffect,
  type WaterTileEffect,
} from "@/lib/rendering/phaser/terrainAnimation";
import {
  applyTerrainTopTextureCrop,
  drawTileTexture,
  getTerrainTopTextureTransform,
  isAllowedDecor,
} from "@/lib/rendering/phaser/decorTextures";
import {
  drawTerrainSideDetails,
  drawTerrainSideEdges,
  getMaxTileDepth,
  getTerrainSideExposure,
  getTerrainSideFaceColor,
  getTerrainSideFacePoints,
  getTerrainTopStroke,
  getTileDepth,
  type TerrainSideVisibility,
} from "@/lib/rendering/phaser/terrainFaceRender";
import {
  getGateBannerPlacement,
  getHeroBannerMetrics,
  getHeroTravelMetrics,
  getObjectHitboxScale,
  getObjectMetrics,
} from "@/lib/rendering/phaser/objectMetrics";
import {
  animateHeroSprite,
  getDirectionalAnimationKey,
  getHeroDirection,
  type HeroSpriteAnimation,
} from "@/lib/rendering/phaser/heroSprite";
import {
  drawBoulderCluster,
  drawBush,
  drawDeadGrove,
  drawDeadTree,
  drawDecorShadow,
  drawFlowers,
  drawGrassTuft,
  drawOakGrove,
  drawOakTree,
  drawPineGrove,
  drawPineTree,
  drawRockCluster,
  drawSmallRock,
} from "@/lib/rendering/phaser/decorDrawing";
import {
  drawCornerBolts,
  drawRoadSegment,
  drawWoodGrain,
} from "@/lib/rendering/phaser/boardAndWallDrawing";

type FailedLoaderFile = {
  key?: unknown;
  src?: unknown;
  url?: unknown;
};

import {
  areObjectsRenderEquivalent,
  type BrickWallOrientation,
  drawPolygonPath,
  drawRingPath,
  getBrickRampartPlacement,
  getBrickWallAxis,
  getBrickWallVectors,
  getMapOuterCorners,
  isSpritePointInView,
  isTerrainEffectInView,
  liftPolygon,
  parseHexColor,
  pickNaturalWallTreeSprite,
  pickTerrainTexture,
  shouldRebuildHero,
} from "@/lib/rendering/phaser/mapRenderHelpers";

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
  private exploredTiles: Set<string> | null = null;
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
  private failedAssetKeys = new Set<string>();
  private isLoadingDynamicTextures = false;
  private pendingDynamicTextureKeys = new Set<string>();
  private queuedMapRender: GameMap | null = null;
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
    this.load.on("loaderror", (file: FailedLoaderFile) => {
      const key = this.getFailedAssetKey(file);
      if (!key) return;
      this.failedAssetKeys.add(key);
      console.warn(`[map] Asset failed to load, using fallback texture: ${key}`);
    });
    this.load.once("complete", () => {
      this.ensureFallbackTextures();
      this.loadingProgressCallback?.(89, "Preparation de la scene...");
    });

    for (const path of MAP_SPRITE_PATHS) {
      this.load.image(path, path);
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
    if (this.loadMissingMapTextures(map)) return;

    this.fogPlaneDepth = getMaxTileDepth(map) + FOG_PLANE_CLEARANCE;
    this.waterTiles = [];
    this.lavaTiles = [];
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
    this.redrawCurrentFog();
  }

  private loadMissingMapTextures(map: GameMap) {
    if (this.isLoadingDynamicTextures) {
      this.queuedMapRender = map;
      return true;
    }

    const paths = this.getDynamicMapTexturePaths(map).filter((path) => !this.textures.exists(path));
    if (paths.length === 0) return false;

    this.isLoadingDynamicTextures = true;
    this.queuedMapRender = map;
    this.pendingDynamicTextureKeys = new Set(paths);
    for (const path of paths) {
      this.load.image(path, path);
    }
    this.load.once("complete", () => {
      this.isLoadingDynamicTextures = false;
      this.pendingDynamicTextureKeys.clear();
      this.ensureFallbackTextures();
      const queued = this.queuedMapRender;
      this.queuedMapRender = null;
      if (queued) this.renderMap(queued);
    });
    this.load.start();
    return true;
  }

  private getDynamicMapTexturePaths(map: GameMap) {
    const paths = new Set<string>();
    for (const row of map.tiles) {
      for (const tile of row) {
        const object = tile.object;
        if (object?.type === "monster") {
          paths.add(getMonsterSpritePath(object.subtype));
        }
      }
    }
    return [...paths];
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

    drawWoodGrain(top, outerTop, innerTop);
    drawCornerBolts(top, outerTop);
    this.boardLipLayer.add(top);
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
      drawRoadSegment(_graphics, center, anchor, style);
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

    drawDecorShadow(batchGraphics, isoX, baseY, kind);

    switch (kind) {
      case "tree-pine":
        drawPineTree(batchGraphics, isoX, baseY, scale);
        break;
      case "tree-oak":
        drawOakTree(batchGraphics, isoX, baseY, scale);
        break;
      case "tree-dead":
        drawDeadTree(batchGraphics, isoX, baseY, scale);
        break;
      case "grove-pine":
        drawPineGrove(batchGraphics, isoX, baseY, scale);
        break;
      case "grove-oak":
        drawOakGrove(batchGraphics, isoX, baseY, scale);
        break;
      case "grove-dead":
        drawDeadGrove(batchGraphics, isoX, baseY, scale);
        break;
      case "rock-large":
        drawRockCluster(batchGraphics, isoX, baseY, scale);
        break;
      case "rock-small":
        drawSmallRock(batchGraphics, isoX, baseY, scale);
        break;
      case "boulder-cluster":
        drawBoulderCluster(batchGraphics, isoX, baseY, scale);
        break;
      case "bush":
        drawBush(batchGraphics, isoX, baseY, scale);
        break;
      case "flower":
        drawFlowers(batchGraphics, isoX, baseY, scale, variant);
        break;
      case "grass-tuft":
        drawGrassTuft(batchGraphics, isoX, baseY, scale, variant);
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



  setObjects(objects: MapObjectData[]) {
    this.objects = objects;
    this.renderObjects();
  }

  setFog(visibleTiles: Set<string>, exploredTiles: Set<string>) {
    if (!this.map) return;
    this.visibleTiles = new Set(visibleTiles);
    this.exploredTiles = new Set(exploredTiles);
    if (this.isLoadingDynamicTextures) return;
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

  private redrawCurrentFog() {
    if (!this.visibleTiles || !this.exploredTiles) return;
    const visibleTiles = new Set(this.visibleTiles);
    const exploredTiles = new Set(this.exploredTiles);
    this.fogTileStates = null;
    this.setFog(visibleTiles, exploredTiles);
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
    const mapGateHits = this.getMapGateObjectsNearWorld(world.x, world.y)
      .filter((object) => this.isPointInsideObject(world.x, world.y, object));
    const hits = this.dedupeObjectHits([...objectHits, ...mapGateHits]);
    if (hits.length > 0) {
      return hits.sort((a, b) => this.getObjectDepth(b) - this.getObjectDepth(a));
    }

    const tile = this.getTileAtScreen(screenX, screenY);
    if (!tile) return [];
    return this.dedupeObjectHits([
      ...this.objects.filter((object) => object.x === tile.x && object.y === tile.y),
      ...this.getMapGateObjectsAtTile(tile),
    ]);
  }

  private dedupeObjectHits(objects: MapObjectData[]) {
    const seen = new Set<string>();
    return objects.filter((object) => {
      const key = `${object.type}:${object.id}:${object.x},${object.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private getMapGateObjectsNearWorld(worldX: number, worldY: number) {
    if (!this.map) return [];
    const cart = isoToCart(worldX, worldY);
    const centerX = Math.round(cart.x);
    const centerY = Math.round(cart.y);
    const gates: MapObjectData[] = [];

    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) continue;
        const tile = this.map.tiles[y]?.[x];
        const gate = this.mapGateTileToObject(tile);
        if (gate) gates.push(gate);
      }
    }

    return gates;
  }

  private getMapGateObjectsAtTile(position: Position) {
    if (!this.map) return [];
    const tile = this.map.tiles[position.y]?.[position.x];
    const gate = this.mapGateTileToObject(tile);
    return gate ? [gate] : [];
  }

  private mapGateTileToObject(tile: MapTile | undefined): MapObjectData | null {
    const object = tile?.object;
    if (!tile || object?.type !== "gate") return null;

    return {
      type: "gate",
      id: object.id,
      playerId: object.ownerId ?? null,
      x: tile.x,
      y: tile.y,
      faction: "",
      color: "",
      name: object.ownerId ? "Porte controlee" : "Porte neutre",
      guardianPower: object.guardianPower ?? 0,
    };
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
        this.renderMapObject(tile.object, iso.x, this.getSurfaceY(x, y), tile);
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
    isoY: number,
    tile?: MapTile,
  ) {
    if (object.type === "resource" && object.subtype) {
      const sprite = this.add.image(isoX, isoY + RESOURCE_PICKUP_OFFSET_Y, MAP_SPRITES.resources[object.subtype]);
      const origin = getOriginForMapTileObject(object);
      sprite.setOrigin(origin.originX, origin.originY);
      sprite.setDisplaySize(38, 38);
      sprite.setDepth(isoY + RESOURCE_PICKUP_OFFSET_Y);
      this.mapObjectLayer.add(sprite);
    } else if (object.type === "monster") {
      const textureKey = getMonsterSpritePath(object.subtype);
      this.ensureFallbackTexture(textureKey, "unit");
      const sprite = this.add.image(isoX, isoY + MONSTER_OFFSET_Y, textureKey);
      const origin = getOriginForMapTileObject(object);
      sprite.setOrigin(origin.originX, origin.originY);
      sprite.setDisplaySize(46, 46);
      sprite.setDepth(isoY + MONSTER_OFFSET_Y);
      this.mapObjectLayer.add(sprite);
    } else if (object.type === "gate") {
      this.addGateSprite(isoX, isoY, object, tile);
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

  private addGateSprite(isoX: number, isoY: number, object: MapObject, tile?: MapTile) {
    const textureKey = this.getGateSpritePath(tile);
    this.ensureFallbackTexture(textureKey, "map");
    const sprite = this.add.image(isoX, isoY + GATE_OFFSET_Y, textureKey);
    sprite.setOrigin(GATE_ORIGIN_X, GATE_ORIGIN_Y);
    sprite.setDisplaySize(GATE_DISPLAY_WIDTH, GATE_DISPLAY_HEIGHT);
    sprite.setDepth(this.getGateSpriteDepth(isoY));
    if (object.ownerId) sprite.setTint(0xe8f0ff);
    this.mapObjectLayer.add(sprite);
  }

  private getGateSpriteDepth(isoY: number) {
    const visualFootOffset = GATE_DISPLAY_HEIGHT * (1 - GATE_ORIGIN_Y);
    return isoY + GATE_OFFSET_Y + visualFootOffset + GATE_DEPTH_CLEARANCE;
  }

  private getGateSpritePath(tile?: MapTile) {
    if (!tile) return MAP_SPRITES.gates.diagonalDown;
    const roadAxis = tile.object?.type === "gate" ? tile.object.roadAxis : undefined;
    if (roadAxis === "x") return MAP_SPRITES.gates.diagonalUp;
    if (roadAxis === "y") return MAP_SPRITES.gates.diagonalDown;

    const connections = this.getRoadConnections(tile);
    const diagonalDownScore = connections.filter((side) => side === "northWest" || side === "southEast").length;
    const diagonalUpScore = connections.filter((side) => side === "northEast" || side === "southWest").length;
    if (diagonalDownScore !== diagonalUpScore) {
      // The gate wall must cross the road perpendicularly so the road runs
      // through the portcullis. gate-diagonal-down.webp is authored with its
      // wall on the screen "\" diagonal, so it serves a "/" road (NE/SW),
      // and the mirrored gate-diagonal-up.webp serves a "\" road (NW/SE).
      return diagonalDownScore > diagonalUpScore
        ? MAP_SPRITES.gates.diagonalUp
        : MAP_SPRITES.gates.diagonalDown;
    }

    // No road: align the gate wall with the surrounding brick-wall axis.
    const orientation = this.getWallOrientation(tile);
    return orientation === "y" || orientation === "diagonalUp"
      ? MAP_SPRITES.gates.diagonalUp
      : MAP_SPRITES.gates.diagonalDown;
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
    const map = this.map;
    if (!map) return null;

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
    } else if (object.type === "gate") {
      const tile = map.tiles[object.y]?.[object.x];
      const textureKey = this.getGateSpritePath(tile);
      const sprite = this.addObjectSprite(
        object,
        iso.x,
        surfaceY + GATE_OFFSET_Y,
        textureKey,
        GATE_DISPLAY_WIDTH,
        GATE_DISPLAY_HEIGHT,
        getOriginForObject(object),
      );
      if (!sprite) return null;
      sprite.setDepth(this.getGateSpriteDepth(surfaceY));
      if (object.playerId) sprite.setTint(0xe8f0ff);
      rendered.sprite = sprite;
      if (object.playerId) {
        const bounds = this.getObjectBounds(object);
        if (bounds) {
          const width = bounds.right - bounds.left;
          const height = bounds.bottom - bounds.top;
          const bannerPlacement = getGateBannerPlacement(textureKey);
          rendered.banner = this.addBanner(
            this.objectLayer,
            bounds.left + width * bannerPlacement.xRatio,
            bounds.top + height * bannerPlacement.yRatio,
            object.color || "#808080",
            18,
            12,
            sprite.depth + 24,
          );
        }
      }
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
    if (getSavedAudioMuted()) return;

    const effectsVolume = getSavedEffectsVolume();
    if (effectsVolume <= 0) return;

    const soundConfig = MOVEMENT_SOUNDS[kind];
    const now = this.time.now;
    if (now - this.lastMovementSoundAt[kind] < soundConfig.minIntervalMs) {
      return;
    }

    let started = false;
    try {
      started = this.sound.play(soundConfig.key, {
        volume: soundConfig.volume * effectsVolume,
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

  private getFailedAssetKey(file: FailedLoaderFile) {
    const rawKey = file.key ?? file.src ?? file.url;
    return typeof rawKey === "string" && rawKey.trim().length > 0 ? rawKey : null;
  }

  private ensureFallbackTextures() {
    for (const key of this.failedAssetKeys) {
      this.ensureFallbackTexture(key, this.getFallbackTextureKind(key));
    }
  }

  private getFallbackTextureKind(path: string): "map" | "town" | "unit" {
    if (path.includes("/assets/sprites/units/")) return "unit";
    if (path.includes("/assets/sprites/map/town-")) return "town";
    return "map";
  }

  private ensureFallbackTexture(path: string, kind: "map" | "town" | "unit" = "map") {
    if (!path || this.textures.exists(path)) return;
    if (this.pendingDynamicTextureKeys.has(path)) return;

    const size = kind === "town" ? { width: 88, height: 72 } : kind === "unit" ? { width: 48, height: 48 } : { width: 56, height: 56 };
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.clear();
    graphics.fillStyle(kind === "town" ? 0x28364f : kind === "unit" ? 0x35445a : 0x34413a, 1);
    graphics.fillRect(0, 0, size.width, size.height);
    graphics.lineStyle(2, 0xf2cf75, 0.95);
    graphics.strokeRect(1, 1, size.width - 2, size.height - 2);

    if (kind === "town") {
      graphics.fillStyle(0x8ea5bd, 1);
      graphics.fillTriangle(size.width * 0.18, size.height * 0.62, size.width * 0.5, size.height * 0.22, size.width * 0.82, size.height * 0.62);
      graphics.fillStyle(0xb8c6d6, 1);
      graphics.fillRect(size.width * 0.24, size.height * 0.58, size.width * 0.52, size.height * 0.28);
      graphics.fillStyle(0x5a3a24, 1);
      graphics.fillRect(size.width * 0.44, size.height * 0.68, size.width * 0.12, size.height * 0.18);
    } else if (kind === "unit") {
      graphics.fillStyle(0xb8c6d6, 1);
      graphics.fillCircle(size.width * 0.5, size.height * 0.28, size.width * 0.12);
      graphics.fillStyle(0x7a92aa, 1);
      graphics.fillRect(size.width * 0.36, size.height * 0.42, size.width * 0.28, size.height * 0.32);
      graphics.lineStyle(3, 0xd8e2ef, 1);
      graphics.lineBetween(size.width * 0.66, size.height * 0.28, size.width * 0.66, size.height * 0.82);
    } else {
      graphics.fillStyle(0xa9bdc7, 1);
      graphics.fillTriangle(size.width * 0.5, size.height * 0.18, size.width * 0.2, size.height * 0.45, size.width * 0.5, size.height * 0.72);
      graphics.fillTriangle(size.width * 0.5, size.height * 0.18, size.width * 0.8, size.height * 0.45, size.width * 0.5, size.height * 0.72);
      graphics.fillStyle(0x5f6f77, 1);
      graphics.fillRect(size.width * 0.36, size.height * 0.5, size.width * 0.28, size.height * 0.18);
    }

    graphics.generateTexture(path, size.width, size.height);
    graphics.destroy();
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
    this.ensureFallbackTexture(path, object.type === "town" ? "town" : "map");
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


