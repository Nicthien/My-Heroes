import { createGuideMetadata } from "@/lib/seo/metadata";
import { FactionIndex } from "@/components/guide/FactionIndex";

export const metadata = createGuideMetadata("Factions — Guide My Heroes", "/guide/factions");

export default function GuideFactionsPage() {
  return <FactionIndex />;
}
