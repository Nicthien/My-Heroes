import { createGuideMetadata } from "@/lib/seo/metadata";
import { FirstStepsSection } from "@/components/guide/sections/FirstStepsSection";
import { TipsSection } from "@/components/guide/sections/TipsSection";

export const metadata = createGuideMetadata("Premiers pas — Guide My Heroes", "/guide/debuter");

export default function GuideDebuterPage() {
  return (
    <>
      <FirstStepsSection />
      <TipsSection />
    </>
  );
}
