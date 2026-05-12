import { chromium } from "playwright";

const baseUrl = process.env.PHASER_TEST_BASE_URL ?? "http://localhost:3000";
const email = process.env.PHASER_TEST_EMAIL;
const password = process.env.PHASER_TEST_PASSWORD;

if (!email || !password) {
  console.error("Missing PHASER_TEST_EMAIL or PHASER_TEST_PASSWORD.");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
const pageErrors = [];

page.on("console", (message) => {
  logs.push({ type: message.type(), text: message.text() });
});
page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});

try {
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Nouvelle partie" }).click();
  await page.getByLabel("Nom").fill(`Validation Phaser ${Date.now()}`);
  await page.getByTestId("create-game-submit").click();
  await page.waitForURL("**/game/**", { timeout: 40_000 });
  await page.waitForLoadState("networkidle");

  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.getByTestId("start-game").click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2_000);

  const canvas = page.locator("canvas").first();
  const canvasCount = await page.locator("canvas").count();
  const canvasBox = await canvas.boundingBox();

  const bodyTextBeforeMove = await page.locator("body").innerText();
  const movementBefore = bodyTextBeforeMove.match(/MVT\s*:\s*[^\n]+/)?.[0] ?? null;

  await page.mouse.click(760, 500);
  await page.waitForTimeout(500);
  await page.mouse.click(760, 500);
  await page.waitForTimeout(2_000);

  const bodyTextAfterMove = await page.locator("body").innerText();
  const movementAfter = bodyTextAfterMove.match(/MVT\s*:\s*[^\n]+/)?.[0] ?? null;

  await page.getByTestId("end-turn").click();
  await page.waitForTimeout(1_000);

  const bodyTextAfterEndTurn = await page.locator("body").innerText();
  const endTurnConfirmed = bodyTextAfterEndTurn.includes("Tour terminé") ||
    bodyTextAfterEndTurn.includes("À vous de jouer") ||
    bodyTextAfterEndTurn.includes("Fin du tour");

  await page.screenshot({ path: "phaser-active-validation.png", fullPage: false });

  const consoleErrors = logs
    .filter((item) => item.type === "error")
    .map((item) => item.text)
    .filter((text) => !text.includes("favicon"));

  const result = {
    url: page.url(),
    canvasCount,
    canvasBox,
    phaserStarted: logs.some((item) => item.text.includes("Phaser v4.1.0")),
    consoleErrors: consoleErrors.map((text) => text.slice(0, 500)),
    pageErrors,
    hasActiveStatus: bodyTextAfterMove.includes("À vous de jouer") || bodyTextAfterMove.includes("Fin du tour"),
    movementBefore,
    movementAfter,
    movementChanged: Boolean(movementBefore && movementAfter && movementBefore !== movementAfter),
    endTurnConfirmed,
    screenshot: "phaser-active-validation.png",
  };

  console.log(JSON.stringify(result, null, 2));

  if (canvasCount < 1) throw new Error("No canvas rendered on the game page.");
  if (!canvasBox || canvasBox.width < 100 || canvasBox.height < 100) {
    throw new Error("Canvas is missing or too small.");
  }
  if (!result.phaserStarted) throw new Error("Phaser startup log was not found.");
  if (!result.hasActiveStatus) throw new Error("The game did not reach the active turn UI.");
  if (!result.movementChanged) throw new Error("The Phaser map click did not move the selected hero.");
  if (!result.endTurnConfirmed) throw new Error("The end-turn UI did not confirm a completed turn.");
  if (consoleErrors.length > 0) throw new Error(`Console errors detected: ${consoleErrors.join("\n")}`);
  if (pageErrors.length > 0) throw new Error(`Page errors detected: ${pageErrors.join("\n")}`);
} finally {
  await browser.close();
}
