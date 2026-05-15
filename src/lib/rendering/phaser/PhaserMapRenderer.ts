import Phaser from "phaser";
import { getAdventureBuildingLabel } from "@/lib/game/adventure-buildings";
import { getResourceBuildingLabel } from "@/lib/game/economy";
import { DecorItem, DecorKind, GameMap, MapObject, MapTile, Position, RoadType, TerrainType } from "@/lib/game/types";
import { UNIT_RULES } from "@/lib/game/units";
import { MapObjectData, MapRenderer } from "@/lib/rendering/mapRenderer";
import { BASE_HEIGHT, ELEVATION_SCALE, TILE_HEIGHT, TILE_WIDTH, cartToIso, isoToCart } from "@/lib/rendering/phaser/iso";
import { HERO_DIRECTIONS, HERO_SPRITESHEETS, MAP_SPRITES, MAP_SPRITE_PATHS, getHeroSpritePath, getHeroSpritesheet, getMonsterSpritePath, getTownSpritePath, type HeroDirection } from "@/lib/rendering/phaser/assets";

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
  gold: "OR",
  wood: "BOIS",
  ore: "MIN",
  mercury: "MER",
  crystals: "CRI",
  gems: "GEM",
  sulfur: "SOU",
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

const MIN_CAMERA_ZOOM = 0.65;
const MAX_CAMERA_ZOOM = 1.85;
const CAMERA_ZOOM_STEP = 1.15;
const BOARD_THICKNESS = 34;
const BOARD_LIP_EXTRA_HEIGHT = ELEVATION_SCALE;
const REACHABLE_TILE_COLOR = 0x2f80ff;
const REACHABLE_TILE_ALPHA = 0.34;

type WaterTileEffect = {
  graphics: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  seed: number;
};

