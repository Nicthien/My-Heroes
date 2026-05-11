import { Application, Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import { GameMap, MapTile, TerrainType, Position, MapObject, ResourceBuildingType } from "@/lib/game/types";

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
  mercury: 0xb56cff,
  crystals: 0x00ffff,
  sulfur: 0xffa500,
};

const RESOURCE_LABELS: Record<string, string> = {
  gold: "OR",
  wood: "BOIS",
  ore: "MIN",
  mercury: "MER",
  crystals: "CRI",
  sulfur: "SOU",
};

const RESOURCE_BUILDING_COLORS: Record<string, number> = {
  gold_mine: 0xffd700,
  sawmill: 0x8b4513,
  ore_pit: 0x808080,
  alchemist_lab: 0xb56cff,
  crystal_cavern: 0x00ffff,
  sulfur_dune: 0xffa500,
};

const RESOURCE_BUILDING_LABELS: Record<string, string> = {
  gold_mine: "Mine d'or",
  sawmill: "Scierie",
  ore_pit: "Mine",
  alchemist_lab: "Labo",
  crystal_cavern: "Cristaux",
  sulfur_dune: "Soufre",
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

const MAP_SPRITES = {
  hero: "/assets/sprites/map/hero-cavalier.svg",
  town: "/assets/sprites/map/town-castle.svg",
  monster: "/assets/sprites/map/monster.svg",
  resources: {
    gold: "/assets/sprites/resources/gold.svg",
    wood: "/assets/sprites/resources/wood.svg",
    ore: "/assets/sprites/resources/ore.svg",
    mercury: "/assets/sprites/resources/mercury.svg",
    crystals: "/assets/sprites/resources/crystals.svg",
    sulfur: "/assets/sprites/resources/sulfur.svg",
  } as Record<string, string>,
  buildings: {
    gold_mine: "/assets/sprites/map/gold-mine.svg",
    sawmill: "/assets/sprites/map/sawmill.svg",
    ore_pit: "/assets/sprites/map/ore-pit.svg",
    alchemist_lab: "/assets/sprites/map/alchemist-lab.svg",
    crystal_cavern: "/assets/sprites/map/crystal-cavern.svg",
    sulfur_dune: "/assets/sprites/map/sulfur-dune.svg",
  } as Record<string, string>,
};

const MAP_SPRITE_PATHS = [
  MAP_SPRITES.hero,
  MAP_SPRITES.town,
  MAP_SPRITES.monster,
  ...Object.values(MAP_SPRITES.resources),
  ...Object.values(MAP_SPRITES.buildings),
];

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

function parseHexColor(color: string): number | null {
  const normalized = color.trim().replace(/^#/, "");
  const hex = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

export interface MapObjectData {
  type: "hero" | "town" | "combat" | "building";
  id: string;
  playerId: string | null;
  x: number;
  y: number;
  faction: string;
  color: string;
  name: string;
  onWater?: boolean;
  buildingType?: string;
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
    await Assets.load(MAP_SPRITE_PATHS);
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
      this.renderResourceIcon(container, object.subtype);
    } else if (object.type === "monster") {
      const monster = Sprite.from(MAP_SPRITES.monster);
      monster.anchor.set(0.5, 1);
      monster.width = 44;
      monster.height = 44;
      monster.y = 3;
      container.addChild(monster);

      const g = new Graphics();
      g.roundRect(-12, -43, 24, 10, 4);
      g.fill({ color: 0x000000, alpha: 0.48 });
      g.stroke({ width: 1, color: 0xffd166, alpha: 0.7 });
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
      label.y = -38;
      container.addChild(label);
    } else if (object.type === "building" && object.subtype) {
      this.renderBuildingOnTile(container, object.subtype, object.guardianPower);
    }

    this.mapContainer.addChild(container);
  }

  private renderResourceIcon(container: Container, subtype: string) {
    const color = RESOURCE_COLORS[subtype] || 0xffd700;
    const spritePath = MAP_SPRITES.resources[subtype];

    if (spritePath) {
      const resource = Sprite.from(spritePath);
      resource.anchor.set(0.5, 1);
      resource.width = 38;
      resource.height = 38;
      resource.y = 4;
      container.addChild(resource);

      const label = new Text({
        text: RESOURCE_LABELS[subtype] || subtype.slice(0, 3).toUpperCase(),
        style: {
          fill: 0xffffff,
          fontSize: 6,
          fontWeight: "bold",
          stroke: { color: 0x000000, width: 2 },
        },
      });
      label.anchor.set(0.5);
      label.y = 5;
      container.addChild(label);
      return;
    }

    const shadow = new Graphics();
    shadow.ellipse(0, 1, 13, 6);
    shadow.fill({ color: 0x000000, alpha: 0.35 });
    container.addChild(shadow);

    const glow = new Graphics();
    glow.circle(0, -12, 12);
    glow.fill({ color, alpha: 0.24 });
    container.addChild(glow);

    const badge = new Graphics();
    badge.circle(0, -12, 10);
    badge.fill({ color: 0x10111f, alpha: 0.94 });
    badge.stroke({ width: 2, color });
    container.addChild(badge);

    if (subtype === "gold") {
      const coin = new Graphics();
      coin.ellipse(0, -12, 7, 6);
      coin.fill(0xffd84d);
      coin.stroke({ width: 2, color: 0xfff2a8 });
      coin.ellipse(0, -12, 4, 3);
      coin.stroke({ width: 1, color: 0xb7791f });
      coin.moveTo(0, -16);
      coin.lineTo(0, -8);
      coin.stroke({ width: 1, color: 0x8a5a00 });
      container.addChild(coin);
    } else if (subtype === "wood") {
      const logBack = new Graphics();
      logBack.roundRect(-7, -17, 14, 5, 3);
      logBack.fill(0x5b2d12);
      logBack.stroke({ width: 1, color: 0xd08a35 });
      container.addChild(logBack);

      const logFront = new Graphics();
      logFront.roundRect(-6, -12, 14, 5, 3);
      logFront.fill(0x8b4513);
      logFront.stroke({ width: 1, color: 0xffc170 });
      logFront.circle(-3, -9.5, 2);
      logFront.stroke({ width: 1, color: 0xfcd19b });
      container.addChild(logFront);
    } else if (subtype === "ore") {
      const rock = new Graphics();
      rock.moveTo(-7, -10);
      rock.lineTo(-3, -18);
      rock.lineTo(5, -17);
      rock.lineTo(8, -11);
      rock.lineTo(2, -6);
      rock.closePath();
      rock.fill(0x9ca3af);
      rock.stroke({ width: 1, color: 0xe5e7eb });
      rock.moveTo(-2, -16);
      rock.lineTo(2, -8);
      rock.moveTo(-5, -11);
      rock.lineTo(7, -12);
      rock.stroke({ width: 1, color: 0x6b7280 });
      container.addChild(rock);
    } else if (subtype === "mercury") {
      const neck = new Graphics();
      neck.roundRect(-3, -20, 6, 5, 1);
      neck.fill(0xe9d5ff);
      neck.stroke({ width: 1, color: 0xffffff });
      container.addChild(neck);

      const vial = new Graphics();
      vial.roundRect(-6, -16, 12, 10, 5);
      vial.fill(0xc084fc);
      vial.stroke({ width: 1, color: 0xf5d0fe });
      vial.moveTo(-4, -11);
      vial.lineTo(4, -11);
      vial.stroke({ width: 1, color: 0xffffff });
      container.addChild(vial);
    } else if (subtype === "crystals") {
      const crystal = new Graphics();
      crystal.moveTo(0, -21);
      crystal.lineTo(8, -14);
      crystal.lineTo(5, -6);
      crystal.lineTo(-5, -6);
      crystal.lineTo(-8, -14);
      crystal.closePath();
      crystal.fill(0x67e8f9);
      crystal.stroke({ width: 1, color: 0xecfeff });
      crystal.moveTo(0, -21);
      crystal.lineTo(0, -6);
      crystal.moveTo(-8, -14);
      crystal.lineTo(8, -14);
      crystal.stroke({ width: 1, color: 0x0891b2 });
      container.addChild(crystal);
    } else if (subtype === "sulfur") {
      const cloud = new Graphics();
      cloud.circle(-5, -11, 4);
      cloud.circle(0, -14, 5);
      cloud.circle(5, -11, 4);
      cloud.roundRect(-8, -12, 16, 7, 4);
      cloud.fill(0xfacc15);
      cloud.stroke({ width: 1, color: 0xfff2a8 });
      container.addChild(cloud);
    }

    const label = new Text({
      text: RESOURCE_LABELS[subtype] || subtype.slice(0, 3).toUpperCase(),
      style: {
        fill: 0xffffff,
        fontSize: 6,
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 2 },
      },
    });
    label.anchor.set(0.5);
    label.y = 3;
    container.addChild(label);
  }
  private renderBuildingOnTile(container: Container, subtype: string, guardianPower?: number) {
    const color = RESOURCE_BUILDING_COLORS[subtype] || 0x808080;
    const spritePath = MAP_SPRITES.buildings[subtype];

    if (spritePath) {
      const building = Sprite.from(spritePath);
      building.anchor.set(0.5, 1);
      building.width = 52;
      building.height = 52;
      building.y = 6;
      container.addChild(building);
    } else {
      const shadow = new Graphics();
      shadow.ellipse(0, 1, 14, 6);
      shadow.fill({ color: 0x000000, alpha: 0.35 });
      container.addChild(shadow);

      const base = new Graphics();
      base.roundRect(-10, -16, 20, 14, 3);
      base.fill(0x555555);
      base.stroke({ width: 1, color: 0x888888 });
      container.addChild(base);

      const roof = new Graphics();
      roof.moveTo(-12, -16);
      roof.lineTo(0, -28);
      roof.lineTo(12, -16);
      roof.closePath();
      roof.fill(color);
      roof.stroke({ width: 1, color: 0xffffff });
      container.addChild(roof);
    }

    const nameLabel = new Text({
      text: RESOURCE_BUILDING_LABELS[subtype] || subtype,
      style: {
        fill: 0xffffff,
        fontSize: 7,
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 2 },
      },
    });
    nameLabel.anchor.set(0.5);
    nameLabel.y = 5;
    container.addChild(nameLabel);

    if (guardianPower && guardianPower > 0) {
      const shieldBg = new Graphics();
      shieldBg.roundRect(-8, -42, 16, 10, 3);
      shieldBg.fill({ color: 0x000000, alpha: 0.6 });
      shieldBg.stroke({ width: 1, color: 0xff4444 });
      container.addChild(shieldBg);

      const shieldLabel = new Text({
        text: `${Math.ceil(guardianPower / 100)}`,
        style: {
          fill: 0xff6666,
          fontSize: 8,
          fontWeight: "bold",
          stroke: { color: 0x000000, width: 1 },
        },
      });
      shieldLabel.anchor.set(0.5);
      shieldLabel.y = -37;
      container.addChild(shieldLabel);
    }
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
    } else if (obj.type === "building") {
      this.renderBuildingObject(container, obj);
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

  private renderBuildingObject(container: Container, obj: MapObjectData) {
    const buildingType = obj.buildingType || "";
    const color = RESOURCE_BUILDING_COLORS[buildingType] || 0x808080;
    const spritePath = MAP_SPRITES.buildings[buildingType];

    const shadow = new Graphics();
    shadow.ellipse(0, 1, 14, 6);
    shadow.fill({ color: 0x000000, alpha: 0.35 });
    container.addChild(shadow);

    if (spritePath) {
      const building = Sprite.from(spritePath);
      building.anchor.set(0.5, 1);
      building.width = 52;
      building.height = 52;
      building.y = 6;
      container.addChild(building);
    } else {
      const base = new Graphics();
      base.roundRect(-10, -16, 20, 14, 3);
      base.fill(0x555555);
      base.stroke({ width: 1, color: 0x888888 });
      container.addChild(base);

      const roof = new Graphics();
      roof.moveTo(-12, -16);
      roof.lineTo(0, -28);
      roof.lineTo(12, -16);
      roof.closePath();
      roof.fill(color);
      roof.stroke({ width: 1, color: 0xffffff });
      container.addChild(roof);
    }

    const label = new Text({
      text: RESOURCE_BUILDING_LABELS[buildingType] || buildingType,
      style: {
        fill: 0xffffff,
        fontSize: 7,
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 2 },
      },
    });
    label.anchor.set(0.5);
    label.y = 5;
    container.addChild(label);

    if (obj.playerId) {
      const bannerColor = parseHexColor(obj.color ?? "") ?? 0x808080;
      this.renderBanner(container, 0, -30, bannerColor, 14, 10);
    }
  }

  private renderTown(container: Container, obj: MapObjectData) {
    const factionColor = FACTION_COLORS[obj.faction] || 0x3b82f6;
    const bannerColor = parseHexColor(obj.color) ?? factionColor;
    if (MAP_SPRITES.town) {
      const town = Sprite.from(MAP_SPRITES.town);
      town.anchor.set(0.5, 1);
      town.width = 82;
      town.height = 82;
      town.y = 20;
      container.addChild(town);

      this.renderBanner(container, 0, -43, bannerColor, 18, 12);

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
      return;
    }

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

    this.renderBanner(container, 0, -48, bannerColor, 18, 12);

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
    const bannerColor = parseHexColor(obj.color) ?? factionColor;
    if (obj.onWater) {
      this.renderBoatHero(container, obj, factionColor, bannerColor);
      return;
    }

    if (MAP_SPRITES.hero) {
      const hero = Sprite.from(MAP_SPRITES.hero);
      hero.anchor.set(0.5, 1);
      hero.width = 62;
      hero.height = 62;
      hero.y = 15;
      container.addChild(hero);

      this.renderBanner(container, -16, -19, bannerColor, 16, 12);

      const labelPlate = new Graphics();
      labelPlate.roundRect(-24, 15, 48, 12, 5);
      labelPlate.fill({ color: 0x000000, alpha: 0.42 });
      labelPlate.stroke({ width: 1, color: 0xffd166, alpha: 0.7 });
      container.addChild(labelPlate);

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
      return;
    }

    const horseColor = 0x6d4c41;
    const horseLight = 0x8d6e63;
    const horseDark = 0x3e2723;
    const armorColor = 0xcfd8dc;
    const armorShadow = 0x78909c;
    const gold = 0xffd166;

    const shadow = new Graphics();
    shadow.ellipse(0, 11, 19, 7);
    shadow.fill({ color: 0x000000, alpha: 0.28 });
    container.addChild(shadow);

    const tail = new Graphics();
    tail.moveTo(-15, -5);
    tail.lineTo(-25, -13);
    tail.lineTo(-22, -4);
    tail.lineTo(-15, 1);
    tail.closePath();
    tail.fill(0x2a1710);
    tail.stroke({ width: 1, color: horseDark });
    container.addChild(tail);

    const horseBody = new Graphics();
    horseBody.ellipse(-1, -3, 18, 9);
    horseBody.fill(horseColor);
    horseBody.stroke({ width: 1.5, color: horseDark });
    horseBody.ellipse(2, -6, 12, 4);
    horseBody.fill({ color: horseLight, alpha: 0.45 });
    container.addChild(horseBody);

    const saddleBlanket = new Graphics();
    saddleBlanket.roundRect(-8, -13, 17, 10, 3);
    saddleBlanket.fill(bannerColor);
    saddleBlanket.stroke({ width: 1, color: gold });
    container.addChild(saddleBlanket);

    const saddle = new Graphics();
    saddle.ellipse(0, -12, 9, 4);
    saddle.fill(0x2b1a12);
    saddle.stroke({ width: 1, color: 0xb8860b });
    container.addChild(saddle);

    const horseHead = new Graphics();
    horseHead.ellipse(15, -11, 8, 5);
    horseHead.fill(horseColor);
    horseHead.stroke({ width: 1.5, color: horseDark });
    horseHead.ellipse(20, -10, 3, 2);
    horseHead.fill(0xc49a6c);
    container.addChild(horseHead);

    const ear = new Graphics();
    ear.moveTo(13, -16);
    ear.lineTo(16, -22);
    ear.lineTo(18, -15);
    ear.closePath();
    ear.fill(horseColor);
    ear.stroke({ width: 1, color: horseDark });
    container.addChild(ear);

    const mane = new Graphics();
    mane.moveTo(7, -15);
    mane.lineTo(13, -18);
    mane.lineTo(11, -7);
    mane.lineTo(5, -9);
    mane.closePath();
    mane.fill(0x24130c);
    container.addChild(mane);

    const bridle = new Graphics();
    bridle.moveTo(12, -12);
    bridle.lineTo(22, -12);
    bridle.moveTo(18, -16);
    bridle.lineTo(15, -6);
    bridle.stroke({ width: 1, color: gold });
    container.addChild(bridle);

    const eye = new Graphics();
    eye.circle(19, -13, 1.2);
    eye.fill(0x111111);
    container.addChild(eye);

    const legs = new Graphics();
    legs.moveTo(9, 2);
    legs.lineTo(14, 12);
    legs.moveTo(13, 1);
    legs.lineTo(9, 11);
    legs.moveTo(-8, 2);
    legs.lineTo(-13, 11);
    legs.moveTo(-4, 3);
    legs.lineTo(-3, 12);
    legs.stroke({ width: 3, color: horseColor });
    legs.moveTo(13, 12);
    legs.lineTo(18, 12);
    legs.moveTo(8, 11);
    legs.lineTo(12, 11);
    legs.moveTo(-14, 11);
    legs.lineTo(-10, 11);
    legs.moveTo(-4, 12);
    legs.lineTo(0, 12);
    legs.stroke({ width: 2, color: 0x151515 });
    container.addChild(legs);

    const cape = new Graphics();
    cape.moveTo(-4, -22);
    cape.lineTo(-17, -15);
    cape.lineTo(-13, -2);
    cape.lineTo(-1, -8);
    cape.closePath();
    cape.fill({ color: bannerColor, alpha: 0.88 });
    cape.stroke({ width: 1, color: 0x2d1b1b });
    container.addChild(cape);

    const riderBody = new Graphics();
    riderBody.roundRect(-5, -24, 11, 15, 3);
    riderBody.fill(armorColor);
    riderBody.stroke({ width: 1.5, color: armorShadow });
    riderBody.moveTo(-3, -21);
    riderBody.lineTo(4, -21);
    riderBody.moveTo(-2, -17);
    riderBody.lineTo(5, -17);
    riderBody.stroke({ width: 1, color: 0xf8fafc });
    container.addChild(riderBody);

    const arm = new Graphics();
    arm.moveTo(5, -20);
    arm.lineTo(12, -17);
    arm.stroke({ width: 3, color: armorColor });
    arm.stroke({ width: 1, color: armorShadow });
    container.addChild(arm);

    const riderHead = new Graphics();
    riderHead.circle(1, -29, 5);
    riderHead.fill(0xffcc80);
    riderHead.stroke({ width: 1, color: 0xe0e0e0 });
    container.addChild(riderHead);

    const helmet = new Graphics();
    helmet.arc(1, -29, 5, Math.PI, 0);
    helmet.fill(factionColor);
    helmet.stroke({ width: 1.5, color: 0xffffff });
    helmet.rect(-1, -29, 6, 2);
    helmet.fill(0xe2e8f0);
    container.addChild(helmet);

    const plume = new Graphics();
    plume.moveTo(1, -34);
    plume.lineTo(6, -43);
    plume.lineTo(1, -39);
    plume.lineTo(-3, -43);
    plume.lineTo(-1, -34);
    plume.closePath();
    plume.fill(gold);
    plume.stroke({ width: 1, color: 0x9a6b00 });
    container.addChild(plume);

    this.renderBanner(container, -16, -19, bannerColor, 16, 12);

    const lance = new Graphics();
    lance.moveTo(10, -18);
    lance.lineTo(26, -39);
    lance.stroke({ width: 2, color: 0x90a4ae });
    lance.moveTo(24, -37);
    lance.lineTo(29, -42);
    lance.lineTo(24, -44);
    lance.closePath();
    lance.fill(0xe5e7eb);
    lance.moveTo(18, -29);
    lance.lineTo(26, -31);
    lance.lineTo(21, -24);
    lance.closePath();
    lance.fill(bannerColor);
    lance.stroke({ width: 1, color: gold });
    container.addChild(lance);

    const shield = new Graphics();
    shield.moveTo(-10, -20);
    shield.lineTo(-3, -17);
    shield.lineTo(-4, -9);
    shield.lineTo(-10, -5);
    shield.lineTo(-16, -9);
    shield.lineTo(-17, -17);
    shield.closePath();
    shield.fill(factionColor);
    shield.stroke({ width: 1.5, color: gold });
    shield.moveTo(-10, -18);
    shield.lineTo(-10, -7);
    shield.moveTo(-15, -14);
    shield.lineTo(-5, -14);
    shield.stroke({ width: 1, color: 0xffffff });
    container.addChild(shield);

    const labelPlate = new Graphics();
    labelPlate.roundRect(-24, 15, 48, 12, 5);
    labelPlate.fill({ color: 0x000000, alpha: 0.42 });
    labelPlate.stroke({ width: 1, color: gold, alpha: 0.7 });
    container.addChild(labelPlate);

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

  private renderBanner(container: Container, x: number, y: number, color: number, width: number, height: number) {
    const pole = new Graphics();
    pole.moveTo(x, y);
    pole.lineTo(x, y - height - 8);
    pole.stroke({ width: 2, color: 0x222222 });
    container.addChild(pole);

    const banner = new Graphics();
    banner.moveTo(x, y - height - 8);
    banner.lineTo(x + width, y - height - 5);
    banner.lineTo(x + width - 3, y - height / 2 - 4);
    banner.lineTo(x + width, y - 3);
    banner.lineTo(x, y - 5);
    banner.closePath();
    banner.fill(color);
    banner.stroke({ width: 1, color: 0xffffff });
    container.addChild(banner);
  }

  private renderBoatHero(container: Container, obj: MapObjectData, factionColor: number, bannerColor: number) {
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
    flag.fill(bannerColor);
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
