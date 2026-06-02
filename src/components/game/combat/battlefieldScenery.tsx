"use client";

import Image from "next/image";
import type { CombatEnvironment, CombatTerrainFeature } from "@/lib/game/types";
import { TILE_DEPTH, TILE_HEIGHT, TILE_WIDTH } from "./combatLayout";
import { getBattleTileTexture, getSceneryPreset, getTileStrokeColor, getTileTopColor } from "./sceneryPresets";

const HEX_CLIP_PATH =
  "polygon(50% 3.125%, 97.83% 28.125%, 97.83% 71.875%, 50% 96.875%, 2.17% 71.875%, 2.17% 28.125%)";

const WATER_TILE_VARIANTS = 6;
type TerrainFeatureModel = {
  src: string;
  width: number;
  height: number;
  top: number;
  shadow: string;
};

const TERRAIN_FEATURE_MODELS: Record<CombatTerrainFeature["type"], TerrainFeatureModel> = {
  rock: {
    src: "/assets/sprites/map/boulder-cluster.webp",
    width: 88,
    height: 88,
    top: -22,
    shadow: "drop-shadow-[5px_8px_8px_rgba(0,0,0,0.55)]",
  },
  water: {
    src: "",
    width: 74,
    height: 40,
    top: 14,
    shadow: "",
  },
  bramble: {
    src: "/assets/sprites/map/grass-bramble-mound.webp",
    width: 96,
    height: 88,
    top: -18,
    shadow: "drop-shadow-[5px_9px_7px_rgba(0,0,0,0.48)]",
  },
  fallen_log: {
    src: "/assets/sprites/map/fallen-log-barricade.webp",
    width: 104,
    height: 86,
    top: -16,
    shadow: "drop-shadow-[5px_9px_7px_rgba(0,0,0,0.5)]",
  },
  deadwood: {
    src: "/assets/sprites/map/deadwood-thicket.webp",
    width: 96,
    height: 98,
    top: -28,
    shadow: "drop-shadow-[5px_10px_8px_rgba(0,0,0,0.52)]",
  },
  root_snarl: {
    src: "/assets/sprites/map/dirt-root-snarl.webp",
    width: 98,
    height: 88,
    top: -18,
    shadow: "drop-shadow-[5px_9px_7px_rgba(0,0,0,0.5)]",
  },
  cactus: {
    src: "/assets/sprites/map/sand-cactus-cluster.webp",
    width: 92,
    height: 94,
    top: -26,
    shadow: "drop-shadow-[5px_10px_8px_rgba(0,0,0,0.5)]",
  },
  crystal: {
    src: "/assets/sprites/map/underground-crystal-ribs.webp",
    width: 100,
    height: 98,
    top: -28,
    shadow: "drop-shadow-[5px_10px_8px_rgba(0,0,0,0.52)]",
  },
  reed_thicket: {
    src: "/assets/sprites/map/swamp-reed-thicket.webp",
    width: 94,
    height: 92,
    top: -22,
    shadow: "drop-shadow-[5px_9px_7px_rgba(0,0,0,0.48)]",
  },
  // Spell-created obstacles reuse existing sprites until dedicated art exists.
  quicksand: {
    src: "/assets/sprites/map/swamp-reed-thicket.webp",
    width: 94,
    height: 92,
    top: -22,
    shadow: "drop-shadow-[5px_9px_7px_rgba(0,0,0,0.48)]",
  },
  force_field: {
    src: "/assets/sprites/map/underground-crystal-ribs.webp",
    width: 100,
    height: 98,
    top: -28,
    shadow: "drop-shadow-[5px_10px_8px_rgba(0,0,0,0.52)]",
  },
};

const NAVAL_BLOCKER_MODELS: TerrainFeatureModel[] = [
  {
    src: "/assets/sprites/combat/naval-cargo-crates.webp",
    width: 108,
    height: 88,
    top: -16,
    shadow: "drop-shadow-[5px_9px_7px_rgba(0,0,0,0.5)]",
  },
  {
    src: "/assets/sprites/combat/naval-rope-anchor.webp",
    width: 112,
    height: 72,
    top: -8,
    shadow: "drop-shadow-[5px_8px_7px_rgba(0,0,0,0.48)]",
  },
  {
    src: "/assets/sprites/combat/naval-broken-spars.webp",
    width: 116,
    height: 82,
    top: -12,
    shadow: "drop-shadow-[5px_9px_7px_rgba(0,0,0,0.5)]",
  },
];

