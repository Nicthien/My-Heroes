import { chromium, expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const gameplayEmail = process.env.E2E_GAMEPLAY_EMAIL ?? process.env.PHASER_TEST_EMAIL;
const gameplayPassword = process.env.E2E_GAMEPLAY_PASSWORD ?? process.env.PHASER_TEST_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:48324";

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

  test("guest creates a temporary game and another guest joins it", async ({ page: hostPage }) => {
    // A separate browser process models a second player/device and avoids the
    // origin-wide Web Lock intentionally used by Supabase Auth within one browser.
    const guestBrowser = await chromium.launch();
    const guestContext = await guestBrowser.newContext({ locale: "fr-FR" });
    const guestPage = await guestContext.newPage();
    const suffix = Date.now().toString(36);
    const hostName = `Invite Hote ${suffix}`;
    const guestName = `Invite Ami ${suffix}`;

    try {
      await startGuestSession(hostPage, hostName);
      await expectGuestProfilePolicies(hostPage, hostName);
      const beforeConversion = await readCurrentProfile(hostPage);
      await expect(hostPage.getByRole("heading", { name: /créer une partie/i })).toBeVisible({ timeout: 30_000 });
      await createSmallGame(hostPage, true, `Essai E2E ${suffix}`);
      await expect(hostPage.getByText("Partie temporaire", { exact: true })).toBeVisible({ timeout: 30_000 });
      const gameUrl = hostPage.url();
      const secondGameResponse = await hostPage.request.post("/api/games", { data: {} });
      expect(secondGameResponse.status()).toBe(409);
      expect((await secondGameResponse.json()).gameId).toBe(new URL(gameUrl).pathname.split("/").pop());

      await startGuestSession(guestPage, guestName);
      await expect(guestPage.getByRole("heading", { name: /créer une partie/i })).toBeVisible({ timeout: 30_000 });
      await guestPage.getByRole("button", { name: "Annuler", exact: true }).first().click();
      await guestPage.getByRole("button", { name: "Rejoindre", exact: true }).first().click();
      await guestPage.getByRole("button", { name: "Suivant", exact: true }).click();
      await expect(guestPage.getByText(`Essai E2E ${suffix}`, { exact: true })).toBeVisible({ timeout: 30_000 });
      await guestPage.getByRole("button", { name: "Rejoindre", exact: true }).last().click();
      await guestPage.waitForURL(gameUrl, { timeout: 60_000 });
      await expect(guestPage.getByText("Partie temporaire", { exact: true })).toBeVisible({ timeout: 30_000 });

      await hostPage.getByRole("button", { name: "menu", exact: true }).click();
      await hostPage.getByRole("menuitem", { name: "Créer un compte et conserver la partie", exact: true }).click();
      const conversionEmail = `invite-${suffix}@myheroes.local`;
      await hostPage.getByLabel("Email", { exact: true }).fill(conversionEmail);
      await hostPage.getByLabel("Mot de passe", { exact: true }).fill("GuestPass123!");
      await hostPage.getByLabel("Confirmer le mot de passe", { exact: true }).fill("GuestPass123!");
      await hostPage.getByRole("button", { name: "Créer le compte", exact: true }).click();
      await expect(hostPage.getByText(/Vérifiez votre email pour rendre la partie permanente/i)).toBeVisible();

      const confirmationToken = await readMailpitConfirmationToken(conversionEmail);
      const confirmationResponse = await hostPage.request.post("/api/auth/confirm", {
        data: { token: confirmationToken },
      });
      expect(confirmationResponse.ok(), await confirmationResponse.text()).toBe(true);
      const convertedSession = await signInConvertedGuest(conversionEmail, "GuestPass123!");
      const databaseProfile = await readProfileByName(hostName);
      const databaseGame = await readGameByName(`Essai E2E ${suffix}`);
      expect(convertedSession.user.id).toBe(beforeConversion.id);
      expect(databaseProfile?.id).toBe(beforeConversion.id);
      expect(databaseProfile?.is_guest).toBe(false);
      expect(databaseGame?.is_ephemeral).toBe(false);
    } finally {
      await guestContext.close();
      await guestBrowser.close();
      await cleanupGuestGameplayData(`Essai E2E ${suffix}`, [hostName, guestName]);
    }
  });
});

