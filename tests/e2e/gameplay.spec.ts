import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const gameplayEmail = process.env.E2E_GAMEPLAY_EMAIL ?? process.env.PHASER_TEST_EMAIL;
const gameplayPassword = process.env.E2E_GAMEPLAY_PASSWORD ?? process.env.PHASER_TEST_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

test.skip(
  !gameplayEmail || !gameplayPassword || !supabaseUrl || !supabasePublishableKey,
  "Set gameplay credentials and local Supabase env vars, or run npm run test:e2e:gameplay.",
);

test.describe("Gameplay E2E", () => {
  test.setTimeout(120_000);

  test("creates, starts, renders, moves, and ends a turn in a real game", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const consoleLogs: string[] = [];

    page.on("console", (message) => {
      const text = message.text();
      consoleLogs.push(text);
      if (message.type() === "error" && !/favicon/i.test(text)) {
        consoleErrors.push(text);
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await login(page);
    await createSmallGame(page);
    await startPendingGame(page);
    await expectPlayableMap(page, consoleLogs);
    await moveHeroThroughActionApi(page);
    await dismissBlockingOverlays(page);
    await endTurn(page);

    expect(pageErrors, `uncaught page errors:\n${pageErrors.join("\n")}`).toEqual([]);
    expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
  });
});

async function login(page: Page) {
  const supabase = createClient(supabaseUrl!, supabasePublishableKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: gameplayEmail!,
    password: gameplayPassword!,
  });

  if (error || !data.session) {
    throw new Error(error?.message ?? "Unable to create Supabase gameplay session.");
  }

  await page.context().clearCookies();
  await page.context().addCookies(createSupabaseSessionCookies(data.session));

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Nouvelle partie" })).toBeVisible({ timeout: 30_000 });
}

async function createSmallGame(page: Page) {
  await page.getByRole("button", { name: "Nouvelle partie" }).click();
  await page.getByLabel("Nom").fill(`Gameplay E2E ${Date.now()}`);

  await page.getByRole("button", { name: /^S\s*36/i }).click();
  await page.locator("#max-players").selectOption("2");
  await page.locator("#seed").fill(`E2E${Date.now().toString(36).toUpperCase()}`);

  await page.getByTestId("create-game-submit").click();
  await page.waitForURL(/\/game\/[^/]+/, { timeout: 60_000 });
}

async function startPendingGame(page: Page) {
  await expect(page.getByTestId("pending-lobby-panel")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("progressbar", { name: "Chargement de la carte" })).toBeHidden({ timeout: 30_000 });
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("end-turn")).toBeVisible({ timeout: 40_000 });
}

async function expectPlayableMap(page: Page, consoleLogs: string[]) {
  await page.waitForSelector("canvas", { timeout: 30_000 });

  const canvas = page.locator("canvas").first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox, "expected Phaser canvas to have a box").not.toBeNull();
  expect(canvasBox!.width, "expected Phaser canvas to be visible").toBeGreaterThan(100);
  expect(canvasBox!.height, "expected Phaser canvas to be visible").toBeGreaterThan(100);

  await expect.poll(() => consoleLogs.some((text) => /Phaser v/i.test(text))).toBeTruthy();
  await expect(page.getByText(/À vous|Fin tour|Fin du tour/).first()).toBeVisible();
}

async function moveHeroThroughActionApi(page: Page) {
  const movementBefore = await readMovementLine(page);
  expect(movementBefore, "expected movement text before moving").not.toBeNull();
  if (!movementBefore) throw new Error("Expected movement text before moving.");

  const gameId = getGameIdFromUrl(page);
  const game = await fetchGameState(page, gameId);
  const player = findPlayablePlayer(game);
  const hero = player?.heroes?.[0];
  expect(hero, "expected the gameplay user to have a hero").toBeTruthy();
  if (!hero) throw new Error("Expected a hero to move.");

  const attempts = adjacentPositions(hero);
  const failures: string[] = [];
  for (const destination of attempts) {
    const response = await postGameAction(page, gameId, {
      type: "MOVE_HERO",
      heroId: hero.id,
      path: [
        { x: hero.x, y: hero.y },
        destination,
      ],
    });

    if (response.ok) {
      await expect.poll(() => readMovementLine(page), {
        message: "expected hero movement to change after API move",
        timeout: 10_000,
      }).not.toBe(movementBefore);
      return;
    }

    failures.push(`${destination.x},${destination.y}: ${response.error ?? response.status}`);
  }

  throw new Error(`Unable to move hero to an adjacent tile.\n${failures.join("\n")}`);
}

