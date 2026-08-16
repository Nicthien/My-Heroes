import { createGuideMetadata } from "@/lib/seo/metadata";
import { ArtifactsView } from "@/components/guide/ArtifactsView";

export const metadata = createGuideMetadata("Artefacts — Guide My Heroes", "/guide/artefacts");

export default function GuideArtefactsPage() {
  return <ArtifactsView />;
}
