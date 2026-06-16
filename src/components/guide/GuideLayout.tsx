"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CornerOrnaments, FleurDeLis, goldText, ornateFramePolished } from "@/components/game/hud/theme";
import { GUIDE_NAV, isGuideNavActive } from "./guideNav";

/**
 * Persistent chrome for every /guide page: a sticky header, a desktop sidebar
 * grouped by theme, and a horizontal mobile nav. The active route is derived from
 * the pathname so the wiki feels like a single navigable encyclopedia.
 */
export function GuideLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const flatItems = GUIDE_NAV.flatMap((group) => group.items);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0e0904] via-[#0b0703] to-black text-amber-100">
      <header className="sticky top-0 z-20 border-b border-amber-800/40 bg-[#0b0703]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/guide" className="flex items-center gap-2">
            <FleurDeLis className="h-4 w-4 text-amber-400" />
            <span className={`text-base font-black uppercase tracking-[0.18em] sm:text-lg ${goldText}`}>
              Guide de jeu
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-amber-700/50 bg-stone-950/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-200/85 transition hover:border-amber-400/60 hover:text-amber-100"
          >
            ← Retour
          </Link>
        </div>
      </header>

      {/* Mobile nav: horizontal chips for every page */}
      <nav className="sticky top-[52px] z-10 border-b border-amber-900/40 bg-[#0b0703]/85 backdrop-blur lg:hidden">
        <div className="flex gap-2 overflow-x-auto px-4 py-2">
          {flatItems.map((item) => {
            const active = isGuideNavActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold transition ${
                  active
                    ? "border-amber-400/70 bg-amber-900/40 text-amber-100"
                    : "border-amber-800/40 bg-stone-950/50 text-amber-200/70"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span> {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className={`sticky top-24 ${ornateFramePolished} p-2`}>
            <CornerOrnaments />
            <nav className="space-y-3">
              {GUIDE_NAV.map((group) => (
                <div key={group.title} className="space-y-0.5">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-400/70">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const active = isGuideNavActive(item.href, pathname);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                          active
                            ? "bg-amber-900/40 text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.25)_inset]"
                            : "text-amber-200/70 hover:bg-amber-950/40 hover:text-amber-100"
                        }`}
                      >
                        <span aria-hidden="true">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {children}
          <footer className="pb-10 pt-4 text-center text-xs text-amber-200/50">
            My Heroes · Guide de jeu — bonne chance sur le champ de bataille.
          </footer>
        </main>
      </div>
    </div>
  );
}
