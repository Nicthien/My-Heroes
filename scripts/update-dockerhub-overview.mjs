// Pushes DOCKERHUB.md as the repository "Overview" (full_description) on Docker
// Hub. `docker push` only uploads the image — never the description — so run
// this after a push to keep the Hub page in sync with the repo.
//
// Credentials come from the environment or, if absent, from a local
// `.env.dockerhub` file at the repo root (gitignored via the `.env*` rule — it
// is NEVER committed, even by `git add -A`). Format:
//   DOCKERHUB_USERNAME=nicthien
//   DOCKERHUB_TOKEN=<token-or-password>
// Override the file path with DOCKERHUB_ENV_FILE.
//
// Usage:
//   npm run dockerhub:overview            # reads .env.dockerhub
//   DOCKERHUB_USERNAME=... DOCKERHUB_TOKEN=... npm run dockerhub:overview
//
// IMPORTANT: editing the Overview (full_description) needs write scope. A
// Docker Hub PAT with **Read/Write/Delete** usually works; a read-only token
// returns "403 insufficient scope". If a full-scope PAT still 403s, the account
// password works (only without 2FA). Prefer a revocable PAT over the password.
// Override the repo with DOCKERHUB_REPO (defaults to nicthien/my-heroes).

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load creds from a gitignored file when not provided via the environment.
function loadCredsFile() {
  const path = process.env.DOCKERHUB_ENV_FILE || join(root, ".env.dockerhub");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadCredsFile();

const REPO = process.env.DOCKERHUB_REPO || "nicthien/my-heroes";
const username = process.env.DOCKERHUB_USERNAME;
const token = process.env.DOCKERHUB_TOKEN;

if (!username || !token) {
  console.error(
    "[dockerhub] No credentials. Create .env.dockerhub (DOCKERHUB_USERNAME / DOCKERHUB_TOKEN) " +
      "or pass them as env vars, then retry.",
  );
  process.exit(1);
}
const fullDescription = await readFile(join(root, "DOCKERHUB.md"), "utf8");

// Docker Hub caps full_description at 25000 characters.
if (fullDescription.length > 25000) {
  console.error(`[dockerhub] DOCKERHUB.md is ${fullDescription.length} chars (max 25000).`);
  process.exit(1);
}

const login = await fetch("https://hub.docker.com/v2/users/login/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password: token }),
});
if (!login.ok) {
  console.error("[dockerhub] Login failed:", login.status, await login.text());
  process.exit(1);
}
const { token: jwt } = await login.json();

const res = await fetch(`https://hub.docker.com/v2/repositories/${REPO}/`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Authorization: `JWT ${jwt}` },
  body: JSON.stringify({ full_description: fullDescription }),
});
if (!res.ok) {
  console.error("[dockerhub] Update failed:", res.status, await res.text());
  process.exit(1);
}

console.log(`[dockerhub] Overview updated for ${REPO} (${fullDescription.length} chars).`);