async function readCurrentProfile(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/profile", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`Profile request failed: ${response.status}`);
    return response.json() as Promise<{ id: string; isGuest: boolean }>;
  });
}

async function cleanupGuestGameplayData(gameName: string, names: string[]) {
  if (!supabaseServiceRoleKey || !supabaseUrl) return;
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
  await admin.from("games").delete().eq("name", gameName);
  const { data: profiles } = await admin.from("profiles").select("id").in("name", names);
  for (const profile of profiles ?? []) await admin.auth.admin.deleteUser(profile.id);
}

async function readProfileByName(name: string) {
  if (!supabaseServiceRoleKey || !supabaseUrl) return null;
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await admin.from("profiles").select("id,is_guest").eq("name", name).maybeSingle();
  if (error) throw error;
  return data;
}

async function readGameByName(name: string) {
  if (!supabaseServiceRoleKey || !supabaseUrl) return null;
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await admin.from("games").select("is_ephemeral").eq("name", name).maybeSingle();
  if (error) throw error;
  return data;
}

async function readMailpitConfirmationToken(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const listResponse = await fetch(`${mailpitUrl}/api/v1/messages?limit=100`);
    if (!listResponse.ok) throw new Error(`Mailpit list failed: ${listResponse.status}`);
    const list = await listResponse.json() as {
      messages?: Array<{ ID: string; To?: Array<{ Address?: string }> }>;
    };
    const message = list.messages?.find((entry) =>
      entry.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()),
    );
    if (message) {
      const detailResponse = await fetch(`${mailpitUrl}/api/v1/message/${encodeURIComponent(message.ID)}`);
      if (!detailResponse.ok) throw new Error(`Mailpit message failed: ${detailResponse.status}`);
      const detail = await detailResponse.json() as { Text?: string; HTML?: string };
      const match = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.match(/[?&]token=([^\s&"'<>]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No confirmation email received for ${email}.`);
}

async function signInConvertedGuest(email: string, password: string) {
  const supabase = createClient(supabaseUrl!, supabasePublishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(error?.message ?? "Converted guest could not sign in.");
  return data;
}

async function expectGuestProfilePolicies(page: Page, existingName: string) {
  const origin = new URL(page.url()).origin;
  const permanentClient = createClient(supabaseUrl!, supabasePublishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const permanentSignIn = await permanentClient.auth.signInWithPassword({
    email: gameplayEmail!,
    password: gameplayPassword!,
  });
  if (permanentSignIn.error || !permanentSignIn.data.session) {
    throw new Error(permanentSignIn.error?.message ?? "Permanent E2E account could not sign in.");
  }
  const permanentResponse = await fetch(`${origin}/api/auth/guest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${permanentSignIn.data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: `Permanent ${Date.now()}`, language: "fr" }),
  });
  expect(permanentResponse.status).toBe(403);

  const releasableName = `Invite Libere ${Date.now()}`;
  const releasableClient = createClient(supabaseUrl!, supabasePublishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const releasableSignIn = await releasableClient.auth.signInAnonymously();
  if (releasableSignIn.error || !releasableSignIn.data.session) {
    throw new Error(releasableSignIn.error?.message ?? "Releasable guest could not sign in.");
  }
  const releasableToken = releasableSignIn.data.session.access_token;
  const createReleasableResponse = await postGuestRequest(origin, "/api/auth/guest", releasableToken, {
    name: releasableName,
    language: "fr",
  });
  expect(createReleasableResponse.status).toBe(201);
  const releaseResponse = await postGuestRequest(origin, "/api/auth/guest/logout", releasableToken);
  expect(releaseResponse.status).toBe(200);
  expect((await releaseResponse.json()).released).toBe(true);

  const replacementClient = createClient(supabaseUrl!, supabasePublishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const replacementSignIn = await replacementClient.auth.signInAnonymously();
  if (replacementSignIn.error || !replacementSignIn.data.session) {
    throw new Error(replacementSignIn.error?.message ?? "Replacement guest could not sign in.");
  }
  const replacementToken = replacementSignIn.data.session.access_token;
  const replacementResponse = await postGuestRequest(origin, "/api/auth/guest", replacementToken, {
    name: releasableName,
    language: "fr",
  });
  expect(replacementResponse.status).toBe(201);
  await postGuestRequest(origin, "/api/auth/guest/logout", replacementToken);

  const anonymousClient = createClient(supabaseUrl!, supabasePublishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonymousSignIn = await anonymousClient.auth.signInAnonymously();
  if (anonymousSignIn.error || !anonymousSignIn.data.session) {
    throw new Error(anonymousSignIn.error?.message ?? "Duplicate-name guest could not sign in.");
  }
  const duplicateResponse = await fetch(`${origin}/api/auth/guest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonymousSignIn.data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: existingName.toUpperCase(), language: "fr" }),
  });
  expect(duplicateResponse.status).toBe(409);
}

function postGuestRequest(origin: string, path: string, token: string, body?: Record<string, unknown>) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function startGuestSession(page: Page, name: string) {
  await disablePerformanceWarning(page);
  const supabase = createClient(supabaseUrl!, supabasePublishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { name } } });
  if (error || !data.session) throw new Error(error?.message ?? "Unable to create anonymous Supabase session.");

  await page.context().clearCookies();
  await page.context().addCookies(createSupabaseSessionCookies(data.session));
  const profileResponse = await page.request.post("/api/auth/guest", {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    data: { name, language: "fr" },
  });
  if (!profileResponse.ok()) throw new Error(`Guest profile failed (${profileResponse.status()}): ${await profileResponse.text()}`);

  await page.goto("/dashboard?create=1", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard\?create=1|\/dashboard$/, { timeout: 30_000 });
  await dismissPerformanceWarning(page);
}

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
  await disablePerformanceWarning(page);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Nouvelle partie" })).toBeVisible({ timeout: 30_000 });
  await dismissPerformanceWarning(page);
}