const SNOW_TERRAIN_FEATURE_MODELS: Partial<typeof TERRAIN_FEATURE_MODELS> = {
  bramble: {
    ...TERRAIN_FEATURE_MODELS.bramble,
    src: "/assets/sprites/map/snow-bramble-mound.webp",
  },
  fallen_log: {
    ...TERRAIN_FEATURE_MODELS.fallen_log,
    src: "/assets/sprites/map/snow-deadwood-barrier.webp",
    height: 96,
    top: -26,
  },
  deadwood: {
    ...TERRAIN_FEATURE_MODELS.deadwood,
    src: "/assets/sprites/map/snow-deadwood-barrier.webp",
  },
  root_snarl: {
    ...TERRAIN_FEATURE_MODELS.root_snarl,
    src: "/assets/sprites/map/snow-shrub-wall.webp",
    height: 94,
    top: -24,
  },
  reed_thicket: {
    ...TERRAIN_FEATURE_MODELS.reed_thicket,
    src: "/assets/sprites/map/snow-shrub-wall.webp",
  },
};

function getTerrainFeatureModel(feature: CombatTerrainFeature, environment: CombatEnvironment, seed: number) {
  if (environment.theme === "water" && feature.type !== "water") {
    return NAVAL_BLOCKER_MODELS[seed % NAVAL_BLOCKER_MODELS.length];
  }
  if (environment.theme === "snow") {
    return SNOW_TERRAIN_FEATURE_MODELS[feature.type] ?? TERRAIN_FEATURE_MODELS[feature.type] ?? TERRAIN_FEATURE_MODELS.rock;
  }
  return TERRAIN_FEATURE_MODELS[feature.type] ?? TERRAIN_FEATURE_MODELS.rock;
}

// Naval combats are fought on a ship's deck. The deck floor itself is the
// wooden plank tile texture (see sceneryPresets); this backdrop adds the rest
// of the vessel — mast, sail, rigging and the hull bulwark — framing the deck
// with open sea beyond. Rendered behind the hex grid, like all other scenery.
function ShipDeckScenery() {
  return (
    <>
      {/* A distant sail far out at sea, on the horizon. */}
      <span className="absolute left-[14%] top-[15%] h-12 w-9 opacity-60 [clip-path:polygon(50%_0,100%_100%,0_100%)] bg-[linear-gradient(160deg,rgba(228,238,242,0.82),rgba(120,150,162,0.6))]" />
      {/* Rigging lines fanning from the masthead to the gunwale corners. */}
      <span className="absolute left-1/2 top-[8%] h-[58%] w-[44%] origin-top -translate-x-1/2 skew-x-[26deg] border-l border-[rgba(20,12,6,0.45)]" />
      <span className="absolute left-1/2 top-[8%] h-[58%] w-[44%] origin-top -translate-x-1/2 -skew-x-[26deg] border-r border-[rgba(20,12,6,0.45)]" />
      {/* Mast rising behind the deck. */}
      <span className="absolute left-1/2 top-[5%] h-44 w-3 -translate-x-1/2 rounded bg-[linear-gradient(90deg,#7a5230,#3c2614,#2a1a0d)] shadow-[0_0_12px_rgba(0,0,0,0.45)]" />
      {/* Yard (horizontal spar) + the billowing sail hung from it. */}
      <span className="absolute left-1/2 top-[13%] h-2 w-48 -translate-x-1/2 rounded bg-[linear-gradient(180deg,#7a5230,#2a1a0d)]" />
      <span className="absolute left-1/2 top-[14%] h-20 w-36 -translate-x-1/2 rounded-b-[45%] bg-[linear-gradient(180deg,rgba(232,221,191,0.94),rgba(196,180,142,0.86)_60%,rgba(150,134,98,0.8))] shadow-[0_10px_18px_rgba(0,0,0,0.3)]" />
      {/* Soft seams across the canvas sail. */}
      <span className="absolute left-1/2 top-[14%] h-20 w-36 -translate-x-1/2 rounded-b-[45%] [background:repeating-linear-gradient(90deg,transparent_0,transparent_16px,rgba(90,70,40,0.25)_17px,transparent_18px)]" />
      {/* Hull bulwark: a capped wooden rail along the stern (bottom) and the two
          gunwale strakes running up the port/starboard edges of the deck. */}
      <span className="absolute bottom-0 left-0 right-0 h-12 bg-[linear-gradient(180deg,#6b4527,#3a2412)] shadow-[inset_0_3px_0_rgba(255,255,255,0.1),0_-6px_14px_rgba(0,0,0,0.3)]" />
      <span className="absolute bottom-10 left-0 right-0 h-2 bg-[linear-gradient(180deg,#8a5e36,#5a3a20)]" />
      <span className="absolute bottom-0 left-0 top-[30%] w-12 bg-[linear-gradient(90deg,#5a3a20,rgba(58,36,18,0))]" />
      <span className="absolute bottom-0 right-0 top-[30%] w-12 bg-[linear-gradient(270deg,#5a3a20,rgba(58,36,18,0))]" />
    </>
  );
}

