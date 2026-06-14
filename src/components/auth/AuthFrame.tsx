"use client";

import { ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import {
  CornerOrnaments,
  FleurDeLis,
  ParchmentBackground,
  goldDivider,
  goldText,
  ornateFramePolished,
} from "@/components/game/hud/theme";
import { CREATURES } from "@/lib/game/creature-catalog";
import { useI18n } from "@/lib/i18n/I18nProvider";

export const authLabelClass =
  "mb-1 block text-xs font-black uppercase text-amber-200/80";

export const authInputClass =
  "h-12 w-full rounded-md border border-amber-700/50 bg-stone-950/75 px-3 text-amber-50 shadow-inner shadow-black/40 outline-none transition placeholder:text-amber-200/25 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20";

export const authPrimaryButtonClass =
  "h-12 w-full rounded-md border border-amber-400/70 bg-gradient-to-b from-amber-600 to-amber-800 px-4 text-sm font-black uppercase text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.28),0_8px_18px_rgba(0,0,0,0.35)] transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-55";

export const authErrorClass =
  "mb-4 rounded-md border border-red-400/50 bg-red-950/50 px-3 py-2 text-sm font-semibold text-red-100";

export const authLinkClass =
  "font-bold text-amber-200 underline decoration-amber-500/50 underline-offset-4 transition hover:text-amber-100";

interface AuthFrameProps {
  title: ReactNode;
  subtitle: ReactNode;
  showHeader?: boolean;
  showGameIntro?: boolean;
  children: ReactNode;
}

const factions = [
  "castle",
  "rampart",
  "tower",
  "inferno",
  "necropolis",
  "dungeon",
  "stronghold",
  "fortress",
  "conflux",
] as const;

const castleSprites = factions.map((faction) => `/assets/sprites/map/town-${faction}.webp`);
const kingSprites = factions.map((faction) => `/assets/sprites/units/kings/king-${faction}.webp`);
const heroSprites = factions.map((faction) => `/assets/sprites/heroes/${faction}/adventure.webp`);
const creatureSprites = CREATURES.map((creature) => `/assets/sprites/units/${creature.type}.webp`);

type ShowcaseSprites = {
  castle: string;
  king: string;
  hero: string;
  creature: string;
};

const initialShowcaseSprites: ShowcaseSprites = {
  castle: castleSprites[0],
  king: kingSprites[0],
  hero: heroSprites[0],
  creature: creatureSprites[0],
};

const introPoints = [
  "auth.intro.pointMap",
  "auth.intro.pointTown",
  "auth.intro.pointCombat",
  "auth.intro.pointOnline",
] as const;

const screenshots = [
  {
    src: "/assets/screenshot/My-Heroes.png",
    width: 1872,
    height: 910,
    caption: "auth.intro.screenshotAdventure",
    alt: "auth.intro.screenshotAdventureAlt",
  },
  {
    src: "/assets/screenshot/My-Heroes-4.png",
    width: 2541,
    height: 1392,
    caption: "auth.intro.screenshotNaval",
    alt: "auth.intro.screenshotNavalAlt",
  },
  {
    src: "/assets/screenshot/My-Heroes-2.png",
    width: 1868,
    height: 907,
    caption: "auth.intro.screenshotCombat",
    alt: "auth.intro.screenshotCombatAlt",
  },
  {
    src: "/assets/screenshot/My-Heroes-6.png",
    width: 2541,
    height: 1399,
    caption: "auth.intro.screenshotSiege",
    alt: "auth.intro.screenshotSiegeAlt",
  },
  {
    src: "/assets/screenshot/My-Heroes-7.png",
    width: 2539,
    height: 1392,
    caption: "auth.intro.screenshotWinter",
    alt: "auth.intro.screenshotWinterAlt",
  },
  {
    src: "/assets/screenshot/My-Heroes-3.png",
    width: 1863,
    height: 904,
    caption: "auth.intro.screenshotDashboard",
    alt: "auth.intro.screenshotDashboardAlt",
  },
  {
    src: "/assets/screenshot/My-Heroes-5.png",
    width: 1961,
    height: 1192,
    caption: "auth.intro.screenshotBuildTree",
    alt: "auth.intro.screenshotBuildTreeAlt",
  },
  {
    src: "/assets/screenshot/My-Heroes-8.png",
    width: 2536,
    height: 1386,
    caption: "auth.intro.screenshotGrail",
    alt: "auth.intro.screenshotGrailAlt",
  },
] as const;

function pickRandom<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

export default function AuthFrame({
  title,
  subtitle,
  showHeader = true,
  showGameIntro = false,
  children,
}: AuthFrameProps) {
  const [showcaseSprites, setShowcaseSprites] = useState(initialShowcaseSprites);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowcaseSprites({
        castle: pickRandom(castleSprites),
        king: pickRandom(kingSprites),
        hero: pickRandom(heroSprites),
        creature: pickRandom(creatureSprites),
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-gradient-to-br from-stone-950 via-[#0e0904] to-stone-900 px-4 py-6 text-amber-50 sm:px-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(245,158,11,0.12), transparent 36%), linear-gradient(45deg, rgba(16,185,129,0.10), transparent 42%), url('/assets/textures/terrain/mountain/mountain-dark-rock.webp')",
          backgroundSize: "auto, auto, 220px 220px",
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.7),rgba(0,0,0,0.18)_44%,rgba(0,0,0,0.72))]" aria-hidden="true" />

      <div
        className={`relative mx-auto grid min-h-[calc(100dvh-3rem)] w-full items-center gap-6 ${
          showGameIntro ? "max-w-7xl lg:grid-cols-[minmax(0,1.35fr)_25rem]" : "max-w-5xl lg:grid-cols-[minmax(0,1fr)_26rem]"
        }`}
      >
        {showGameIntro ? <GameIntro compact className="lg:hidden" /> : null}

        <section
          className="hidden min-h-[34rem] flex-col justify-center lg:flex"
          aria-hidden={showGameIntro ? undefined : true}
        >
          {showGameIntro ? (
            <GameIntro />
          ) : (
            <>
              <div className="mb-8 flex items-center gap-4">
                <div className="relative grid h-24 w-24 place-items-center rounded-xl border border-amber-500/60 bg-black/35 shadow-2xl shadow-black/60">
                  <Image src="/icon.png" width={96} height={96} alt="" priority className="h-20 w-20 rounded-lg" />
                </div>
                <div>
                  <div className={`text-5xl font-black ${goldText}`}>My Heroes</div>
                  <div className="mt-3 flex items-center gap-2 text-amber-200/70">
                    <FleurDeLis className="h-3 w-3 text-amber-400" />
                    <div className="h-px w-32 bg-gradient-to-r from-amber-500/70 to-transparent" />
                  </div>
                </div>
              </div>

              <div className="grid max-w-xl grid-cols-2 gap-3">
                <ShowcaseCard>
                  <Image src={showcaseSprites.castle} alt="" fill sizes="180px" className="object-contain p-3 drop-shadow-[0_10px_14px_rgba(0,0,0,0.7)]" />
                </ShowcaseCard>
                <ShowcaseCard>
                  <Image src={showcaseSprites.king} alt="" fill sizes="180px" className="object-contain p-3 drop-shadow-[0_10px_14px_rgba(0,0,0,0.7)]" />
                </ShowcaseCard>
                <ShowcaseCard>
                  <HeroSeSprite src={showcaseSprites.hero} />
                </ShowcaseCard>
                <ShowcaseCard>
                  <Image src={showcaseSprites.creature} alt="" fill sizes="180px" className="object-contain p-3 drop-shadow-[0_10px_14px_rgba(0,0,0,0.7)]" />
                </ShowcaseCard>
              </div>
            </>
          )}
        </section>

        <div className="mx-auto flex w-full max-w-96 flex-col gap-4">
          <section className={`${ornateFramePolished} relative w-full overflow-hidden p-5 sm:p-7`}>
            <ParchmentBackground />
            <CornerOrnaments />
            <div className="relative">
              {showHeader ? (
                <>
                  <Image
                    src="/icon.png"
                    width={104}
                    height={104}
                    alt=""
                    priority
                    className="mx-auto mb-4 h-24 w-24 rounded-lg border border-amber-500/50 bg-black/30 p-1 shadow-xl shadow-black/50"
                  />
                  <h1 className={`text-center text-3xl font-black sm:text-4xl ${goldText}`}>
                    {title}
                  </h1>
                  <p className="mt-2 text-center text-sm font-semibold text-amber-100/70">{subtitle}</p>
                  <div className={`my-6 ${goldDivider}`} />
                </>
              ) : null}
              {children}
            </div>
          </section>

          {showGameIntro ? <RandomSpriteShowcase sprites={showcaseSprites} /> : null}
        </div>
      </div>
    </main>
  );
}

