import type { Metadata } from "next";
import { CreaturesExplorer } from "@/components/guide/CreaturesExplorer";

export const metadata: Metadata = { title: "Bestiaire — Guide My Heroes" };

export default function GuideCreaturesPage() {
  return <CreaturesExplorer />;
}
