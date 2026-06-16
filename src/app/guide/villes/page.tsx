import type { Metadata } from "next";
import { TownSection } from "@/components/guide/sections/TownSection";
import { ArmySection } from "@/components/guide/sections/ArmySection";

export const metadata: Metadata = { title: "Villes & bâtiments — Guide My Heroes" };

export default function GuideVillesPage() {
  return (
    <>
      <TownSection />
      <ArmySection />
    </>
  );
}
