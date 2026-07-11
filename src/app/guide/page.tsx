import type { Metadata } from "next";
import { OverviewSection } from "@/components/guide/sections/OverviewSection";
import { GuideSection } from "@/components/guide/guidePrimitives";
import { GuideHomeCards } from "@/components/guide/GuideHomeCards";

export const metadata: Metadata = {
  title: "Accueil — Guide My Heroes",
};

export default function GuideHomePage() {
  return (
    <>
      <OverviewSection />
      <GuideSection id="explore" title="Explorer le guide" icon="🧭">
        <GuideHomeCards />
      </GuideSection>
    </>
  );
}
