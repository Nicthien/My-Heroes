"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RmgMapPreview, OBJECT_COLOR, TERRAIN_COLOR } from "@/components/game/map/RmgMapPreview";
import { generateMap } from "@/lib/game/engine";
import { listTemplatesForPlayers } from "@/lib/game/engine/template";
import { GameMap, TerrainType } from "@/lib/game/types";

const MAP_SIZES = {
  S: 36,
  M: 72,
  L: 108,
  XL: 144,
} as const;

type SizeKey = keyof typeof MAP_SIZES;
const SIZE_KEYS = Object.keys(MAP_SIZES) as SizeKey[];
const DEFAULT_SEED = "RMGDEMO1";

export default function RmgPreviewPage() {
  return (
    <Suspense fallback={<RmgPreviewShell />}>
      <RmgPreviewContent />
    </Suspense>
  );
}

function RmgPreviewContent() {
  const searchParams = useSearchParams();
  const [seed, setSeed] = useState(() => initialSeed(searchParams));
  const [size, setSize] = useState<SizeKey>(() => initialSize(searchParams));
  const [playerCount, setPlayerCount] = useState(() => initialPlayerCount(searchParams));
  const templates = useMemo(() => listTemplatesForPlayers(playerCount), [playerCount]);
  const [templateId, setTemplateId] = useState<string>(() => initialTemplateId(searchParams));
  const selectedTemplateId = templateId !== "auto" && templates.some((template) => template.id === templateId)
    ? templateId
    : "auto";

  const map = useMemo(
    () =>
      generateMap({
        width: MAP_SIZES[size],
        height: MAP_SIZES[size],
        seed,
        playerCount,
        templateId: selectedTemplateId === "auto" ? undefined : selectedTemplateId,
      }),
    [playerCount, seed, selectedTemplateId, size],
  );

  const stats = useMemo(() => summarizeMap(map), [map]);

  return (
    <main className="h-screen overflow-hidden bg-stone-950 text-stone-100">
      <div className="mx-auto flex h-full max-w-[1500px] flex-col gap-4 px-4 py-4">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Apercu RMG</h1>
            <p className="text-sm text-stone-400">Seed {map.seed} · Template {map.templateId}</p>
          </div>
          <button
            type="button"
            onClick={() => setSeed(randomSeed())}
            className="h-9 rounded border border-amber-500/60 bg-amber-500/15 px-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/25"
          >
            Nouvelle seed
          </button>
        </header>

        <section className="grid gap-3 border-b border-stone-800 pb-4 lg:grid-cols-[1fr_auto_auto_auto]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-stone-400">Seed</span>
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value.toUpperCase())}
              className="h-9 rounded border border-stone-700 bg-stone-900 px-3 font-mono text-sm outline-none focus:border-amber-400"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-stone-400">Taille</span>
            <select
              value={size}
              onChange={(event) => setSize(event.target.value as SizeKey)}
              className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
            >
              {Object.entries(MAP_SIZES).map(([key, value]) => (
                <option key={key} value={key}>
                  {key} · {value}x{value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-stone-400">Joueurs</span>
            <select
              value={playerCount}
              onChange={(event) => setPlayerCount(Number(event.target.value))}
              className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
            >
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-stone-400">Template</span>
            <select
              value={selectedTemplateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
            >
              <option value="auto">auto</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.id}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <RmgMapPreview map={map} minSize={420} maxSize={1120} cellScale={8} />

          <aside className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1 text-sm">
            <Legend />
            <StatBlock title="Terrain" values={stats.terrain} total={map.width * map.height} />
            <StatBlock title="Objets" values={stats.objects} total={stats.objectTotal} />
            <StatBlock title="Details" values={stats.details} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function RmgPreviewShell() {
  return (
    <main className="h-screen overflow-hidden bg-stone-950 text-stone-100">
      <div className="mx-auto flex h-full max-w-[1500px] items-center justify-center px-4 py-4">
        <div className="text-sm font-semibold uppercase tracking-wider text-stone-400">Chargement de l apercu...</div>
      </div>
    </main>
  );
}

function Legend() {
  const terrainItems = [
    ["Eau", TERRAIN_COLOR.water],
    ["Plage", TERRAIN_COLOR.sand],
    ["Prairie", TERRAIN_COLOR.grass],
    ["Foret", TERRAIN_COLOR.forest],
    ["Montagne", TERRAIN_COLOR.mountain],
    ["Marais", TERRAIN_COLOR.swamp],
    ["Pont", "#8b5a2b"],
  ];

  const objectItems = [
    ["Ville", OBJECT_COLOR.town],
    ["Mine", OBJECT_COLOR.building],
    ["Monstre", OBJECT_COLOR.monster],
    ["Ressource", OBJECT_COLOR.resource],
    ["Mur", OBJECT_COLOR.wall],
  ];

  return (
    <div className="border border-stone-800 bg-stone-900/80 p-3">
      <h2 className="mb-2 text-sm font-semibold text-amber-100">Legende</h2>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-1.5">
          {terrainItems.map(([label, color]) => (
            <LegendItem key={label} label={label} color={color} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 border-t border-stone-800 pt-2">
          {objectItems.map(([label, color]) => (
            <LegendItem key={label} label={label} color={color} round />
          ))}
        </div>
      </div>
    </div>
  );
}

function LegendItem({ label, color, round = false }: { label: string; color: string; round?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-stone-300">
      <span
        className={round ? "h-3 w-3 shrink-0 rounded-full" : "h-3 w-3 shrink-0 rounded-sm"}
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{label}</span>
    </div>
  );
}

function StatBlock({
  title,
  values,
  total,
}: {
  title: string;
  values: Record<string, number>;
  total?: number;
}) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  return (
    <div className="border border-stone-800 bg-stone-900/80 p-3">
      <h2 className="mb-2 text-sm font-semibold text-amber-100">{title}</h2>
      <div className="grid gap-1.5">
        {entries.map(([key, value]) => {
          const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
          return (
            <div key={key} className="grid grid-cols-[1fr_auto] gap-3 text-xs">
              <span className="truncate text-stone-300">{key}</span>
              <span className="font-mono text-stone-100">{pct === null ? value : `${value} · ${pct}%`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function summarizeMap(map: GameMap) {
  const terrain: Record<string, number> = {};
  const objects: Record<string, number> = {};
  let objectTotal = 0;
  let roads = 0;
  let bridges = 0;
  let decor = 0;
  let blockingDecor = 0;
  let towns = 0;
  let neutralTowns = 0;

  for (const row of map.tiles) {
    for (const tile of row) {
      terrain[tile.terrain] = (terrain[tile.terrain] ?? 0) + 1;
      if (tile.road) {
        roads++;
        if (tile.terrain === TerrainType.WATER) bridges++;
      }
      if (tile.decor) {
        decor++;
        if (tile.decor.blocking) blockingDecor++;
      }
      if (tile.object) {
        objectTotal++;
        objects[tile.object.type] = (objects[tile.object.type] ?? 0) + 1;
        if (tile.object.type === "town") {
          towns++;
          if (tile.object.subtype === "neutral") neutralTowns++;
        }
      }
    }
  }

  return {
    terrain,
    objects,
    objectTotal,
    details: {
      zones: map.zones?.length ?? 0,
      roads,
      bridges,
      decor,
      blockingDecor,
      towns,
      neutralTowns,
    },
  };
}

function randomSeed() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < 8; i++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function searchParam(params: Pick<URLSearchParams, "get">, name: string) {
  return params.get(name);
}

function initialSeed(params: Pick<URLSearchParams, "get">) {
  return searchParam(params, "seed")?.toUpperCase() || DEFAULT_SEED;
}

function initialSize(params: Pick<URLSearchParams, "get">): SizeKey {
  const value = searchParam(params, "size");
  return value && SIZE_KEYS.includes(value as SizeKey) ? (value as SizeKey) : "M";
}

function initialPlayerCount(params: Pick<URLSearchParams, "get">) {
  const value = Number(searchParam(params, "players"));
  return Number.isInteger(value) && value >= 2 && value <= 6 ? value : 4;
}

function initialTemplateId(params: Pick<URLSearchParams, "get">) {
  return searchParam(params, "template") || "auto";
}
