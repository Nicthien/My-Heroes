import type { Metadata } from "next";
import { SkillsView } from "@/components/guide/SkillsView";

export const metadata: Metadata = { title: "Compétences — Guide My Heroes" };

export default function GuideCompetencesPage() {
  return <SkillsView />;
}
