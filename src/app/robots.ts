import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dev/"],
    },
    sitemap: getSiteUrl("/sitemap.xml"),
    host: getSiteUrl("/").replace(/\/$/, ""),
  };
}