type LavaTileEffect = {
  graphics: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  seed: number;
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

type FogEdgeSide = "northWest" | "northEast" | "southEast" | "southWest";
type RoadSide = "northEast" | "southEast" | "southWest" | "northWest";
type RoadPalette = {
  shadow: number;
  edge: number;
  fill: number;
  highlight: number;
  grit: number;
  alpha: number;
};

const DECOR_SPRITES: Partial<Record<DecorKind, string>> = {
  "grove-pine": MAP_SPRITES.decor.grove_pine,
  "grove-oak": MAP_SPRITES.decor.grove_oak,
  "grove-dead": MAP_SPRITES.decor.grove_dead,
  "boulder-cluster": MAP_SPRITES.decor.boulder_cluster,
};

const BLOCKING_DECOR_SPRITE_SIZE = 72;
const BLOCKING_DECOR_GROUND_OFFSET = TILE_HEIGHT / 2 + 8;

class PhaserMapScene extends Phaser.Scene {
  map: GameMap | null = null;
  objects: MapObjectData[] = [];
  readyCallback?: () => void;

  private boardLayer!: Phaser.GameObjects.Container;
  private boardLipLayer!: Phaser.GameObjects.Container;
  private mapLayer!: Phaser.GameObjects.Container;
  private decorLayer!: Phaser.GameObjects.Container;
  private mapObjectLayer!: Phaser.GameObjects.Container;
  private reachableLayer!: Phaser.GameObjects.Container;
  private highlightLayer!: Phaser.GameObjects.Container;
  private objectLayer!: Phaser.GameObjects.Container;
  private fogLayer!: Phaser.GameObjects.Container;
  private hoverLabelLayer!: Phaser.GameObjects.Container;
  private hoverLabelBackground?: Phaser.GameObjects.Graphics;
  private hoverLabelText?: Phaser.GameObjects.Text;
  private hoverLabelKey: string | null = null;
  private visibleTiles: Set<string> | null = null;
  private fogPlaneDepth = BASE_HEIGHT;
  private waterTiles: WaterTileEffect[] = [];
  private lavaTiles: LavaTileEffect[] = [];
  private heroSpriteAnimations: HeroSpriteAnimation[] = [];
  private renderedHeroes = new Map<string, RenderedHeroObject>();
  private heroDirections = new Map<string, HeroDirection>();

  constructor() {
    super("MapScene");
  }

  preload() {
    for (const path of MAP_SPRITE_PATHS) {
      this.load.svg(path, path);
    }
    for (const sheet of Object.values(HERO_SPRITESHEETS)) {
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
    this.decorLayer = this.add.container(0, 0);
    this.mapObjectLayer = this.add.container(0, 0);
    this.reachableLayer = this.add.container(0, 0);
    this.highlightLayer = this.add.container(0, 0);
    this.objectLayer = this.add.container(0, 0);
    this.fogLayer = this.add.container(0, 0);
    this.hoverLabelLayer = this.add.container(0, 0);

    this.boardLayer.setDepth(-2);
    this.mapLayer.setDepth(0);
    this.reachableLayer.setDepth(2);
    this.highlightLayer.setDepth(2);
    this.decorLayer.setDepth(3);
    this.mapObjectLayer.setDepth(4);
    this.boardLipLayer.setDepth(25);
    this.objectLayer.setDepth(10);
    this.fogLayer.setDepth(20);
    this.hoverLabelLayer.setDepth(30);
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.updateHoverLabel(pointer.x, pointer.y);
    });
    this.createHeroAnimations();
    this.readyCallback?.();
  }

  renderMap(map: GameMap) {
    this.map = map;
    this.fogPlaneDepth = getMaxTileDepth(map);
    this.waterTiles = [];
    this.lavaTiles = [];
    this.boardLayer.removeAll(true);
    this.boardLipLayer.removeAll(true);
    this.mapLayer.removeAll(true);
    this.decorLayer.removeAll(true);
    this.mapObjectLayer.removeAll(true);
    this.clearHoverLabel();
    this.renderBoardFrame(map);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        const iso = cartToIso(x, y);
        this.renderTile(tile, iso.x, iso.y);
        const depth = getTileDepth(tile);
        if (tile.object?.type === "wall" && tile.object.subtype === "natural") {
          this.renderNaturalWall(tile, iso.x, iso.y - depth);
        }
        if (tile.decor) this.renderDecor(tile.decor, iso.x, iso.y - depth);
      }
    }

    this.decorLayer.sort("depth");
    this.mapObjectLayer.sort("depth");
    this.renderObjects();
  }

  update(time: number) {
    for (const water of this.waterTiles) {
      drawWaterAnimation(water.graphics, water.x, water.y, water.seed, time);
    }

    for (const lava of this.lavaTiles) {
      drawLavaAnimation(lava.graphics, lava.x, lava.y, lava.seed, time);
    }

    for (const hero of this.heroSpriteAnimations) {
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

  private drawRoad(graphics: Phaser.GameObjects.Graphics, tile: MapTile, isoX: number, isoY: number) {
    const road = tile.road;
    if (!road) return;
    const isBridge = tile.terrain === TerrainType.WATER;
    const palette = getRoadPalette(road, isBridge);
    const connections = this.getRoadConnections(tile);
    const center = { x: isoX, y: isoY + 1 };
    const jitter = hashTile(tile.x, tile.y);

    graphics.fillStyle(palette.shadow, isBridge ? 0.2 : 0.12);
    drawInsetDiamondPath(graphics, isoX, isoY + 1, 0.38);
    graphics.fillPath();

    for (const [index, side] of connections.entries()) {
      const point = getRoadExitPoint(isoX, isoY, side);
      drawRoadStroke(graphics, center, point, palette, isBridge);
      if (!isBridge) drawRoadGravel(graphics, center, point, palette, jitter + index * 0.17, road);
    }

    if (isBridge) {
      graphics.fillStyle(palette.edge, 0.62);
      graphics.fillEllipse(center.x, center.y, 15, 7.5);
      graphics.fillStyle(palette.fill, palette.alpha);
      graphics.fillEllipse(center.x, center.y, 11, 5);
    } else {
      drawRoadJunctionGrit(graphics, center, palette, jitter, road);
    }

    if (isBridge) {
      graphics.lineStyle(2, 0x4a2f18, 0.9);
      graphics.beginPath();
      graphics.moveTo(isoX - TILE_WIDTH / 2 + 8, isoY);
      graphics.lineTo(isoX + TILE_WIDTH / 2 - 8, isoY);
      graphics.moveTo(isoX, isoY - TILE_HEIGHT / 2 + 5);
      graphics.lineTo(isoX, isoY + TILE_HEIGHT / 2 - 5);
      graphics.strokePath();
    }
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

  private renderDecor(decor: DecorItem, isoX: number, isoY: number) {
    const { type: kind, variant = 0 } = decor;
    if (!isAllowedDecor(kind)) return;

    const spritePath = DECOR_SPRITES[kind];
    if (spritePath) {
      const size = BLOCKING_DECOR_SPRITE_SIZE;
      const groundY = isoY + BLOCKING_DECOR_GROUND_OFFSET;
      const sprite = this.add.image(isoX, groundY, spritePath);
      sprite.setOrigin(0.5, 1);
      sprite.setDisplaySize(size, size);
      sprite.setDepth(groundY);
      this.decorLayer.add(sprite);
      return;
    }

    const g = this.add.graphics();
    const baseY = isoY + 2;
    const scale = 0.92 + variant * 0.08;

    this.drawDecorShadow(g, isoX, baseY, kind);

    switch (kind) {
      case "tree-pine":
        this.drawPineTree(g, isoX, baseY, scale);
        break;
      case "tree-oak":
        this.drawOakTree(g, isoX, baseY, scale);
        break;
      case "tree-dead":
        this.drawDeadTree(g, isoX, baseY, scale);
        break;
      case "grove-pine":
        this.drawPineGrove(g, isoX, baseY, scale);
        break;
      case "grove-oak":
        this.drawOakGrove(g, isoX, baseY, scale);
        break;
      case "grove-dead":
        this.drawDeadGrove(g, isoX, baseY, scale);
        break;
      case "rock-large":
        this.drawRockCluster(g, isoX, baseY, scale);
        break;
      case "rock-small":
        this.drawSmallRock(g, isoX, baseY, scale);
        break;
      case "boulder-cluster":
        this.drawBoulderCluster(g, isoX, baseY, scale);
        break;
      case "bush":
        this.drawBush(g, isoX, baseY, scale);
        break;
      case "flower":
        this.drawFlowers(g, isoX, baseY, scale, variant);
        break;
      case "grass-tuft":
        this.drawGrassTuft(g, isoX, baseY, scale, variant);
        break;
    }
    g.setDepth(baseY);
    this.decorLayer.add(g);
  }

  private renderNaturalWall(tile: MapTile, isoX: number, isoY: number) {
    const g = this.add.graphics();
    const jitter = hashTile(tile.x, tile.y);
    const topY = isoY - 19 - jitter * 2;
    const baseY = isoY + 7;
    const drop = baseY - topY;
    const north = { x: isoX, y: topY - TILE_HEIGHT / 2 };
    const east = { x: isoX + TILE_WIDTH / 2, y: topY };
    const south = { x: isoX, y: topY + TILE_HEIGHT / 2 };
    const west = { x: isoX - TILE_WIDTH / 2, y: topY };
    const baseNorth = { x: north.x, y: north.y + drop };
    const baseEast = { x: east.x, y: east.y + drop };
    const baseSouth = { x: south.x, y: south.y + drop };
    const baseWest = { x: west.x, y: west.y + drop };
    const exposed = this.getExposedNaturalWallSides(tile);

    g.fillStyle(0x071006, 0.3);
    drawDiamondPath(g, isoX, isoY + 8);
    g.fillPath();

    if (exposed.northEast) this.drawNaturalWallFace(g, north, east, baseNorth, baseEast, 0x3f6b34, 0.86);
    if (exposed.southEast) this.drawNaturalWallFace(g, east, south, baseEast, baseSouth, 0x275324, 0.96);
    if (exposed.southWest) this.drawNaturalWallFace(g, south, west, baseSouth, baseWest, 0x1f421f, 0.98);
    if (exposed.northWest) this.drawNaturalWallFace(g, west, north, baseWest, baseNorth, 0x5f8748, 0.76);

    g.fillStyle(0x4f7d3a, 0.72);
    g.lineStyle(1.5, 0x173015, 0.72);
    g.beginPath();
    g.moveTo(north.x, north.y + 1 - jitter * 2);
    g.lineTo(east.x - 4, east.y + 2 + jitter * 2);
    g.lineTo(south.x, south.y + 2);
    g.lineTo(west.x + 4, west.y + 1 - jitter);
    g.closePath();
    g.fillPath();
    g.strokePath();

    this.drawNaturalWallTop(g, north, east, south, west, jitter);

    g.setDepth(baseY + 0.5);
    this.decorLayer.add(g);
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
    graphics.fillStyle(color, alpha);
    graphics.lineStyle(1.2, 0x13280f, 0.78);
    graphics.beginPath();
    graphics.moveTo(topA.x, topA.y);
    graphics.lineTo(topB.x, topB.y);
    graphics.lineTo(bottomB.x, bottomB.y);
    graphics.lineTo(bottomA.x, bottomA.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    graphics.lineStyle(1, 0x143010, 0.28);
    for (const t of [0.34, 0.68]) {
      const a = lerpPoint(topA, bottomA, t);
      const b = lerpPoint(topB, bottomB, t);
      graphics.beginPath();
      graphics.moveTo(a.x, a.y);
      graphics.lineTo(b.x, b.y);
      graphics.strokePath();
    }

    graphics.lineStyle(1, 0x9fd089, 0.2);
    const highlightA = lerpPoint(topA, bottomA, 0.2);
    const highlightB = lerpPoint(topB, bottomB, 0.2);
    graphics.beginPath();
    graphics.moveTo(highlightA.x, highlightA.y);
    graphics.lineTo(highlightB.x, highlightB.y);
    graphics.strokePath();
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
    this.fogLayer.removeAll(true);

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const key = `${x},${y}`;
        if (visibleTiles.has(key)) continue;

        this.drawFogTile(this.fogLayer, x, y, exploredTiles.has(key));
      }
    }

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const key = `${x},${y}`;
        if (!visibleTiles.has(key)) continue;

        if (x > 0 && !visibleTiles.has(`${x - 1},${y}`)) this.drawFogFrontierEdge(this.fogLayer, x, y, "northWest");
        if (y > 0 && !visibleTiles.has(`${x},${y - 1}`)) this.drawFogFrontierEdge(this.fogLayer, x, y, "northEast");
        if (x < this.map.width - 1 && !visibleTiles.has(`${x + 1},${y}`)) this.drawFogFrontierEdge(this.fogLayer, x, y, "southEast");
        if (y < this.map.height - 1 && !visibleTiles.has(`${x},${y + 1}`)) this.drawFogFrontierEdge(this.fogLayer, x, y, "southWest");
      }
    }

    this.fogLayer.sort("depth");
  }

  highlightPath(path: Position[]) {
    this.highlightLayer.removeAll(true);
    for (const pos of path) {
      this.drawDiamond(this.highlightLayer, pos.x, pos.y, 0xffff00, 0.3);
    }
  }

  highlightPartialPath(reachable: Position[], unreachable: Position[], turnsLabel?: string) {
    this.highlightLayer.removeAll(true);
    for (const pos of reachable) {
      this.drawDiamond(this.highlightLayer, pos.x, pos.y, 0xffff00, 0.3);
    }
    for (const pos of unreachable) {
      this.drawDiamond(this.highlightLayer, pos.x, pos.y, 0xff0000, 0.28);
    }

    const labelTile = unreachable.at(-1) ?? reachable.at(-1);
    if (labelTile && turnsLabel) {
      const iso = cartToIso(labelTile.x, labelTile.y);
      const centerY = this.getSurfaceY(labelTile.x, labelTile.y);
      const badge = this.add.graphics();
      badge.fillStyle(0x1f1406, 0.82);
      badge.lineStyle(2, 0xffd166, 0.95);
      badge.fillCircle(iso.x, centerY, 12);
      badge.strokeCircle(iso.x, centerY, 12);
      this.highlightLayer.add(badge);

      const text = this.add.text(iso.x, centerY, turnsLabel, {
        color: "#ffffff",
        fontSize: "12px",
        fontStyle: "bold",
        stroke: "#1f1406",
        strokeThickness: 2,
      });
      text.setOrigin(0.5);
      this.highlightLayer.add(text);
    }
  }

  highlightTiles(tiles: Position[], color = REACHABLE_TILE_COLOR, alpha = REACHABLE_TILE_ALPHA) {
    this.reachableLayer.removeAll(true);
    for (const tile of tiles) {
      this.drawDiamond(this.reachableLayer, tile.x, tile.y, color, alpha);
    }
  }

  highlightTile(x: number, y: number, color = 0x00ff00) {
    this.highlightLayer.removeAll(true);
    this.drawDiamond(this.highlightLayer, x, y, color, 0.4);
  }

  clearHighlights() {
    this.highlightLayer.removeAll(true);
  }

  clearReachable() {
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

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
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

    const cart = isoToCart(world.x, world.y);
    const tileX = Math.round(cart.x);
    const tileY = Math.round(cart.y);

    if (tileX < 0 || tileX >= this.map.width || tileY < 0 || tileY >= this.map.height) {
      return null;
    }

    return { x: tileX, y: tileY };
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
    const bounds = this.getObjectBounds(object);
    if (!bounds) return false;

    return (
      worldX >= bounds.left &&
      worldX <= bounds.right &&
      worldY >= bounds.top &&
      worldY <= bounds.bottom
    );
  }

  private getObjectBounds(object: MapObjectData) {
    const iso = cartToIso(object.x, object.y);
    const surfaceY = this.getSurfaceY(object.x, object.y);
    const metrics = getObjectMetrics(object);
    if (!metrics) return null;

    const bottom = surfaceY + metrics.offsetY;
    return {
      left: iso.x - metrics.width / 2,
      right: iso.x + metrics.width / 2,
      top: bottom - metrics.height,
      bottom,
    };
  }

  private getObjectDepth(object: MapObjectData) {
    const metrics = getObjectMetrics(object);
    return this.getSurfaceY(object.x, object.y) + (metrics?.offsetY ?? 0);
  }

  private renderTile(tile: MapTile, isoX: number, isoY: number) {
    const depth = getTileDepth(tile);
    const topColor = TERRAIN_TOP[tile.terrain] ?? 0x333333;
    const sideLit = TERRAIN_SIDE_LIT[tile.terrain] ?? 0x333333;
    const sideDark = TERRAIN_SIDE_DARK[tile.terrain] ?? 0x333333;

    if (depth > 0) {
      const left = this.add.graphics();
      left.fillStyle(sideLit);
      left.beginPath();
      left.moveTo(isoX - TILE_WIDTH / 2, isoY - depth);
      left.lineTo(isoX, isoY + TILE_HEIGHT / 2 - depth);
      left.lineTo(isoX, isoY + TILE_HEIGHT / 2);
      left.lineTo(isoX - TILE_WIDTH / 2, isoY);
      left.closePath();
      left.fillPath();
      this.mapLayer.add(left);

      const right = this.add.graphics();
      right.fillStyle(sideDark);
      right.beginPath();
      right.moveTo(isoX, isoY + TILE_HEIGHT / 2 - depth);
      right.lineTo(isoX + TILE_WIDTH / 2, isoY - depth);
      right.lineTo(isoX + TILE_WIDTH / 2, isoY);
      right.lineTo(isoX, isoY + TILE_HEIGHT / 2);
      right.closePath();
      right.fillPath();
      this.mapLayer.add(right);
    }

    const top = this.add.graphics();
    top.fillStyle(topColor, tile.terrain === TerrainType.WATER ? 0.7 : 1);
    top.lineStyle(tile.terrain === TerrainType.WATER ? 0 : 1, 0x000000, 1);
    drawDiamondPath(top, isoX, isoY - depth);
    top.fillPath();
    if (tile.terrain === TerrainType.WATER) {
      this.mapLayer.add(top);
      this.addWaterAnimation(tile, isoX, isoY - depth);
    } else if (tile.terrain === TerrainType.LAVA) {
      drawTileTexture(top, tile, isoX, isoY - depth);
      this.mapLayer.add(top);
      this.addLavaAnimation(tile, isoX, isoY - depth);
    } else {
      drawTileTexture(top, tile, isoX, isoY - depth);
      this.drawRoad(top, tile, isoX, isoY - depth);
      top.lineStyle(1, 0x000000, 1);
      drawDiamondPath(top, isoX, isoY - depth);
      top.strokePath();
      this.mapLayer.add(top);
    }

    if (tile.terrain === TerrainType.WATER && tile.road) {
      const road = this.add.graphics();
      this.drawRoad(road, tile, isoX, isoY - depth);
      this.mapLayer.add(road);
    }

    if (tile.object) {
      this.renderMapObject(tile.object, isoX, isoY - depth, tile);
    }
  }

  private addWaterAnimation(tile: MapTile, isoX: number, isoY: number) {
    const water = this.add.graphics();
    drawWaterAnimation(water, isoX, isoY, hashTile(tile.x, tile.y), 0);
    this.waterTiles.push({ graphics: water, x: isoX, y: isoY, seed: hashTile(tile.x, tile.y) });
    this.mapLayer.add(water);
  }

  private addLavaAnimation(tile: MapTile, isoX: number, isoY: number) {
    const lava = this.add.graphics();
    const seed = hashTile(tile.x, tile.y);
    drawLavaAnimation(lava, isoX, isoY, seed, 0);
    this.lavaTiles.push({ graphics: lava, x: isoX, y: isoY, seed });
    this.mapLayer.add(lava);
  }

  private renderMapObject(object: MapObject, isoX: number, isoY: number, tile?: MapTile) {
    if (object.type === "resource" && object.subtype) {
      const sprite = this.add.image(isoX, isoY + 4, MAP_SPRITES.resources[object.subtype]);
      sprite.setOrigin(0.5, 1);
      sprite.setDisplaySize(38, 38);
      sprite.setDepth(isoY + 4);
      this.mapObjectLayer.add(sprite);
    } else if (object.type === "monster") {
      const sprite = this.add.image(isoX, isoY + 3, getMonsterSpritePath(object.subtype));
      sprite.setOrigin(0.5, 1);
      sprite.setDisplaySize(44, 44);
      sprite.setDepth(isoY + 3);
      this.mapObjectLayer.add(sprite);
    } else if (object.type === "wall" && object.subtype === "brick") {
      const g = this.add.graphics();
      this.drawBrickWall(g, isoX, isoY, tile);
      this.mapLayer.add(g);
    }
    // Note: natural walls are rendered via decorLayer.
  }

  private drawBrickWall(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, tile?: MapTile) {
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

  private drawWallSegment(graphics: Phaser.GameObjects.Graphics, isoX: number, isoY: number, orientation: "x" | "y") {
    const dir = orientation === "x" ? { x: 25, y: 12 } : { x: -25, y: 12 };
    const normal = orientation === "x" ? { x: -6, y: 5 } : { x: 6, y: 5 };
    const height = 20;
    const lift = { x: 0, y: -height };

    const a = { x: isoX - dir.x, y: isoY - dir.y + 4 };
    const b = { x: isoX + dir.x, y: isoY + dir.y + 4 };
    const c = { x: b.x + normal.x, y: b.y + normal.y };
    const d = { x: a.x + normal.x, y: a.y + normal.y };
    const at = { x: a.x + lift.x, y: a.y + lift.y };
    const bt = { x: b.x + lift.x, y: b.y + lift.y };
    const ct = { x: c.x + lift.x, y: c.y + lift.y };
    const dt = { x: d.x + lift.x, y: d.y + lift.y };

    graphics.fillStyle(0x060504, 0.24);
    graphics.beginPath();
    graphics.moveTo(a.x - normal.x, a.y + 5);
    graphics.lineTo(b.x - normal.x, b.y + 5);
    graphics.lineTo(c.x + normal.x, c.y + 7);
    graphics.lineTo(d.x + normal.x, d.y + 7);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(0x5c5348, 1);
    graphics.lineStyle(1, 0x2d251d, 0.9);
    graphics.beginPath();
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.lineTo(bt.x, bt.y);
    graphics.lineTo(at.x, at.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    graphics.fillStyle(0x3f3832, 1);
    graphics.beginPath();
    graphics.moveTo(b.x, b.y);
    graphics.lineTo(c.x, c.y);
    graphics.lineTo(ct.x, ct.y);
    graphics.lineTo(bt.x, bt.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    graphics.fillStyle(0x8f806a, 1);
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
    graphics.lineStyle(1, 0x2f2923, 0.4);
    for (let i = 1; i < 3; i++) {
      const t = i / 3;
      const px = Phaser.Math.Linear(a.x, b.x, t);
      const py = Phaser.Math.Linear(a.y, b.y, t);
      const qx = Phaser.Math.Linear(at.x, bt.x, t);
      const qy = Phaser.Math.Linear(at.y, bt.y, t);
      graphics.beginPath();
      graphics.moveTo(px, py);
      graphics.lineTo(qx, qy);
      graphics.strokePath();
    }

    // A horizontal stone-course line halfway up the front face — adds a "real wall"
    // bond pattern without any spikes on top.
    graphics.lineStyle(1, 0x2f2923, 0.3);
    graphics.beginPath();
    graphics.moveTo(a.x + 2, a.y - height / 2);
    graphics.lineTo(b.x - 2, b.y - height / 2);
    graphics.strokePath();

    // Soft highlight along the front-top edge of the parapet for relief.
    graphics.lineStyle(1, 0xb8aa8a, 0.35);
    graphics.beginPath();
    graphics.moveTo(at.x + 3, at.y + 1);
    graphics.lineTo(bt.x - 3, bt.y + 1);
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

  private getWallOrientation(tile?: MapTile): "x" | "y" | "cross" {
    if (!tile || !this.map) return "x";

    const westEast = this.isBrickWall(tile.x - 1, tile.y) || this.isBrickWall(tile.x + 1, tile.y);
    const northSouth = this.isBrickWall(tile.x, tile.y - 1) || this.isBrickWall(tile.x, tile.y + 1);
    if (westEast && northSouth) return "cross";
    return northSouth ? "y" : "x";
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
    for (const [id, hero] of this.renderedHeroes) {
      this.heroDirections.set(id, hero.direction);
    }
    this.objectLayer.removeAll(true);
    this.heroSpriteAnimations = [];
    this.renderedHeroes.clear();
    this.clearHoverLabel();

    for (const object of this.objects) {
      const iso = cartToIso(object.x, object.y);
      const y = this.getSurfaceY(object.x, object.y);
      if (object.type === "hero") {
        const metrics = getObjectMetrics(object);
        if (!metrics) continue;
        const direction = this.heroDirections.get(object.id) ?? "se";
        const sprite = this.addHeroSprite(object, iso.x, y + metrics.offsetY, metrics.width, metrics.height, direction);
        if (sprite) {
          const bannerMetrics = getHeroBannerMetrics(object);
          const animation = {
            sprite,
            baseY: sprite.y,
            baseScaleX: sprite.scaleX,
            baseScaleY: sprite.scaleY,
            phase: hashTile(object.x, object.y) * Math.PI * 2,
            mode: object.onWater ? "boat" : object.inTown ? "idle" : "mounted",
          } satisfies HeroSpriteAnimation;
          const banner = this.addBanner(
            this.objectLayer,
            iso.x - bannerMetrics.xOffset,
            y + metrics.offsetY - metrics.height + bannerMetrics.yOffset,
            object.color,
            bannerMetrics.width,
            bannerMetrics.height,
            y + metrics.offsetY
          );
          this.heroSpriteAnimations.push(animation);
          this.renderedHeroes.set(object.id, {
            object,
            sprite,
            banner,
            animation,
            baseX: sprite.x,
            baseY: sprite.y,
            baseDisplayWidth: sprite.displayWidth,
            baseDisplayHeight: sprite.displayHeight,
            direction,
          });
        }
      } else if (object.type === "town") {
        this.addObjectSprite(object, iso.x, y + 20, getTownSpritePath(object.faction), 82, 82);
        this.addBanner(this.objectLayer, iso.x, y - 43, object.color, 18, 12, y + 20);
      } else if (object.type === "building" && object.buildingType) {
        this.addObjectSprite(object, iso.x, y + 6, MAP_SPRITES.buildings[object.buildingType], 52, 52);
        if (object.playerId) {
          this.addBanner(this.objectLayer, iso.x, y - 30, object.color, 14, 10, y + 6);
        }
        if (object.guardianPower && object.guardianPower > 0) {
          this.addBadge(this.objectLayer, iso.x, y - 37, String(Math.ceil(object.guardianPower / 100)), 0xff4444, y + 6);
        }
      } else if (object.type === "adventure_building" && object.buildingType) {
        const metrics = getObjectMetrics(object);
        if (!metrics) continue;
        this.addObjectSprite(object, iso.x, y + metrics.offsetY, MAP_SPRITES.adventureBuildings[object.buildingType], metrics.width, metrics.height);
      } else if (object.type === "combat") {
        const markerY = y - 60;
        const markerDepth = y + 1000;
        const marker = this.add.star(iso.x, markerY, 8, 9, 22, 0xff6b00, 1);
        marker.setStrokeStyle(2, 0xfff2a8, 1);
        marker.setDepth(markerDepth);
        this.objectLayer.add(marker);
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
      }
    }

    this.objectLayer.sort("depth");
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

    renderedHero.animation.mode = renderedHero.object.onWater ? "boat" : "mounted";

    return new Promise<void>((resolve) => {
      let index = 1;
      const moveNext = () => {
        const from = path[index - 1];
        const to = path[index];
        if (!from || !to) {
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
        renderedHero.direction = getHeroDirection(from, to, renderedHero.direction);
        this.heroDirections.set(heroId, renderedHero.direction);
        this.playHeroAnimation(renderedHero, "walk");
        this.updateRenderedHeroPosition(renderedHero, start.x, start.y);

        this.tweens.add({
          targets: tweenState,
          x: end.x,
          y: end.y,
          duration: 140,
          ease: "Sine.easeInOut",
          onUpdate: () => {
            this.updateRenderedHeroPosition(renderedHero, tweenState.x, tweenState.y);
          },
          onComplete: () => {
            this.updateRenderedHeroPosition(renderedHero, end.x, end.y);
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

  private updateRenderedHeroPosition(renderedHero: RenderedHeroObject, x: number, y: number) {
    renderedHero.sprite.x = x;
    renderedHero.sprite.setDepth(y);
    renderedHero.animation.baseY = y;
    renderedHero.banner.setPosition(x - renderedHero.baseX, y - renderedHero.baseY);
    renderedHero.banner.setDepth(y + 3);
    this.objectLayer.sort("depth");
  }

  private createHeroAnimations() {
    for (const sheet of Object.values(HERO_SPRITESHEETS)) {
      for (const [directionIndex, direction] of HERO_DIRECTIONS.entries()) {
        const rowOffset = directionIndex * sheet.columns;
        const directionIdleKey = getHeroAnimationKey(sheet.faction, direction, "idle");
        if (!this.anims.exists(directionIdleKey)) {
          this.anims.create({
            key: directionIdleKey,
            frames: this.anims.generateFrameNumbers(sheet.key, { frames: [0, 1, 2, 3, 2, 1].map((frame) => rowOffset + frame) }),
            frameRate: 5,
            repeat: -1,
          });
        }

        const directionWalkKey = getHeroAnimationKey(sheet.faction, direction, "walk");
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
    const sheet = getHeroSpritesheet(object.faction, object.onWater);
    if (!sheet) return this.addObjectSprite(object, x, y, getHeroSpritePath(object.faction, object.onWater), width, height);

    const sprite = this.add.sprite(x, y, sheet.key, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(width, height);
    sprite.setDepth(y);
    this.objectLayer.add(sprite);
    sprite.play(getHeroAnimationKey(sheet.faction, direction, "idle"));
    return sprite;
  }

  private playHeroAnimation(renderedHero: RenderedHeroObject, state: "idle" | "walk") {
    const sheet = getHeroSpritesheet(renderedHero.object.faction, renderedHero.object.onWater);
    if (!sheet || !(renderedHero.sprite instanceof Phaser.GameObjects.Sprite)) return;
    const key = getHeroAnimationKey(sheet.faction, renderedHero.direction, state);
    if (renderedHero.sprite.anims.currentAnim?.key === key) return;
    renderedHero.sprite.play(key);
  }

  private addObjectSprite(object: MapObjectData, x: number, y: number, path: string | undefined, width: number, height: number) {
    if (!path) return null;
    const sprite = this.add.image(x, y, path);
    sprite.setOrigin(0.5, 1);
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
    const objects = this.getObjectsAtScreen(screenX, screenY);
    const object = objects.find((item) => item.name.trim().length > 0);
    if (object) {
      const bounds = this.getObjectBounds(object);
      if (!bounds) return null;
      const iso = cartToIso(object.x, object.y);
      return {
        key: `object:${object.id}`,
        text: object.name,
        x: iso.x,
        y: bounds.top - 8,
      };
    }

    const tile = this.getTileAtScreen(screenX, screenY);
    const mapObject = tile ? this.map?.tiles[tile.y]?.[tile.x]?.object : undefined;
    if (!tile || !mapObject) return null;
    if (this.visibleTiles && !this.visibleTiles.has(`${tile.x},${tile.y}`)) return null;

    const text = getMapObjectHoverText(mapObject);
    if (!text) return null;

    const iso = cartToIso(tile.x, tile.y);
    const surfaceY = this.getSurfaceY(tile.x, tile.y);
    return {
      key: `map:${mapObject.id}`,
      text,
      x: iso.x,
      y: surfaceY - 34,
    };
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
    graphics.lineStyle(2, 0x222222, 1);
    graphics.beginPath();
    graphics.moveTo(x, y);
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

  private addBadge(layer: Phaser.GameObjects.Container, x: number, y: number, textValue: string, color: number, depth: number) {
    const background = this.add.graphics();
    background.fillStyle(0x000000, 0.62);
    background.lineStyle(1, color, 0.85);
    background.fillRoundedRect(x - 8, y - 5, 16, 10, 3);
    background.strokeRoundedRect(x - 8, y - 5, 16, 10, 3);
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
  }

  private drawDiamond(layer: Phaser.GameObjects.Container, x: number, y: number, color: number, alpha: number) {
    const iso = cartToIso(x, y);
    const graphics = this.add.graphics();
    graphics.fillStyle(color, alpha);
    drawDiamondPath(graphics, iso.x, this.getSurfaceY(x, y));
    graphics.fillPath();
    layer.add(graphics);
  }

  private drawFogTile(layer: Phaser.GameObjects.Container, x: number, y: number, explored: boolean) {
    const iso = cartToIso(x, y);
    const ySurface = this.getFogSurfaceY(x, y);
    const jitter = hashTile(x, y);
    const graphics = this.add.graphics();

    if (explored) {
      graphics.fillStyle(0x0d1220, 0.68);
      drawFogDiamondPath(graphics, iso.x, ySurface, 1);
      graphics.fillPath();

      graphics.fillStyle(0x1d2741, 0.18);
      graphics.fillEllipse(iso.x - 10 + jitter * 20, ySurface - 1, 34, 13);
      graphics.fillEllipse(iso.x + 8 - jitter * 16, ySurface + 5, 28, 10);
    } else {
      graphics.fillStyle(0x02040c, 1);
      drawFogDiamondPath(graphics, iso.x, ySurface, 1.5);
      graphics.fillPath();

      graphics.fillStyle(0x070b18, 0.95);
      graphics.fillEllipse(iso.x - 12 + jitter * 18, ySurface - 4, 44, 17);
      graphics.fillEllipse(iso.x + 10 - jitter * 16, ySurface + 5, 36, 13);
    }

    graphics.setDepth(ySurface);
    layer.add(graphics);
  }

  private drawFogFrontierEdge(layer: Phaser.GameObjects.Container, x: number, y: number, side: FogEdgeSide) {
    const iso = cartToIso(x, y);
    const ySurface = this.getFogSurfaceY(x, y);
    const points = getDiamondPoints(iso.x, ySurface);
    const edge = getFogEdge(points, side);
    const graphics = this.add.graphics();

    fillEdgeStrip(graphics, edge.a, edge.b, { x: iso.x, y: ySurface }, 0.34, 0x02040c, 0.44);
    fillEdgeStrip(graphics, edge.a, edge.b, { x: iso.x, y: ySurface }, 0.18, 0x10172a, 0.26);

    graphics.lineStyle(1, 0xaab4dd, 0.18);
    graphics.beginPath();
    graphics.moveTo(edge.a.x, edge.a.y);
    graphics.lineTo(edge.b.x, edge.b.y);
    graphics.strokePath();

    graphics.setDepth(ySurface + 0.5);
    layer.add(graphics);
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
}

export class PhaserMapRenderer implements MapRenderer {
  private game: Phaser.Game | null = null;
  private scene: PhaserMapScene | null = null;
  private initialized = false;
  private destroyed = false;

  async init(container: HTMLDivElement) {
    this.destroyed = false;
    container.querySelectorAll("canvas").forEach((canvas) => canvas.remove());

    const scene = new PhaserMapScene();
    this.scene = scene;

    const ready = new Promise<void>((resolve) => {
      scene.readyCallback = resolve;
    });

    try {
      this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth || window.innerWidth || 1024,
      height: container.clientHeight || window.innerHeight || 768,
      backgroundColor: "#1a1a2e",
      scene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        parent: container,
      },
      });

      await ready;
      this.initialized = !this.destroyed;
    } catch (error) {
      this.destroyed = true;
      this.initialized = false;
      this.game?.destroy(true);
      this.game = null;
      this.scene = null;
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
    this.destroyed = true;
    this.initialized = false;
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
  }
}

function getTileDepth(tile: MapTile) {
  return tile.terrain === TerrainType.WATER
    ? 2
    : BASE_HEIGHT + Math.max(0, tile.elevation) * ELEVATION_SCALE;
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

function drawDiamondPath(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
  graphics.beginPath();
  graphics.moveTo(x, y - TILE_HEIGHT / 2);
  graphics.lineTo(x + TILE_WIDTH / 2, y);
  graphics.lineTo(x, y + TILE_HEIGHT / 2);
  graphics.lineTo(x - TILE_WIDTH / 2, y);
  graphics.closePath();
}

function drawInsetDiamondPath(graphics: Phaser.GameObjects.Graphics, x: number, y: number, inset: number) {
  const width = TILE_WIDTH * (1 - inset);
  const height = TILE_HEIGHT * (1 - inset);
  graphics.beginPath();
  graphics.moveTo(x, y - height / 2);
  graphics.lineTo(x + width / 2, y);
  graphics.lineTo(x, y + height / 2);
  graphics.lineTo(x - width / 2, y);
  graphics.closePath();
}

function getRoadExitPoint(x: number, y: number, side: RoadSide): Position {
  switch (side) {
    case "northEast":
      return { x: x + TILE_WIDTH * 0.24, y: y - TILE_HEIGHT * 0.24 };
    case "southEast":
      return { x: x + TILE_WIDTH * 0.24, y: y + TILE_HEIGHT * 0.24 };
    case "southWest":
      return { x: x - TILE_WIDTH * 0.24, y: y + TILE_HEIGHT * 0.24 };
    case "northWest":
      return { x: x - TILE_WIDTH * 0.24, y: y - TILE_HEIGHT * 0.24 };
  }
}

function drawRoadStroke(
  graphics: Phaser.GameObjects.Graphics,
  from: Position,
  to: Position,
  palette: RoadPalette,
  isBridge: boolean
) {
  graphics.lineStyle(isBridge ? 13 : 11, palette.edge, 0.84);
  graphics.beginPath();
  graphics.moveTo(from.x, from.y);
  graphics.lineTo(to.x, to.y);
  graphics.strokePath();

  graphics.lineStyle(isBridge ? 9 : 7, palette.fill, palette.alpha);
  graphics.beginPath();
  graphics.moveTo(from.x, from.y);
  graphics.lineTo(to.x, to.y);
  graphics.strokePath();

  graphics.lineStyle(isBridge ? 2 : 1, palette.highlight, isBridge ? 0.28 : 0.22);
  graphics.beginPath();
  graphics.moveTo(from.x - 1, from.y - 2);
  graphics.lineTo(to.x - 1, to.y - 2);
  graphics.strokePath();
}

function drawRoadGravel(
  graphics: Phaser.GameObjects.Graphics,
  from: Position,
  to: Position,
  palette: RoadPalette,
  seed: number,
  road: RoadType
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const count = road === "paved" ? 6 : 7;
  const spread = road === "paved" ? 8 : 9;

  for (let i = 0; i < count; i++) {
    const a = pseudoRandom(seed, i);
    const b = pseudoRandom(seed + 0.31, i);
    const t = 0.15 + (i / Math.max(1, count - 1)) * 0.72 + a * 0.06;
    const offset = (b - 0.5) * spread;
    const x = Phaser.Math.Linear(from.x, to.x, t) + normal.x * offset;
    const y = Phaser.Math.Linear(from.y, to.y, t) + normal.y * offset;
    const radius = 0.75 + pseudoRandom(seed + 0.73, i) * (road === "paved" ? 0.75 : 0.9);
    const light = pseudoRandom(seed + 0.47, i) > 0.66;
    const alpha = light ? 0.38 : road === "paved" ? 0.52 : 0.46;

    graphics.fillStyle(light ? palette.highlight : palette.grit, alpha);
    if (road === "paved" || i % 3 === 0) {
      graphics.fillRect(x - radius * 1.15, y - radius * 0.55, radius * 2.3, radius * 1.1);
    } else {
      graphics.fillCircle(x, y, radius);
    }
  }
}

function drawRoadJunctionGrit(
  graphics: Phaser.GameObjects.Graphics,
  center: Position,
  palette: RoadPalette,
  seed: number,
  road: RoadType
) {
  const count = road === "paved" ? 8 : 10;
  for (let i = 0; i < count; i++) {
    const angle = pseudoRandom(seed + 0.19, i) * Math.PI * 2;
    const distance = 2 + pseudoRandom(seed + 0.37, i) * 10;
    const x = center.x + Math.cos(angle) * distance;
    const y = center.y + Math.sin(angle) * distance * 0.5;
    const radius = 0.75 + pseudoRandom(seed + 0.61, i) * 0.9;
    const light = pseudoRandom(seed + 0.83, i) > 0.7;

    graphics.fillStyle(light ? palette.highlight : palette.grit, light ? 0.38 : 0.5);
    if (road === "paved" || i % 2 === 0) {
      graphics.fillRect(x - radius, y - radius * 0.55, radius * 2, radius * 1.1);
    } else {
      graphics.fillCircle(x, y, radius);
    }
  }
}

function getRoadPalette(road: RoadType, isBridge: boolean): RoadPalette {
  if (isBridge) {
    return {
      shadow: 0x1d0f06,
      edge: 0x4a2f18,
      fill: 0xa06a35,
      highlight: 0xd8a96c,
      grit: 0x2d1709,
      alpha: 0.9,
    };
  }

  if (road === "paved") {
    return {
      shadow: 0x1c1915,
      edge: 0x4d4237,
      fill: 0xbfb09a,
      highlight: 0xf1e4cc,
      grit: 0x625548,
      alpha: 0.82,
    };
  }

  if (road === "gravel") {
    return {
      shadow: 0x171717,
      edge: 0x4a4a45,
      fill: 0x8f897f,
      highlight: 0xd4cec1,
      grit: 0x3f3d39,
      alpha: 0.83,
    };
  }

  return {
    shadow: 0x1b1209,
    edge: 0x4f351d,
    fill: 0x9d743c,
    highlight: 0xd7b06f,
    grit: 0x3d2815,
    alpha: 0.84,
  };
}

function pseudoRandom(seed: number, index: number): number {
  const value = Math.sin((seed + index * 12.9898) * 43758.5453);
  return value - Math.floor(value);
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
    return;
  }

  if (tile.terrain === TerrainType.MOUNTAIN) {
    graphics.lineStyle(1, 0x3f3f3f, 0.32);
    graphics.beginPath();
    graphics.moveTo(isoX - 12, isoY + 3);
    graphics.lineTo(isoX - 2, isoY - 7);
    graphics.lineTo(isoX + 10, isoY + 4);
    graphics.strokePath();
    return;
  }

  if (tile.terrain === TerrainType.FOREST) {
    graphics.fillStyle(0x17461f, 0.24);
    graphics.fillCircle(isoX - 7, isoY, 3);
    graphics.fillCircle(isoX + 4, isoY - 3, 2.5);
    return;
  }

  if (tile.terrain === TerrainType.LAVA) {
    graphics.lineStyle(2, 0xff5a1f, 0.35);
    graphics.beginPath();
    graphics.moveTo(isoX - 11, isoY + 2);
    graphics.lineTo(isoX - 2, isoY - 2);
    graphics.lineTo(isoX + 9, isoY + 3);
    graphics.strokePath();
  }
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
    const sheet = getHeroSpritesheet(object.faction, object.onWater);
    if (sheet) return object.inTown
      ? { width: sheet.townDisplayWidth, height: sheet.townDisplayHeight, offsetY: 27 }
      : { width: sheet.displayWidth, height: sheet.displayHeight, offsetY: 10 };
    return object.inTown
      ? { width: 30, height: 30, offsetY: 27 }
      : { width: 44, height: 44, offsetY: 10 };
  }
  if (object.type === "town") return { width: 82, height: 82, offsetY: 20 };
  if (object.type === "building") return { width: 52, height: 52, offsetY: 6 };
  if (object.type === "adventure_building") return object.buildingType === "stargate"
    ? { width: 58, height: 58, offsetY: 6 }
    : { width: 52, height: 52, offsetY: 6 };
  if (object.type === "combat") return { width: 48, height: 48, offsetY: 10 };
  return null;
}

function getHeroTravelMetrics(object: MapObjectData) {
  return getObjectMetrics({ ...object, inTown: false }) ?? getObjectMetrics(object)!;
}

function getHeroBannerMetrics(object: MapObjectData) {
  if (object.inTown) return { xOffset: 8, yOffset: 1, width: 10, height: 7 };
  return { xOffset: 12, yOffset: -2, width: 12, height: 9 };
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

function getHeroAnimationKey(faction: string, direction: HeroDirection, state: "idle" | "walk") {
  return `hero-${faction}-${direction}-${state}`;
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
