import { createGuideMetadata } from "@/lib/seo/metadata";
import { SearchView } from "@/components/guide/SearchView";

export const metadata = createGuideMetadata("Rechercher — Guide My Heroes", "/guide/recherche", { index: false });

export default function GuideRecherchePage() {
  return <SearchView />;
}
