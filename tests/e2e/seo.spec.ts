import { expect, test } from "@playwright/test";

const SITE_ORIGIN = "https://myheroes.nthstudio.eu";

const INDEXABLE_PATHS = [
  "/",
  "/guide",
  "/guide/debuter",
  "/guide/ressources",
  "/guide/villes",
  "/guide/heros",
  "/guide/combat",
  "/guide/carte",
  "/guide/factions",
  "/guide/creatures",
  "/guide/artefacts",
  "/guide/competences",
  "/guide/sorts",
  "/guide/mecaniques",
  "/guide/glossaire",
  "/guide/factions/castle",
  "/guide/factions/rampart",
  "/guide/factions/tower",
  "/guide/factions/inferno",
  "/guide/factions/necropolis",
  "/guide/factions/dungeon",
  "/guide/factions/stronghold",
  "/guide/factions/fortress",
] as const;

test.describe("Public SEO surface", () => {
  test("landing page is indexable and exposes complete metadata", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "My Heroes", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Jouer gratuitement" })).toHaveAttribute("href", "/auth/login");
    await expect(page.getByRole("link", { name: "Consulter le guide" })).toHaveAttribute("href", "/guide");
    await expect(page.getByText("Tous les ingrédients d'une grande aventure stratégique")).toBeVisible();

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", SITE_ORIGIN);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", SITE_ORIGIN);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${SITE_ORIGIN}/assets/banners/my-heroes-banner.png`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);

    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(jsonLd).not.toBeNull();
    const structuredData = JSON.parse(jsonLd!);
    expect(structuredData["@graph"].map((entry: { "@type": string }) => entry["@type"])).toEqual([
      "WebSite",
      "VideoGame",
    ]);
  });

  test("guide pages declare self-referencing canonicals", async ({ page }) => {
    for (const path of ["/guide/combat", "/guide/factions/necropolis"]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_ORIGIN}${path}`);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);
    }
  });

  test("private and utility pages stay out of the index", async ({ page }) => {
    for (const path of ["/auth/login", "/dashboard", "/game/seo-check", "/dev/sprites"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }

    await page.goto("/guide/recherche", { waitUntil: "domcontentloaded" });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /follow/);
  });

  test("robots.txt allows public content and advertises the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");

    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /dev/");
    expect(body).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(body).not.toContain("Disallow: /auth/");
    expect(body).not.toContain("Disallow: /dashboard");
    expect(body).not.toContain("Disallow: /game/");
  });

  test("sitemap.xml contains exactly the 23 public canonical URLs", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/xml");

    const body = await response.text();
    const locations = Array.from(body.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
    expect(locations).toEqual(INDEXABLE_PATHS.map((path) => `${SITE_ORIGIN}${path === "/" ? "/" : path}`));
    expect(locations).toHaveLength(23);
    for (const excluded of ["/auth/", "/dashboard", "/game/", "/api/", "/dev/", "/guide/recherche"]) {
      expect(body).not.toContain(excluded);
    }
    expect(body).not.toContain("<lastmod>");
  });

  test("landing page fits a 390px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "My Heroes", exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
