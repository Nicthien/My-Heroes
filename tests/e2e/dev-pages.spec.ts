import { expect, test } from "@playwright/test";

/**
 * Smoke coverage for the /dev/* preview pages.
 *
 * These pages exercise the heaviest rendering components (HUD, CombatScreen,
 * PhaserMapRenderer, sprite assets) with mocked state — so making sure they
 * render without runtime errors gives a cheap safety net for refactors in:
 *   - src/components/game/hud/HUD.tsx
 *   - src/components/game/combat/CombatScreen.tsx
 *   - src/lib/rendering/phaser/PhaserMapRenderer.ts
 *   - src/lib/rendering/phaser/assets.ts
 *   - src/lib/game/engine/* (via /dev/rmg)
 */

type DevPage = {
  path: string;
  expect: { selector: string; description: string };
};

const DEV_PAGES: DevPage[] = [
  { path: "/dev/hud",          expect: { selector: "body",   description: "HUD preview body" } },
  { path: "/dev/combat",       expect: { selector: "body",   description: "Combat preview body" } },
  { path: "/dev/sprites",      expect: { selector: "body",   description: "Sprite gallery body" } },
  { path: "/dev/map-showcase", expect: { selector: "body",   description: "Map showcase body" } },
  { path: "/dev/rmg",          expect: { selector: "body",   description: "RMG preview body" } },
];

test.describe("Smoke — /dev/* preview pages render without errors", () => {
  for (const devPage of DEV_PAGES) {
    test(`${devPage.path} renders without runtime errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      const IGNORED_PATTERNS = [
        /supabase/i,
        /fetch/i,
        /network/i,
        /cors/i,
        /failed to load resource/i, // Static asset 401/403/404 against placeholder Supabase
        /the server responded with a status of (401|403|404)/i,
      ];

      page.on("console", (message) => {
        if (message.type() === "error") {
          const text = message.text();
          if (IGNORED_PATTERNS.some((rx) => rx.test(text))) return;
          consoleErrors.push(text);
        }
      });
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });

      const response = await page.goto(devPage.path, { waitUntil: "domcontentloaded" });
      expect(response, `expected a response for ${devPage.path}`).not.toBeNull();
      expect(response!.status(), `unexpected status for ${devPage.path}`).toBeLessThan(400);

      await expect(page.locator(devPage.expect.selector)).toBeVisible();

      // Give async loaders (Phaser, sprite preloads) a brief window to fail loudly.
      await page.waitForTimeout(1500);

      expect(pageErrors, `uncaught page errors on ${devPage.path}:\n${pageErrors.join("\n")}`).toEqual([]);
      expect(consoleErrors, `console errors on ${devPage.path}:\n${consoleErrors.join("\n")}`).toEqual([]);
    });
  }

  test("audio settings popup is available from HUD and combat previews", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("my-heroes:audio:muted", "true");
    });

    await page.goto("/dev/hud", { waitUntil: "domcontentloaded" });
    await page.getByTestId("adventure-music-control").getByRole("button", { name: "Reglages audio" }).click();
    await expect(page.getByLabel("Muet")).toBeVisible();
    await expect(page.getByLabel("Musique aventure")).toBeVisible();
    await expect(page.getByLabel("Musique combat")).toBeVisible();
    await expect(page.getByLabel("Effets")).toBeVisible();

    await page.goto("/dev/combat", { waitUntil: "domcontentloaded" });
    await page.getByTestId("combat-audio-control").getByRole("button", { name: "Reglages audio" }).click();
    await expect(page.getByLabel("Muet")).toBeVisible();
    await expect(page.getByLabel("Musique aventure")).toBeVisible();
    await expect(page.getByLabel("Musique combat")).toBeVisible();
    await expect(page.getByLabel("Effets")).toBeVisible();
  });
});
