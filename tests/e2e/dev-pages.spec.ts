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
  { path: "/dev/hud-build",    expect: { selector: "body",   description: "HUD build preview body" } },
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
    await page.getByTestId("adventure-music-control").getByRole("button", { name: "Réglages audio" }).click();
    await expect(page.getByLabel("Muet")).toBeVisible();
    await expect(page.getByLabel("Musique aventure")).toBeVisible();
    await expect(page.getByLabel("Musique combat")).toBeVisible();
    await expect(page.getByLabel("Effets")).toBeVisible();

    await page.goto("/dev/combat", { waitUntil: "domcontentloaded" });
    await page.getByTestId("combat-audio-control").getByRole("button", { name: "Réglages audio" }).click();
    await expect(page.getByLabel("Muet")).toBeVisible();
    await expect(page.getByLabel("Musique aventure")).toBeVisible();
    await expect(page.getByLabel("Musique combat")).toBeVisible();
    await expect(page.getByLabel("Effets")).toBeVisible();
  });

  test("pending HUD lobby panel is centered", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/dev/hud?status=pending", { waitUntil: "domcontentloaded" });

    const lobbyTitle = page.getByText("Salle d'attente");
    await expect(lobbyTitle).toBeVisible();

    const panelBox = await page.getByTestId("pending-lobby-panel").boundingBox();
    expect(panelBox).not.toBeNull();

    const panelCenterX = panelBox!.x + panelBox!.width / 2;
    const panelCenterY = panelBox!.y + panelBox!.height / 2;
    expect(Math.abs(panelCenterX - 640)).toBeLessThanOrEqual(8);
    expect(Math.abs(panelCenterY - 360)).toBeLessThanOrEqual(8);
  });

  test("mobile HUD drawer filters heroes, towns, and actions", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto("/dev/hud", { waitUntil: "domcontentloaded" });
      const drawer = page.getByTestId("mobile-hud-drawer");

      await page.getByTestId("mobile-nav-heroes").click({ force: true });
      await expect(drawer.getByText("Héros (2)")).toBeVisible();
      await expect(drawer.getByText("Châteaux (1)")).toHaveCount(0);
      await expect(drawer.getByText("Mines (3)")).toHaveCount(0);

      await page.getByTestId("mobile-nav-towns").click({ force: true });
      await expect(drawer.getByText("Châteaux (1)")).toBeVisible();
      await expect(drawer.getByText("Héros (2)")).toHaveCount(0);
      await expect(drawer.getByText("Mines (3)")).toHaveCount(0);

      await page.getByTestId("mobile-nav-actions").click({ force: true });
      await expect(drawer.getByText("Mines (3)")).toBeVisible();
      await expect(drawer.getByText("Héros (2)")).toHaveCount(0);
      await expect(drawer.getByText("Châteaux (1)")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("spell books are available from HUD and combat previews", async ({ page }) => {
    await page.goto("/dev/hud", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Livre de sorts" }).click();
    const adventureSpellBook = page.getByRole("dialog", { name: "Livre de sorts - Aventure" });
    await expect(adventureSpellBook).toBeVisible();
    await expect(page.getByRole("button", { name: "Air" })).toBeVisible();
    await expect(page.getByText("Vue de l'air")).toBeVisible();
    await adventureSpellBook.getByRole("button", { name: "Fermer" }).click();

    await page.goto("/dev/combat", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Livre de sorts combat" }).click();
    await expect(page.getByRole("dialog", { name: "Livre de sorts - Combat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Feu" })).toBeVisible();
    await expect(page.getByText("Flèche magique")).toBeVisible();
  });

  test("combat tactics phase blocks regular combat actions", async ({ page }) => {
    await page.route("**/api/games/dev-combat-game/combats/dev-combat/action", async (route) => {
      const action = route.request().postDataJSON() as { type?: string; q?: number; r?: number };
      const tacticsActive = action.type !== "TACTICS_END";
      const currentUnitId = tacticsActive ? null : "atk-0";
      const unit = {
        id: "atk-0",
        unitType: "pikeman",
        count: 12,
        health: 120,
        maxHealth: 10,
        position: 0,
        ownerPlayerId: "p1",
        heroId: "h1",
        participantId: null,
        joinsRound: 1,
        speed: 6,
        minDamage: 1,
        maxDamage: 3,
        ranged: false,
        shots: 0,
        hasRetaliated: false,
        defended: false,
        waited: false,
        morale: 0,
        moraleApplied: false,
        moraleBonus: false,
        side: "attacker",
        q: action.type === "TACTICS_MOVE" ? action.q : 1,
        r: action.type === "TACTICS_MOVE" ? action.r : 0,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          combat: {
            id: "dev-combat",
            gameId: "dev-combat-game",
            mode: "MANUAL",
            status: "ACTIVE",
            attackerPlayerId: "p1",
            defenderPlayerId: "p2",
            attackerHeroId: "h1",
            defenderHeroId: "h2",
            neutralArmyId: null,
            currentPlayerId: currentUnitId ? "p1" : null,
            currentUnitId,
            round: 1,
            x: 4,
            y: 4,
            boardState: {
              units: [unit],
              terrain: [],
              ...(tacticsActive ? { tacticsPhase: { side: "attacker", maxColumn: 4 } } : {}),
            },
            turnQueue: ["atk-0"],
            actionLog: tacticsActive ? ["Phase de tactique."] : ["Phase de tactique.", "Phase de tactique terminée.", "Combat lance."],
            participants: [],
            reinforcementRequests: [],
            surrenderNegotiations: [],
            truces: [],
            result: null,
            visibility: "full",
          },
          result: null,
        }),
      });
    });
    await page.goto("/dev/combat", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Combat lance.")).toBeVisible();
    await page.getByRole("button", { name: "Tactique" }).click();

    await expect(page.getByRole("button", { name: "Phase de tactique", exact: true })).toBeVisible();
    await expect(page.getByText("Aucune unité sélectionnée")).toBeVisible();
    await expect(page.getByRole("button", { name: "Terminer la phase de tactique" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Attendre" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Defendre" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Fuir" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Livre de sorts combat" })).toBeDisabled();

    const unitBox = await page.getByTestId("combat-unit-atk-19").boundingBox();
    expect(unitBox).not.toBeNull();
    await page.mouse.click(unitBox!.x + unitBox!.width / 2, unitBox!.y + unitBox!.height / 2);
    await expect(page.locator('[data-tactics-selected="true"]')).toHaveCount(1);
    await expect(page.locator('[data-tactics-destination="true"]')).not.toHaveCount(0);
    await page.getByTestId("combat-cell-2-0").click();
    await expect(page.locator('[data-tactics-selected="true"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Terminer la phase de tactique" }).click();
    await expect(page.getByRole("button", { name: "Attendre" })).toBeEnabled();
  });

  test("town build tree modal shows construction dependencies", async ({ page }) => {
    await page.goto("/dev/hud-build", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Construire" }).first().click();
    await page.getByRole("button", { name: "Arbre des constructions" }).click();

    const buildTree = page.getByRole("dialog", { name: "Arbre des constructions" });
    await expect(buildTree).toBeVisible();
    await expect(buildTree.getByRole("heading", { name: "Guilde des mages (niveau 1)" })).toBeVisible();
    await expect(buildTree.getByRole("heading", { name: "Guilde des mages (niveau 2)" })).toBeVisible();
    await expect(buildTree.getByRole("heading", { name: "Guilde des mages (niveau 3)" })).toBeVisible();
    await expect(buildTree.getByRole("button", { name: "Construire" }).first()).toBeVisible();
  });
});

const MOBILE_VIEWPORTS = [
  { name: "phone portrait 390", width: 390, height: 844 },
  { name: "phone landscape 844", width: 844, height: 390 },
  { name: "phone portrait 430", width: 430, height: 932 },
  { name: "phone landscape 932", width: 932, height: 430 },
];

test.describe("Mobile smoke - core screens stay usable", () => {
  for (const viewport of MOBILE_VIEWPORTS) {
    test(`/auth/login fits ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      try {
        await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "My Heroes" })).toBeVisible();
        await expect(page.locator("#login-email")).toBeVisible();
        await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible();
        await expectNoHorizontalOverflow(page);
      } finally {
        await context.close();
      }
    });

    for (const path of ["/dev/hud", "/dev/hud-build", "/dev/combat", "/dev/map-showcase"]) {
      test(`${path} supports ${viewport.name}`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        try {
          await page.goto(path, { waitUntil: "domcontentloaded" });
          await expect(page.locator("body")).toBeVisible();
          await page.waitForTimeout(1000);
          await expectNoHorizontalOverflow(page);

          if (path === "/dev/hud" || path === "/dev/hud-build") {
            await expect(page.getByTestId("end-turn-mobile")).toBeVisible();
            await page.getByRole("button", { name: "Carte" }).click();
            await expect(page.getByLabel("Mini carte").last()).toBeVisible();
          }
        } finally {
          await context.close();
        }
      });
    }
  }
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth;
    const viewportWidth = document.documentElement.clientWidth;
    return documentWidth - viewportWidth;
  });
  expect(overflow).toBeLessThanOrEqual(2);
}
