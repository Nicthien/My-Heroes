# Deploying My Heroes on Unraid (self-hosted Supabase)

This guide self-hosts the full stack on Unraid:

| Piece | What it is | How it's managed | Address |
| --- | --- | --- | --- |
| **Supabase** | Official self-hosted stack (~11 containers) | `docker compose` (one folder) | its own LAN IP, e.g. `<supabase-ip>:8000` |
| **My Heroes** | The Next.js game (one container) | **native Unraid template** (Docker → Add Container) | its own LAN IP, e.g. `<app-ip>:3000` |

Two design choices drive everything:

1. **Each piece gets its own LAN IP** (a `br0` address) so their default ports
   never collide with the crowded Unraid host IP. See [Networking](#networking).
2. **The app image is GENERIC** — no IP or key is baked in. Every value is read
   at **runtime** from the container env, so the same public image
   (`nicthien/my-heroes` on Docker Hub) works for anyone with their own values.
   See [Why the image is generic](#why-the-image-is-generic).

---

## Networking

On Unraid:

- **`bridge` (default)** makes every container share the **Unraid host IP**, and
  every published port binds there → that is where ports collide.
- **`br0` (macvlan)** gives a container its **own LAN IP**. Its ports live on
  that IP, never touching the host's — so default ports (8000, 3000…) are free
  to use, and there is no collision with anything else on the host.

So we give **Supabase's Kong** and **the app** each a dedicated `br0` IP. The app
reaches Supabase at Kong's LAN IP; the browser reaches the app at the app's LAN
IP (front it with Zoraxy for a public hostname).

> Note: macvlan containers can't be reached **from the Unraid host itself**, only
> from other LAN devices — which is fine here (your PC reaches both; the app
> reaches Kong container-to-container on `br0`).

---

## Why the image is generic

Next.js inlines `NEXT_PUBLIC_*` at **build** time (even server-side), which would
freeze one deployment's URL/keys into the image. Instead, My Heroes reads its
config at **runtime**:

- Server code reads plain env names via `src/lib/config/supabaseEnv.ts`.
- The public subset (URL + anon key) is injected into the page at request time by
  `RuntimeConfigScript` and read by `src/lib/supabase/browser.ts`.

Result: nothing personal is compiled in. You (and anyone else) pass your own
values as container env vars; the published image stays shareable.

Runtime env vars:

| Var | Required | Meaning |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Browser-facing Supabase (Kong) URL. A private/LAN value flips the client onto the built-in `/api/supabase` proxy. |
| `SUPABASE_ANON_KEY` | yes | Anon / publishable key (public by design). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only secret. Never sent to the browser. |
| `SUPABASE_INTERNAL_URL` | optional | Where server code reaches Supabase. Defaults to `SUPABASE_URL`. Set to `http://kong:8000` if the app shares Supabase's docker network, or to Kong's LAN IP if on `br0`. |

---

## Step 0 — Get the Supabase config on disk (one-off)

The official Supabase stack ships a `volumes/` folder of config that must exist
on disk. From the Unraid terminal, once:

```bash
mkdir -p /mnt/user/appdata/my-heroes && cd /mnt/user/appdata/my-heroes
git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase tmp
cd tmp && git sparse-checkout set docker && cd ..
cp -r tmp/docker ./supabase-stack
cp tmp/docker/.env.example ./supabase-stack/.env
rm -rf tmp
```

You now have `/mnt/user/appdata/my-heroes/supabase-stack/` (`docker-compose.yml`,
`.env`, `volumes/`).

## Step 1 — Generate real keys & fill the Supabase `.env`

Generate a key set on your dev machine (never reuse the demo keys for real use):

```bash
node scripts/gen-supabase-keys.mjs   # prints JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
```

Edit `supabase-stack/.env` and set at least `POSTGRES_PASSWORD`, `JWT_SECRET`,
`ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD`,
`SECRET_KEY_BASE`, `VAULT_ENC_KEY`, and:

```env
SITE_URL=https://your-public-host
API_EXTERNAL_URL=http://<supabase-ip>:8000
SUPABASE_PUBLIC_URL=http://<supabase-ip>:8000
```

## Step 2 — Give Kong a dedicated LAN IP & deploy Supabase

So Supabase lives on its own address with default ports, attach **Kong** to
`br0` and stop it (and the pooler) from publishing on the host. In
`supabase-stack/`:

```bash
# Don't publish the pooler / Kong on the HOST (they get a LAN IP / stay internal)
sed -i 's|- ${POSTGRES_PORT}:5432|# &|' docker-compose.yml
sed -i 's|^\([[:space:]]*\)# ports:|\1ports:|' docker-compose.yml   # (only if previously toggled)

# Attach Kong to br0 with a fixed IP, via an addition to the kong service:
#   networks:
#     lan:
#       ipv4_address: <supabase-ip>
# and a top-level:
#   networks:
#     lan:
#       external: true
#       name: br0
# (edit the base docker-compose.yml directly — a compose override is NOT reliably
#  merged onto the kong service.)

docker compose up -d
```

Set `SUPABASE_PUBLIC_URL` / `API_EXTERNAL_URL` to `http://<supabase-ip>:8000`.
Studio is then at `http://<supabase-ip>:8000` (login = `DASHBOARD_USERNAME` /
`DASHBOARD_PASSWORD`).

> If the pooler crash-loops on `ulimit ... Operation not permitted`, add to its
> service: `ulimits: { nofile: { soft: 100000, hard: 100000 } }`.

## Step 3 — Apply the schema

In **Studio → SQL Editor**, paste [`supabase/schema.sql`](../supabase/schema.sql)
and Run. It is the source of truth for a fresh DB.

## Step 4 — Deploy the app as an Unraid template

Unraid → **Docker → Add Container**:

| Field | Value |
| --- | --- |
| Name | `my-heroes` |
| Repository | `nicthien/my-heroes:latest` |
| Network Type | `Custom: br0` |
| Fixed IP address | `<app-ip>` |
| WebUI | `http://<app-ip>:3000` |

Add these **variables** (your own values — nothing is baked into the image):

| Key | Value |
| --- | --- |
| `SUPABASE_URL` | `http://<supabase-ip>:8000` |
| `SUPABASE_ANON_KEY` | *(your anon key)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(your service role key)* |
| `SUPABASE_INTERNAL_URL` | `http://<supabase-ip>:8000` |

Apply. Open `http://<app-ip>:3000`, register a user (validates app ↔ Kong ↔
DB), then front it with Zoraxy on your public hostname.

---

## Building & publishing the image (maintainers)

The image is built and pushed from a dev machine (Unraid has no source checkout).
No build args are needed — it's generic:

```bash
docker build -t nicthien/my-heroes:latest .
docker push nicthien/my-heroes:latest
```

Unraid then pulls it straight from Docker Hub (no local registry required).

## Alternative: app as a Portainer/compose stack

If you'd rather run the app on Supabase's docker network instead of a `br0` IP,
use [`docker-compose.unraid.yml`](../docker-compose.unraid.yml) +
[`docker/unraid/env.unraid.example`](../docker/unraid/env.unraid.example) (set
`SUPABASE_INTERNAL_URL=http://kong:8000`).

## Troubleshooting

- **Login hangs / network error** but the page loads → the app (`br0`) can't
  reach Kong (`br0`). Verify both IPs respond; as a fallback, run the app on
  Supabase's docker network (the compose alternative above) with
  `SUPABASE_INTERNAL_URL=http://kong:8000`.
- **401 / invalid JWT** → the app's keys don't match the Supabase `JWT_SECRET`.
  Regenerate the set and update both.
- **Port already allocated** → something else holds that host port; giving the
  container its own `br0` IP avoids host ports entirely.
