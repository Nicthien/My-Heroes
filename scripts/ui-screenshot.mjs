import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

await mkdir("screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warning") console.log(`[${t}]`, msg.text());
});
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

console.log("→ goto /dev/hud");
await page.goto(`${BASE}/dev/hud`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.screenshot({ path: "screenshots/hud-1920-hero.png", fullPage: false });

// Click on the castle in side panel
// Measure topbar title vs retour button
const sizes = await page.evaluate(() => {
  const topbar = document.querySelector(".pointer-events-auto.absolute.top-0");
  const btn = topbar?.querySelector("button");
  const resourceBar = topbar?.querySelector('div[class*="grid-cols-2"]');
  const pill = resourceBar?.querySelector("span");
  return {
    topbar: topbar?.getBoundingClientRect(),
    button: btn?.getBoundingClientRect(),
    resourceBar: resourceBar?.getBoundingClientRect(),
    pill: pill?.getBoundingClientRect(),
  };
});
console.log("TOPBAR sizes:", JSON.stringify(sizes, null, 2));

await page.click('text=Château Astral');
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshots/hud-1920-town.png", fullPage: false });

await page.setViewportSize({ width: 1366, height: 768 });
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshots/hud-1366-town.png", fullPage: false });
const boxes2 = await page.evaluate(() => {
  const root = document.querySelector(".absolute.inset-0.pointer-events-none");
  return Array.from(root.children).map((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent ?? "").slice(0, 30) };
  });
});
console.log("1366 boxes:", JSON.stringify(boxes2, null, 2));

// Get the bounding boxes of all top-level HUD panels
const boxes = await page.evaluate(() => {
  const root = document.querySelector(".absolute.inset-0.pointer-events-none");
  if (!root) return { error: "HUD root not found" };
  const children = Array.from(root.children);
  return children.map((el, i) => {
    const r = el.getBoundingClientRect();
    return {
      i,
      tag: el.tagName,
      classes: el.className.split(/\s+/).slice(0, 6).join(" "),
      text: (el.textContent ?? "").slice(0, 60).replace(/\s+/g, " "),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
});
console.log("PANELS:\n", JSON.stringify(boxes, null, 2));

await browser.close();
console.log("done");
