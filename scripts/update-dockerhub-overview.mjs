// Pushes DOCKERHUB.md as the repository "Overview" (full_description) on Docker
// Hub. `docker push` only uploads the image — never the description — so run
// this after a push to keep the Hub page in sync with the repo.
//
// Usage:
//   DOCKERHUB_USERNAME=<user> DOCKERHUB_TOKEN=<password> npm run dockerhub:overview
//
// IMPORTANT: editing the repository Overview (full_description) needs an account
// password login — Docker Hub access tokens (PATs) push/pull images but return
// "403 insufficient scope" on this endpoint. So DOCKERHUB_TOKEN must be your
// account password (works only without 2FA). With 2FA, edit the Overview by
// hand on the website instead. Override the repo with DOCKERHUB_REPO
// (defaults to nicthien/my-heroes).

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.DOCKERHUB_REPO || "nicthien/my-heroes";
const username = process.env.DOCKERHUB_USERNAME;
const token = process.env.DOCKERHUB_TOKEN;

if (!username || !token) {
  console.error(
    "[dockerhub] Set DOCKERHUB_USERNAME and DOCKERHUB_TOKEN (a Docker Hub access token) and retry.",
  );
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
