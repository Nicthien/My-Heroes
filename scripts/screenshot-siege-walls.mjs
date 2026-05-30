import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

await mkdir("screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(`${BASE}/dev/combat`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.click('button:has-text("Chateau")');
await page.waitForTimeout(1200);

// Zoom in maximally to see walls clearly
const zoomBtn = page.locator('button[aria-label="Zoom avant"]');
for (let i = 0; i < 6; i++) {
  await zoomBtn.click();
  await page.waitForTimeout(150);
}

await page.screenshot({ path: "screenshots/siege-zoomed.png", fullPage: false });
console.log("→ zoomed saved");

await browser.close();
