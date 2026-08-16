"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import LanguageSelect from "@/components/i18n/LanguageSelect";
import { SocialLinks } from "@/app/dashboard/SocialLinks";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { CornerOrnaments, FleurDeLis, ParchmentBackground, goldText, ornateFramePolished } from "@/components/game/hud/theme";

const features = [
  { icon: "🗺️", title: "landing.featureExploreTitle", body: "landing.featureExploreBody" },
  { icon: "🏰", title: "landing.featureTownTitle", body: "landing.featureTownBody" },
  { icon: "⚔️", title: "landing.featureCombatTitle", body: "landing.featureCombatBody" },
  { icon: "🌐", title: "landing.featureOnlineTitle", body: "landing.featureOnlineBody" },
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
    src: "/assets/screenshot/My-Heroes-8.png",
    width: 2536,
    height: 1386,
    caption: "auth.intro.screenshotGrail",
    alt: "auth.intro.screenshotGrailAlt",
  },
] as const;

const guideLinks = [
  { href: "/guide/debuter", label: "landing.guideStart", icon: "🚀" },
  { href: "/guide/factions", label: "landing.guideFactions", icon: "🛡️" },
  { href: "/guide/combat", label: "landing.guideCombat", icon: "🎯" },
  { href: "/guide/carte", label: "landing.guideMap", icon: "🧭" },
] as const;

