import Phaser from "phaser";
import { GameMap, MapObject, MapTile, Position, TerrainType } from "@/lib/game/types";
import { MapObjectData, MapRenderer } from "@/lib/rendering/mapRenderer";
import { BASE_HEIGHT, ELEVATION_SCALE, TILE_HEIGHT, TILE_WIDTH, cartToIso, isoToCart } from "@/lib/rendering/phaser/iso";
import { MAP_SPRITES, MAP_SPRITE_PATHS } from "@/lib/rendering/phaser/assets";

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
  sulfur: "SOU",
};

class PhaserMapScene extends Phaser.Scene {
  map: GameMap | null = null;
  objects: MapObjectData[] = [];
  readyCallback?: () => void;

  private mapLayer!: Phaser.GameObjects.Container;
  private reachableLayer!: Phaser.GameObjects.Container;
  private highlightLayer!: Phaser.GameObjects.Container;
  private objectLayer!: Phaser.GameObjects.Container;
  private fogLayer!: Phaser.GameObjects.Container;

  constructor() {
    super("MapScene");
  }

  preload() {
    for (const path of MAP_SPRITE_PATHS) {
      this.load.svg(path, path);
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a1a2e);
    this.mapLayer = this.add.container(0, 0);
    this.reachableLayer = this.add.container(0, 0);
    this.highlightLayer = this.add.container(0, 0);
    this.objectLayer = this.add.container(0, 0);
    this.fogLayer = this.add.container(0, 0);

    this.mapLayer.setDepth(0);
    this.reachableLayer.setDepth(4);
    this.highlightLayer.setDepth(5);
    this.objectLayer.setDepth(10);
    this.fogLayer.setDepth(20);
    this.readyCallback?.();
  }

  renderMap(map: GameMap) {
    this.map = map;
    this.mapLayer.removeAll(true);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        const iso = cartToIso(x, y);
        this.renderTile(tile, iso.x, iso.y);
      }
    }

    this.renderObjects();
  }

  setObjects(objects: MapObjectData[]) {
    this.objects = objects;
    this.renderObjects();
  }

  setFog(visibleTiles: Set<string>, exploredTiles: Set<string>) {
    if (!this.map) return;
    this.fogLayer.removeAll(true);

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const key = `${x},${y}`;
        if (visibleTiles.has(key)) continue;

        const color = exploredTiles.has(key) ? 0x1a1a2e : 0x0a0a14;
        const alpha = exploredTiles.has(key) ? 0.6 : 1;
        this.drawDiamond(this.fogLayer, x, y, color, alpha);
      }
    }
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
      const text = this.add.text(iso.x, this.getSurfaceY(labelTile.x, labelTile.y) - 30, turnsLabel, {
        color: "#ffffff",
        fontSize: "12px",
        fontStyle: "bold",
      });
      text.setOrigin(0.5);
      this.highlightLayer.add(text);
    }
  }

  highlightTiles(tiles: Position[], color = 0x32d583, alpha = 0.2) {
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
    camera.scrollX -= dx;
    camera.scrollY -= dy;
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
    if (tile.terrain !== TerrainType.WATER) top.strokePath();
    this.mapLayer.add(top);

    if (tile.object) {
      this.renderMapObject(tile.object, isoX, isoY - depth);
    }
  }

  private renderMapObject(object: MapObject, isoX: number, isoY: number) {
    if (object.type === "resource" && object.subtype) {
      const sprite = this.add.image(isoX, isoY + 4, MAP_SPRITES.resources[object.subtype]);
      sprite.setOrigin(0.5, 1);
      sprite.setDisplaySize(38, 38);
      this.mapLayer.add(sprite);
      this.addSmallLabel(this.mapLayer, isoX, isoY + 5, RESOURCE_LABELS[object.subtype] ?? object.subtype.slice(0, 3).toUpperCase());
    } else if (object.type === "monster") {
      const sprite = this.add.image(isoX, isoY + 3, MAP_SPRITES.monster);
      sprite.setOrigin(0.5, 1);
      sprite.setDisplaySize(44, 44);
      this.mapLayer.add(sprite);
    }
  }

  private renderObjects() {
    if (!this.map || !this.objectLayer) return;
    this.objectLayer.removeAll(true);

    for (const object of this.objects) {
      const iso = cartToIso(object.x, object.y);
      const y = this.getSurfaceY(object.x, object.y);
      if (object.type === "hero") {
        this.addObjectSprite(object, iso.x, y + 15, MAP_SPRITES.hero, 62, 62);
        this.addBanner(this.objectLayer, iso.x - 16, y - 19, object.color, 16, 12, y + 15);
      } else if (object.type === "town") {
        this.addObjectSprite(object, iso.x, y + 20, MAP_SPRITES.town, 82, 82);
        this.addBanner(this.objectLayer, iso.x, y - 43, object.color, 18, 12, y + 20);
      } else if (object.type === "building" && object.buildingType) {
        this.addObjectSprite(object, iso.x, y + 6, MAP_SPRITES.buildings[object.buildingType], 52, 52);
        if (object.playerId) {
          this.addBanner(this.objectLayer, iso.x, y - 30, object.color, 14, 10, y + 6);
        }
        if (object.guardianPower && object.guardianPower > 0) {
          this.addBadge(this.objectLayer, iso.x, y - 37, String(Math.ceil(object.guardianPower / 100)), 0xff4444, y + 6);
        }
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

  private addObjectSprite(object: MapObjectData, x: number, y: number, path: string | undefined, width: number, height: number) {
    if (!path) return;
    const sprite = this.add.image(x, y, path);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(width, height);
    sprite.setDepth(y);
    this.objectLayer.add(sprite);
    this.addSmallLabel(this.objectLayer, x, y + 5, object.name);
  }

  private addSmallLabel(layer: Phaser.GameObjects.Container, x: number, y: number, textValue: string) {
    const text = this.add.text(x, y, textValue, {
      color: "#ffffff",
      fontSize: "9px",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
    });
    text.setOrigin(0.5);
    text.setDepth(y + 1);
    layer.add(text);
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

  getSurfaceY(x: number, y: number): number {
    const iso = cartToIso(x, y);
    if (!this.map) return iso.y;
    const tile = this.map.tiles[y]?.[x];
    if (!tile) return iso.y;
    return iso.y - getTileDepth(tile);
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

function drawDiamondPath(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
  graphics.beginPath();
  graphics.moveTo(x, y - TILE_HEIGHT / 2);
  graphics.lineTo(x + TILE_WIDTH / 2, y);
  graphics.lineTo(x, y + TILE_HEIGHT / 2);
  graphics.lineTo(x - TILE_WIDTH / 2, y);
  graphics.closePath();
}

function parseHexColor(color: string): number | null {
  const normalized = color.trim().replace(/^#/, "");
  const hex = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

function getObjectMetrics(object: MapObjectData) {
  if (object.type === "hero") return { width: 62, height: 62, offsetY: 15 };
  if (object.type === "town") return { width: 82, height: 82, offsetY: 20 };
  if (object.type === "building") return { width: 52, height: 52, offsetY: 6 };
  if (object.type === "combat") return { width: 48, height: 48, offsetY: 10 };
  return null;
}
