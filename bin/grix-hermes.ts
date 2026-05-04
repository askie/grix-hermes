#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  defaultInstallDir,
  installEntries,
  manifestData,
  projectRoot,
  runtimeDependencyEntries,
  SKILLS,
} from "../lib/manifest.js";

function printHelp(): void {
  process.stdout.write(`grix-hermes

Usage:
  grix-hermes list
  grix-hermes manifest
  grix-hermes install [--dest <dir>] [--force] [--skip-cron] [--hermes <path>]
`);
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
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

function samePathOrTarget(a: string, b: string): boolean {
  const resolvedA = path.resolve(a);
  const resolvedB = path.resolve(b);
  if (resolvedA === resolvedB) return true;
  try {
    return fs.realpathSync.native(resolvedA) === fs.realpathSync.native(resolvedB);
  } catch {
    return false;
  }
}

function copyRecursive(src: string, dest: string, force: boolean): void {
  if (samePathOrTarget(src, dest)) {
    return;
  }
  if (fs.existsSync(dest)) {
    if (!force) {
      throw new Error(`Destination already exists: ${dest}. Use --force to overwrite.`);
    }
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

const CRON_JOB_NAME = "grix-hermes-daily-update";

function setupCron(hermesBin: string, installDir: string): void {
  const listResult = spawnSync(hermesBin, ["cron", "list"], { encoding: "utf8" });
  if (listResult.error || listResult.status !== 0) {
    process.stderr.write(
      `[grix-hermes] hermes cron list failed, skipping cron setup. ` +
      `You can manually create it later with:\n` +
      `  hermes cron add --name ${CRON_JOB_NAME} --skill grix-update "0 6 * * *" ` +
      `'Use the grix-update skill with {"install_dir":"${installDir}"}'\n`,
    );
    return;
  }
  if ((listResult.stdout || "").includes(CRON_JOB_NAME)) {
    process.stderr.write(`[grix-hermes] cron job "${CRON_JOB_NAME}" already exists, skipping.\n`);
    return;
  }
  const prompt = `Use the grix-update skill with {"install_dir":"${installDir}"}`;
  const addResult = spawnSync(
    hermesBin,
    ["cron", "add", "--name", CRON_JOB_NAME, "--skill", "grix-update", "0 6 * * *", prompt],
    { encoding: "utf8" },
  );
  if (addResult.error || addResult.status !== 0) {
    process.stderr.write(
      `[grix-hermes] hermes cron add failed, skipping cron setup. ` +
      `You can manually create it later.\n`,
    );
    return;
  }
  process.stderr.write(`[grix-hermes] cron job "${CRON_JOB_NAME}" created (daily at 06:00).\n`);
}

function runInstall(flags: Record<string, string | boolean>): void {
  const root = projectRoot();
  const destRoot = path.resolve(String(flags.dest || defaultInstallDir()));
  fs.mkdirSync(destRoot, { recursive: true });
  for (const entry of installEntries()) {
    copyRecursive(
      path.join(root, entry),
      path.join(destRoot, entry),
      Boolean(flags.force),
    );
  }
  for (const dependency of runtimeDependencyEntries()) {
    copyRecursive(
      dependency.source,
      path.join(destRoot, dependency.dest),
      Boolean(flags.force),
    );
  }
  if (!flags["skip-cron"]) {
    const hermesBin = String(flags.hermes || "hermes");
    setupCron(hermesBin, destRoot);
  }
  process.stdout.write(`${destRoot}\n`);
}

function runList(): void {
  for (const skill of SKILLS) {
    process.stdout.write(`${skill.name}\t${skill.description}\n`);
  }
}

function runManifest(): void {
  process.stdout.write(`${JSON.stringify(manifestData(), null, 2)}\n`);
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
