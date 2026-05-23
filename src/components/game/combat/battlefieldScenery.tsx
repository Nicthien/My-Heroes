"use client";

import Image from "next/image";
import type { CombatEnvironment, CombatTerrainFeature } from "@/lib/game/types";
import { TILE_DEPTH, TILE_HEIGHT, TILE_WIDTH } from "./combatLayout";
import { getBattleTileTexture, getSceneryPreset, getTileStrokeColor, getTileTopColor } from "./sceneryPresets";

const HEX_CLIP_PATH =
  "polygon(50% 3.125%, 97.83% 28.125%, 97.83% 71.875%, 50% 96.875%, 2.17% 71.875%, 2.17% 28.125%)";

const WATER_TILE_VARIANTS = 6;

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
      {environment.theme === "road" && (
        <span className="absolute bottom-[10%] left-1/2 h-28 w-[62rem] -translate-x-1/2 skew-x-[-18deg] rounded-[50%] bg-stone-700/45 shadow-[inset_0_0_22px_rgba(250,204,21,0.12)]" />
      )}
      {(environment.theme === "coast" || environment.theme === "water") && (
        <span className="absolute bottom-[13%] left-[8%] h-28 w-[34rem] -skew-x-12 rounded-[50%] bg-cyan-300/18 shadow-[inset_0_0_34px_rgba(125,211,252,0.34)]" />
      )}
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

export function TerrainModel({ feature }: { feature: CombatTerrainFeature }) {
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

  // Rock variant: vary scale, horizontal nudge and a slight mirror so clusters
  // don't all look identical when several rocks sit nearby.
  const scale = 0.9 + ((seed >> 3) % 6) * 0.04;
  const nudgeX = (((seed >> 5) % 5) - 2) * 3;
  const flip = ((seed >> 7) & 1) === 1 ? -1 : 1;
  const rotate = (((seed >> 9) % 7) - 3) * 4;
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-[-22px] block h-[88px] w-[88px]"
      style={{
        transform: `translate(calc(-50% + ${nudgeX}px), 0) scale(${scale * flip}, ${scale}) rotate(${rotate}deg)`,
      }}
    >
      <Image
        src="/assets/sprites/map/boulder-cluster.webp"
        alt=""
        fill
        sizes="88px"
        className="absolute inset-0 h-full w-full object-contain drop-shadow-[5px_8px_8px_rgba(0,0,0,0.55)]"
        draggable={false}
      />
    </span>
  );
}
