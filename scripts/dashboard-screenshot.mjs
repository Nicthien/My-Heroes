import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
await mkdir("screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/dev/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "screenshots/dashboard-1920.png", fullPage: false });
console.log("→ dashboard captured");

await page.click('text=Nouvelle partie');
await page.waitForTimeout(400);
await page.screenshot({ path: "screenshots/dashboard-create.png", fullPage: false });
console.log("→ create dialog");

await page.click('text=Annuler');
await page.click('text=Rejoindre');
await page.waitForTimeout(400);
await page.screenshot({ path: "screenshots/dashboard-join.png", fullPage: false });
console.log("→ join dialog");

await browser.close();
