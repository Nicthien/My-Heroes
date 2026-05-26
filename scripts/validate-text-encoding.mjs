import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const INCLUDED_DIRS = ["src", "scripts", "tests", "supabase"];
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
]);
const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const latinCapitalAWithTilde = String.fromCharCode(0x00c3);
const latinCapitalAWithCircumflex = String.fromCharCode(0x00c2);
const replacementCharacter = String.fromCharCode(0xfffd);
const latinSmallAWithCircumflex = String.fromCharCode(0x00e2);

const MOJIBAKE_PATTERNS = [
  { regex: new RegExp(latinCapitalAWithTilde, "u"), label: "UTF-8 accent decoded as Windows-1252/Latin-1" },
  { regex: new RegExp(replacementCharacter, "u"), label: "Unicode replacement character" },
  {
    regex: new RegExp(`${latinCapitalAWithCircumflex}(?:[\\s!"#$%&'()*+,\\-./:;<=>?@[\\\\\\]^_\`{|}~]|\\u00A0|©|®|«|»|±)`, "u"),
    label: "stray capital A with circumflex from double-decoded punctuation or spaces",
  },
  {
    regex: new RegExp(`${latinSmallAWithCircumflex}(?:€™|€œ|€\\u009d|€˜|€\\u0099|€\\u009c|€¦|€“|€”|€\\x9d)`, "u"),
    label: "smart punctuation decoded as mojibake",
  },
];

const failures = [];

for (const dir of INCLUDED_DIRS) {
  const start = path.join(root, dir);
  if (fs.existsSync(start)) scanDirectory(start);
}

if (failures.length > 0) {
  console.error("Text encoding validation failed:");
  for (const failure of failures.slice(0, 80)) {
    console.error(`- ${failure.file}:${failure.line}:${failure.column} ${failure.label}`);
    console.error(`  ${failure.preview}`);
  }
  if (failures.length > 80) console.error(`- ...and ${failures.length - 80} more.`);
  process.exit(1);
}

console.log("Text encoding validation passed.");

function scanDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) scanDirectory(path.join(directory, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const filePath = path.join(directory, entry.name);
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
    scanFile(filePath);
  }
}

function scanFile(filePath) {
  const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/u);

  lines.forEach((line, index) => {
    for (const pattern of MOJIBAKE_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (!match) continue;
      failures.push({
        file: relativePath,
        line: index + 1,
        column: match.index + 1,
        label: pattern.label,
        preview: line.trim().slice(0, 180),
      });
      break;
    }
  });
}
