import { expect, test } from "@playwright/test";

test.describe("Smoke — auth pages render", () => {
  test("root renders the public landing page", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "My Heroes" })).toBeVisible();
  });

  test("/auth/login displays the sign-in form", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByLabel("Pseudo", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Essayer", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email ou pseudo")).toBeVisible();
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible();

    const guestBox = await page.locator("#guest-name").boundingBox();
    const loginBox = await page.locator("#login-email").boundingBox();
    expect(guestBox?.y).toBeLessThan(loginBox?.y ?? Number.POSITIVE_INFINITY);
  });

  test("/auth/login fits a compact desktop without vertical scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/auth/login");

    const layout = await page.evaluate(() => {
      const viewportHeight = window.innerHeight;
      const visibleControls = Array.from(
        document.querySelectorAll<HTMLElement>("main button, main a, main input, main h1, main h2"),
      ).filter((element) => element.getClientRects().length > 0);
      const clippedControls = visibleControls
        .map((element) => ({ label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.top < 0 || rect.bottom > viewportHeight)
        .map(({ label }) => label);
      const introColumn = document.querySelector<HTMLElement>("[data-testid='auth-intro-column']")?.getBoundingClientRect();
      const formColumn = document.querySelector<HTMLElement>("[data-testid='auth-form-column']")?.getBoundingClientRect();

      return {
        hasVerticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        clippedControls,
        bottomDelta: introColumn && formColumn ? Math.abs(introColumn.bottom - formColumn.bottom) : null,
        randomTileCount: document.querySelectorAll("[data-testid='auth-random-showcase'] > div").length,
      };
    });

    expect(layout.hasVerticalOverflow).toBe(false);
    expect(layout.clippedControls).toEqual([]);
    expect(layout.bottomDelta).toBeLessThanOrEqual(1);
    expect(layout.randomTileCount).toBe(4);
  });

  test("/auth/register displays the sign-up form", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.getByRole("heading", { name: /créer un compte/i })).toBeVisible();
    await expect(page.locator("#register-name")).toBeVisible();
  });

  test("login page links to register page", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("link", { name: /créer un compte/i }).click();
    await expect(page).toHaveURL(/\/auth\/register$/);
  });

  test("login page preserves an explicit English language choice", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem("my-heroes:language"))).toBe("en");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByLabel("Email or username")).toBeVisible();
  });
});

test.describe("Smoke — browser language detection", () => {
  test.use({ locale: "en-US" });

  test("/auth/login defaults to the browser language when no choice is saved", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem("my-heroes:language"))).toBeNull();
  });
});
