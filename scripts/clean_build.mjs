#!/usr/bin/env node
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const INCLUDED_DIRS = [
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
  "tests",
];

const EXCLUDED_NAMES = new Set(["clean_build.mjs"]);

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (EXCLUDED_NAMES.has(name)) continue;
    const full = join(dir, name);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      if (name === "node_modules") continue;
      walk(full);
    } else if (name.endsWith(".js") || name.endsWith(".js.map") || name.endsWith(".d.ts")) {
      // Only delete if a sibling .ts (or .mts) exists — those are TS artifacts.
      const base = name.replace(/\.(js|js\.map|d\.ts)$/, "");
      const tsSibling = join(dir, `${base}.ts`);
      try {
        statSync(tsSibling);
      } catch {
        continue;
      }
      rmSync(full, { force: true });
    }
  }
}

for (const rel of INCLUDED_DIRS) {
  walk(join(ROOT, rel));
}
