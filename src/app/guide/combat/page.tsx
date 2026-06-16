import type { Metadata } from "next";
import { CombatSection } from "@/components/guide/sections/CombatSection";
import { AdvancedCombatView } from "@/components/guide/AdvancedCombatView";

export const metadata: Metadata = { title: "Combat — Guide My Heroes" };

export default function GuideCombatPage() {
  return (
    <>
      <CombatSection />
      <AdvancedCombatView />
    </>
  );
}
