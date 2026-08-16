import { createGuideMetadata } from "@/lib/seo/metadata";
import { SpellsExplorer } from "@/components/guide/SpellsExplorer";

export const metadata = createGuideMetadata("Sorts — Guide My Heroes", "/guide/sorts");

export default function GuideSortsPage() {
  return <SpellsExplorer />;
}
