import { GUIDE_NAV } from "@/components/guide/guideNav";
import { PLAYABLE_FACTIONS } from "@/lib/game/playable-factions";
import { getSiteUrl } from "@/lib/seo/site";

export const dynamic = "force-static";

const guidePaths = GUIDE_NAV.flatMap((group) => group.items)
  .map((item) => item.href)
  .filter((path) => path !== "/guide/recherche");

const publicPaths = [
  "/",
  ...guidePaths,
  ...PLAYABLE_FACTIONS.map((faction) => `/guide/factions/${faction}`),
];

function buildSitemapXml(): string {
  const entries = publicPaths
    .map((path) => `  <url><loc>${getSiteUrl(path)}</loc></url>`)
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</urlset>",
    "",
  ].join("\n");
}

export function GET() {
  const body = buildSitemapXml();

  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Length": String(new TextEncoder().encode(body).byteLength),
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
