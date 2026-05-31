import type { CombatEnvironment, CombatTerrainFeature } from "@/lib/game/types";

export type SceneryPreset = {
  background: string;
  sky: string;
  horizon: string;
  mountain: string;
  tree: string;
  trunk: string;
  leftVignette: string;
  rightVignette: string;
  trees: Array<{ left: number; top: number; scale: number }>;
  mountains: Array<{ left: number; width: number; height: number }>;
};

export function getSceneryPreset(environment: CombatEnvironment): SceneryPreset {
  const defaultTrees = [
    { left: 5, top: 21, scale: 1.1 },
    { left: 14, top: 12, scale: 0.86 },
    { left: 25, top: 18, scale: 1.0 },
    { left: 66, top: 14, scale: 0.96 },
    { left: 78, top: 20, scale: 1.2 },
    { left: 90, top: 15, scale: 0.9 },
  ];
  const sparseTrees = [
    { left: 9, top: 23, scale: 0.74 },
    { left: 82, top: 20, scale: 0.8 },
  ];
  const defaultMountains = [
    { left: 10, width: 150, height: 94 },
    { left: 31, width: 210, height: 126 },
    { left: 59, width: 180, height: 108 },
    { left: 78, width: 150, height: 86 },
  ];
  const noMountains: SceneryPreset["mountains"] = [];
  const base: SceneryPreset = {
    background: "linear-gradient(180deg,#5d6d68 0%,#636a58 26%,#30352b 56%,#141712 100%)",
    sky: "linear-gradient(180deg,rgba(177,192,190,0.48),rgba(112,128,116,0.28) 45%,transparent)",
    horizon: "linear-gradient(180deg,rgba(48,75,55,0.56),rgba(40,53,41,0.2),transparent)",
    mountain: "linear-gradient(145deg,rgba(86,94,84,0.92),rgba(37,45,39,0.64))",
    tree: "linear-gradient(160deg,#3f5f45,#182a20)",
    trunk: "#3f2c1d",
    leftVignette: "radial-gradient(ellipse at bottom left,rgba(24,44,23,0.95),transparent 70%)",
    rightVignette: "radial-gradient(ellipse at bottom right,rgba(45,37,25,0.96),transparent 72%)",
    trees: defaultTrees,
    mountains: defaultMountains,
  };

  switch (environment.theme) {
    case "forest":
      return {
        ...base,
        background: "linear-gradient(180deg,#52665c 0%,#36533f 32%,#1f3527 62%,#101812 100%)",
        horizon: "linear-gradient(180deg,rgba(29,68,43,0.72),rgba(21,54,33,0.42),transparent)",
        tree: "linear-gradient(160deg,#5f8c52,#102516)",
        trees: [...defaultTrees, { left: 39, top: 11, scale: 1.08 }, { left: 54, top: 18, scale: 0.92 }],
      };
    case "sand":
      return {
        ...base,
        background: "linear-gradient(180deg,#9aa2a0 0%,#b99957 30%,#6e572e 62%,#211b13 100%)",
        horizon: "linear-gradient(180deg,rgba(157,124,52,0.52),rgba(108,82,32,0.28),transparent)",
        mountain: "linear-gradient(145deg,rgba(151,115,61,0.88),rgba(71,52,27,0.62))",
        tree: "linear-gradient(160deg,#a3a03a,#4f4b1d)",
        trunk: "#5b341c",
        trees: sparseTrees,
      };
    case "snow":
      return {
        ...base,
        background: "linear-gradient(180deg,#c7d4d8 0%,#9aaeb2 30%,#56666a 62%,#15191b 100%)",
        sky: "linear-gradient(180deg,rgba(236,249,255,0.62),rgba(188,205,211,0.3) 45%,transparent)",
        horizon: "linear-gradient(180deg,rgba(203,218,218,0.5),rgba(106,125,124,0.22),transparent)",
        mountain: "linear-gradient(145deg,rgba(226,232,240,0.9),rgba(91,104,111,0.66))",
        tree: "linear-gradient(160deg,#dbe7de,#2b4a3a)",
      };
    case "swamp":
      return {
        ...base,
        background: "linear-gradient(180deg,#67715a 0%,#4f6139 30%,#2f3a24 62%,#11160d 100%)",
        sky: "linear-gradient(180deg,rgba(149,160,122,0.48),rgba(82,101,62,0.3) 45%,transparent)",
        horizon: "linear-gradient(180deg,rgba(69,91,42,0.64),rgba(40,57,27,0.28),transparent)",
        tree: "linear-gradient(160deg,#617f3d,#1f2f16)",
        trees: [...sparseTrees, { left: 38, top: 24, scale: 0.68 }, { left: 62, top: 23, scale: 0.72 }],
        mountains: noMountains,
      };
    case "lava":
      return {
        ...base,
        background: "linear-gradient(180deg,#5b4b43 0%,#5a2b22 32%,#341817 62%,#110909 100%)",
        sky: "linear-gradient(180deg,rgba(104,71,56,0.58),rgba(90,40,28,0.36) 45%,transparent)",
        horizon: "linear-gradient(180deg,rgba(126,47,27,0.46),rgba(56,19,15,0.35),transparent)",
        mountain: "linear-gradient(145deg,rgba(75,52,45,0.92),rgba(29,20,18,0.75))",
        tree: "linear-gradient(160deg,#3c2b24,#140d0b)",
        trunk: "#27130e",
        trees: sparseTrees,
      };
    case "mountain":
      return {
        ...base,
        background: "linear-gradient(180deg,#8a918b 0%,#686a62 30%,#383b36 62%,#141614 100%)",
        mountain: "linear-gradient(145deg,rgba(142,145,137,0.94),rgba(53,56,52,0.72))",
        trees: sparseTrees,
      };
    case "water":
    case "coast":
      return {
        ...base,
        background: "linear-gradient(180deg,#7c969d 0%,#557884 32%,#264856 62%,#101923 100%)",
        horizon: "linear-gradient(180deg,rgba(56,110,127,0.54),rgba(28,73,91,0.3),transparent)",
        tree: "linear-gradient(160deg,#567a58,#173028)",
        mountains: environment.theme === "water" ? noMountains : defaultMountains.slice(0, 2),
        trees: environment.theme === "water" ? sparseTrees.slice(0, 1) : sparseTrees,
      };
    case "road":
      return {
        ...base,
        background: "linear-gradient(180deg,#69716a 0%,#6b684e 30%,#3d3929 62%,#171510 100%)",
        horizon: "linear-gradient(180deg,rgba(83,78,48,0.5),rgba(48,44,31,0.24),transparent)",
        trees: defaultTrees.slice(0, 4),
      };
    case "settlement":
    case "building":
      return {
        ...base,
        background: "linear-gradient(180deg,#6b716d 0%,#74664c 30%,#453928 62%,#15110d 100%)",
        horizon: "linear-gradient(180deg,rgba(94,72,44,0.54),rgba(56,40,25,0.28),transparent)",
        trees: sparseTrees,
      };
    case "dirt":
      return {
        ...base,
        background: "linear-gradient(180deg,#74746b 0%,#826447 30%,#493726 62%,#18120d 100%)",
        horizon: "linear-gradient(180deg,rgba(104,71,43,0.52),rgba(61,42,27,0.24),transparent)",
        tree: "linear-gradient(160deg,#647342,#202818)",
        trees: defaultTrees.slice(0, 5),
      };
    case "grass":
    default:
      return base;
  }
}

