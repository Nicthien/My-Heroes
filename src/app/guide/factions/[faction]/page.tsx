import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FactionDetail } from "@/components/guide/FactionDetail";
import { PLAYABLE_FACTIONS, isPlayableFaction } from "@/lib/game/playable-factions";
import { factionLabel } from "@/app/dashboard/factionMeta";
import { createGuideMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return PLAYABLE_FACTIONS.map((faction) => ({ faction }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ faction: string }>;
}): Promise<Metadata> {
  const { faction } = await params;
  if (!isPlayableFaction(faction)) return { title: "Faction — Guide My Heroes" };
  return createGuideMetadata(
    `${factionLabel(faction)} — Guide My Heroes`,
    `/guide/factions/${faction}`,
  );
}

export default async function GuideFactionDetailPage({
  params,
}: {
  params: Promise<{ faction: string }>;
}) {
  const { faction } = await params;
  if (!isPlayableFaction(faction)) notFound();
  return <FactionDetail faction={faction} />;
}
