import type { Metadata } from "next";
import { SearchView } from "@/components/guide/SearchView";

export const metadata: Metadata = { title: "Rechercher — Guide My Heroes" };

export default function GuideRecherchePage() {
  return <SearchView />;
}