// Per-theme pools of terrain textures. The same hex always picks the same
// variant (deterministic from q/r) so the battlefield stays stable across
// re-renders but feels organic instead of a uniform color.
const BATTLE_TILE_TEXTURE_POOLS: Record<CombatEnvironment["theme"], string[]> = {
  grass: [
    "/assets/textures/terrain/grass/grass-clean.webp",
    "/assets/textures/terrain/grass/grass-dense-herb.webp",
    "/assets/textures/terrain/grass/grass-flowers.webp",
    "/assets/textures/terrain/grass/grass-herb-flowers.webp",
    "/assets/textures/terrain/grass/grass-clover-moss.webp",
  ],
  forest: [
    "/assets/textures/terrain/forest/forest-leafy-floor.webp",
    "/assets/textures/terrain/forest/forest-dead-leaves.webp",
    "/assets/textures/terrain/forest/forest-moss.webp",
    "/assets/textures/terrain/forest/forest-ferns.webp",
    "/assets/textures/terrain/forest/forest-pine-needles.webp",
    "/assets/textures/terrain/forest/forest-rare-flowers.webp",
  ],
  dirt: [
    "/assets/textures/terrain/dirt/dirt-bare.webp",
    "/assets/textures/terrain/dirt/dirt-dry.webp",
    "/assets/textures/terrain/dirt/dirt-rare-grass.webp",
    "/assets/textures/terrain/dirt/dirt-dark.webp",
    "/assets/textures/terrain/dirt/dirt-light-mud.webp",
  ],
  sand: [
    "/assets/textures/terrain/sand/sand-clean.webp",
    "/assets/textures/terrain/sand/sand-ripples.webp",
    "/assets/textures/terrain/sand/sand-shells.webp",
    "/assets/textures/terrain/sand/sand-dry.webp",
    "/assets/textures/terrain/sand/sand-packed.webp",
    "/assets/textures/terrain/sand/sand-rare-grass.webp",
  ],
  snow: [
    "/assets/textures/terrain/snow/snow-clean.webp",
    "/assets/textures/terrain/snow/snow-packed.webp",
    "/assets/textures/terrain/snow/snow-blue.webp",
    "/assets/textures/terrain/snow/snow-frozen-grass.webp",
    "/assets/textures/terrain/snow/snow-soft-tracks.webp",
  ],
  swamp: [
    "/assets/textures/terrain/swamp/swamp-green-mud.webp",
    "/assets/textures/terrain/swamp/swamp-wet-moss.webp",
    "/assets/textures/terrain/swamp/swamp-low-reeds.webp",
    "/assets/textures/terrain/swamp/swamp-marsh-grass.webp",
    "/assets/textures/terrain/swamp/swamp-dark-puddles.webp",
    "/assets/textures/terrain/swamp/swamp-roots.webp",
  ],
  mountain: [
    "/assets/textures/terrain/mountain/mountain-clean-rock.webp",
    "/assets/textures/terrain/mountain/mountain-cracked-rock.webp",
    "/assets/textures/terrain/mountain/mountain-rare-moss.webp",
    "/assets/textures/terrain/mountain/mountain-dark-rock.webp",
    "/assets/textures/terrain/mountain/mountain-light-rock.webp",
    "/assets/textures/terrain/mountain/mountain-gravel.webp",
  ],
  lava: [
    "/assets/textures/terrain/lava/lava-volcanic-rock.webp",
    "/assets/textures/terrain/lava/lava-ash.webp",
    "/assets/textures/terrain/lava/lava-hot-cracks.webp",
    "/assets/textures/terrain/lava/lava-embers.webp",
    "/assets/textures/terrain/lava/lava-black-rock.webp",
    "/assets/textures/terrain/lava/lava-dry-flow.webp",
  ],
  road: [
    "/assets/textures/terrain/dirt/dirt-ruts.webp",
    "/assets/textures/terrain/dirt/dirt-bare.webp",
    "/assets/textures/terrain/dirt/dirt-dry.webp",
    "/assets/textures/terrain/dirt/dirt-light-mud.webp",
  ],
  settlement: [
    "/assets/textures/terrain/dirt/dirt-bare.webp",
    "/assets/textures/terrain/dirt/dirt-ruts.webp",
    "/assets/textures/terrain/dirt/dirt-rare-grass.webp",
    "/assets/textures/terrain/grass/grass-clean.webp",
  ],
  building: [
    "/assets/textures/terrain/dirt/dirt-bare.webp",
    "/assets/textures/terrain/dirt/dirt-dry.webp",
    "/assets/textures/terrain/dirt/dirt-rare-grass.webp",
  ],
  water: [
    "/assets/textures/terrain/sand/sand-clean.webp",
    "/assets/textures/terrain/sand/sand-ripples.webp",
    "/assets/textures/terrain/sand/sand-shells.webp",
    "/assets/textures/terrain/sand/sand-dry.webp",
  ],
  coast: [
    "/assets/textures/terrain/sand/sand-clean.webp",
    "/assets/textures/terrain/sand/sand-ripples.webp",
    "/assets/textures/terrain/sand/sand-rare-grass.webp",
    "/assets/textures/terrain/grass/grass-clean.webp",
  ],
};

