# My Heroes

Turn-based fantasy strategy game (Next.js + Supabase + Phaser).
This image is the **app server** (Next.js frontend + API routes). It needs a
running **Supabase** backend (Postgres + Auth + Realtime).

## Generic image

Nothing is baked at build — every value is read at **runtime** from the
container env, so the same public image works for any deployment.

## Quick start

```bash
docker run -d --name my-heroes -p 3000:3000 \
  -e SUPABASE_URL="http://<supabase-host>:8000" \
  -e SUPABASE_ANON_KEY="<anon / publishable key>" \
  -e SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
  -e SUPABASE_INTERNAL_URL="http://kong:8000" \
  nicthien/my-heroes:latest
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | yes | Browser-facing Supabase URL. A private/LAN value enables the built-in `/api/supabase` proxy. |
| `SUPABASE_ANON_KEY` | yes | Anon / publishable key (public by design). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key, server-only. |
| `SUPABASE_INTERNAL_URL` | no | Where the server reaches Supabase. Defaults to `SUPABASE_URL`. |
| `SUPABASE_DB_URL` | no | Direct Postgres URL (`postgres` user + `POSTGRES_PASSWORD`) used to **auto-apply schema migrations at boot**. Unset = no auto-migration. |
| `MIGRATE_ON_BOOT` | no | `false` to disable the boot-time migration step. Defaults to `true`. |
| `MIGRATE_MODE` | no | `apply` (default), `baseline` (adopt an existing DB once, without running migrations), or `status` (report only). |
| `USE_SMTP` | no | `true` to enable outgoing email (signup confirmation + welcome); login stays blocked until the address is confirmed. Defaults to `false` (instant signup, no email). |
| `APP_PUBLIC_URL` | if SMTP | Public app URL (e.g. `https://myheroes.example.com`), used to build confirmation links. |
| `SMTP_HOST` | if SMTP | SMTP server host. |
| `SMTP_PORT` | no | SMTP port. Defaults to `587`. |
| `SMTP_SECURE` | no | `true` for implicit TLS (port 465), `false` for STARTTLS (587/25). Defaults to `false`. |
| `SMTP_USER` | if SMTP | SMTP username. |
| `SMTP_PASS` | if SMTP | SMTP password. |
| `SMTP_FROM` | if SMTP | `From` header, e.g. `My Heroes <no-reply@example.com>`. |

## Auto-migration at boot

If `SUPABASE_DB_URL` is set, the container applies any pending migrations
before starting the server — tracked in `supabase_migrations.schema_migrations`,
the same table the Supabase CLI uses. A failed migration aborts startup
(non-zero exit) so the app never serves a half-applied schema.

- **Fresh database** → it builds the whole schema from the migrations.
- **Existing database** (e.g. created from `schema.sql`) → do a one-time
  `MIGRATE_MODE=baseline` boot first to adopt the current schema, then switch
  back to `apply`.

The connection uses a direct Postgres login (the `postgres` user + your stack's
`POSTGRES_PASSWORD`), not the service role key — keep it out of source control.

If the database isn't reachable yet at boot (e.g. the app and Supabase start
together after a host reboot), the runner waits and retries instead of failing
immediately. Tune with `MIGRATE_CONNECT_RETRIES` (default `60`) and
`MIGRATE_CONNECT_DELAY_MS` (default `2000`). A real migration SQL error still
aborts startup.

## Docs

- Self-host / Unraid guide: <https://github.com/Nicthien/My-Heroes/blob/master/docs/UNRAID.md>
- Release / Docker notes: <https://github.com/Nicthien/My-Heroes/blob/master/RELEASE.md>
- Source: <https://github.com/Nicthien/My-Heroes>
