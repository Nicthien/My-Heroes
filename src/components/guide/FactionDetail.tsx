"use client";

import Link from "next/link";
import { Callout, Chip, CostInline, GuideSection, GuideTable, Lead, Sprite, SubBlock } from "./guidePrimitives";
import { CreatureTable } from "./CreatureTable";
import {
  ALIGNMENT_LABEL,
  BUILDING_CATEGORY_LABEL,
  GUIDE_FACTIONS,
  getFactionBuildingRows,
  getFactionClasses,
  getFactionCreatureRows,
  getFactionHeroes,
  type FactionBuildingRow,
} from "./guideData";
import type { Faction } from "@/lib/game/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { guideText } from "./guideI18n";

const ALIGNMENT_COLOR: Record<string, string> = {
  good: "#38bdf8",
  evil: "#fb7185",
  barbarian: "#fb923c",
};

const CATEGORY_ORDER: FactionBuildingRow["category"][] = [
  "common",
  "mage_guild",
  "dwelling",
  "dwelling_upgrade",
  "unique",
];

export function FactionDetail({ faction }: { faction: Faction }) {
  const { locale } = useI18n();
  const meta = GUIDE_FACTIONS.find((f) => f.faction === faction);
  if (!meta) return null;

  const metaLabel = locale === "en" ? meta.labelEn : meta.label;
  const metaDesc = locale === "en" ? meta.descEn : meta.desc;
  const creatures = getFactionCreatureRows(faction, locale);
  const buildings = getFactionBuildingRows(faction);
  const heroes = getFactionHeroes(faction);
  const classes = getFactionClasses(faction);

  return (
    <>
      <div className="flex items-center justify-between">
        <Link href="/guide/factions" className="text-xs font-bold uppercase tracking-wider text-amber-300/80 hover:text-amber-200">
          {guideText(locale, "← Toutes les factions")}
        </Link>
      </div>

      <GuideSection id="faction" title={metaLabel} icon={meta.emblem}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Sprite src={meta.townSprite} alt={metaLabel} size={96} />
          <div className="space-y-2">
            <Chip color={ALIGNMENT_COLOR[meta.alignment]}>{guideText(locale, ALIGNMENT_LABEL[meta.alignment])}</Chip>
            <Lead>{metaDesc}</Lead>
          </div>
        </div>
      </GuideSection>

      <GuideSection id="faction-creatures" title="Créatures" icon="🐉">
        <Lead>
          {locale === "en"
            ? `${metaLabel}'s 7 tiers, each with its base version and upgraded version.`
            : `Les 7 paliers de ${metaLabel}, chacun avec sa version de base et sa version améliorée.`}
        </Lead>
        <CreatureTable rows={creatures} showTier />
      </GuideSection>

      <GuideSection id="faction-buildings" title="Bâtiments de la ville" icon="🏰">
        <Lead>
          {locale === "en"
            ? `Every building available in a ${metaLabel} town: town center, fortifications, mage guild, dwellings, and unique buildings.`
            : `Tous les bâtiments constructibles dans une ville ${metaLabel} : centre-ville, fortifications, guilde des mages, habitats et bâtiments uniques.`}
        </Lead>
        {CATEGORY_ORDER.map((category) => {
          const rows = buildings.filter((b) => b.category === category);
          if (rows.length === 0) return null;
          return (
            <SubBlock key={category} title={BUILDING_CATEGORY_LABEL[category]}>
              <GuideTable
                headers={["Bâtiment", "Coût", "Effet"]}
                rows={rows.map((b) => [
                  <span key="l" className="inline-flex items-center gap-2">
                    <Sprite src={b.sprite ?? ""} alt={b.label} size={30} fallback="🏛️" />
                    <span className="font-semibold text-amber-100">{b.label}</span>
                  </span>,
                  <CostInline key="c" cost={b.cost} />,
                  <span key="d" className="text-sm text-amber-100/80">{b.description}</span>,
                ])}
              />
            </SubBlock>
          );
        })}
      </GuideSection>

      <GuideSection id="faction-heroes" title="Héros" icon="🦸">
        <Lead>
          {locale === "en"
            ? `${metaLabel} recruits two hero classes. Their starting stats reflect their style.`
            : `${metaLabel} recrute deux classes de héros. Leurs statistiques de départ reflètent leur style.`}
        </Lead>
        <div className="flex flex-wrap gap-3">
          {classes.map((c) => (
            <div key={c.className} className="rounded-lg border border-amber-700/40 bg-stone-950/40 px-3 py-2">
              <div className="text-sm font-black text-amber-200">{c.className}</div>
              <div className="text-xs text-amber-100/75">
              {guideText(locale, "Att")} {c.stats.attack} · {guideText(locale, "Déf")} {c.stats.defense} ·{" "}
              {guideText(locale, "Pouv")} {c.stats.spellPower} · {guideText(locale, "Conn")} {c.stats.knowledge}
              </div>
            </div>
          ))}
        </div>

        {heroes.length > 0 && (
          <GuideTable
            headers={["Héros", "Classe", "Spécialité"]}
            rows={heroes.map((h) => [
              <span key="n" className="font-semibold text-amber-100">{h.name}</span>,
              h.className,
              <span key="s" className="text-sm text-amber-100/80">{h.specialty}</span>,
            ])}
          />
        )}

        <Callout kind="info" title="Les héros se recrutent à la taverne">
          Chaque semaine, la taverne propose de nouveaux héros à recruter contre de l’or. Leur classe
          détermine leurs forces ; leur spécialité offre un bonus thématique.
        </Callout>
      </GuideSection>
    </>
  );
}
