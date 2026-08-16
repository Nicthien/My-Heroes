import type { MetadataRoute } from "next";
import { GUIDE_NAV } from "@/components/guide/guideNav";
import { PLAYABLE_FACTIONS } from "@/lib/game/playable-factions";
import { getSiteUrl } from "@/lib/seo/site";

const guidePaths = GUIDE_NAV.flatMap((group) => group.items)
  .map((item) => item.href)
  .filter((path) => path !== "/guide/recherche");

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPaths = [
    "/",
    ...guidePaths,
    ...PLAYABLE_FACTIONS.map((faction) => `/guide/factions/${faction}`),
  ];

  return publicPaths.map((path, index) => ({
    url: getSiteUrl(path),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: index === 0 ? 1 : path === "/guide" ? 0.9 : 0.7,
  }));
}
