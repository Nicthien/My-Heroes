import { createGuideMetadata } from "@/lib/seo/metadata";
import { TownSection } from "@/components/guide/sections/TownSection";
import { ArmySection } from "@/components/guide/sections/ArmySection";

export const metadata = createGuideMetadata("Villes & bâtiments — Guide My Heroes", "/guide/villes");

export default function GuideVillesPage() {
  return (
    <>
      <TownSection />
      <ArmySection />
    </>
  );
}
