import { createGuideMetadata } from "@/lib/seo/metadata";
import { CombatSection } from "@/components/guide/sections/CombatSection";
import { AdvancedCombatView } from "@/components/guide/AdvancedCombatView";

export const metadata = createGuideMetadata("Combat — Guide My Heroes", "/guide/combat");

export default function GuideCombatPage() {
  return (
    <>
      <CombatSection />
      <AdvancedCombatView />
    </>
  );
}
