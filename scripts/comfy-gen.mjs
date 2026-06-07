// Node driver for the local ComfyUI server (HTTP API on port 8000). Equivalent to
// tools/comfy-gen.ps1 but callable without PowerShell. Loads a Save(API Format)
// workflow, injects the prompt at the __PROMPT__ token, queues it, waits, downloads.
//
// Usage:
//   node scripts/comfy-gen.mjs --workflow tools/comfy/txt2img.api.json \
//     --prompt "seamless tileable ..." --out assets/generated/rough.png [--seed 123]

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[i + 1];
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = args.server ?? "http://127.0.0.1:8000";
  const workflowPath = args.workflow ?? "tools/comfy/txt2img.api.json";
  const prompt = args.prompt;
  const out = args.out;
  const timeoutMs = Number(args.timeout ?? 300) * 1000;
  if (!prompt || !out) {
    console.error("Usage: node scripts/comfy-gen.mjs --prompt <text> --out <file> [--workflow f] [--seed n]");
    process.exit(1);
  }

  const graph = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  let injected = false;
  for (const node of Object.values(graph)) {
    if (node?.inputs?.text === "__PROMPT__") { node.inputs.text = prompt; injected = true; }
    if (args.seed !== undefined && node?.class_type === "KSampler" && "seed" in (node.inputs ?? {})) {
      node.inputs.seed = Number(args.seed);
    }
  }
  if (!injected) throw new Error("No __PROMPT__ token found in workflow.");

  const clientId = randomUUID();
  const queued = await fetch(`${server}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  }).then((r) => r.json());
  if (!queued.prompt_id) throw new Error(`Queue rejected: ${JSON.stringify(queued)}`);
  console.log(`Queued ${queued.prompt_id}; waiting...`);

  const deadline = Date.now() + timeoutMs;
  let entry = null;
  while (Date.now() < deadline) {
    await sleep(900);
    const hist = await fetch(`${server}/history/${queued.prompt_id}`).then((r) => r.json());
    if (hist[queued.prompt_id]) { entry = hist[queued.prompt_id]; if (entry.outputs) break; }
  }
  if (!entry?.outputs) throw new Error("Timed out waiting for ComfyUI.");

  let image = null;
  for (const nodeOut of Object.values(entry.outputs)) {
    if (nodeOut.images?.length) { image = nodeOut.images[0]; break; }
  }
  if (!image) throw new Error("No image in outputs.");

  const q = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? "", type: image.type ?? "output" });
  const bytes = Buffer.from(await fetch(`${server}/view?${q}`).then((r) => r.arrayBuffer()));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  console.log(`Saved -> ${out} (${bytes.length} bytes)`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
