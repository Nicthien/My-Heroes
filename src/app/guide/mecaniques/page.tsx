import type { Metadata } from "next";
import { GameMechanicsView } from "@/components/guide/GameMechanicsView";

export const metadata: Metadata = { title: "Mécaniques de partie — Guide My Heroes" };

export default function GuideMecaniquesPage() {
  return <GameMechanicsView />;
}
