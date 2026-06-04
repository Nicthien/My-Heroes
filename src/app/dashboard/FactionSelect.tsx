"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { goldText } from "@/components/game/hud/theme";
import { ALIGNMENT_GROUPS, FACTION_META, getFactionShowcase } from "./factionMeta";
import { PLAYABLE_FACTIONS, normalizePlayableFaction } from "@/lib/game/playable-factions";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { pickLocale } from "@/lib/i18n/localized";
import { localizedUnitLabel } from "@/lib/i18n/gameLabels";
import { localizedSpecialty } from "@/lib/game/heroes-i18n";

const PIXELATED: React.CSSProperties = { imageRendering: "pixelated" };
const PLAYABLE_FACTION_SET = new Set<string>(PLAYABLE_FACTIONS);

// Hero adventure spritesheet layout (see HERO_SPRITESHEETS in rendering/phaser/assets.ts):
// 12 columns wide, one row per HERO_DIRECTIONS entry (8 rows, order
// ["S","SW","W","NW","N","NE","E","SE"]). We show the "SE" view (row 7), and its
// idle loop cycles columns [0,1,2,3,2,1] (5 fps).
const HERO_SHEET_COLUMNS = 12;
const HERO_SHEET_ROWS = 8;
const HERO_IDLE_ROW = 7; // "SE" in HERO_DIRECTIONS
const HERO_IDLE_FRAME_COLUMNS = [0, 1, 2, 3, 2, 1] as const;

/** Renders the camera-facing idle animation from the hero adventure spritesheet. */
function HeroIdleSprite({ src, alt, size = 48, className = "" }: { src: string; alt: string; size?: number; className?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrame((current) => (current + 1) % HERO_IDLE_FRAME_COLUMNS.length);
    }, 180);
    return () => window.clearInterval(interval);
  }, []);

  const column = HERO_IDLE_FRAME_COLUMNS[frame];
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${HERO_SHEET_COLUMNS * size}px ${HERO_SHEET_ROWS * size}px`,
        backgroundPosition: `${-column * size}px ${-HERO_IDLE_ROW * size}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}

function FactionGrid({
  selectedFaction,
  onSelect,
}: {
  selectedFaction: string;
  onSelect: (faction: string) => void;
}) {
  const { locale } = useI18n();
  return (
    <div className="space-y-3">
      {ALIGNMENT_GROUPS.map((group) => (
        <div key={group.key}>
          <div className={`mb-1 text-[11px] font-bold uppercase tracking-[0.2em] ${group.accent}`}>{pickLocale(group.label, group.labelEn, locale)}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(FACTION_META)
              .filter(([key, m]) => PLAYABLE_FACTION_SET.has(key) && m.alignment === group.key)
              .map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`rounded-lg border p-2.5 text-left transition ${
                    selectedFaction === key
                      ? "border-amber-400 bg-amber-900/30 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)]"
                      : "border-amber-700/30 bg-stone-950/60 hover:border-amber-500/50 hover:bg-amber-900/15"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Image
                      src={`/assets/sprites/map/town-${key}.webp`}
                      alt=""
                      aria-hidden
                      width={44}
                      height={44}
                      unoptimized
                      className="h-11 w-11 shrink-0 rounded-md object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
                      style={PIXELATED}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base" aria-hidden>{meta.emblem}</span>
                        <div className="h-3 w-3 rounded-full ring-1 ring-amber-200/40" style={{ backgroundColor: meta.color }} />
                        <span className="text-sm font-bold text-amber-100">{pickLocale(meta.label, meta.labelEn, locale)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wider text-amber-200/60">{pickLocale(meta.tagline, meta.taglineEn, locale)}</div>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FactionDetail({ faction }: { faction: string }) {
  const { locale, t } = useI18n();
  const meta = FACTION_META[faction];
  const showcase = getFactionShowcase(faction);
  if (!meta) return null;

  return (
    <div className="rounded-lg border border-amber-700/40 bg-stone-950/60 p-4">
      <div className="flex items-start gap-4">
        <Image
          src={showcase.townSprite}
          alt={pickLocale(meta.label, meta.labelEn, locale)}
          width={96}
          height={96}
          unoptimized
          className="h-24 w-24 shrink-0 rounded-md object-contain drop-shadow-[0_3px_5px_rgba(0,0,0,0.7)]"
          style={PIXELATED}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>{meta.emblem}</span>
            <div className="h-3.5 w-3.5 rounded-full ring-1 ring-amber-200/40" style={{ backgroundColor: meta.color }} />
            <h3 className={`text-lg font-black uppercase tracking-wider ${goldText}`}>{pickLocale(meta.label, meta.labelEn, locale)}</h3>
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200/70">{pickLocale(meta.tagline, meta.taglineEn, locale)}</div>
          <p className="mt-2 text-xs leading-snug text-amber-200/70">{pickLocale(meta.desc, meta.descEn, locale)}</p>
        </div>
      </div>

      {showcase.hero && (
        <div className="mt-4">
          <div className="mb-3 flex justify-center rounded-md border border-amber-700/30 bg-black/25 py-2">
            <Image
              src={showcase.kingSprite}
              alt=""
              aria-hidden
              width={72}
              height={72}
              unoptimized
              className="h-20 w-20 object-contain drop-shadow-[0_3px_5px_rgba(0,0,0,0.7)]"
            />
          </div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200/80">{t("faction.startingHero")}</div>
          <div className="flex items-center gap-3 rounded-md border border-amber-700/30 bg-black/30 p-2.5">
            <HeroIdleSprite
              src={showcase.hero.sprite}
              alt={showcase.hero.name}
              size={48}
              className="h-12 w-12 shrink-0 rounded-md drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
            />
            <div className="min-w-0">
              <div className="text-sm font-bold text-amber-100">{showcase.hero.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-amber-200/60">{localizedSpecialty(showcase.hero.specialty, locale)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200/80">{t("faction.signatureCreatures")}</div>
        <div className="grid grid-cols-3 gap-2">
          {showcase.creatures.map((creature) => (
            <div
              key={creature.type}
              className="flex flex-col items-center gap-1 rounded-md border border-amber-700/30 bg-black/30 p-2 text-center"
            >
              <Image
                src={creature.sprite}
                alt={localizedUnitLabel(creature.type, creature.label, locale)}
                width={48}
                height={48}
                unoptimized
                className="h-12 w-12 object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
                style={PIXELATED}
              />
              <div className="text-[11px] font-bold leading-tight text-amber-100">{localizedUnitLabel(creature.type, creature.label, locale)}</div>
              <div className="text-[10px] uppercase tracking-wider text-amber-200/55">{t("faction.tier")} {creature.tier}</div>
              <div className="text-[10px] text-amber-200/70">
                <span title={t("stat.attack")}>⚔ {creature.attack}</span> · <span title={t("stat.health")}>❤ {creature.health}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FactionSelect({
  selectedFaction,
  onSelect,
}: {
  selectedFaction: string;
  onSelect: (faction: string) => void;
}) {
  useEffect(() => {
    const playableFaction = normalizePlayableFaction(selectedFaction);
    if (playableFaction !== selectedFaction) onSelect(playableFaction);
  }, [selectedFaction, onSelect]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <FactionGrid selectedFaction={selectedFaction} onSelect={onSelect} />
      <FactionDetail faction={selectedFaction} />
    </div>
  );
}
