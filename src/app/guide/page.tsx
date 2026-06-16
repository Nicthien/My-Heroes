import type { Metadata } from "next";
import Link from "next/link";
import { OverviewSection } from "@/components/guide/sections/OverviewSection";
import { GuideSection } from "@/components/guide/guidePrimitives";
import { GUIDE_NAV } from "@/components/guide/guideNav";

export const metadata: Metadata = {
  title: "Accueil — Guide My Heroes",
};

export default function GuideHomePage() {
  const cards = GUIDE_NAV.flatMap((group) => group.items).filter((item) => item.href !== "/guide");
  return (
    <>
      <OverviewSection />
      <GuideSection id="explore" title="Explorer le guide" icon="🧭">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg border border-amber-800/40 bg-stone-950/50 p-3 transition hover:border-amber-400/60 hover:bg-amber-950/30"
            >
              <span className="text-2xl" aria-hidden="true">{item.icon}</span>
              <span className="font-bold text-amber-100">{item.label}</span>
            </Link>
          ))}
        </div>
      </GuideSection>
    </>
  );
}
