# Release (Docker)

**My Heroes** is a web app (Next.js + Supabase), so there is no `.exe`. A
"release" is the running server. Two pieces must be deployed together:

1. **The app** — the Next.js server, packaged as the `my-heroes` Docker image.
2. **Supabase** — Postgres + Auth + Realtime, which the app depends on for
   everything (auth, game state, realtime sync). This is a *separate* stack.

The repo ships the app side: [`Dockerfile`](Dockerfile) (multi-stage, Node 24,
standalone output) and [`docker-compose.yml`](docker-compose.yml). You provide
Supabase via one of the options below.

> ✅ The image is **generic**: nothing is baked at build. All config (Supabase
> URL, anon key, service key) is read at **runtime** from the container env (see
> `src/lib/config/supabaseEnv.ts`; the public subset is injected to the browser
> by `RuntimeConfigScript`). So one published image works for any deployment, and
> no IP or key is ever compiled in. No build args are needed.

---

## v1.4.1 - 2026-08-17

### Highlights

- `/sitemap.xml` now uses a dedicated, statically generated XML response with
  an explicit content length instead of a chunked metadata-route response.
- The sitemap is reduced to the 23 required canonical `<loc>` entries; optional
  `changefreq` and `priority` values ignored by Google were removed.
- SEO regression coverage now checks both sitemap contents and transport
  headers.

### Deployment notes

- Publish image tag: `nicthien/my-heroes:1.4.1`.
- No database migration is required for this release.
- After deployment, resubmit
  `https://myheroes.nthstudio.eu/sitemap.xml` in Google Search Console.

### Verified

- `npm.cmd run lint`
- `npx.cmd tsc --noEmit`
- `npm.cmd run test:e2e`
- `npm.cmd run build`
- Production-style HTTP header and sitemap-content checks

---

## v1.4.0 - 2026-08-16

### Highlights

- `/` is now an indexable, server-rendered public showcase for My Heroes,
  including the game pitch, feature cards, an accessible screenshot viewer,
  public guide entry points, community links, and French/English copy.
- Search metadata now has a single public-origin resolver, page-specific guide
  canonicals, homepage Open Graph/Twitter metadata, and `VideoGame`/`WebSite`
  structured data.
- Private application surfaces are explicitly excluded with `noindex`, while
  `/robots.txt` and `/sitemap.xml` expose exactly the intended 23 public URLs.
- Playwright now verifies the complete SEO surface and 390 px mobile layout.

### Deployment notes

- Publish image tag: `nicthien/my-heroes:1.4.0`.
- Set `APP_PUBLIC_URL=https://myheroes.nthstudio.eu` in production so canonical,
  sitemap, robots, confirmation, and social URLs share the official origin.
- No database migration is required for this release.

### Verified

- `npm.cmd run lint`
- `npx.cmd tsc --noEmit`
- `npm.cmd run test:e2e`
- `npm.cmd run build`
- Production HTTP, metadata, robots, and sitemap smoke checks

---

## v1.3.5 - 2026-07-11

### Highlights

- Login language is now selected from the browser by default and the user's
  choice is preserved after authentication.
- The game guide has a broader English pass: the guide shell, homepage cards,
  search results, first steps, resources, towns, heroes, combat, map objects,
  encyclopedia tables, spells, skills, glossary, and game mechanics now follow
  the selected language more consistently.
- Admin now opens on an overview tab with lighter per-tab loading instead of
  loading every admin table at once.
- Admin statistics now track anonymous account usage: guests created,
  conversion requests, completed conversions, pending conversions, conversion
  rate, and history charts.
- Bug-report stats now use the IMAP `Answered` flag as a fallback, so answered
  threads are counted even when sent copies are not present in the inbox.
- Public metadata now uses `APP_PUBLIC_URL` / `NEXT_PUBLIC_SITE_URL` so shared
  links and social previews resolve to the production domain.

### Deployment notes

- Publish image tag: `nicthien/my-heroes:1.3.5`.
- Recommended production env: set `APP_PUBLIC_URL=https://<your-domain>` on the
  VPS/app container for confirmation links, Open Graph images, and Reddit/social
  previews.
- New migrations are included for app settings, presence trigger hardening, and
  anonymous account event tracking. With `SUPABASE_DB_URL` and
  `MIGRATE_ON_BOOT=true`, they apply automatically when the container starts.

