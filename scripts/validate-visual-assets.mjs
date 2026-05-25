import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const agentsPath = path.join(root, "AGENTS.md");
const agentsText = fs.readFileSync(agentsPath, "utf8");

if (!agentsText.includes("visible map/game objects and decor must not be drawn with Phaser/canvas primitives")) {
  failures.push("AGENTS.md is missing the hard rule against procedural visible map/game decor.");
}

const rendererPath = path.join(root, "src", "lib", "rendering", "phaser", "PhaserMapRenderer.ts");
const rendererText = fs.readFileSync(rendererPath, "utf8");
const renderDecorMatch = rendererText.match(/private renderDecor\([\s\S]*?\n  private renderNaturalWall/);

if (!renderDecorMatch) {
  failures.push("Could not locate PhaserMapRenderer.renderDecor() for visual asset validation.");
} else {
  const renderDecorBody = renderDecorMatch[0];
  const nonBlockingBranch = renderDecorBody.match(/if \(!decor\.blocking\) \{([\s\S]*?)\n    \}/);
  if (!nonBlockingBranch) {
    failures.push("Could not locate the non-blocking decor branch in renderDecor().");
  } else {
    const nonBlockingBody = nonBlockingBranch[1];
    const forbiddenPrimitive = /\b(?:fillTriangle|fillCircle|fillEllipse|lineTo|moveTo|strokePath|fillPath|draw(?:Pine|Oak|Dead|Bush|Flowers|Grass|Rock|Decor))/;
    if (forbiddenPrimitive.test(nonBlockingBody)) {
      failures.push("Non-blocking adventure-map decor must not be rendered with Phaser/canvas primitives; use .webp sprites instead.");
    }
    if (!/this\.add\.image\([\s\S]*spritePath/.test(nonBlockingBody) && !/^\s*return;\s*$/m.test(nonBlockingBody)) {
      failures.push("Non-blocking adventure-map decor may only render .webp sprites or return without visible output.");
    }
  }
}

if (failures.length > 0) {
  console.error("Visual asset validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Visual asset validation passed.");