export function LandingPage() {
  const { locale, setLocale, t } = useI18n();
  const [selectedScreenshot, setSelectedScreenshot] = useState<(typeof screenshots)[number] | null>(null);

  useEffect(() => {
    if (!selectedScreenshot) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedScreenshot(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedScreenshot]);

  return (
    <main className="min-h-dvh overflow-hidden bg-[#090603] text-amber-50">
      <header className="relative z-20 border-b border-amber-800/35 bg-black/75 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="My Heroes">
            <Image src="/icon.png" width={48} height={48} alt="" priority className="h-10 w-10 rounded-md border border-amber-500/40" />
            <span className={`whitespace-nowrap text-xl font-black sm:text-2xl ${goldText}`}>My Heroes</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/guide" className="hidden rounded-md px-3 py-2 text-sm font-bold text-amber-100/75 transition hover:text-amber-100 sm:block">
              {t("landing.navGuide")}
            </Link>
            <Link href="/auth/login" className="rounded-md border border-amber-400/65 bg-amber-800/60 px-3 py-2 text-sm font-black text-amber-50 transition hover:bg-amber-700/70 sm:px-4">
              {t("landing.navPlay")}
            </Link>
            <LanguageSelect value={locale} onChange={setLocale} compactOnMobile />
          </div>
        </div>
      </header>

      <section className="relative isolate border-b border-amber-900/35">
        <Image
          src="/assets/banners/my-heroes-banner.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-center opacity-40"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#090603] via-[#090603]/88 to-[#090603]/42" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#090603] via-transparent to-black/35" />
        <div className="mx-auto grid min-h-[640px] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)] lg:py-24">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3 text-xs font-black uppercase tracking-[0.24em] text-amber-300/85">
              <FleurDeLis className="h-4 w-4" />
              <span>{t("landing.eyebrow")}</span>
            </div>
            <h1 className={`text-balance text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl ${goldText}`}>
              My Heroes
            </h1>
            <h2 className="mt-5 max-w-2xl text-balance text-2xl font-black leading-tight text-amber-50 sm:text-4xl">
              {t("landing.title")}
            </h2>
            <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-amber-100/78 sm:text-lg">
              {t("landing.body")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/login" className="rounded-md border border-amber-300/70 bg-gradient-to-b from-amber-500 to-amber-800 px-6 py-3.5 text-center text-sm font-black uppercase tracking-wide text-white shadow-[0_14px_32px_rgba(0,0,0,0.38)] transition hover:from-amber-400 hover:to-amber-700">
                {t("landing.playCta")}
              </Link>
              <Link href="/guide" className="rounded-md border border-amber-600/55 bg-black/45 px-6 py-3.5 text-center text-sm font-black uppercase tracking-wide text-amber-100 transition hover:border-amber-300/70 hover:bg-black/65">
                {t("landing.guideCta")}
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Avantages">
              {(["landing.badgeFree", "landing.badgeBrowser", "landing.badgeGuest"] as const).map((key) => (
                <li key={key} className="rounded-full border border-emerald-500/35 bg-emerald-950/35 px-3 py-1 text-xs font-bold text-emerald-100/85">
                  ✓ {t(key)}
                </li>
              ))}
            </ul>
          </div>

          <div className={`${ornateFramePolished} relative hidden overflow-hidden p-3 shadow-2xl shadow-black/60 lg:block`}>
            <CornerOrnaments />
            <ParchmentBackground />
            <Image
              src="/assets/covers/my-heroes-cover.webp"
              width={1672}
              height={941}
              alt="My Heroes, jeu de stratégie fantasy au tour par tour"
              sizes="(max-width: 1200px) 40vw, 520px"
              className="relative aspect-[16/9] w-full rounded-sm object-cover"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow={t("landing.featuresEyebrow")} title={t("landing.featuresTitle")} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-lg border border-amber-800/35 bg-gradient-to-b from-amber-950/25 to-black/30 p-5 shadow-xl shadow-black/20">
              <div className="text-3xl" aria-hidden="true">{feature.icon}</div>
              <h3 className="mt-4 text-lg font-black text-amber-100">{t(feature.title)}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-amber-100/65">{t(feature.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-amber-900/35 bg-black/28">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow={t("landing.galleryEyebrow")} title={t("landing.galleryTitle")} body={t("landing.galleryBody")} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {screenshots.map((screenshot) => (
              <button
                key={screenshot.src}
                type="button"
                onClick={() => setSelectedScreenshot(screenshot)}
                aria-label={`${t("auth.intro.viewScreenshot")} — ${t(screenshot.caption)}`}
                className="group relative overflow-hidden rounded-lg border border-amber-800/45 bg-black text-left shadow-2xl shadow-black/30 outline-none transition hover:-translate-y-0.5 hover:border-amber-400/70 focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <Image
                  src={screenshot.src}
                  width={screenshot.width}
                  height={screenshot.height}
                  alt={t(screenshot.alt)}
                  sizes="(max-width: 640px) 94vw, 46vw"
                  className="aspect-[2/1] w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:brightness-110"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent px-4 pb-3 pt-12 text-sm font-black uppercase tracking-wide text-amber-100">
                  {t(screenshot.caption)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <SectionHeading eyebrow={t("landing.guideEyebrow")} title={t("landing.guideTitle")} body={t("landing.guideBody")} />
        <div className="grid gap-3 sm:grid-cols-2">
          {guideLinks.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-4 rounded-lg border border-amber-800/40 bg-amber-950/20 p-4 text-amber-100 transition hover:border-amber-400/60 hover:bg-amber-900/25">
              <span className="text-2xl" aria-hidden="true">{item.icon}</span>
              <span className="font-black">{t(item.label)}</span>
              <span className="ml-auto text-amber-300" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-amber-900/40 bg-black/45">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 text-center sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:text-left">
          <div>
            <h2 className="text-lg font-black text-amber-100">{t("landing.communityTitle")}</h2>
            <p className="mt-1 text-sm text-amber-100/58">{t("landing.communityBody")}</p>
          </div>
          <SocialLinks className="justify-center lg:justify-end" />
        </div>
      </footer>

      {selectedScreenshot ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={t(selectedScreenshot.caption)}
          onClick={() => setSelectedScreenshot(null)}
        >
          <div className="relative max-h-[94dvh] w-full max-w-6xl overflow-hidden rounded-lg border border-amber-500/65 bg-stone-950 shadow-[0_28px_80px_rgba(0,0,0,0.8)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-amber-800/45 px-4 py-3">
              <span className="font-black uppercase tracking-wide text-amber-100">{t(selectedScreenshot.caption)}</span>
              <button type="button" onClick={() => setSelectedScreenshot(null)} className="grid h-10 w-10 place-items-center rounded-md border border-amber-500/50 text-xl font-black text-amber-100 hover:bg-amber-900/35" aria-label={t("common.close")}>
                ×
              </button>
            </div>
            <div className="grid max-h-[calc(94dvh-4rem)] place-items-center p-2 sm:p-4">
              <Image src={selectedScreenshot.src} width={selectedScreenshot.width} height={selectedScreenshot.height} alt={t(selectedScreenshot.alt)} sizes="96vw" className="max-h-[calc(94dvh-6rem)] w-auto max-w-full object-contain" />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-3xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-amber-400/75">{eyebrow}</div>
      <h2 className="mt-3 text-balance text-3xl font-black leading-tight text-amber-50 sm:text-4xl">{title}</h2>
      {body ? <p className="mt-4 text-base font-medium leading-7 text-amber-100/65">{body}</p> : null}
    </div>
  );
}
