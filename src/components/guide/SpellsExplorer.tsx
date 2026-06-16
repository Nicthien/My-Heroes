"use client";

import { useState } from "react";
import { Callout, Chip, GuideSection, GuideTable, Lead } from "./guidePrimitives";
import {
  SPELL_ROWS,
  SPELL_SCHOOL_COLOR,
  SPELL_SCHOOL_LABEL,
  SPELL_SCHOOL_ORDER,
} from "./guideData";
import type { SpellContext, SpellSchool } from "@/lib/game/spells";

type SchoolFilter = "all-schools" | SpellSchool;
type ContextFilter = "all" | SpellContext;

const KIND_COLOR: Record<string, string> = {
  Dégâts: "#fb7185",
  Amélioration: "#34d399",
  Affaiblissement: "#fbbf24",
  Utilitaire: "#a78bfa",
};

export function SpellsExplorer() {
  const [school, setSchool] = useState<SchoolFilter>("all-schools");
  const [context, setContext] = useState<ContextFilter>("all");

  const rows = SPELL_ROWS.filter(
    (s) => (school === "all-schools" || s.school === school) && (context === "all" || s.context === context),
  ).sort((a, b) => a.level - b.level || a.label.localeCompare(b.label, "fr"));

  return (
    <GuideSection id="spells" title="Grimoire" icon="✨">
      <Lead>
        Les sorts se lancent depuis le <strong>livre de sorts</strong> du héros, contre des points de{" "}
        <strong>mana</strong>. Ils appartiennent à quatre écoles (Air, Terre, Feu, Eau) et vont du
        niveau 1 au niveau 5. Maîtriser l’école correspondante et la <strong>Sagesse</strong> en
        renforce les effets.
      </Lead>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400/70">École :</span>
          <FilterButton active={school === "all-schools"} onClick={() => setSchool("all-schools")} label="Toutes les écoles" />
          {SPELL_SCHOOL_ORDER.map((s) => (
            <FilterButton
              key={s}
              active={school === s}
              onClick={() => setSchool(s)}
              label={SPELL_SCHOOL_LABEL[s]}
              color={SPELL_SCHOOL_COLOR[s]}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400/70">Contexte :</span>
          <FilterButton active={context === "all"} onClick={() => setContext("all")} label="Tous" />
          <FilterButton active={context === "combat"} onClick={() => setContext("combat")} label="Combat" />
          <FilterButton active={context === "adventure"} onClick={() => setContext("adventure")} label="Aventure" />
        </div>
      </div>

      <GuideTable
        headers={["Sort", "École", "Niv.", "Type", "Mana", "Effet", "Dégâts"]}
        align={["left", "center", "center", "center", "center", "left", "left"]}
        rows={rows.map((s) => [
          <span key="n" className="font-semibold text-amber-100">{s.label}</span>,
          <Chip key="sc" color={s.schoolColor}>{s.schoolLabel}</Chip>,
          <span key="lv" className="font-bold text-amber-300">{s.level}</span>,
          <Chip key="k" color={KIND_COLOR[s.kindLabel]}>{s.kindLabel}</Chip>,
          <span key="m" className="whitespace-nowrap tabular-nums text-amber-100/85">{s.costStandard}/{s.costExpert}</span>,
          <span key="e" className="text-sm text-amber-100/80">{s.effect}</span>,
          <span key="d" className="whitespace-nowrap text-xs text-rose-200/80">{s.damage ?? "—"}</span>,
        ])}
      />

      <Callout kind="info" title="Lire le tableau">
        <strong>Mana</strong> indique le coût normal / le coût à un niveau de maîtrise expert de l’école.
        La colonne <strong>Dégâts</strong> donne les valeurs de base aux paliers Base / Avancé / Expert,
        auxquelles s’ajoute un bonus proportionnel au <strong>Pouvoir magique</strong> du héros.
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
      {label}
    </button>
  );
}
