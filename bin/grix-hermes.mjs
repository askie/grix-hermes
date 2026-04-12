#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { defaultInstallDir, installEntries, manifestData, projectRoot, SKILLS } from "../lib/manifest.mjs";

function printHelp() {
  console.log(`grix-hermes

Usage:
  grix-hermes list
  grix-hermes manifest
  grix-hermes install [--dest <dir>] [--force]
`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { positional, flags };
}

function copyRecursive(src, dest, force) {
  if (fs.existsSync(dest)) {
    if (!force) {
      throw new Error(`Destination already exists: ${dest}. Use --force to overwrite.`);
    }
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function runInstall(flags) {
  const root = projectRoot();
  const destRoot = path.resolve(String(flags.dest || defaultInstallDir()));
  fs.mkdirSync(destRoot, { recursive: true });
  for (const entry of installEntries()) {
    copyRecursive(path.join(root, entry), path.join(destRoot, entry), Boolean(flags.force));
  }
  console.log(destRoot);
}

function runList() {
  for (const skill of SKILLS) {
    console.log(`${skill.name}\t${skill.description}`);
  }
}

function runManifest() {
  console.log(JSON.stringify(manifestData(), null, 2));
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const command = positional[0] || "help";

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (command === "list") {
  runList();
  process.exit(0);
}

if (command === "manifest") {
  runManifest();
  process.exit(0);
}

if (command === "install") {
  runInstall(flags);
  process.exit(0);
}

printHelp();
process.exit(1);
