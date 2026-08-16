import { createGuideMetadata } from "@/lib/seo/metadata";
import { SkillsView } from "@/components/guide/SkillsView";

export const metadata = createGuideMetadata("Compétences — Guide My Heroes", "/guide/competences");

export default function GuideCompetencesPage() {
  return <SkillsView />;
}
