#!/usr/bin/env node

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import JavaScriptObfuscator from "javascript-obfuscator";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ["rc4"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChosenCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: "function",
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  seed: 42,
  target: "node",
  renameProperties: false,
  sourceMap: false,
  sourceMapMode: "separate",
};

const JS_DIRS = [
  "bin",
  "lib",
  "shared",
  "grix-admin/scripts",
  "grix-egg/scripts",
  "grix-group/scripts",
  "grix-query/scripts",
  "grix-register/scripts",
  "grix-update/scripts",
  "message-send/scripts",
  "message-unsend/scripts",
];

const ASSET_DIRS = [
  "grix-admin/agents",
  "grix-egg/agents",
  "grix-group/agents",
  "grix-query/agents",
  "grix-register/agents",
  "grix-update/agents",
  "message-send/agents",
  "message-unsend/agents",
];

const ASSET_FILES = [
  "grix-admin/SKILL.md",
  "grix-egg/SKILL.md",
  "grix-group/SKILL.md",
  "grix-query/SKILL.md",
  "grix-register/SKILL.md",
  "grix-update/SKILL.md",
  "message-send/SKILL.md",
  "message-unsend/SKILL.md",
  "README.md",
  "LICENSE",
];

const REFERENCE_DIRS = [
  "grix-admin/references",
  "grix-egg/references",
  "grix-register/references",
  "grix-update/references",
];

function walk(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function collectJsFiles() {
  const files = [];
  for (const dir of JS_DIRS) {
    const abs = resolve(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of walk(abs)) {
      if (f.endsWith(".js")) files.push(f);
    }
  }
  return files;
}

function collectAssetFiles() {
  const files = [];
  for (const f of ASSET_FILES) {
    const abs = resolve(ROOT, f);
    if (existsSync(abs)) files.push(abs);
  }
  for (const dir of [...ASSET_DIRS, ...REFERENCE_DIRS]) {
    const abs = resolve(ROOT, dir);
    if (!existsSync(abs)) continue;
    files.push(...walk(abs));
  }
  return files;
}

function obfuscateFile(srcPath) {
  let content = readFileSync(srcPath, "utf8");

  let shebang = "";
  if (content.startsWith("#!")) {
    const nlIdx = content.indexOf("\n");
    if (nlIdx !== -1) {
      shebang = content.slice(0, nlIdx + 1);
      content = content.slice(nlIdx + 1);
    }
  }

  const result = JavaScriptObfuscator.obfuscate(content, OBFUSCATOR_OPTIONS);
  return shebang + result.getObfuscatedCode();
}

function main() {
  const stagingDir = mkdtempSync(join(tmpdir(), "grix-obfuscate-"));

  const jsFiles = collectJsFiles();
  const assetFiles = collectAssetFiles();
  let jsCount = 0;

  for (const src of jsFiles) {
    const rel = relative(ROOT, src);
    const dest = join(stagingDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, obfuscateFile(src), "utf8");
    jsCount++;
  }

  for (const src of assetFiles) {
    const rel = relative(ROOT, src);
    const dest = join(stagingDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }

  const pkgJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  writeFileSync(join(stagingDir, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n", "utf8");

  process.stdout.write(stagingDir);
}

main();
