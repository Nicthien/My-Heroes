import type { Metadata } from "next";
import { SpellsExplorer } from "@/components/guide/SpellsExplorer";

export const metadata: Metadata = { title: "Sorts — Guide My Heroes" };

export default function GuideSortsPage() {
  return <SpellsExplorer />;
}
