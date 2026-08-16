import { createGuideMetadata } from "@/lib/seo/metadata";
import { GameMechanicsView } from "@/components/guide/GameMechanicsView";

export const metadata = createGuideMetadata("Mécaniques de partie — Guide My Heroes", "/guide/mecaniques");

export default function GuideMecaniquesPage() {
  return <GameMechanicsView />;
}