async function endTurn(page: Page) {
  await page.getByTestId("end-turn").click();
  await expect(page.getByText(/Tour terminé|À vous|Fin du tour|Fin tour/).first()).toBeVisible({ timeout: 20_000 });
}

async function dismissBlockingOverlays(page: Page) {
  const fleeButton = page.getByRole("button", { name: /Fuir/ });
  if (await fleeButton.isVisible().catch(() => false)) {
    await fleeButton.click();
    await expect(fleeButton).toHaveCount(0, { timeout: 10_000 });
  }

  const closeButtons = page.getByRole("button", { name: "Fermer" });
  const closeCount = await closeButtons.count();
  for (let index = 0; index < closeCount; index += 1) {
    const button = closeButtons.first();
    if (await button.isVisible().catch(() => false)) await button.click();
  }
}

async function readMovementLine(page: Page) {
  const bodyText = await page.locator("body").innerText();
  return bodyText.match(/MVT\s*:\s*[^\n]+/)?.[0]
    ?? bodyText.match(/Mouvement\s+\d+\s*\/\s*\d+/)?.[0]
    ?? null;
}

function createSupabaseSessionCookies(session: unknown) {
  const encoded = `base64-${stringToBase64Url(JSON.stringify(session))}`;
  const chunks = createCookieChunks("sb-127-auth-token", encoded);
  const url = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 3000}`;

  return chunks.map(({ name, value }) => ({
    name,
    value,
    url,
    sameSite: "Lax" as const,
    httpOnly: false,
    secure: false,
  }));
}

function createCookieChunks(key: string, value: string) {
  const maxChunkSize = 3180;
  const encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= maxChunkSize) return [{ name: key, value }];

  const chunks: string[] = [];
  let remaining = encodedValue;

  while (remaining.length > 0) {
    let encodedHead = remaining.slice(0, maxChunkSize);
    const lastEscapePos = encodedHead.lastIndexOf("%");
    if (lastEscapePos > maxChunkSize - 3) {
      encodedHead = encodedHead.slice(0, lastEscapePos);
    }
    chunks.push(decodeURIComponent(encodedHead));
    remaining = remaining.slice(encodedHead.length);
  }

  return chunks.map((chunk, index) => ({ name: `${key}.${index}`, value: chunk }));
}

function stringToBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getGameIdFromUrl(page: Page) {
  const match = page.url().match(/\/game\/([^/?#]+)/);
  if (!match) throw new Error(`Unable to read game id from URL: ${page.url()}`);
  return decodeURIComponent(match[1]);
}

async function fetchGameState(page: Page, gameId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/games/${id}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`GET /api/games/${id} failed: ${response.status}`);
    return response.json();
  }, gameId) as Promise<GameApiState>;
}

async function postGameAction(page: Page, gameId: string, action: Record<string, unknown>) {
  return page.evaluate(async ({ id, body }) => {
    const response = await fetch(`/api/games/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      error: typeof data?.error === "string" ? data.error : null,
    };
  }, { id: gameId, body: action });
}

function findPlayablePlayer(game: GameApiState) {
  return game.players.find((player) => player.id === game.currentTurnPlayerId && player.heroes.length > 0)
    ?? game.players.find((player) => !player.isAi && player.heroes.length > 0)
    ?? game.players.find((player) => player.heroes.length > 0)
    ?? null;
}

function adjacentPositions(hero: GameApiHero) {
  const offsets = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ];

  return offsets.map((offset) => ({ x: hero.x + offset.x, y: hero.y + offset.y }));
}

type GameApiState = {
  currentTurnPlayerId?: string;
  players: GameApiPlayer[];
};

type GameApiPlayer = {
  id: string;
  isAi?: boolean;
  heroes: GameApiHero[];
};

type GameApiHero = {
  id: string;
  x: number;
  y: number;
};