export function getBattleTileTexture(theme: CombatEnvironment["theme"], q: number, r: number): string {
  const pool = BATTLE_TILE_TEXTURE_POOLS[theme] ?? BATTLE_TILE_TEXTURE_POOLS.grass;
  const seed = Math.abs(q * 73856093 + r * 19349663);
  return pool[seed % pool.length];
}

export function getBattleTileBaseColor(theme: CombatEnvironment["theme"]) {
  switch (theme) {
    case "forest":
      return "#203327";
    case "sand":
      return "#4b3d22";
    case "snow":
      return "#485153";
    case "swamp":
      return "#2b3521";
    case "lava":
      return "#341d18";
    case "mountain":
      return "#373934";
    case "water":
    case "coast":
      return "#1e3640";
    case "road":
      return "#383327";
    case "settlement":
    case "building":
      return "#3b3024";
    case "dirt":
      return "#382b20";
    case "grass":
    default:
      return "#232b20";
  }
}

export function getTileTopColor(
  feature: CombatTerrainFeature | undefined,
  environment: CombatEnvironment,
  reachable: boolean,
  attackable: boolean,
  pendingDestination: boolean,
  pendingPath: boolean,
  active: boolean,
  inspected: boolean
) {
  if (attackable) return "#3c1e1c";
  if (inspected) return "#3d3420";
  if (active) return "#3f4648";
  if (pendingDestination) return "#5b4a20";
  if (pendingPath) return "#4a3f24";
  if (reachable) return "#26382b";
  if (feature?.type === "water") return "#213a40";
  if (feature?.type === "rock") return "#3a3934";
  if (feature?.type === "crystal") return "#313646";
  if (feature?.type === "cactus") return "#37351f";
  if (feature?.type === "reed_thicket") return "#263525";
  if (feature) return "#2f3024";
  return getBattleTileBaseColor(environment.theme);
}

export function getTileStrokeColor(
  feature: CombatTerrainFeature | undefined,
  reachable: boolean,
  attackable: boolean,
  pendingDestination: boolean,
  pendingPath: boolean,
  active: boolean,
  inspected: boolean
) {
  if (attackable) return "rgba(244,114,74,0.95)";
  if (inspected) return "rgba(251,191,36,0.95)";
  if (active) return "rgba(236,244,246,0.95)";
  if (pendingDestination) return "rgba(255,218,96,0.95)";
  if (pendingPath) return "rgba(229,169,57,0.9)";
  if (reachable) return "rgba(104,177,104,0.58)";
  if (feature?.type === "water") return "rgba(107,172,190,0.68)";
  if (feature?.type === "rock") return "rgba(146,142,128,0.62)";
  if (feature?.type === "crystal") return "rgba(154,169,216,0.62)";
  if (feature?.type === "cactus") return "rgba(163,161,79,0.58)";
  if (feature?.type === "reed_thicket") return "rgba(118,166,94,0.58)";
  if (feature) return "rgba(135,128,91,0.56)";
  return "rgba(142,148,132,0.46)";
}
