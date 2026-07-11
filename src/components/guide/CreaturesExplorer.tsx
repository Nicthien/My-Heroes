"use client";

import { useState } from "react";
import { Callout, GuideSection, Lead } from "./guidePrimitives";
import { CreatureTable } from "./CreatureTable";
import { GUIDE_FACTIONS, getFactionCreatureRows } from "./guideData";
import type { Faction } from "@/lib/game/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

/** Encyclopedia of every recruitable creature, filtered by faction. */
export function CreaturesExplorer() {
  const { locale } = useI18n();
  const [faction, setFaction] = useState<Faction>(GUIDE_FACTIONS[0].faction);
  const meta = GUIDE_FACTIONS.find((f) => f.faction === faction) ?? GUIDE_FACTIONS[0];
  const rows = getFactionCreatureRows(faction, locale);
  const metaLabel = locale === "en" ? meta.labelEn : meta.label;
  const metaTagline = locale === "en" ? meta.taglineEn : meta.tagline;

  return (
    <GuideSection id="creatures" title="Bestiaire" icon="🐉">
      <Lead>
        Toutes les créatures recrutables, faction par faction, avec leurs statistiques complètes :
        attaque, défense, dégâts, points de vie, vitesse, croissance hebdomadaire, coût et capacités
        spéciales. Chaque créature de base est suivie de sa version <em>améliorée</em>.
      </Lead>

      <div className="flex flex-wrap gap-2">
        {GUIDE_FACTIONS.map((f) => {
          const selected = f.faction === faction;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFaction(f.faction)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                selected
                  ? "border-amber-400/70 bg-amber-900/40 text-amber-100"
                  : "border-amber-800/40 bg-stone-950/50 text-amber-200/70 hover:border-amber-500/50"
              }`}
              style={selected ? { borderColor: f.color } : undefined}
            >
              <span aria-hidden="true">{f.emblem}</span> {locale === "en" ? f.labelEn : f.label}
            </button>
          );
        })}
      </div>

      <div className="text-sm text-amber-100/75" style={{ color: meta.color }}>
        {metaLabel} — {metaTagline}
      </div>

      <CreatureTable rows={rows} showTier />

      <Callout kind="tip" title="Lire les statistiques">
        <strong>Att./Déf.</strong> se comparent à celles de l’ennemi pour moduler les dégâts.{" "}
        <strong>Dégâts</strong> est la fourchette par créature et par coup. <strong>Vit.</strong> décide
        de l’ordre d’action au combat. <strong>Croiss.</strong> est le nombre produit chaque semaine.
      </Callout>
    </GuideSection>
  );
}
