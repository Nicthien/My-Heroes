import { createGuideMetadata } from "@/lib/seo/metadata";
import { HeroesSection } from "@/components/guide/sections/HeroesSection";
import { HeroClassesTable } from "@/components/guide/HeroClassesTable";
import { GuideSection, Lead } from "@/components/guide/guidePrimitives";

export const metadata = createGuideMetadata("Héros — Guide My Heroes", "/guide/heros");

export default function GuideHerosPage() {
  return (
    <>
      <HeroesSection />
      <GuideSection id="hero-classes" title="Les classes de héros" icon="🎓">
        <Lead>
          Chaque héros appartient à une des 18 classes, qui définit ses statistiques de départ et la
          façon dont il progresse. Les classes orientées combat misent sur l’attaque et la défense ;
          les classes magiques sur le pouvoir et la connaissance.
        </Lead>
        <HeroClassesTable />
      </GuideSection>
    </>
  );
}
