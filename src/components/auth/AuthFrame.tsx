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

function pickRandom<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

export default function AuthFrame({ title, subtitle, showHeader = true, children }: AuthFrameProps) {
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

      <div className="relative mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-5xl items-center gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="hidden min-h-[34rem] flex-col justify-center lg:flex" aria-hidden="true">
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
        </section>

        <section className={`${ornateFramePolished} relative mx-auto w-full max-w-96 overflow-hidden p-5 sm:p-7`}>
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
      </div>
    </main>
  );
}

function ShowcaseCard({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-32 overflow-hidden rounded-md border border-amber-700/45 bg-black/35 shadow-[inset_0_0_20px_rgba(0,0,0,0.55),0_14px_28px_rgba(0,0,0,0.35)]">
      {children}
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
