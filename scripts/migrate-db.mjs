// Remote migration runner for self-hosted Supabase (e.g. the Unraid deploy).
//
// In LOCAL dev, `supabase start` already applies everything in
// supabase/migrations/. This script covers the OTHER case: a running Postgres
// (self-hosted Supabase) that the app image must bring up to the latest schema
// at boot. It mirrors what the Supabase CLI does — it tracks applied versions
// in `supabase_migrations.schema_migrations` (same table, same `version` key)
// and applies only the files that are missing, each in its own transaction.
//
// Usage:
//   node scripts/migrate-db.mjs            # apply pending migrations
//   node scripts/migrate-db.mjs --status   # list pending without applying
//   node scripts/migrate-db.mjs --baseline # mark all files as applied WITHOUT
//                                           # running them (adopt a DB that is
//                                           # already at head, e.g. one built
//                                           # from supabase/schema.sql)
//
// Connection comes from SUPABASE_DB_URL, a direct Postgres URL, e.g.
//   postgresql://postgres:PASSWORD@db:5432/postgres
// On the shared Supabase docker network the host is the db service name (`db`),
// so no host port needs to be published.

import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(SCRIPT_DIR, "..", "supabase", "migrations");

const log = (...args) => console.log("[migrate]", ...args);
const warn = (...args) => console.warn("[migrate]", ...args);

// Parse "<version>_<name>.sql" → { version, name, file }. The version is the
// numeric prefix before the first underscore, matching the Supabase CLI.
function parseMigrationName(file) {
  const match = file.match(/^(\d+)_(.+)\.sql$/);
  if (!match) return null;
  return { version: match[1], name: match[2], file };
}

async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .map(parseMigrationName)
    .filter(Boolean)
    .sort((a, b) => a.version.localeCompare(b.version));
}

async function ensureTrackingTable(sql) {
  await sql.unsafe(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);
}

async function appliedVersions(sql) {
  const rows = await sql`select version from supabase_migrations.schema_migrations`;
  return new Set(rows.map((r) => r.version));
}

/**
 * Apply pending migrations (or baseline / report, depending on options).
 * Returns the list of migrations that were applied (or would be).
 *
 * @param {object} [options]
 * @param {"apply"|"status"|"baseline"} [options.mode="apply"]
 * @param {string} [options.databaseUrl=process.env.SUPABASE_DB_URL]
 * @param {boolean} [options.required=false] throw when no databaseUrl is set
 */
export async function runMigrations(options = {}) {
  const mode = options.mode ?? "apply";
  const databaseUrl = options.databaseUrl ?? process.env.SUPABASE_DB_URL;

  if (!databaseUrl) {
    const message =
      "SUPABASE_DB_URL is not set — skipping schema migrations. " +
      "Set it to a direct Postgres URL (e.g. postgresql://postgres:PWD@db:5432/postgres) to enable auto-migration.";
    if (options.required) throw new Error(message);
    warn(message);
    return [];
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
    // Migrations are DDL; never auto-prepare and keep notices quiet.
    prepare: false,
    onnotice: () => {},
  });

  try {
    await ensureTrackingTable(sql);
    const applied = await appliedVersions(sql);
    const all = await listMigrationFiles();
    const pending = all.filter((m) => !applied.has(m.version));

    if (pending.length === 0) {
      log(`Database is up to date (${all.length} migrations applied).`);
      return [];
    }

    if (mode === "status") {
      log(`${pending.length} pending migration(s):`);
      for (const m of pending) log(`  - ${m.version}_${m.name}`);
      return pending;
    }

    if (mode === "baseline") {
      for (const m of pending) {
        await sql`
          insert into supabase_migrations.schema_migrations (version, name)
          values (${m.version}, ${m.name})
          on conflict (version) do nothing
        `;
        log(`baselined ${m.version}_${m.name} (not executed)`);
      }
      log(`Baselined ${pending.length} migration(s).`);
      return pending;
    }

    // mode === "apply"
    log(`Applying ${pending.length} pending migration(s)...`);
    for (const m of pending) {
      const content = await readFile(join(MIGRATIONS_DIR, m.file), "utf8");
      // Each migration runs in its own transaction — a failure rolls the file
      // back and aborts the run (we never half-apply).
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`
          insert into supabase_migrations.schema_migrations (version, name)
          values (${m.version}, ${m.name})
        `;
      });
      log(`applied ${m.version}_${m.name}`);
    }
    log(`Done — applied ${pending.length} migration(s).`);
    return pending;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// CLI entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = new Set(process.argv.slice(2));
  const mode = flags.has("--baseline")
    ? "baseline"
    : flags.has("--status") || flags.has("--dry-run")
      ? "status"
      : "apply";

  runMigrations({ mode, required: true }).catch((err) => {
    console.error("[migrate] FAILED:", err.message);
    process.exit(1);
  });
}
