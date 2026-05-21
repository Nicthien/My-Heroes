const CURSOR_PATH = "/assets/cursors";
const DEFAULT_HOTSPOT = "4 4";

function cursor(filename: string, fallback = "pointer", hotspot = DEFAULT_HOTSPOT) {
  return `url('${CURSOR_PATH}/${filename}') ${hotspot}, ${fallback}`;
}

export const GAME_CURSORS = {
  default: "default",
  wait: cursor("cursor-wait.webp", "wait", "12 12"),
  scrollMap: cursor("cursor-adventure-scroll-map.webp", "move", "24 24"),
  dragging: "grabbing",
  forbidden: cursor("cursor-combat-invalid.webp", "not-allowed", "24 24"),
  adventure: {
    moveLand: cursor("cursor-adventure-move-land.webp"),
    arriveLand: cursor("cursor-adventure-arrive-land.webp"),
    arriveLandTurn2: cursor("cursor-adventure-arrive-land-2.webp"),
    arriveLandTurn3: cursor("cursor-adventure-arrive-land-3.webp"),
    arriveLandTurn4: cursor("cursor-adventure-arrive-land-4.webp"),
    moveSea: cursor("cursor-adventure-move-sea.webp"),
    moveSeaHota: cursor("cursor-adventure-move-sea-hota.webp"),
    arriveSea: cursor("cursor-adventure-arrive-sea.webp"),
    arriveSeaHota: cursor("cursor-adventure-arrive-sea-hota.webp"),
    moveAirHota: cursor("cursor-adventure-move-air-hota.webp"),
    disembark: cursor("cursor-adventure-disembark.webp"),
    attack: cursor("cursor-adventure-attack.webp"),
    trade: cursor("cursor-adventure-trade.webp"),
    dimensionDoor: cursor("cursor-adventure-dimension-door.webp"),
    dimensionDoorAttackHota: cursor("cursor-adventure-dimension-door-attack-hota.webp"),
    hero: cursor("cursor-adventure-hero.webp"),
    town: cursor("cursor-adventure-town.webp"),
    scuttle: cursor("cursor-adventure-scuttle.webp"),
    scuttleHota: cursor("cursor-adventure-scuttle-hota.webp"),
  },
  combat: {
    moveWalk: cursor("cursor-combat-move-walk.webp"),
    moveFly: cursor("cursor-combat-move-fly.webp"),
    attack: cursor("cursor-combat-attack.webp"),
    shotGood: cursor("cursor-combat-shot-good.webp"),
    shotBad: cursor("cursor-combat-shot-bad.webp"),
    spell: cursor("cursor-combat-spell.webp"),
    sacrifice: cursor("cursor-combat-sacrifice.webp"),
    attackWall: cursor("cursor-combat-attack-wall.webp"),
    firstAid: cursor("cursor-combat-first-aid.webp"),
    teleport: cursor("cursor-adventure-dimension-door.webp"),
    hero: cursor("cursor-adventure-hero.webp"),
    info: cursor("cursor-combat-info.webp"),
    invalid: cursor("cursor-combat-invalid.webp", "not-allowed", "24 24"),
    fireballHota: cursor("cursor-combat-fireball-hota.webp"),
    deathCloudHota: cursor("cursor-combat-death-cloud-hota.webp"),
    repairHota: cursor("cursor-combat-repair-hota.webp"),
    devourHota: cursor("cursor-combat-devour-hota.webp"),
    heatStrokeHota: cursor("cursor-combat-heat-stroke-hota.webp"),
  },
} as const;
