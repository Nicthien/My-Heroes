import type { Metadata } from "next";
import { GuideLayout } from "@/components/guide/GuideLayout";

export const metadata: Metadata = {
  title: "Guide de jeu — My Heroes",
  description:
    "Encyclopédie de My Heroes : comment jouer, factions, créatures, bâtiments, artefacts, objets de la carte, combat et héros.",
};

export default function GuideRootLayout({ children }: { children: React.ReactNode }) {
  return <GuideLayout>{children}</GuideLayout>;
}
