import type { Metadata } from "next";
import { AdventureSection } from "@/components/guide/sections/AdventureSection";
import { MapObjectsView } from "@/components/guide/MapObjectsView";
import { MapAdvancedView } from "@/components/guide/MapAdvancedView";

export const metadata: Metadata = { title: "Carte & objets — Guide My Heroes" };

export default function GuideCartePage() {
  return (
    <>
      <AdventureSection />
      <MapObjectsView />
      <MapAdvancedView />
    </>
  );
}