async function createSmallGame(page: Page, wizardAlreadyOpen = false, gameName = `Gameplay E2E ${Date.now()}`) {
  if (!wizardAlreadyOpen) await page.getByRole("button", { name: "Nouvelle partie" }).click();
  const nextButton = page.getByRole("button", { name: "Suivant", exact: true });
  if (await nextButton.isVisible().catch(() => false)) await nextButton.click();
  await page.getByLabel("Nom").fill(gameName);

  await page.getByRole("button", { name: /^S\s*36/i }).click();
  await page.locator("#max-players").selectOption("2");
  await page.locator("#seed").fill(`E2E${Date.now().toString(36).toUpperCase()}`);

  await page.getByTestId("create-game-submit").click();
  await page.waitForURL(/\/game\/[^/]+/, { timeout: 60_000 });
}

async function dismissPerformanceWarning(page: Page) {
  const modal = page.getByTestId("perf-warning-modal");
  if (await modal.isVisible().catch(() => false)) {
    await modal.getByRole("button", { name: "Ne plus afficher", exact: true }).click();
  }
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
        // The fallback sync interval is 10 seconds; allow one full interval plus
        // network/render settling on software-rendered CI browsers.
        timeout: 20_000,
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
  const rulesDismiss = page.getByTestId("game-rules-dismiss");
  if (await rulesDismiss.isVisible().catch(() => false)) await rulesDismiss.click();

  const tutorialSkip = page.getByTestId("tutorial-skip");
  if (await tutorialSkip.isVisible().catch(() => false)) await tutorialSkip.click();

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

async function disablePerformanceWarning(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("my-heroes:dashboard:perf-warning-dismissed", "true");
  });
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
