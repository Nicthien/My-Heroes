"use client";

import { useState } from "react";
import { Callout, Chip, GuideSection, Lead, Sprite } from "./guidePrimitives";
import {
  ARTIFACT_CLASS_COLOR,
  ARTIFACT_CLASS_LABEL,
  ARTIFACT_CLASS_ORDER,
  ARTIFACT_ROWS,
} from "./guideData";
import type { ArtifactClass } from "@/lib/game/artifacts";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { guideText } from "./guideI18n";

type Filter = "all" | ArtifactClass;

export function ArtifactsView() {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = filter === "all" ? ARTIFACT_ROWS : ARTIFACT_ROWS.filter((a) => a.cls === filter);

  return (
    <GuideSection id="artifacts" title="Artefacts" icon="💎">
      <Lead>
        Les artefacts s’équipent sur vos héros pour renforcer leurs statistiques. Ils se trouvent sur la
        carte, se gagnent en combat ou s’achètent. Leur <strong>classe</strong> (trésor → relique)
        indique leur puissance et leur rareté.
      </Lead>

      <div className="flex flex-wrap gap-2">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="Tous" />
        {ARTIFACT_CLASS_ORDER.map((cls) => (
          <FilterButton
            key={cls}
            active={filter === cls}
            onClick={() => setFilter(cls)}
            label={ARTIFACT_CLASS_LABEL[cls]}
            color={ARTIFACT_CLASS_COLOR[cls]}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((a) => (
          <div key={a.id} className="flex gap-3 rounded-lg border border-amber-800/40 bg-stone-950/50 p-3">
            <Sprite src={a.sprite} alt={a.name} size={48} fallback="💎" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="truncate text-sm font-bold text-amber-100">{a.name}</div>
              <Chip color={ARTIFACT_CLASS_COLOR[a.cls]}>{ARTIFACT_CLASS_LABEL[a.cls]}</Chip>
              {a.bonus && <div className="text-xs font-semibold text-emerald-200/85">{a.bonus}</div>}
              {a.extra && <div className="text-[11px] text-amber-100/60">{a.extra}</div>}
            </div>
          </div>
        ))}
      </div>

      <Callout kind="info" title="Emplacements d’équipement">
        Un héros possède des emplacements distincts (arme, bouclier, armure, casque, collier, bottes,
        anneaux…). Certains artefacts puissants forment des <strong>combinaisons</strong> aux effets
        renforcés lorsqu’ils sont portés ensemble.
      </Callout>
    </GuideSection>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  const { locale } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "border-amber-400/70 bg-amber-900/40 text-amber-100"
          : "border-amber-800/40 bg-stone-950/50 text-amber-200/70 hover:border-amber-500/50"
      }`}
      style={active && color ? { borderColor: color, color } : undefined}
    >
      {guideText(locale, label)}
    </button>
  );
}
