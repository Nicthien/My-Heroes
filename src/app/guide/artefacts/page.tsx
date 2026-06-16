import type { Metadata } from "next";
import { ArtifactsView } from "@/components/guide/ArtifactsView";

export const metadata: Metadata = { title: "Artefacts — Guide My Heroes" };

export default function GuideArtefactsPage() {
  return <ArtifactsView />;
}
