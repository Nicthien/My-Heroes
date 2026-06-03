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
  { path: "/dev/admin-observer", expect: { selector: "[data-testid='admin-observer-panel']", description: "Admin observer panel" } },
  { path: "/dev/sprites",      expect: { selector: "body",   description: "Sprite gallery body" } },
  { path: "/dev/map-showcase", expect: { selector: "body",   description: "Map showcase body" } },
  { path: "/dev/map-showcase?size=S", expect: { selector: "body", description: "Generated Phaser map showcase body" } },
  { path: "/dev/map-showcase?size=S&fog=partial", expect: { selector: "body", description: "Generated Phaser partial fog map showcase body" } },
  { path: "/dev/rmg",          expect: { selector: "body",   description: "RMG preview body" } },
  { path: "/dev/leaderboard",  expect: { selector: "body",   description: "Leaderboard preview body" } },
  { path: "/dev/ai",           expect: { selector: "[data-testid='ai-navigation-decisions']", description: "AI navigation decisions panel" } },
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

  test("combat town preview renders siege sprites", async ({ page }) => {
    await page.goto("/dev/combat", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Chateau" }).click();

    await expect(page.getByTestId("siege-overlay")).toBeAttached();
    await expect(page.locator('img[src*="/assets/sprites/map/wall-rampart-cube.png"]').first()).toBeVisible();
    await expect(page.locator('img[src*="/assets/sprites/map/gate-N-S.webp"]').first()).toBeVisible();
    await expect(page.locator('img[src*="/assets/sprites/siege/tower-castle-"]').first()).toBeVisible();
    await expect(page.locator('img[src*="/assets/sprites/siege/tower-castle-"]')).toHaveCount(2);
    await expect(page.locator('img[src*="/assets/sprites/siege/moat-castle.webp"]').first()).toBeVisible();
    await expect(page.getByTestId("combat-cell-7-6")).not.toHaveAttribute("data-terrain-feature", /.+/);
    await expect(page.getByTestId("combat-cell-7-6")).toHaveAttribute("data-siege-moat", "true");
    await expect(page.getByTestId("combat-cell-7-6").locator('img[src*="moat-castle.webp"]')).toBeVisible();
    await expect(page.getByTestId("combat-cell-7-6").locator('img[src*="water-tile-"]')).toHaveCount(0);
    await expect(page.getByTestId("combat-cell-8-2")).not.toHaveAttribute("data-terrain-feature", /.+/);
    await expect(page.getByTestId("combat-cell-7-9")).toHaveAttribute("data-siege-moat", "true");
    await expect(page.getByTestId("combat-cell-7-9").locator('img[src*="moat-castle.webp"]')).toBeVisible();

    const towerPlacement = await page.evaluate(() => {
      const towerRects = Array.from(document.querySelectorAll('img[src*="/assets/sprites/siege/tower-castle-"]')).map((img) => {
        const rect = img.getBoundingClientRect();
        return { centerX: rect.x + rect.width / 2, baseY: rect.y + rect.height };
      });
      const targetRects = [
        { wall: "8-3", rear: "9-3" },
        { wall: "8-7", rear: "9-7" },
      ].map(({ wall, rear }) => {
        const wallRect = document.querySelector(`[data-testid="combat-cell-${wall}"]`)?.getBoundingClientRect();
        const rearRect = document.querySelector(`[data-testid="combat-cell-${rear}"]`)?.getBoundingClientRect();
        return wallRect && rearRect
          ? {
              wallCenterX: wallRect.x + wallRect.width / 2,
              rearCenterX: rearRect.x + rearRect.width / 2,
              rearCenterY: rearRect.y + rearRect.height / 2,
            }
          : null;
      });
      return towerRects.map((tower, index) => {
        const target = targetRects[index];
        return target
          ? {
              afterWall: tower.centerX - target.wallCenterX,
              beforeRearCenter: target.rearCenterX - tower.centerX,
              baseDy: tower.baseY - target.rearCenterY,
            }
          : null;
      });
    });
    expect(towerPlacement).toHaveLength(2);
    for (const placement of towerPlacement) {
      expect(placement).not.toBeNull();
      expect(placement!.afterWall).toBeGreaterThan(20);
      expect(placement!.beforeRearCenter).toBeGreaterThan(20);
      expect(placement!.baseDy).toBeGreaterThanOrEqual(-24);
      expect(placement!.baseDy).toBeLessThanOrEqual(-8);
    }

    const siegeDepths = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-siege-depth-y]"))
        .map((element) => ({
          id: element.dataset.testid ?? "",
          y: Number(element.dataset.siegeDepthY),
          zIndex: Number(window.getComputedStyle(element).zIndex),
        }))
        .sort((a, b) => a.y - b.y || a.zIndex - b.zIndex)
    );
    expect(siegeDepths.length).toBeGreaterThan(4);
    for (let i = 0; i < siegeDepths.length; i++) {
      for (let j = i + 1; j < siegeDepths.length; j++) {
        if (siegeDepths[i].y < siegeDepths[j].y) {
          expect(siegeDepths[i].zIndex, `${siegeDepths[i].id} should render behind ${siegeDepths[j].id}`).toBeLessThan(siegeDepths[j].zIndex);
        }
      }
    }
  });

  test("combat naval preview floors the deck with ship planking", async ({ page }) => {
    await page.goto("/dev/combat", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Naval" }).click();

    // The naval theme is a fight on a ship's deck: every battle tile is floored
    // with the wooden deck planking texture, not the sandy coast textures.
    const deckTileCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("span"))
        .filter((span) => window.getComputedStyle(span).backgroundImage.includes("terrain/deck/deck-"))
        .length
    );
    expect(deckTileCount).toBeGreaterThan(0);
    await expect(page.locator('img[src*="naval-"]')).toHaveCount(2);
    await expect(page.locator('img[src*="boulder-cluster.webp"]')).toHaveCount(0);
    await expect(page.locator('img[src*="grass-bramble-mound.webp"]')).toHaveCount(0);
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

  test("admin observer can start an empty pending lobby from the center panel", async ({ page }) => {
    await page.goto("/dev/hud?status=pending&admin=1", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("pending-lobby-panel")).toBeVisible();
    await expect(page.getByTestId("start-game")).toBeVisible();
    await expect(page.getByText(/En attente que/i)).toHaveCount(0);
  });

  test("admin observer sees the minimap without being a player", async ({ page }) => {
    await page.goto("/dev/hud?admin=1", { waitUntil: "domcontentloaded" });

    await expect(page.locator('[aria-label^="Images par seconde:"]').first()).toBeVisible();
    await expect(page.getByLabel("Mini carte").first()).toBeVisible();
    await expect(page.getByText("Exploration : 100%").first()).toBeVisible();
    await expect(page.getByText("Observation", { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("end-turn")).toHaveCount(0);
    await expect(page.getByTestId("end-turn-mobile")).toHaveCount(0);
  });

  test("admin observer opens a hero sheet from the admin panel", async ({ page }) => {
    await page.goto("/dev/hud?admin=1", { waitUntil: "domcontentloaded" });

    await page.getByTestId("admin-observer-panel").getByRole("button", { name: /Aldric Niv\. 2/ }).click();

    await expect(page.getByText("Niveau 2 - XP 200")).toBeVisible();
    await expect(page.getByRole("button", { name: "Livre de sorts" })).toHaveCount(0);
  });

  test("minimap control overlay can be toggled", async ({ page }) => {
    await page.goto("/dev/hud", { waitUntil: "domcontentloaded" });

    await expect(page.getByLabel("Mini carte").first()).toBeVisible();
    await expect(page.locator('[data-testid="minimap-control-overlay"]').first()).toBeVisible();

    await page.getByTestId("minimap-control-toggle").first().click();
    await expect(page.locator('[data-testid="minimap-control-overlay"]')).toHaveCount(0);

    await page.getByTestId("minimap-control-toggle").first().click();
    await expect(page.locator('[data-testid="minimap-control-overlay"]').first()).toBeVisible();
  });

  test("desktop HUD overview uses tabs and saves draggable positions", async ({ page }) => {
    await page.goto("/dev/hud", { waitUntil: "domcontentloaded" });

    const overview = page.getByTestId("hud-overview-window");
    await expect(overview).toBeVisible();
    await expect(page.getByText("Carte").first()).toBeVisible();
    await expect(page.getByText("Joueurs").first()).toBeVisible();
    await expect(page.getByText("Leon").first()).toBeVisible();

    await overview.getByRole("button", { name: /Châteaux/ }).click();
    await expect(overview.getByText("Château Astral")).toBeVisible();
    await expect(overview.getByText("Aldric")).toHaveCount(0);

    await overview.getByRole("button", { name: /Mines/ }).click();
    await expect(overview.getByText("Mine d'or")).toBeVisible();
    await expect(overview.getByText("Château Astral")).toHaveCount(0);

    await overview.getByRole("button", { name: /Combats/ }).click();
    await expect(overview.getByText("Aucun combat actif.")).toBeVisible();

    await overview.getByRole("button", { name: /Journal/ }).click();
    await expect(overview.getByText("Leon Sticky-Fingers lance un combat contre des créatures.")).toBeVisible();
    const resourceEntry = overview.getByText("Leon Sticky-Fingers collecte des ressources.");
    await expect(resourceEntry).toBeVisible();
    await expect(overview.getByText("Leon Sticky-Fingers capture une mine.")).toBeVisible();
    await expect(overview.getByText("Le jour commence.")).toBeVisible();
    await expect(overview.getByText("Leon Sticky-Fingers déplace un héros.")).toHaveCount(0);
    await expect(overview.getByText("Adversaire termine son tour.")).toHaveCount(0);
    await expect(overview.getByText("actionType")).toHaveCount(0);
    await expect(resourceEntry.locator("xpath=ancestor::article")).toHaveAttribute("title", /Type : COLLECT_RESOURCE/);

    const before = await overview.boundingBox();
    expect(before).not.toBeNull();
    await page.mouse.move(before!.x + 30, before!.y + 16);
    await page.mouse.down();
    await page.mouse.move(before!.x - 90, before!.y + 60, { steps: 6 });
    await page.mouse.up();

    const moved = await overview.boundingBox();
    expect(moved).not.toBeNull();
    expect(Math.abs(moved!.x - before!.x)).toBeGreaterThan(40);

    await page.reload({ waitUntil: "domcontentloaded" });
    const restored = await page.getByTestId("hud-overview-window").boundingBox();
    expect(restored).not.toBeNull();
    expect(Math.abs(restored!.x - moved!.x)).toBeLessThan(8);

    await page.getByRole("button", { name: /Réinitialiser la position Suivi/ }).click();
    const reset = await page.getByTestId("hud-overview-window").boundingBox();
    expect(reset).not.toBeNull();
    expect(Math.abs(reset!.x - moved!.x)).toBeGreaterThan(40);
  });

  test("mobile HUD suivi exposes the player journal", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();
    await page.goto("/dev/hud", { waitUntil: "domcontentloaded" });

    await page.getByTestId("mobile-nav-actions").click();
    const drawer = page.getByTestId("mobile-hud-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Journal" }).click();
    await expect(drawer.getByText("Leon Sticky-Fingers collecte des ressources.")).toBeVisible();
    await expect(drawer.getByText("Leon Sticky-Fingers déplace un héros.")).toHaveCount(0);
    await expect(drawer.getByText("Adversaire termine son tour.")).toHaveCount(0);

    await context.close();
  });

  test("desktop HUD window follows a held drag smoothly", async ({ page }) => {
    await page.goto("/dev/hud", { waitUntil: "domcontentloaded" });
    const overview = page.getByTestId("hud-overview-window");
    await expect(overview).toBeVisible();

    await page.getByRole("button", { name: /Réinitialiser la position Suivi/ }).click();
    const start = await overview.boundingBox();
    expect(start).not.toBeNull();

    await page.mouse.move(start!.x + 48, start!.y + 18);
    await page.mouse.down();
    for (let index = 1; index <= 8; index += 1) {
      await page.mouse.move(start!.x + 48 - index * 16, start!.y + 18 - index * 9);
      const current = await overview.boundingBox();
      expect(current).not.toBeNull();
      expect(current!.x).toBeLessThan(start!.x + 4);
      expect(current!.y).toBeLessThan(start!.y + 4);
    }
    await page.mouse.up();

    const end = await overview.boundingBox();
    expect(end).not.toBeNull();
    expect(end!.x).toBeLessThan(start!.x - 90);
    expect(end!.y).toBeLessThan(start!.y - 55);
  });

  test("admin minimap shows fully controlled explored zones", async ({ page }) => {
    await page.goto("/dev/hud?admin=1", { waitUntil: "domcontentloaded" });

    await expect(page.getByLabel("Mini carte").first()).toBeVisible();
    await expect(page.locator('[data-testid="minimap-control-overlay"][opacity="0.9"]').first()).toBeVisible();
  });

  test("admin observer overlay groups map positions by player", async ({ page }) => {
    await page.goto("/dev/admin-observer?status=pending", { waitUntil: "domcontentloaded" });

    const panel = page.getByTestId("admin-observer-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Observation admin")).toBeVisible();
    await expect(panel.getByText("Leon Sticky-Fingers")).toBeVisible();
    await expect(panel.getByText("Heros (2)")).toBeVisible();
    await expect(panel.getByText("Chateaux (1)")).toBeVisible();
    await expect(panel.getByText("Mines (3)")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Demarrer" })).toHaveCount(0);
  });

  test("admin observer can collapse players and inspect the journal", async ({ page }) => {
    await page.goto("/dev/admin-observer", { waitUntil: "domcontentloaded" });

    const panel = page.getByTestId("admin-observer-panel");
    await panel.getByRole("button", { name: /Reduire Leon Sticky-Fingers/ }).click();
    await expect(panel.getByText("Heros (2)")).toHaveCount(0);

    await panel.getByRole("button", { name: "Journal" }).click();
    await expect(panel.getByText("Leon Sticky-Fingers déplace un héros.")).toBeVisible();
    await expect(panel.getByText("actionType")).toHaveCount(0);

    await panel.getByRole("button", { name: "Details" }).click();
    await expect(panel.getByText("actionType").first()).toBeVisible();
    await expect(panel.getByText("MOVE_HERO")).toBeVisible();
  });

  test("admin observer panel is draggable and resettable", async ({ page }) => {
    await page.goto("/dev/admin-observer", { waitUntil: "domcontentloaded" });

    const panel = page.getByTestId("admin-observer-panel");
    await expect(panel).toBeVisible();
    await page.getByRole("button", { name: "Reinitialiser la position du panneau admin" }).click();

    const start = await panel.boundingBox();
    expect(start).not.toBeNull();
    await page.mouse.move(start!.x + 80, start!.y + 16);
    await page.mouse.down();
    await page.mouse.move(start!.x + 180, start!.y + 86, { steps: 8 });
    await page.mouse.up();

    const moved = await panel.boundingBox();
    expect(moved).not.toBeNull();
    expect(moved!.x).toBeGreaterThan(start!.x + 80);
    expect(moved!.y).toBeGreaterThanOrEqual(start!.y);

    await page.reload({ waitUntil: "domcontentloaded" });
    const restored = await page.getByTestId("admin-observer-panel").boundingBox();
    expect(restored).not.toBeNull();
    expect(Math.abs(restored!.x - moved!.x)).toBeLessThan(8);

    await page.getByRole("button", { name: "Reinitialiser la position du panneau admin" }).click();
    const reset = await page.getByTestId("admin-observer-panel").boundingBox();
    expect(reset).not.toBeNull();
    expect(reset!.x).toBeLessThan(moved!.x - 80);
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

      await page.getByTestId("mobile-nav-heroes").dispatchEvent("click");
      await expect(drawer.getByText("Héros (2)")).toBeVisible();
      await expect(drawer.getByText("Châteaux (1)")).toHaveCount(0);
      await expect(drawer.getByText("Mines (3)")).toHaveCount(0);

      await page.getByTestId("mobile-nav-towns").dispatchEvent("click");
      await expect(drawer.getByText("Châteaux (1)")).toBeVisible();
      await expect(drawer.getByText("Héros (2)")).toHaveCount(0);
      await expect(drawer.getByText("Mines (3)")).toHaveCount(0);

      await page.getByTestId("mobile-nav-actions").dispatchEvent("click");
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
    await expect(page.getByRole("button", { name: "Défendre" })).toBeDisabled();
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

  test("AI dev page proves gate and boat navigation decisions", async ({ page }) => {
    await page.goto("/dev/ai", { waitUntil: "domcontentloaded" });

    const panel = page.getByTestId("ai-navigation-decisions");
    await expect(panel).toBeVisible();

    // The AI must descend through the subterranean gate, embark, and sail.
    await expect(page.getByTestId("ai-decision-subterranean-gate")).toHaveAttribute("data-objective-type", "level_transition");
    await expect(page.getByTestId("ai-decision-embark-boat")).toHaveAttribute("data-objective-type", "embark_boat");
    await expect(page.getByTestId("ai-decision-sail")).toHaveAttribute("data-decision-ok", "true");

    for (const id of ["subterranean-gate", "embark-boat", "sail"]) {
      await expect(page.getByTestId(`ai-decision-${id}`)).toHaveAttribute("data-decision-ok", "true");
    }

    // Loss-aware combat: lopsided win is cheap, even fight is flagged costly.
    await expect(page.getByTestId("ai-loss-awareness")).toBeVisible();
    await expect(page.getByTestId("ai-loss-lopsided")).toHaveAttribute("data-decision-ok", "true");
    await expect(page.getByTestId("ai-loss-even")).toHaveAttribute("data-decision-ok", "true");
  });

  test("dashboard leaderboard lists top players with ranks", async ({ page }) => {
    await page.goto("/dev/leaderboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Meilleurs joueurs")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Meilleur score" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Leon Sticky-Fingers" })).toBeVisible();
    await expect(page.getByText("🥇")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Joueur inconnu" })).toBeVisible();
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
