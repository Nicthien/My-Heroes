import { Application, Container, Graphics, Text } from "pixi.js";
import { GameMap, MapTile, TerrainType, Position, MapObject } from "@/lib/game/types";

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const BASE_HEIGHT = 6; // hauteur de base pour toutes les tuiles solides
const ELEVATION_SCALE = 8; // pixels par niveau d'elevation

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

const RESOURCE_COLORS: Record<string, number> = {
  gold: 0xffd700,
  wood: 0x8b4513,
  ore: 0x808080,
  mercury: 0x90ee90,
  crystals: 0x00ffff,
  sulfur: 0xffa500,
};

const FACTION_COLORS: Record<string, number> = {
  castle: 0x3b82f6,
  rampart: 0x22c55e,
  tower: 0x8b5cf6,
  inferno: 0xef4444,
  necropolis: 0x6b7280,
  dungeon: 0x7c3aed,
  stronghold: 0xf97316,
  fortress: 0x059669,
};

function cartToIso(cartX: number, cartY: number): { x: number; y: number } {
  return {
    x: (cartX - cartY) * (TILE_WIDTH / 2),
    y: (cartX + cartY) * (TILE_HEIGHT / 2),
  };
}

function isoToCart(isoX: number, isoY: number): { x: number; y: number } {
  return {
    x: (isoX / (TILE_WIDTH / 2) + isoY / (TILE_HEIGHT / 2)) / 2,
    y: (isoY / (TILE_HEIGHT / 2) - isoX / (TILE_WIDTH / 2)) / 2,
  };
}

export interface MapObjectData {
  type: "hero" | "town" | "combat";
  id: string;
  playerId: string;
  x: number;
  y: number;
  faction: string;
  color: string;
  name: string;
  onWater?: boolean;
}

export class IsometricRenderer {
  private app: Application;
  private mapContainer: Container;
  private objectContainer: Container;
  private highlightContainer: Container;
  private fogContainer: Container;
  private fogTiles: Map<string, Graphics> = new Map();
  private map: GameMap | null = null;
  private objects: MapObjectData[] = [];

  private initialized = false;
  private destroyed = false;
  private viewportWidth = 1024;
  private viewportHeight = 768;

  constructor() {
    this.app = new Application();
    this.mapContainer = new Container();
    this.objectContainer = new Container();
    this.highlightContainer = new Container();
    this.fogContainer = new Container();
    this.mapContainer.zIndex = 0;
    this.fogContainer.zIndex = 20;
    this.highlightContainer.zIndex = 5;
    this.objectContainer.zIndex = 10;
    this.objectContainer.sortableChildren = true;
  }

  async init(container: HTMLDivElement) {
    this.destroyed = false;
    this.viewportWidth = container.clientWidth || window.innerWidth || 1024;
    this.viewportHeight = container.clientHeight || window.innerHeight || 768;

    await this.app.init({
      resizeTo: container,
      backgroundColor: 0x1a1a2e,
      antialias: true,
    });

    container.querySelectorAll("canvas").forEach((canvas) => canvas.remove());
    container.appendChild(this.app.canvas as HTMLCanvasElement);

    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.objectContainer);
    this.app.stage.addChild(this.highlightContainer);
    this.app.stage.addChild(this.fogContainer);

