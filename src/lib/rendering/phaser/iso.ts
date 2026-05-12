export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const BASE_HEIGHT = 6;
export const ELEVATION_SCALE = 8;

export function cartToIso(cartX: number, cartY: number): { x: number; y: number } {
  return {
    x: (cartX - cartY) * (TILE_WIDTH / 2),
    y: (cartX + cartY) * (TILE_HEIGHT / 2),
  };
}

export function isoToCart(isoX: number, isoY: number): { x: number; y: number } {
  return {
    x: (isoX / (TILE_WIDTH / 2) + isoY / (TILE_HEIGHT / 2)) / 2,
    y: (isoY / (TILE_HEIGHT / 2) - isoX / (TILE_WIDTH / 2)) / 2,
  };
}
