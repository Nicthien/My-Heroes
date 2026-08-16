import { createGuideMetadata } from "@/lib/seo/metadata";
import { OverviewSection } from "@/components/guide/sections/OverviewSection";
import { GuideSection } from "@/components/guide/guidePrimitives";
import { GuideHomeCards } from "@/components/guide/GuideHomeCards";

export const metadata = createGuideMetadata("Accueil — Guide My Heroes", "/guide");

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
