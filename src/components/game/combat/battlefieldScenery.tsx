"use client";

import type { CombatEnvironment, CombatTerrainFeature } from "@/lib/game/types";
import { TILE_DEPTH, TILE_HEIGHT, TILE_WIDTH } from "./combatLayout";
import { getSceneryPreset, getTileStrokeColor, getTileTopColor } from "./sceneryPresets";

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
}: {
  feature?: CombatTerrainFeature;
  environment: CombatEnvironment;
  reachable: boolean;
  attackable: boolean;
  pendingDestination: boolean;
  pendingPath: boolean;
  active: boolean;
  inspected: boolean;
}) {
  const topColor = getTileTopColor(feature, environment, reachable, attackable, pendingDestination, pendingPath, active, inspected);
  const strokeColor = getTileStrokeColor(feature, reachable, attackable, pendingDestination, pendingPath, active, inspected);

  return (
    <span className="absolute left-0 top-0 block" style={{ width: TILE_WIDTH, height: TILE_HEIGHT + TILE_DEPTH }}>
      <svg
        className="absolute left-0 top-0 overflow-visible transition duration-150"
        width={TILE_WIDTH}
        height={TILE_HEIGHT}
        viewBox="0 0 92 64"
        aria-hidden="true"
      >
        <polygon
          points="46,2 90,18 90,46 46,62 2,46 2,18"
          fill={topColor}
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
  if (feature.type === "water") {
    return (
      <span className="pointer-events-none absolute left-[18px] top-[7px] h-8 w-[50px] -skew-y-12 rounded-[50%] bg-cyan-300/20 shadow-[inset_0_0_18px_rgba(125,211,252,0.55)]">
        <span className="absolute left-2 top-3 h-px w-9 bg-cyan-100/60" />
        <span className="absolute left-6 top-5 h-px w-5 bg-cyan-100/50" />
      </span>
    );
  }

  return (
    <span className="pointer-events-none absolute left-[23px] top-[-30px] block h-20 w-12">
      <span className="absolute bottom-3 left-2 h-14 w-8 skew-x-[-10deg] bg-gradient-to-br from-stone-300 via-stone-600 to-stone-950 shadow-[8px_8px_16px_rgba(0,0,0,0.45)] [clip-path:polygon(50%_0,88%_42%,72%_100%,18%_100%,0_40%)]" />
      <span className="absolute bottom-3 left-5 h-12 w-6 skew-x-[12deg] bg-gradient-to-b from-stone-200 to-stone-700 opacity-70 [clip-path:polygon(45%_0,100%_70%,50%_100%,0_58%)]" />
    </span>
  );
}
