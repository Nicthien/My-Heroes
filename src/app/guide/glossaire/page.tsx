import type { Metadata } from "next";
import { GlossaryView } from "@/components/guide/GlossaryView";

export const metadata: Metadata = { title: "Glossaire — Guide My Heroes" };

export default function GuideGlossairePage() {
  return <GlossaryView />;
}