### Verified

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run test:e2e -- tests/e2e/dev-pages.spec.ts -g "guide"`
- Local `/guide` smoke check returned HTTP 200.

---

## 1. Configure environment

Copy the template and fill in the values for your Supabase instance:

```bash
cp .env.example .env
```

```env
# Runtime config (production / Docker). Read at runtime — nothing is baked.
SUPABASE_URL="http://host.docker.internal:56021"   # or your Supabase URL
SUPABASE_ANON_KEY="<anon / publishable key>"
SUPABASE_SERVICE_ROLE_KEY="<service role key>"
SUPABASE_INTERNAL_URL="http://host.docker.internal:56021"   # optional; defaults to SUPABASE_URL
SUPABASE_DB_URL="postgresql://postgres:<password>@<db-host>:5432/postgres"  # optional; enables boot-time migrations (see §4)
```

> Local `next dev` still reads the conventional `NEXT_PUBLIC_SUPABASE_URL` /
> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `.env` as a fallback.

---

## 2. Provide Supabase

### Option A — Supabase running on the host (`supabase start`)
The same stack you use for dev. The app container reaches it through
`host.docker.internal` (already wired via `extra_hosts` in the compose file).

```bash
supabase start          # serves the API on the port from supabase/config.toml (56021)
```

Set `SUPABASE_URL="http://host.docker.internal:56021"` (and
`SUPABASE_INTERNAL_URL` to the same) in `.env`. Grab the anon + service_role keys
from `supabase status`.

### Option B — Self-hosted Supabase stack
Run the **official** Supabase self-hosted compose (Postgres, GoTrue, PostgREST,
Realtime, Storage, Kong, Studio) and point the app at it through the runtime env
vars above — don't hand-roll the Supabase services. The full self-host
walkthrough (dedicated LAN IPs, schema, and the Unraid template) is in
[`docs/UNRAID.md`](docs/UNRAID.md). To run the app on the same docker network as
Supabase, see [`docker-compose.unraid.yml`](docker-compose.unraid.yml).

**On a cloud VPS** (hardening, Docker, Supabase, app, Caddy/HTTPS, SMTP, backups)
there is a complete end-to-end walkthrough in [`docs/VPS.md`](docs/VPS.md).

### Option C — Unraid (self-hosted Supabase + native template)

**Full GUI walkthrough: [`docs/UNRAID.md`](docs/UNRAID.md).** Summary:

Unraid has no source checkout, so the app is **not built there** — you build +
push the **generic** image on your dev machine and only *pull* it on Unraid. The
recommended layout: Supabase as a `docker compose` stack on its own `br0` LAN IP,
and the app as a **native Unraid template** (Docker → Add Container) on its own
`br0` LAN IP. Full walkthrough in [`docs/UNRAID.md`](docs/UNRAID.md).

The **proxy** strategy is chosen at runtime from `SUPABASE_URL`: a private/LAN
value makes the browser route Supabase calls through the app's `/api/supabase`
proxy (see [`src/lib/supabase/browser.ts`](src/lib/supabase/browser.ts)), which
forwards server-side via `SUPABASE_INTERNAL_URL`. Giving each piece its own LAN
IP keeps default ports free of host collisions (see docs/UNRAID.md → Networking).

> The PROXY vs DIRECT choice is made at **runtime** from `SUPABASE_URL`: a
> private value (`192.168.x`, `10.x`, `172.16–31.x`) flips the browser onto the
> `/api/supabase` proxy path. Nothing is baked, so the same image covers both.

**Build + push the image (on your dev machine) — no build args, it's generic.**
`--provenance=false --sbom=false` keeps it a plain image manifest so Unraid can
detect updates (an OCI index + attestation manifest breaks Unraid's update check):

```bash
VERSION=1.4.0
docker build --provenance=false --sbom=false \
  -t nicthien/my-heroes:${VERSION} \
  -t nicthien/my-heroes:latest .
docker push nicthien/my-heroes:${VERSION}
docker push nicthien/my-heroes:latest
```

`docker push` uploads only the image — the Docker Hub **Overview** page is never
synced by it. After a push, refresh it from [`DOCKERHUB.md`](DOCKERHUB.md):

```bash
DOCKERHUB_USERNAME=<user> DOCKERHUB_TOKEN=<access-token> npm run dockerhub:overview
```

Then follow [`docs/UNRAID.md`](docs/UNRAID.md) for the Portainer steps (deploy
Supabase, apply the schema, deploy the app stack, front with Zoraxy). App env
template: [`docker/unraid/env.unraid.example`](docker/unraid/env.unraid.example).

---

## 3. Build & run the app

```bash
docker compose up --build -d
```

App is served on http://localhost:3000.

Logs / stop:

```bash
docker compose logs -f app
docker compose down
```

---

## 4. Database schema

The app expects the schema to already exist in the target Supabase DB:

- Fresh install → run `supabase/schema.sql` in the SQL editor.
- Incremental → apply `supabase/migrations/` in order.

Both must stay aligned (see AGENTS.md → Database Schema).

**Auto-migration at boot (optional).** Set `SUPABASE_DB_URL` (a direct Postgres
URL) and the container applies any pending `supabase/migrations/` before starting
the server — tracked in `supabase_migrations.schema_migrations`, same as the
Supabase CLI. A failed migration aborts startup (non-zero exit) so the app never
serves a half-applied schema. On a DB that already exists, do a one-time
`MIGRATE_MODE=baseline` boot first to adopt the current schema; set
`MIGRATE_ON_BOOT=false` to disable. Full walkthrough in
[`docs/UNRAID.md`](docs/UNRAID.md) → Step 5. From a dev machine you can also run
`npm run db:migrate:status` / `npm run db:migrate`.

---

## Quick sanity build (no Docker)

To verify the production build alone:

```bash
npm run build
npm start          # next start on port 3000
```