export function BattlefieldScenery({ environment }: { environment: CombatEnvironment }) {
  const preset = getSceneryPreset(environment);
  const trees = preset.trees;
  const mountains = preset.mountains;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: preset.background }}>
      <div className="absolute inset-x-0 top-0 h-52" style={{ background: preset.sky }} />
      <span className="absolute left-0 right-0 top-24 h-36" style={{ background: preset.horizon }} />
      {mountains.map((mountain, index) => (
        <span
          key={index}
          className="absolute top-2 blur-[0.2px] [clip-path:polygon(50%_0,100%_100%,0_100%)]"
          style={{ left: `${mountain.left}%`, width: mountain.width, height: mountain.height, background: preset.mountain }}
        />
      ))}
      {trees.map((tree, index) => (
        <span
          key={index}
          className="absolute h-36 w-24 origin-bottom"
          style={{ left: `${tree.left}%`, top: `${tree.top}%`, transform: `scale(${tree.scale})` }}
        >
          <span className="absolute bottom-0 left-1/2 h-16 w-3 -translate-x-1/2" style={{ background: preset.trunk }} />
          <span
            className="absolute bottom-8 left-1/2 h-24 w-20 -translate-x-1/2 opacity-90 [clip-path:polygon(50%_0,90%_42%,72%_42%,100%_82%,64%_78%,50%_100%,36%_78%,0_82%,28%_42%,10%_42%)]"
            style={{ background: preset.tree }}
          />
        </span>
      ))}
      {(environment.road || environment.theme === "road") && (
        <span className="absolute bottom-[10%] left-1/2 h-28 w-[62rem] -translate-x-1/2 skew-x-[-18deg] rounded-[50%] bg-stone-700/45 shadow-[inset_0_0_22px_rgba(250,204,21,0.12)]" />
      )}
      {environment.theme === "coast" && (
        <span className="absolute bottom-[13%] left-[8%] h-28 w-[34rem] -skew-x-12 rounded-[50%] bg-cyan-300/18 shadow-[inset_0_0_34px_rgba(125,211,252,0.34)]" />
      )}
      {environment.theme === "water" && <ShipDeckScenery />}
      {(environment.theme === "settlement" || environment.theme === "building") && (
        <span className="absolute right-[8%] top-[18%] h-36 w-44 bg-[linear-gradient(145deg,rgba(120,91,54,0.78),rgba(39,25,13,0.58))] shadow-[0_18px_32px_rgba(0,0,0,0.28)] [clip-path:polygon(12%_100%,12%_42%,28%_42%,28%_22%,50%_4%,72%_22%,72%_42%,88%_42%,88%_100%)]" />
      )}
      {environment.theme === "lava" && (
        <span className="absolute bottom-[16%] right-[12%] h-24 w-[28rem] -skew-x-12 rounded-[50%] bg-orange-500/22 shadow-[0_0_42px_rgba(249,115,22,0.35),inset_0_0_22px_rgba(254,240,138,0.35)]" />
      )}
      <span className="absolute bottom-0 left-0 h-32 w-56" style={{ background: preset.leftVignette }} />
      <span className="absolute bottom-0 right-0 h-36 w-64" style={{ background: preset.rightVignette }} />
    </div>
  );
}

