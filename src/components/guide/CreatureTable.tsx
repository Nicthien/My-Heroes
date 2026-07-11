"use client";

import { GuideTable, Sprite } from "./guidePrimitives";
import type { CreatureRow } from "./guideData";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { guideText } from "./guideI18n";

/** A full-stats table for a list of creatures. Horizontally scrollable. */
export function CreatureTable({ rows, showTier = false }: { rows: CreatureRow[]; showTier?: boolean }) {
  const { locale } = useI18n();
  const headers = [
    ...(showTier ? ["Plr"] : []),
    "Créature",
    "Att.",
    "Déf.",
    "Dégâts",
    "PV",
    "Vit.",
    "Tir",
    "Croiss.",
    "Coût (or)",
    "Traits",
  ];
  const align: Array<"left" | "center" | "right"> = [
    ...(showTier ? ["center" as const] : []),
    "left",
    "center",
    "center",
    "center",
    "center",
    "center",
    "center",
    "center",
    "right",
    "left",
  ];

  return (
    <GuideTable
      headers={headers}
      align={align}
      rows={rows.map((u) => {
        const traits = [u.abilities, u.special].filter(Boolean).join(" · ");
        return [
          ...(showTier ? [<span key="t" className="font-bold text-amber-300">{u.tier}</span>] : []),
          <span key="n" className="inline-flex items-center gap-2">
            <Sprite src={u.sprite} alt={u.label} size={30} />
            <span>
              <span className="font-semibold text-amber-100">{u.label}</span>
              {u.upgraded && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-emerald-300/80">
                  {guideText(locale, "amélioré")}
                </span>
              )}
            </span>
          </span>,
          u.attack,
          u.defense,
          <span key="d" className="whitespace-nowrap">{u.minDamage}–{u.maxDamage}</span>,
          u.health,
          u.speed,
          u.ranged ? u.shots : "—",
          u.growth,
          <span key="c" className="tabular-nums">{u.goldCost.toLocaleString(locale === "en" ? "en-US" : "fr-FR")}</span>,
          <span key="tr" className="text-xs text-amber-100/75">{traits || "—"}</span>,
        ];
      })}
    />
  );
}
