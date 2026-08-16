import { createGuideMetadata } from "@/lib/seo/metadata";
import { AdventureSection } from "@/components/guide/sections/AdventureSection";
import { MapObjectsView } from "@/components/guide/MapObjectsView";
import { MapAdvancedView } from "@/components/guide/MapAdvancedView";

export const metadata = createGuideMetadata("Carte & objets — Guide My Heroes", "/guide/carte");

export default function GuideCartePage() {
  return (
    <>
      <AdventureSection />
      <MapObjectsView />
      <MapAdvancedView />
    </>
  );
}
