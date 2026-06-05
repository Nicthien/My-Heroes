// Container entry point: bring the database schema up to date, THEN start the
// app. Migrations gate startup — if they fail the process exits non-zero so the
// restart policy / healthcheck reacts instead of serving against a stale schema.
//
// Set MIGRATE_ON_BOOT=false to skip the migration step (e.g. when another
// process owns migrations). When SUPABASE_DB_URL is unset the runner just warns
// and continues, so the app still boots if you haven't opted in yet.
//
// MIGRATE_MODE selects what the boot step does (default "apply"):
//   - "apply"    : run pending migrations (normal operation)
//   - "baseline" : mark all files as applied WITHOUT running them — use ONCE on
//                  a DB already at head (e.g. built from supabase/schema.sql),
//                  then set it back to "apply" (or remove it).
//   - "status"   : only report pending migrations, then start.

import { spawn } from "node:child_process";
import { runMigrations } from "./scripts/migrate-db.mjs";

const command = process.argv.slice(2); // e.g. ["node", "server.js"]
const mode = process.env.MIGRATE_MODE || "apply";

if (process.env.MIGRATE_ON_BOOT === "false") {
  console.log("[entrypoint] MIGRATE_ON_BOOT=false — skipping schema migrations.");
} else {
  try {
    await runMigrations({ mode });
  } catch (err) {
    console.error("[entrypoint] Migration failed — refusing to start:", err.message);
    process.exit(1);
  }
}

if (command.length === 0) process.exit(0);

const child = spawn(command[0], command.slice(1), { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
// Forward termination signals so the app shuts down cleanly.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
