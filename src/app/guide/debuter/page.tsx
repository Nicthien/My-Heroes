import type { Metadata } from "next";
import { FirstStepsSection } from "@/components/guide/sections/FirstStepsSection";
import { TipsSection } from "@/components/guide/sections/TipsSection";

export const metadata: Metadata = { title: "Premiers pas — Guide My Heroes" };

export default function GuideDebuterPage() {
  return (
    <>
      <FirstStepsSection />
      <TipsSection />
    </>
  );
}
