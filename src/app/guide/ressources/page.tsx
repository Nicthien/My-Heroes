import type { Metadata } from "next";
import { ResourcesSection } from "@/components/guide/sections/ResourcesSection";

export const metadata: Metadata = { title: "Ressources — Guide My Heroes" };

export default function GuideRessourcesPage() {
  return <ResourcesSection />;
}