    this.app.stage.sortableChildren = true;
    this.initialized = true;
  }

  isReady() {
    return this.initialized && !this.destroyed;
  }

  renderMap(map: GameMap) {
    if (!this.isReady()) return;
    this.map = map;
    this.mapContainer.removeChildren();

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        const iso = cartToIso(x, y);
        this.renderTile(tile, iso.x, iso.y);
      }
    }

    this.syncObjectPositions();
  }

  private renderTile(tile: MapTile, isoX: number, isoY: number) {
    const depth = tile.terrain === TerrainType.WATER
      ? 2
      : BASE_HEIGHT + Math.max(0, tile.elevation) * ELEVATION_SCALE;
    const topColor = TERRAIN_TOP[tile.terrain] || 0x333333;
    const sideLit = TERRAIN_SIDE_LIT[tile.terrain] || 0x333333;
    const sideDark = TERRAIN_SIDE_DARK[tile.terrain] || 0x333333;

    if (depth > 0) {
      const leftFace = new Graphics();
      leftFace.moveTo(-TILE_WIDTH / 2, 0);
      leftFace.lineTo(0, TILE_HEIGHT / 2);
      leftFace.lineTo(0, TILE_HEIGHT / 2 + depth);
      leftFace.lineTo(-TILE_WIDTH / 2, depth);
      leftFace.closePath();
      leftFace.fill(sideLit);
      leftFace.x = isoX;
      leftFace.y = isoY - depth;
      this.mapContainer.addChild(leftFace);

      const rightFace = new Graphics();
      rightFace.moveTo(0, TILE_HEIGHT / 2);
      rightFace.lineTo(TILE_WIDTH / 2, 0);
      rightFace.lineTo(TILE_WIDTH / 2, depth);
      rightFace.lineTo(0, TILE_HEIGHT / 2 + depth);
      rightFace.closePath();
      rightFace.fill(sideDark);
      rightFace.x = isoX;
      rightFace.y = isoY - depth;
      this.mapContainer.addChild(rightFace);
    }

    const topFace = new Graphics();
    topFace.moveTo(0, -TILE_HEIGHT / 2);
    topFace.lineTo(TILE_WIDTH / 2, 0);
    topFace.lineTo(0, TILE_HEIGHT / 2);
    topFace.lineTo(-TILE_WIDTH / 2, 0);
    topFace.closePath();
    if (tile.terrain === TerrainType.WATER) {
      topFace.fill({ color: topColor, alpha: 0.7 });
    } else {
      topFace.fill(topColor);
      topFace.stroke({ width: 1, color: 0x000000 });
    }
    topFace.x = isoX;
    topFace.y = isoY - depth;
    this.mapContainer.addChild(topFace);

    // Affichage des objets de la carte (ressources, monstres)
    if (tile.object) {
      this.renderMapObject(tile.object, isoX, isoY - depth);
    }
  }

  private renderMapObject(object: MapObject, isoX: number, isoY: number) {
    const container = new Container();
    container.x = isoX;
    container.y = isoY;

    if (object.type === "resource" && object.subtype) {
      const color = RESOURCE_COLORS[object.subtype] || 0xffd700;
      const g = new Graphics();
      g.circle(0, -8, 6);
      g.fill(color);
      g.stroke({ width: 1, color: 0xffffff });
      container.addChild(g);

      const label = new Text({
        text: object.subtype === "gold" ? "G" : object.subtype[0].toUpperCase(),
        style: {
          fill: 0xffffff,
          fontSize: 8,
          fontWeight: "bold",
        },
      });
      label.anchor.set(0.5);
      label.y = -8;
      container.addChild(label);
    } else if (object.type === "monster") {
      const g = new Graphics();
      g.rect(-6, -14, 12, 12);
      g.fill(0x8b0000);
      g.stroke({ width: 1, color: 0x000000 });
      container.addChild(g);

      const label = new Text({
        text: "M",
        style: {
          fill: 0xffffff,
          fontSize: 9,
          fontWeight: "bold",
        },
      });
      label.anchor.set(0.5);
      label.y = -8;
      container.addChild(label);
    }

    this.mapContainer.addChild(container);
  }

  setObjects(objects: MapObjectData[]) {
    if (!this.isReady()) return;
    this.objects = objects;
    this.objectContainer.removeChildren();

    for (const obj of objects) {
      const surfaceY = this.getSurfaceY(obj.x, obj.y);
      const iso = cartToIso(obj.x, obj.y);
      this.renderObject(obj, iso.x, surfaceY);
    }

    this.syncObjectPositions();
  }

  private renderObject(obj: MapObjectData, isoX: number, isoY: number) {
    const container = new Container();
    container.x = isoX;
    container.y = isoY;
    container.zIndex = isoY;
    container.label = obj.id;

    if (obj.type === "town") {
      this.renderTown(container, obj);
    } else if (obj.type === "hero") {
      this.renderHero(container, obj);
    } else if (obj.type === "combat") {
      this.renderCombatMarker(container);
    }

    this.objectContainer.addChild(container);
  }

  private renderCombatMarker(container: Container) {
    const shadow = new Graphics();
    shadow.ellipse(0, 12, 24, 8);
    shadow.fill({ color: 0x000000, alpha: 0.35 });
    container.addChild(shadow);

    const burst = new Graphics();
    burst.star(0, -12, 8, 22, 9);
    burst.fill(0xff6b00);
    burst.stroke({ width: 2, color: 0xfff2a8 });
    container.addChild(burst);

    const label = new Text({
      text: "COMBAT",
      style: { fill: 0xffffff, fontSize: 9, fontWeight: "bold", stroke: { color: 0x000000, width: 3 } },
    });
    label.anchor.set(0.5);
    label.y = -38;
    container.addChild(label);
  }

  private renderTown(container: Container, obj: MapObjectData) {
    const factionColor = FACTION_COLORS[obj.faction] || 0x3b82f6;
    const wallColor = 0x555555;
    const roofColor = 0x8b0000;

    // Ombre portée
    const shadow = new Graphics();
    shadow.ellipse(0, 18, 28, 10);
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    container.addChild(shadow);

    // Muraille arrière (donne la profondeur)
    const backWall = new Graphics();
    backWall.rect(-22, -18, 44, 22);
    backWall.fill(wallColor);
    backWall.stroke({ width: 1, color: 0x333333 });
    container.addChild(backWall);

    // Tours arrière gauche et droite
    const towerBackL = new Graphics();
    towerBackL.rect(-26, -28, 10, 20);
    towerBackL.fill(wallColor);
    towerBackL.stroke({ width: 1, color: 0x333333 });
    container.addChild(towerBackL);

    const towerBackR = new Graphics();
    towerBackR.rect(16, -28, 10, 20);
    towerBackR.fill(wallColor);
    towerBackR.stroke({ width: 1, color: 0x333333 });
    container.addChild(towerBackR);

    // Toits coniques des tours arrière
    const roofBL = new Graphics();
    roofBL.moveTo(-26, -28);
    roofBL.lineTo(-21, -40);
    roofBL.lineTo(-16, -28);
    roofBL.closePath();
    roofBL.fill(roofColor);
    container.addChild(roofBL);

    const roofBR = new Graphics();
    roofBR.moveTo(16, -28);
    roofBR.lineTo(21, -40);
    roofBR.lineTo(26, -28);
    roofBR.closePath();
    roofBR.fill(roofColor);
    container.addChild(roofBR);

    // Corps principal (avant)
    const frontWall = new Graphics();
    frontWall.rect(-20, -10, 40, 22);
    frontWall.fill(wallColor);
    frontWall.stroke({ width: 1, color: 0x444444 });
    container.addChild(frontWall);

    // Tours avant gauche et droite
    const towerFrontL = new Graphics();
    towerFrontL.rect(-26, -22, 10, 24);
    towerFrontL.fill(wallColor);
    towerFrontL.stroke({ width: 1, color: 0x444444 });
    container.addChild(towerFrontL);

    const towerFrontR = new Graphics();
    towerFrontR.rect(16, -22, 10, 24);
    towerFrontR.fill(wallColor);
    towerFrontR.stroke({ width: 1, color: 0x444444 });
    container.addChild(towerFrontR);

    // Toits coniques des tours avant
    const roofFL = new Graphics();
    roofFL.moveTo(-26, -22);
    roofFL.lineTo(-21, -38);
    roofFL.lineTo(-16, -22);
    roofFL.closePath();
    roofFL.fill(roofColor);
    container.addChild(roofFL);

    const roofFR = new Graphics();
    roofFR.moveTo(16, -22);
    roofFR.lineTo(21, -38);
    roofFR.lineTo(26, -22);
    roofFR.closePath();
    roofFR.fill(roofColor);
    container.addChild(roofFR);

    // Donjon central (arrière)
    const keep = new Graphics();
    keep.rect(-10, -30, 20, 18);
    keep.fill(wallColor);
    keep.stroke({ width: 1, color: 0x444444 });
    container.addChild(keep);

    const keepRoof = new Graphics();
    keepRoof.moveTo(-10, -30);
    keepRoof.lineTo(0, -48);
    keepRoof.lineTo(10, -30);
    keepRoof.closePath();
    keepRoof.fill(roofColor);
    container.addChild(keepRoof);

    // Porte
    const gate = new Graphics();
    gate.rect(-6, 0, 12, 12);
    gate.fill(0x3e2723);
    gate.stroke({ width: 1, color: 0x5d4037 });
    container.addChild(gate);

    // Pont-levis (ligne horizontale sur la porte)
    const portcullis = new Graphics();
    portcullis.rect(-5, 2, 10, 2);
    portcullis.fill(0x222222);
    container.addChild(portcullis);

    // Drapeau sur le donjon
    const flagPole = new Graphics();
    flagPole.moveTo(0, -48);
    flagPole.lineTo(0, -60);
    flagPole.stroke({ width: 2, color: 0x222222 });
    container.addChild(flagPole);

    const flag = new Graphics();
    flag.moveTo(0, -60);
    flag.lineTo(14, -54);
    flag.lineTo(0, -48);
    flag.closePath();
    flag.fill(factionColor);
    flag.stroke({ width: 1, color: 0xffffff });
    container.addChild(flag);

    const label = new Text({
      text: obj.name,
      style: {
        fill: 0xffffff,
        fontSize: 11,
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5);
    label.y = 26;
    container.addChild(label);
  }

  private renderHero(container: Container, obj: MapObjectData) {
    const factionColor = FACTION_COLORS[obj.faction] || 0x3b82f6;
    if (obj.onWater) {
      this.renderBoatHero(container, obj, factionColor);
      return;
    }

    const horseColor = 0x5d4037;
    const armorColor = 0xb0bec5;

    // Ombre
    const shadow = new Graphics();
    shadow.ellipse(0, 10, 14, 6);
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    container.addChild(shadow);

    // Cheval (corps)
    const horseBody = new Graphics();
    horseBody.ellipse(0, -2, 16, 8);
    horseBody.fill(horseColor);
    horseBody.stroke({ width: 1, color: 0x3e2723 });
    container.addChild(horseBody);

    // Cheval (tête)
    const horseHead = new Graphics();
    horseHead.ellipse(12, -10, 7, 5);
    horseHead.fill(horseColor);
    horseHead.stroke({ width: 1, color: 0x3e2723 });
    container.addChild(horseHead);

    // Cheval (crinière)
    const mane = new Graphics();
    mane.moveTo(6, -14);
    mane.lineTo(10, -16);
    mane.lineTo(8, -8);
    mane.closePath();
    mane.fill(0x212121);
    container.addChild(mane);

    // Jambes avant
    const legFL = new Graphics();
    legFL.rect(8, 4, 3, 8);
    legFL.fill(horseColor);
    container.addChild(legFL);

    const legFR = new Graphics();
    legFR.rect(12, 4, 3, 8);
    legFR.fill(horseColor);
    container.addChild(legFR);

    // Jambes arrière
    const legBL = new Graphics();
    legBL.rect(-10, 4, 3, 7);
    legBL.fill(horseColor);
    container.addChild(legBL);

    const legBR = new Graphics();
    legBR.rect(-6, 4, 3, 7);
    legBR.fill(horseColor);
    container.addChild(legBR);

    // Cavalier (torse)
    const riderBody = new Graphics();
    riderBody.rect(-4, -22, 10, 14);
    riderBody.fill(armorColor);
    riderBody.stroke({ width: 1, color: 0x78909c });
    container.addChild(riderBody);

    // Cavalier (tête)
    const riderHead = new Graphics();
    riderHead.circle(1, -26, 5);
    riderHead.fill(0xffcc80);
    riderHead.stroke({ width: 1, color: 0xe0e0e0 });
    container.addChild(riderHead);

    // Heaume / casque
    const helmet = new Graphics();
    helmet.arc(1, -26, 5, Math.PI, 0);
    helmet.fill(factionColor);
    helmet.stroke({ width: 1, color: 0xffffff });
    container.addChild(helmet);

    // Plume sur le casque
    const plume = new Graphics();
    plume.moveTo(1, -31);
    plume.lineTo(4, -38);
    plume.lineTo(-1, -33);
    plume.closePath();
    plume.fill(0xffd700);
    container.addChild(plume);

    // Épée / lance
    const lance = new Graphics();
    lance.moveTo(10, -18);
    lance.lineTo(22, -34);
    lance.stroke({ width: 2, color: 0x90a4ae });
    // Pointe de lance
    lance.moveTo(20, -32);
    lance.lineTo(24, -36);
    lance.lineTo(20, -38);
    lance.closePath();
    lance.fill(0xc0c0c0);
    container.addChild(lance);

    // Bouclier
    const shield = new Graphics();
    shield.ellipse(-8, -14, 5, 7);
    shield.fill(factionColor);
    shield.stroke({ width: 1, color: 0xffd700 });
    container.addChild(shield);

    const label = new Text({
      text: obj.name,
      style: {
        fill: 0xffd700,
        fontSize: 10,
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5);
    label.y = 20;
    container.addChild(label);
  }

  private renderBoatHero(container: Container, obj: MapObjectData, factionColor: number) {
    const shadow = new Graphics();
    shadow.ellipse(0, 12, 20, 6);
    shadow.fill({ color: 0x000000, alpha: 0.25 });
    container.addChild(shadow);

    const hull = new Graphics();
    hull.moveTo(-22, -2);
    hull.lineTo(20, -2);
    hull.lineTo(12, 10);
    hull.lineTo(-14, 10);
    hull.closePath();
    hull.fill(0x7a4a22);
    hull.stroke({ width: 1, color: 0x3e2723 });
    container.addChild(hull);

    const mast = new Graphics();
    mast.moveTo(0, -28);
    mast.lineTo(0, 8);
    mast.stroke({ width: 2, color: 0x5d4037 });
    container.addChild(mast);

    const sail = new Graphics();
    sail.moveTo(1, -27);
    sail.lineTo(16, -8);
    sail.lineTo(1, -4);
    sail.closePath();
    sail.fill(0xf5f0d8);
    sail.stroke({ width: 1, color: factionColor });
    container.addChild(sail);

    const flag = new Graphics();
    flag.moveTo(0, -29);
    flag.lineTo(11, -25);
    flag.lineTo(0, -21);
    flag.closePath();
    flag.fill(factionColor);
    container.addChild(flag);

    const label = new Text({
      text: obj.name,
      style: {
        fill: 0xffd700,
        fontSize: 10,
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5);
    label.y = 24;
    container.addChild(label);
  }

  private syncObjectPositions() {
    this.objectContainer.x = this.mapContainer.x;
    this.objectContainer.y = this.mapContainer.y;
    this.highlightContainer.x = this.mapContainer.x;
    this.highlightContainer.y = this.mapContainer.y;
    this.fogContainer.x = this.mapContainer.x;
    this.fogContainer.y = this.mapContainer.y;
  }

  highlightPath(path: Position[]) {
    if (!this.isReady()) return;
    this.highlightContainer.removeChildren();

    for (const pos of path) {
      const iso = cartToIso(pos.x, pos.y);
      const surfaceY = this.getSurfaceY(pos.x, pos.y);
      const highlight = new Graphics();

      highlight.moveTo(0, -TILE_HEIGHT / 2);
      highlight.lineTo(TILE_WIDTH / 2, 0);
      highlight.lineTo(0, TILE_HEIGHT / 2);
      highlight.lineTo(-TILE_WIDTH / 2, 0);
      highlight.closePath();
      highlight.fill({ color: 0xffff00, alpha: 0.3 });

      highlight.x = iso.x;
      highlight.y = surfaceY;

      this.highlightContainer.addChild(highlight);
    }
  }

  highlightTile(x: number, y: number, color: number = 0x00ff00) {
    if (!this.isReady()) return;
    const iso = cartToIso(x, y);
    const surfaceY = this.getSurfaceY(x, y);
    const highlight = new Graphics();

    highlight.moveTo(0, -TILE_HEIGHT / 2);
    highlight.lineTo(TILE_WIDTH / 2, 0);
    highlight.lineTo(0, TILE_HEIGHT / 2);
    highlight.lineTo(-TILE_WIDTH / 2, 0);
    highlight.closePath();
    highlight.fill({ color, alpha: 0.4 });

    highlight.x = iso.x;
    highlight.y = surfaceY;

    this.highlightContainer.addChild(highlight);
  }

  clearHighlights() {
    if (!this.isReady()) return;
    this.highlightContainer.removeChildren();
  }

  private centerCamera() {
    if (!this.map || !this.isReady()) return;

    const centerIso = cartToIso(this.map.width / 2, this.map.height / 2);

    const screenCenterX = this.viewportWidth / 2;
    const screenCenterY = this.viewportHeight / 2;

    this.mapContainer.x = screenCenterX - centerIso.x;
    this.mapContainer.y = screenCenterY - centerIso.y;
  }

  centerOnTile(x: number, y: number) {
    if (!this.isReady()) return;
    const iso = cartToIso(x, y);
    const screenCenterX = this.viewportWidth / 2;
    const screenCenterY = this.viewportHeight / 2;

    this.mapContainer.x = screenCenterX - iso.x;
    this.mapContainer.y = screenCenterY - iso.y;
    this.syncObjectPositions();
    this.highlightContainer.x = this.mapContainer.x;
    this.highlightContainer.y = this.mapContainer.y;
  }

  panCamera(dx: number, dy: number) {
    if (!this.isReady()) return;
    this.mapContainer.x += dx;
    this.mapContainer.y += dy;
    this.syncObjectPositions();
  }

  getSurfaceY(x: number, y: number): number {
    const iso = cartToIso(x, y);
    if (!this.map) return iso.y;
    const tile = this.map.tiles[y]?.[x];
    if (!tile) return iso.y;
    const depth = tile.terrain === TerrainType.WATER
      ? 2
      : BASE_HEIGHT + Math.max(0, tile.elevation) * ELEVATION_SCALE;
    return iso.y - depth;
  }

  getTileAtScreen(screenX: number, screenY: number): Position | null {
    if (!this.isReady() || !this.map) return null;
    const mapX = screenX - this.mapContainer.x;
    const mapY = screenY - this.mapContainer.y;

    let bestTile: Position | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const iso = cartToIso(x, y);
        const surfaceY = this.getSurfaceY(x, y);
        const localX = mapX - iso.x;
        const localY = mapY - surfaceY;
        const diamondDistance =
          Math.abs(localX) / (TILE_WIDTH / 2) +
          Math.abs(localY) / (TILE_HEIGHT / 2);

        if (diamondDistance <= 1 && diamondDistance < bestScore) {
          bestTile = { x, y };
          bestScore = diamondDistance;
        }
      }
    }

    if (bestTile) return bestTile;

    const cart = isoToCart(mapX, mapY);

    const tileX = Math.round(cart.x);
    const tileY = Math.round(cart.y);

    if (tileX < 0 || tileX >= this.map.width || tileY < 0 || tileY >= this.map.height)
      return null;

    return { x: tileX, y: tileY };
  }

  getObjectAtScreen(screenX: number, screenY: number): MapObjectData | null {
    const tile = this.getTileAtScreen(screenX, screenY);
    if (!tile) return null;

    return this.objects.find((o) => o.x === tile.x && o.y === tile.y) || null;
  }

  getObjectsAtScreen(screenX: number, screenY: number): MapObjectData[] {
    const tile = this.getTileAtScreen(screenX, screenY);
    if (!tile) return [];

    return this.objects.filter((o) => o.x === tile.x && o.y === tile.y);
  }

  setFog(visibleTiles: Set<string>, exploredTiles: Set<string>) {
    if (!this.isReady() || !this.map) return;

    this.fogContainer.removeChildren();
    this.fogTiles.clear();

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const key = `${x},${y}`;
        const isVisible = visibleTiles.has(key);
        const isExplored = exploredTiles.has(key);

        if (isVisible) continue;

        const tile = this.map.tiles[y][x];
        const iso = cartToIso(x, y);
        const surfaceY = tile.terrain === TerrainType.WATER
          ? iso.y
          : iso.y - (BASE_HEIGHT + Math.max(0, tile.elevation) * ELEVATION_SCALE);

        if (isExplored) {
          // Brume grise (tuile decouverte mais pas visible)
          const fog = new Graphics();
          fog.moveTo(0, -TILE_HEIGHT / 2);
          fog.lineTo(TILE_WIDTH / 2, 0);
          fog.lineTo(0, TILE_HEIGHT / 2);
          fog.lineTo(-TILE_WIDTH / 2, 0);
          fog.closePath();
          fog.fill({ color: 0x1a1a2e, alpha: 0.6 });

          fog.x = iso.x;
          fog.y = surfaceY;
          this.fogContainer.addChild(fog);

          // Faces laterales aussi
          const depth = tile.terrain === TerrainType.WATER ? 0 : BASE_HEIGHT + Math.max(0, tile.elevation) * ELEVATION_SCALE;
          if (depth > 0) {
            const leftFog = new Graphics();
            leftFog.moveTo(-TILE_WIDTH / 2, 0);
            leftFog.lineTo(0, TILE_HEIGHT / 2);
            leftFog.lineTo(0, TILE_HEIGHT / 2 + depth);
            leftFog.lineTo(-TILE_WIDTH / 2, depth);
            leftFog.closePath();
            leftFog.fill({ color: 0x1a1a2e, alpha: 0.6 });
            leftFog.x = iso.x;
            leftFog.y = iso.y - depth;
            this.fogContainer.addChild(leftFog);

            const rightFog = new Graphics();
            rightFog.moveTo(0, TILE_HEIGHT / 2);
            rightFog.lineTo(TILE_WIDTH / 2, 0);
            rightFog.lineTo(TILE_WIDTH / 2, depth);
            rightFog.lineTo(0, TILE_HEIGHT / 2 + depth);
            rightFog.closePath();
            rightFog.fill({ color: 0x1a1a2e, alpha: 0.6 });
            rightFog.x = iso.x;
            rightFog.y = iso.y - depth;
            this.fogContainer.addChild(rightFog);
          }
        } else {
          // Brouillard complet (noir)
          const fog = new Graphics();
          fog.moveTo(0, -TILE_HEIGHT / 2);
          fog.lineTo(TILE_WIDTH / 2, 0);
          fog.lineTo(0, TILE_HEIGHT / 2);
          fog.lineTo(-TILE_WIDTH / 2, 0);
          fog.closePath();
          fog.fill(0x0a0a14);

          fog.x = iso.x;
          fog.y = surfaceY;
          this.fogContainer.addChild(fog);

          const depth = tile.terrain === TerrainType.WATER ? 0 : BASE_HEIGHT + Math.max(0, tile.elevation) * ELEVATION_SCALE;
          if (depth > 0) {
            const leftFog = new Graphics();
            leftFog.moveTo(-TILE_WIDTH / 2, 0);
            leftFog.lineTo(0, TILE_HEIGHT / 2);
            leftFog.lineTo(0, TILE_HEIGHT / 2 + depth);
            leftFog.lineTo(-TILE_WIDTH / 2, depth);
            leftFog.closePath();
            leftFog.fill(0x0a0a14);
            leftFog.x = iso.x;
            leftFog.y = iso.y - depth;
            this.fogContainer.addChild(leftFog);

            const rightFog = new Graphics();
            rightFog.moveTo(0, TILE_HEIGHT / 2);
            rightFog.lineTo(TILE_WIDTH / 2, 0);
            rightFog.lineTo(TILE_WIDTH / 2, depth);
            rightFog.lineTo(0, TILE_HEIGHT / 2 + depth);
            rightFog.closePath();
            rightFog.fill(0x0a0a14);
            rightFog.x = iso.x;
            rightFog.y = iso.y - depth;
            this.fogContainer.addChild(rightFog);
          }
        }
      }
    }
  }

  destroy() {
    this.destroyed = true;
    if (!this.initialized) return;
    try {
      this.app.destroy(true);
    } catch {
      // ignore destroy errors during React StrictMode re-mounts
    }
    this.initialized = false;
  }
}
