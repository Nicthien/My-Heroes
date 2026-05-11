import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function localCommand(command, args) {
  const supabaseExecutable = join(projectRoot, "node_modules", "supabase", "bin", isWindows ? "supabase.exe" : "supabase");
  const nextExecutable = join(projectRoot, "node_modules", "next", "dist", "bin", "next");

  if (command === "supabase" && existsSync(supabaseExecutable)) {
    return { command: supabaseExecutable, args };
  }

  if (command === "next" && existsSync(nextExecutable)) {
    return { command: process.execPath, args: [nextExecutable, ...args] };
  }

  const executable = isWindows ? `${command}.cmd` : command;
  const candidate = join(projectRoot, "node_modules", ".bin", executable);

  return {
    command: existsSync(candidate) ? candidate : command,
    args,
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const executable = localCommand(command, args);
    const child = spawn(executable.command, executable.args, {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function readSupabaseEnv() {
  const executable = localCommand("supabase", ["status", "-o", "env"]);
  const status = spawnSync(executable.command, executable.args, {
    encoding: "utf8",
  });

  if (status.status !== 0) {
    throw new Error(status.stderr || status.stdout || "Unable to read Supabase status.");
  }

  const values = {};

  for (const line of status.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      values[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }

  return {
    url: values.API_URL || values.SUPABASE_URL || "http://127.0.0.1:54321",
    anonKey: values.ANON_KEY || values.SUPABASE_ANON_KEY,
    serviceRoleKey: values.SERVICE_ROLE_KEY || values.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function main() {
  console.log("Starting local Supabase...");
  await run("supabase", ["start"]);

  const supabase = readSupabaseEnv();

  if (!supabase.anonKey || !supabase.serviceRoleKey) {
    throw new Error("Supabase started, but its local API keys were not found.");
  }

  console.log(`Starting Next.js with Supabase at ${supabase.url}...`);

  const executable = localCommand("next", ["dev"]);
  const next = spawn(executable.command, executable.args, {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    },
  });

  next.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
