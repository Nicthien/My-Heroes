import { createGuideMetadata } from "@/lib/seo/metadata";
import { ResourcesSection } from "@/components/guide/sections/ResourcesSection";

export const metadata = createGuideMetadata("Ressources — Guide My Heroes", "/guide/ressources");

export default function GuideRessourcesPage() {
  return <ResourcesSection />;
}
