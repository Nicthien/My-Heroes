import { createGuideMetadata } from "@/lib/seo/metadata";
import { GlossaryView } from "@/components/guide/GlossaryView";

export const metadata = createGuideMetadata("Glossaire — Guide My Heroes", "/guide/glossaire");

export default function GuideGlossairePage() {
  return <GlossaryView />;
}
