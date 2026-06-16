import type { Metadata } from "next";
import { FactionIndex } from "@/components/guide/FactionIndex";

export const metadata: Metadata = { title: "Factions — Guide My Heroes" };

export default function GuideFactionsPage() {
  return <FactionIndex />;
}
