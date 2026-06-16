"use client";

import { useState } from "react";
import { resourceLabel } from "@/lib/game/economy";
import type { Locale } from "@/lib/i18n/types";

/** Build the ordered resource list of a monster loot, gold first. */
export function lootResourceEntries(loot: { gold: number; resources: Partial<Record<string, number>> }): Array<[string, number]> {
  const entries: Array<[string, number]> = [];
  if (loot.gold) entries.push(["gold", loot.gold]);
  for (const [resource, amount] of Object.entries(loot.resources)) {
    if (amount) entries.push([resource, amount]);
  }
  return entries;
}

/** Resource icon + amount, e.g. 🪙 904. Uses the shared `/assets/sprites/resources/*.webp`. */
export function ResourceSprite({ resource, amount, locale }: { resource: string; amount: number; locale: Locale }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-amber-100/90" title={resourceLabel(resource, locale)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed tiny HUD sprite from a public asset path. */}
      <img src={`/assets/sprites/resources/${resource}.webp`} alt="" className="h-5 w-5 object-contain" loading="lazy" draggable={false} />
      <span className="font-bold">{amount}</span>
    </span>
  );
}

/** Artifact sprite from `/assets/sprites/artifacts/{id}.webp`, with a ◆ fallback if missing. */
export function LootArtifactIcon({ artifactId, size = "md" }: { artifactId: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const img = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded border border-amber-700/45 bg-stone-950/70 shadow-inner shadow-black/40`}>
      {failed ? (
        <span className={`grid ${img} place-items-center text-amber-300/80`} aria-hidden="true">◆</span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- fixed tiny HUD sprite from a public asset path. */
        <img
          src={`/assets/sprites/artifacts/${artifactId}.webp`}
          alt=""
          className={`${img} object-contain [image-rendering:auto]`}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