export function IsoTile({
  feature,
  environment,
  reachable,
  attackable,
  pendingDestination,
  pendingPath,
  active,
  inspected,
  q,
  r,
}: {
  feature?: CombatTerrainFeature;
  environment: CombatEnvironment;
  reachable: boolean;
  attackable: boolean;
  pendingDestination: boolean;
  pendingPath: boolean;
  active: boolean;
  inspected: boolean;
  q: number;
  r: number;
}) {
  const tintColor = getTileTopColor(feature, environment, reachable, attackable, pendingDestination, pendingPath, active, inspected);
  const strokeColor = getTileStrokeColor(feature, reachable, attackable, pendingDestination, pendingPath, active, inspected);
  const texture = getBattleTileTexture(environment.theme, q, r);
  // Tile overlay tint strength: stronger when the tile expresses a state
  // (active/attackable/pending/etc.), faint by default so the underlying
  // terrain texture stays visible.
  const tintOpacity = attackable || active || inspected || pendingDestination
    ? 0.55
    : pendingPath || reachable
      ? 0.4
      : feature
        ? 0.4
        : 0.22;

  return (
    <span className="absolute left-0 top-0 block" style={{ width: TILE_WIDTH, height: TILE_HEIGHT + TILE_DEPTH }}>
      <span
        className="absolute left-0 top-0 block"
        style={{
          width: TILE_WIDTH,
          height: TILE_HEIGHT,
          clipPath: HEX_CLIP_PATH,
          WebkitClipPath: HEX_CLIP_PATH,
          backgroundImage: `url("${texture}")`,
          backgroundSize: "120px 120px",
          backgroundPosition: "center",
        }}
        aria-hidden="true"
      >
        <span
          className="absolute inset-0 block"
          style={{ background: tintColor, opacity: tintOpacity, mixBlendMode: "multiply" }}
        />
      </span>
      <svg
        className="absolute left-0 top-0 overflow-visible transition duration-150"
        width={TILE_WIDTH}
        height={TILE_HEIGHT}
        viewBox="0 0 92 64"
        aria-hidden="true"
      >
        <polygon
          points="46,2 90,18 90,46 46,62 2,46 2,18"
          fill="none"
          stroke="rgba(0,0,0,0.62)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <polygon
          points="46,2 90,18 90,46 46,62 2,46 2,18"
          fill="none"
          stroke={strokeColor}
          strokeWidth={active || attackable || pendingDestination || inspected ? 2.4 : reachable || pendingPath ? 2 : 1.15}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {(reachable || pendingPath || pendingDestination) && (
          <polygon
            points="46,8 82,22 82,42 46,56 10,42 10,22"
            fill={pendingDestination || pendingPath ? "rgba(229,169,57,0.16)" : "rgba(113,174,104,0.06)"}
            stroke={pendingDestination || pendingPath ? "rgba(229,169,57,0.82)" : "rgba(121,184,112,0.36)"}
            strokeWidth={pendingDestination || pendingPath ? 1.55 : 1}
            strokeLinejoin="round"
          />
        )}
        <polygon
          points="46,8 82,22 82,42 46,56 10,42 10,22"
          fill="none"
          stroke="rgba(255,255,255,0.055)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function TerrainModel({ feature, environment }: { feature: CombatTerrainFeature; environment: CombatEnvironment }) {
  // Deterministic per-tile variation so the same feature always picks the
  // same variant (no flicker on re-render).
  const seed = Math.abs(feature.q * 73856093 + feature.r * 19349663);

  if (feature.type === "water") {
    const variant = seed % WATER_TILE_VARIANTS;
    return (
      <span className="pointer-events-none absolute left-1/2 top-[14px] block h-[40px] w-[74px] -translate-x-1/2 overflow-hidden rounded-[50%] shadow-[inset_0_0_16px_rgba(0,0,0,0.6),0_2px_6px_rgba(0,0,0,0.35)]">
        <Image
          src={`/assets/sprites/map/water/water-tile-${variant}.webp`}
          alt=""
          fill
          sizes="74px"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)]" />
      </span>
    );
  }

  // Deterministic per-feature variation so clusters don't all look identical
  // when several blockers sit nearby.
  const model = getTerrainFeatureModel(feature, environment, seed);
  const scale = 0.9 + ((seed >> 3) % 6) * 0.04;
  const nudgeX = (((seed >> 5) % 5) - 2) * 3;
  const flip = ((seed >> 7) & 1) === 1 ? -1 : 1;
  const rotate = (((seed >> 9) % 7) - 3) * 4;
  return (
    <span
      className="pointer-events-none absolute left-1/2 block"
      style={{
        top: model.top,
        width: model.width,
        height: model.height,
        transform: `translate(calc(-50% + ${nudgeX}px), 0) scale(${scale * flip}, ${scale}) rotate(${rotate}deg)`,
      }}
    >
      <Image
        src={model.src}
        alt=""
        fill
        unoptimized
        sizes={`${model.width}px`}
        className={`absolute inset-0 h-full w-full object-contain ${model.shadow}`}
        draggable={false}
      />
    </span>
  );
}

export function SiegeMoatModel() {
  return (
    <span className="pointer-events-none absolute left-0 top-0 block h-[64px] w-[92px]">
      <Image
        src="/assets/sprites/siege/moat-castle.webp"
        alt=""
        fill
        unoptimized
        sizes="92px"
        className="absolute inset-0 h-full w-full object-contain drop-shadow-[2px_4px_4px_rgba(0,0,0,0.38)]"
        draggable={false}
      />
    </span>
  );
}
