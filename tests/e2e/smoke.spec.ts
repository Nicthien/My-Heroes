import { expect, test } from "@playwright/test";

test.describe("Smoke — auth pages render", () => {
  test("root redirects to /auth/login", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test("/auth/login displays the sign-in form", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { name: "My Heroes" })).toBeVisible();
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible();
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
});
