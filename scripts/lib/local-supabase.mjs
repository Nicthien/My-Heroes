import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const isWindows = process.platform === "win32";

export function localCommand(command, args = []) {
  const supabaseExecutable = join(projectRoot, "node_modules", "supabase", "bin", isWindows ? "supabase.exe" : "supabase");
  const nextExecutable = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  const playwrightExecutable = join(projectRoot, "node_modules", "playwright", "cli.js");

  if (command === "supabase" && existsSync(supabaseExecutable)) {
    return { command: supabaseExecutable, args };
  }

  if (command === "next" && existsSync(nextExecutable)) {
    return { command: process.execPath, args: [nextExecutable, ...args] };
  }

  if (command === "playwright" && existsSync(playwrightExecutable)) {
    return { command: process.execPath, args: [playwrightExecutable, ...args] };
  }

  const executable = isWindows ? `${command}.cmd` : command;
  const candidate = join(projectRoot, "node_modules", ".bin", executable);

  return {
    command: existsSync(candidate) ? candidate : command,
    args,
  };
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const executable = localCommand(command, args);
    const child = spawn(executable.command, executable.args, {
      cwd: projectRoot,
      stdio: "inherit",
      ...options,
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

export function readSupabaseEnv() {
  const executable = localCommand("supabase", ["status", "-o", "env"]);
  const status = spawnSync(executable.command, executable.args, {
    cwd: projectRoot,
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
    studioUrl: values.STUDIO_URL || "http://127.0.0.1:54323",
    anonKey: values.ANON_KEY || values.SUPABASE_ANON_KEY,
    serviceRoleKey: values.SERVICE_ROLE_KEY || values.SUPABASE_SERVICE_ROLE_KEY,
  };
}
