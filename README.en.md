# My Heroes

[Français](README.md) · **English**

Turn-based fantasy strategy game.

## Description

My Heroes is a turn-based strategy game where players explore a map, gather resources, recruit heroes and armies, and face their opponents in tactical battles. Built with Next.js, Supabase and Phaser.

## Prerequisites

- Node.js 20.9+
- Docker Desktop running (for local Supabase)
- npm

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development environment:
   ```bash
   npm run dev
   ```
   This starts local Supabase, pulls its variables, and launches Next.js.

3. Open [http://localhost:3000](http://localhost:3000).

Supabase Studio is available at [http://127.0.0.1:56023](http://127.0.0.1:56023).

## Useful commands

```bash
npm run dev:web       # Next.js only
npm run dev:supabase  # local Supabase only
npm run db:reset      # recreate the local DB from migrations
npm run dev:stop      # stop local Supabase
npm run test:e2e:gameplay # start local Supabase, seed an E2E user, then run a full gameplay run
```

The local schema is versioned in [`supabase/migrations`](supabase/migrations). The
[`supabase/schema.sql`](supabase/schema.sql) file is handy to apply the schema to a Supabase
project via the SQL Editor.

## Self-hosted deployment (Unraid / Docker)

The Docker image is **generic**: no URL or key is compiled in. All configuration
is read at **runtime** from the container environment, so the same public image
(`nicthien/my-heroes` on Docker Hub) works for anyone, with their own values.

```bash
docker run -d --name my-heroes -p 3000:3000 \
  -e SUPABASE_URL="http://<supabase-host>:8000" \
  -e SUPABASE_ANON_KEY="<anon / publishable key>" \
  -e SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
  -e SUPABASE_INTERNAL_URL="http://<supabase-host>:8000" \
  nicthien/my-heroes:latest
```

The container runs only the Next.js frontend: a Supabase backend must already be
running. **Full Unraid guide (self-hosted Supabase + Unraid template + dedicated
IPs): [`docs/UNRAID.md`](docs/UNRAID.md).** Packaging: [`Dockerfile`](Dockerfile),
[`RELEASE.md`](RELEASE.md).

## Environment variables (runtime)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | yes | Browser-facing Supabase URL. A private/LAN value enables the `/api/supabase` proxy. |
| `SUPABASE_ANON_KEY` | yes | Anon / publishable key (public by design). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key, server-only. |
| `SUPABASE_INTERNAL_URL` | no | Where the server reaches Supabase. Defaults to `SUPABASE_URL`. |

> Locally, `npm run dev` injects the config automatically from `supabase status`
> (via the `NEXT_PUBLIC_*` names in `.env`, kept as a dev fallback).

## Admin account

An admin account is **created automatically on the server's first boot** (on any
install), if it doesn't already exist:

- Email: `admin@myheroes.local`
- Username: `Admin`
- Password: `ChangeMe`

⚠️ **This is a server-management account only — it cannot play.** It can
administer and observe games, but **cannot join a game as a player** (the API
returns 403 on join, and creating a game as admin does not add them as a player).

The profile is flagged `must_change_password`, so the UI requires changing the
password on first login. Seeding is **idempotent** (an existing account is never
overwritten).

Override via environment variables: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`,
and `ADMIN_SEED_DISABLED=1` to turn the seed off entirely. Locally, `npm run
admin:ensure` does the same on demand.

## Tech stack

- **Frontend**: Next.js, React, Tailwind CSS
- **Backend**: Next.js Route Handlers, Supabase JS
- **Database**: Supabase Postgres
- **Authentication**: Supabase Auth
- **Realtime**: Supabase Realtime
- **Map rendering**: Phaser

## License

Personal project, all rights reserved.
