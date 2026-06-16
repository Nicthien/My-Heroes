"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Chip, GuideSection, Lead, Sprite } from "./guidePrimitives";
import { SEARCH_INDEX } from "./guideData";

const KIND_COLOR: Record<string, string> = {
  Créature: "#fbbf24",
  Artefact: "#a78bfa",
  Sort: "#60a5fa",
  Compétence: "#34d399",
};

/** Accent- and case-insensitive normalisation for forgiving search. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const MAX_RESULTS = 80;

export function SearchView() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return SEARCH_INDEX.filter((e) => normalize(e.label).includes(q) || normalize(e.sub).includes(q)).slice(0, MAX_RESULTS);
  }, [query]);

  const tooShort = query.trim().length > 0 && query.trim().length < 2;

  return (
    <GuideSection id="search" title="Rechercher" icon="🔎">
      <Lead>
        Cherchez une créature, un artefact, un sort ou une compétence par son nom. Le résultat vous mène
        à la page correspondante.
      </Lead>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ex. dragon, épée, boule de feu, logistique…"
        autoFocus
        className="w-full rounded-lg border border-amber-700/50 bg-stone-950/70 px-4 py-2.5 text-amber-100 placeholder:text-amber-200/40 focus:border-amber-400 focus:outline-none"
      />

      {tooShort && <p className="text-sm text-amber-200/60">Tapez au moins 2 caractères.</p>}

      {query.trim().length >= 2 && (
        <p className="text-xs uppercase tracking-wider text-amber-400/70">
          {results.length === 0
            ? "Aucun résultat"
            : `${results.length}${results.length === MAX_RESULTS ? "+" : ""} résultat${results.length > 1 ? "s" : ""}`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {results.map((entry, index) => (
          <Link
            key={`${entry.kind}-${entry.label}-${index}`}
            href={entry.href}
            className="flex items-center gap-3 rounded-lg border border-amber-800/40 bg-stone-950/50 p-2.5 transition hover:border-amber-400/60 hover:bg-amber-950/30"
          >
            {entry.sprite ? (
              <Sprite src={entry.sprite} alt={entry.label} size={36} fallback="◆" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-amber-700/40 bg-stone-950/70 text-amber-300/70">
                {entry.kind === "Sort" ? "✨" : "🎓"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-amber-100">{entry.label}</div>
              <div className="truncate text-xs text-amber-100/60">{entry.sub}</div>
            </div>
            <Chip color={KIND_COLOR[entry.kind]}>{entry.kind}</Chip>
          </Link>
        ))}
      </div>
    </GuideSection>
  );
}