function GameIntro({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { t } = useI18n();
  const [selectedScreenshot, setSelectedScreenshot] = useState<(typeof screenshots)[number] | null>(null);

  useEffect(() => {
    if (!selectedScreenshot) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedScreenshot(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedScreenshot]);

  return (
    <section className={className}>
      <div className="mb-5 flex items-center gap-4">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-amber-500/60 bg-black/35 shadow-2xl shadow-black/60 sm:h-24 sm:w-24">
          <Image src="/icon.png" width={96} height={96} alt="" priority className="h-16 w-16 rounded-lg sm:h-20 sm:w-20" />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-[0.26em] text-amber-300/75">{t("auth.intro.eyebrow")}</div>
          <h1 className={`mt-1 text-4xl font-black sm:text-5xl ${goldText}`}>My Heroes</h1>
          <div className="mt-2 flex items-center gap-2 text-amber-200/70">
            <FleurDeLis className="h-3 w-3 text-amber-400" />
            <div className="h-px w-24 bg-gradient-to-r from-amber-500/70 to-transparent sm:w-36" />
          </div>
        </div>
      </div>

      <div className="max-w-3xl">
        <h2 className="text-balance text-2xl font-black leading-tight text-amber-50 sm:text-3xl">
          {t("auth.intro.title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-amber-100/76 sm:text-base">
          {t("auth.intro.body")}
        </p>
      </div>

      <div className="mt-5 grid max-w-3xl grid-cols-2 gap-2.5 sm:gap-3">
        {introPoints.map((point) => (
          <div
            key={point}
            className="rounded-md border border-amber-700/35 bg-black/28 px-3 py-2 text-xs font-black uppercase leading-5 tracking-wide text-amber-100/82 shadow-[inset_0_0_18px_rgba(0,0,0,0.28)]"
          >
            {t(point)}
          </div>
        ))}
      </div>

      <div className={compact ? "mt-5" : "mt-6"}>
        <div className="mb-3 flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-[0.22em] text-amber-300/72">
            {t("auth.intro.galleryTitle")}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-amber-500/45 to-transparent" />
          <span className="rounded-full border border-amber-600/40 bg-black/40 px-2 py-0.5 text-[10px] font-black text-amber-200/80">
            {screenshots.length}
          </span>
        </div>
        <div className={`grid gap-2.5 ${compact ? "grid-cols-2" : "grid-cols-4"}`}>
          {screenshots.map((screenshot) => (
            <button
              key={screenshot.src}
              type="button"
              onClick={() => setSelectedScreenshot(screenshot)}
              aria-label={`${t("auth.intro.viewScreenshot")} - ${t(screenshot.caption)}`}
              className="group relative block aspect-[2.06/1] w-full overflow-hidden rounded-md border border-amber-700/45 bg-stone-950 text-left shadow-[0_12px_26px_rgba(0,0,0,0.4)] outline-none transition duration-200 hover:-translate-y-0.5 hover:border-amber-400/70 hover:shadow-[0_18px_34px_rgba(0,0,0,0.55)] focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <Image
                src={screenshot.src}
                alt={t(screenshot.alt)}
                width={screenshot.width}
                height={screenshot.height}
                sizes={compact ? "(max-width: 1024px) 45vw, 220px" : "200px"}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.06] group-hover:brightness-110"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 pb-1.5 pt-5">
                <span className="block truncate text-[10px] font-black uppercase tracking-wide text-amber-100/90">
                  {t(screenshot.caption)}
                </span>
              </span>
              <span className="pointer-events-none absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md border border-amber-400/55 bg-black/65 text-xs font-black text-amber-100 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
                ⤢
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedScreenshot ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/86 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={t(selectedScreenshot.caption)}
          onClick={() => setSelectedScreenshot(null)}
        >
          <div
            className="relative max-h-[92dvh] w-full max-w-6xl overflow-hidden rounded-md border border-amber-600/70 bg-stone-950 shadow-[0_28px_80px_rgba(0,0,0,0.75)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-amber-700/40 bg-black/72 px-3 py-2 sm:px-4">
              <div className="min-w-0 truncate text-sm font-black uppercase tracking-[0.18em] text-amber-100">
                {t(selectedScreenshot.caption)}
              </div>
              <button
                type="button"
                onClick={() => setSelectedScreenshot(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-amber-500/55 bg-black/45 text-xl font-black leading-none text-amber-100 transition hover:bg-amber-800/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                aria-label={t("common.close")}
              >
                ×
              </button>
            </div>
            <div className="grid max-h-[calc(92dvh-3.25rem)] place-items-center bg-black/45 p-2 sm:p-4">
              <Image
                src={selectedScreenshot.src}
                alt={t(selectedScreenshot.alt)}
                width={selectedScreenshot.width}
                height={selectedScreenshot.height}
                sizes="(max-width: 768px) 96vw, 1100px"
                className="max-h-[calc(92dvh-5.25rem)] w-auto max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ShowcaseCard({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-32 overflow-hidden rounded-md border border-amber-700/45 bg-black/35 shadow-[inset_0_0_20px_rgba(0,0,0,0.55),0_14px_28px_rgba(0,0,0,0.35)]">
      {children}
    </div>
  );
}

function RandomSpriteShowcase({ sprites }: { sprites: ShowcaseSprites }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ShowcaseCard>
        <Image src={sprites.castle} alt="" fill sizes="180px" className="object-contain p-3 drop-shadow-[0_10px_14px_rgba(0,0,0,0.7)]" />
      </ShowcaseCard>
      <ShowcaseCard>
        <Image src={sprites.king} alt="" fill sizes="180px" className="object-contain p-3 drop-shadow-[0_10px_14px_rgba(0,0,0,0.7)]" />
      </ShowcaseCard>
      <ShowcaseCard>
        <HeroSeSprite src={sprites.hero} />
      </ShowcaseCard>
      <ShowcaseCard>
        <Image src={sprites.creature} alt="" fill sizes="180px" className="object-contain p-3 drop-shadow-[0_10px_14px_rgba(0,0,0,0.7)]" />
      </ShowcaseCard>
    </div>
  );
}

function HeroSeSprite({ src }: { src: string }) {
  const frameWidth = 104;
  const frameHeight = 104;
  const columns = 12;
  const rows = 8;
  const directionIndex = 7;
  const previewSize = 72;
  const scale = previewSize / frameWidth;

  return (
    <div className="grid h-full w-full place-items-center">
      <div
        className="h-[72px] w-[72px] drop-shadow-[0_10px_14px_rgba(0,0,0,0.7)]"
        style={{
          backgroundImage: `url(${src})`,
          backgroundPosition: `0px -${directionIndex * frameHeight * scale}px`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${frameWidth * columns * scale}px ${frameHeight * rows * scale}px`,
        }}
      />
    </div>
  );
}
