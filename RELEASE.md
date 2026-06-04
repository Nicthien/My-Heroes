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

Set `NEXT_PUBLIC_SUPABASE_URL="http://host.docker.internal:56021"` in `.env`.
Grab the anon + service_role keys from `supabase status`.

### Option B — Self-hosted Supabase stack
Fully containerized: run the **official** Supabase self-hosted compose
(Postgres, GoTrue, PostgREST, Realtime, Storage, Kong, Studio) and attach the
app to its network via [`docker-compose.selfhost.yml`](docker-compose.selfhost.yml).
Don't hand-roll the Supabase services — reuse their compose so it tracks
upstream versions.

```bash
# 1. Get the official stack
git clone --depth 1 https://github.com/supabase/supabase
cp -r supabase/docker ./supabase-docker
cp supabase/docker/.env.example ./supabase-docker/.env
# Edit ./supabase-docker/.env: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY,
# SERVICE_ROLE_KEY, SITE_URL, API_EXTERNAL_URL, etc.

# 2. Start Supabase (Kong gateway published on the host, default :8000)
docker compose -f ./supabase-docker/docker-compose.yml up -d

# 3. Apply this repo's schema to that Postgres (psql or Studio SQL editor),
#    then build + run the app attached to Supabase's network
docker compose \
  -f ./supabase-docker/docker-compose.yml \
  -f ./docker-compose.selfhost.yml \
  up -d --build app
```

In this repo's `.env`, set `NEXT_PUBLIC_SUPABASE_URL` to the **host-reachable
Kong URL** (e.g. `http://localhost:8000`) — it is inlined into the browser
bundle at build time. Use the `ANON_KEY` / `SERVICE_ROLE_KEY` you set in the
Supabase `.env` for the publishable and service-role keys.

> The `name: supabase-docker_default` network in `docker-compose.selfhost.yml`
> assumes Supabase's compose runs from `./supabase-docker`. If your directory
> differs, check `docker network ls` and adjust that name.

### Option C — Unraid (self-hosted Supabase, managed in Portainer)

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

**Build + push the image (on your dev machine) — no build args, it's generic:**

```bash
docker build -t nicthien/my-heroes:latest .
docker push nicthien/my-heroes:latest
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

---

## Quick sanity build (no Docker)

To verify the production build alone:

```bash
npm run build
npm start          # next start on port 3000
```
