import Phaser from "phaser";
import { DecorKind, MapTile } from "@/lib/game/types";
import { TERRAIN_TOP_TEXTURE_CROP_INSET } from "@/lib/rendering/phaser/mapRenderSettings";
import { hashTile } from "@/lib/rendering/phaser/pointMath";

export function getTerrainTopTextureTransform(tile: MapTile) {
  const value = Math.floor(hashTile(tile.x + 101, tile.y + 211) * 8);
  return {
    angle: value >= 4 ? 180 : 0,
    flipX: value % 2 === 1,
    flipY: value % 4 >= 2,
  };
}

export function applyTerrainTopTextureCrop(sprite: Phaser.GameObjects.Image) {
  const frameWidth = sprite.frame.width;
  const frameHeight = sprite.frame.height;
  const cropInsetX = Math.min(TERRAIN_TOP_TEXTURE_CROP_INSET, Math.max(0, Math.floor(frameWidth / 8)));
  const cropInsetY = Math.min(TERRAIN_TOP_TEXTURE_CROP_INSET, Math.max(0, Math.floor(frameHeight / 8)));

  if (cropInsetX <= 0 && cropInsetY <= 0) return;

  const cropWidth = Math.max(1, frameWidth - cropInsetX * 2);
  const cropHeight = Math.max(1, frameHeight - cropInsetY * 2);
  sprite.setCrop(cropInsetX, cropInsetY, cropWidth, cropHeight);
}

export function isAllowedDecor(kind: DecorKind) {
  return (
    kind === "tree-pine" ||
    kind === "tree-oak" ||
    kind === "tree-dead" ||
    kind === "bramble-thicket" ||
    kind === "fallen-log-barricade" ||
    kind === "willow-swamp-grove" ||
    kind === "birch-grove" ||
    kind === "deadwood-thicket" ||
    kind === "flowering-hedge" ||
    kind === "grass-oak-copse" ||
    kind === "grass-bramble-mound" ||
    kind === "grass-flowering-hedge" ||
    kind === "grass-reed-thicket" ||
    kind === "grass-root-barricade" ||
    kind === "grass-sapling-grove" ||
    kind === "forest-pine-grove" ||
    kind === "forest-broadleaf-grove" ||
    kind === "forest-underwood-thicket" ||
    kind === "forest-stump-ferns" ||
    kind === "forest-birch-pine-screen" ||
    kind === "forest-deadfall" ||
    kind === "dirt-thorn-scrub" ||
    kind === "dirt-dead-brush" ||
    kind === "dirt-dry-log-barrier" ||
    kind === "dirt-root-snarl" ||
    kind === "dirt-cactus-brush" ||
    kind === "dirt-bramble-ravine" ||
    kind === "sand-cactus-cluster" ||
    kind === "sand-desert-scrub" ||
    kind === "sand-palm-stump" ||
    kind === "sand-agave-barrier" ||
    kind === "sand-tumbleweed-heap" ||
    kind === "sand-saltbush-clump" ||
    kind === "snow-pine-grove" ||
    kind === "snow-birch-thicket" ||
    kind === "snow-deadwood-barrier" ||
    kind === "snow-bramble-mound" ||
    kind === "snow-evergreen-drift" ||
    kind === "snow-shrub-wall" ||
    kind === "mountain-pine-rock" ||
    kind === "mountain-cliff-brush" ||
    kind === "mountain-deadwood" ||
    kind === "mountain-mossy-roots" ||
    kind === "mountain-fir-grove" ||
    kind === "mountain-rhododendron" ||
    kind === "swamp-willow-grove" ||
    kind === "swamp-mangrove-tangle" ||
    kind === "swamp-reed-thicket" ||
    kind === "swamp-cypress-cluster" ||
    kind === "swamp-bog-bramble" ||
    kind === "swamp-fungus-log" ||
    kind === "lava-charred-thorns" ||
    kind === "lava-ember-roots" ||
    kind === "lava-ash-fungus" ||
    kind === "lava-scorched-deadwood" ||
    kind === "lava-sulfur-shrub" ||
    kind === "lava-obsidian-bramble" ||
    kind === "underground-stalagmite-cluster" ||
    kind === "underground-crystal-ribs" ||
    kind === "underground-mushroom-thicket" ||
    kind === "underground-rubble-pillar" ||
    kind === "underground-root-snarl" ||
    kind === "massif-mountain-granite-2x2" ||
    kind === "massif-mountain-snowcap-2x2" ||
    kind === "massif-mountain-pine-2x2" ||
    kind === "massif-mountain-volcanic-2x2" ||
    kind === "massif-mountain-desert-2x2" ||
    kind === "massif-mountain-mossy-2x2" ||
    kind === "rock-large" ||
    kind === "rock-small" ||
    kind === "boulder-cluster" ||
    kind === "bush" ||
    kind === "flower" ||
    kind === "grass-tuft"
  );
}
