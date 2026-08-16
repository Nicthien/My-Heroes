import { createGuideMetadata } from "@/lib/seo/metadata";
import { CreaturesExplorer } from "@/components/guide/CreaturesExplorer";

export const metadata = createGuideMetadata("Bestiaire — Guide My Heroes", "/guide/creatures");

export default function GuideCreaturesPage() {
  return <CreaturesExplorer />;
}
