#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type Mode = "check-only" | "apply-update" | "check-and-apply";

interface Flags {
  mode: Mode;
  repoRoot: string;
  installDir: string;
  allowDirty: boolean;
  git: string;
  npm: string;
  node: string;
  dryRun: boolean;
  json: boolean;
}

interface CommandEntry {
  cmd: string[];
  cwd: string;
  stage: "inspect" | "apply";
  check?: boolean;
}

interface CommandResult {
  cmd: string[];
  cwd: string;
  code: number;
  stdout: string;
  stderr: string;
}

interface RepoState {
  repo_root: string;
  has_git: boolean;
  branch: string;
  upstream: string;
  dirty: boolean;
  dirty_entries: string[];
}

interface Plan {
  repo_root: string;
  install_dir: string;
  mode: Mode;
  strategy: "git-pull" | "inspect-only";
  allow_dirty: boolean;
  repo_state: RepoState;
  cron_ready: boolean;
  commands: CommandEntry[];
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function expandHome(value: string): string {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function projectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

function defaultInstallDir(): string {
  const hermesHome = path.resolve(expandHome(cleanText(process.env.HERMES_HOME) || "~/.hermes"));
  return path.join(hermesHome, "skills", "grix-hermes");
}

function runCommand(cmd: string[], cwd: string | undefined, check = true): CommandResult {
  const [bin, ...rest] = cmd;
  if (!bin) throw new Error("runCommand received empty cmd");
  const result = spawnSync(bin, rest, { cwd: cwd || undefined, encoding: "utf8" });
  const payload: CommandResult = {
    cmd,
    cwd: cwd || "",
    code: result.status ?? -1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
  if (check && payload.code !== 0) {
    throw new Error(payload.stderr || payload.stdout || `command failed: ${cmd.join(" ")}`);
  }
  return payload;
}

function detectRepoState(repoRoot: string, gitCmd: string): RepoState {
  const state: RepoState = {
    repo_root: repoRoot,
    has_git: fs.existsSync(path.join(repoRoot, ".git")),
    branch: "",
    upstream: "",
    dirty: false,
    dirty_entries: [],
  };
  if (!state.has_git) return state;

  const branch = runCommand([gitCmd, "rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  state.branch = branch.stdout;
  const status = runCommand([gitCmd, "status", "--short"], repoRoot);
  state.dirty_entries = status.stdout.split("\n").map((line) => line).filter((line) => line.trim());
  state.dirty = state.dirty_entries.length > 0;
  const upstream = runCommand(
    [gitCmd, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    repoRoot,
    false,
  );
  if (upstream.code === 0) state.upstream = upstream.stdout;
  return state;
}

function buildPlan(flags: Flags): Plan {
  const repoRoot = path.resolve(cleanText(flags.repoRoot) || projectRoot());
  const rawInstallDir = cleanText(flags.installDir);
  let installDir = rawInstallDir ? path.resolve(expandHome(rawInstallDir)) : "";
  if (!installDir && (flags.mode === "apply-update" || flags.mode === "check-and-apply")) {
    installDir = defaultInstallDir();
  }
  const repoState = detectRepoState(repoRoot, flags.git);
  let strategy: Plan["strategy"] = "git-pull";
  if (!repoState.has_git) {
    if (flags.mode !== "check-only") {
      throw new Error(
        "Repository root is not a git checkout. Pass a git repo root for Hermes skill updates.",
      );
    }
    strategy = "inspect-only";
  }

  const commands: CommandEntry[] = [];
  if (repoState.has_git) {
    commands.push(
      { cmd: [flags.git, "status", "--short"], cwd: repoRoot, stage: "inspect" },
      { cmd: [flags.git, "rev-parse", "--abbrev-ref", "HEAD"], cwd: repoRoot, stage: "inspect" },
      {
        cmd: [flags.git, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        cwd: repoRoot,
        stage: "inspect",
        check: false,
      },
    );
    if (flags.mode === "check-only" || flags.mode === "check-and-apply") {
      commands.push({ cmd: [flags.git, "fetch", "--prune"], cwd: repoRoot, stage: "inspect" });
      if (repoState.upstream) {
        commands.push({
          cmd: [flags.git, "rev-list", "--left-right", "--count", `HEAD...${repoState.upstream}`],
          cwd: repoRoot,
          stage: "inspect",
        });
      }
    }
    if (flags.mode === "apply-update" || flags.mode === "check-and-apply") {
      commands.push({ cmd: [flags.git, "pull", "--ff-only"], cwd: repoRoot, stage: "apply" });
      commands.push({ cmd: [flags.npm, "install"], cwd: repoRoot, stage: "apply" });
    }
  }

  if (installDir && (flags.mode === "apply-update" || flags.mode === "check-and-apply")) {
    commands.push({
      cmd: [
        flags.node,
        path.join(repoRoot, "bin", "grix-hermes.js"),
        "install",
        "--dest",
        installDir,
        "--force",
      ],
      cwd: repoRoot,
      stage: "apply",
    });
  }

  const cronReady = repoState.has_git && !repoState.dirty;

  return {
    repo_root: repoRoot,
    install_dir: installDir,
    mode: flags.mode,
    strategy,
    allow_dirty: flags.allowDirty,
    repo_state: repoState,
    cron_ready: cronReady,
    commands,
  };
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    mode: "check-and-apply",
    repoRoot: "",
    installDir: "",
    allowDirty: false,
    git: "git",
    npm: "npm",
    node: "node",
    dryRun: false,
    json: false,
  };
  const allowedModes: Mode[] = ["check-only", "apply-update", "check-and-apply"];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--mode" && next) {
      if (!allowedModes.includes(next as Mode)) {
        throw new Error(`Invalid --mode: ${next}`);
      }
      flags.mode = next as Mode;
      i += 1;
      continue;
    }
    if (token === "--repo-root" && next !== undefined) {
      flags.repoRoot = next;
      i += 1;
      continue;
    }
    if (token === "--install-dir" && next !== undefined) {
      flags.installDir = next;
      i += 1;
      continue;
    }
    if (token === "--allow-dirty" && next !== undefined) {
      if (next !== "true" && next !== "false") {
        throw new Error(`Invalid --allow-dirty: ${next}`);
      }
      flags.allowDirty = next === "true";
      i += 1;
      continue;
    }
    if (token === "--git" && next !== undefined) {
      flags.git = next;
      i += 1;
      continue;
    }
    if (token === "--npm" && next !== undefined) {
      flags.npm = next;
      i += 1;
      continue;
    }
    if (token === "--node" && next !== undefined) {
      flags.node = next;
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (token === "--json") {
      flags.json = true;
      continue;
    }
  }
  return flags;
}

function main(): number {
  let flags: Flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
    return 1;
  }
  try {
    const plan = buildPlan(flags);
    const results: CommandResult[] = [];

    if (!flags.dryRun) {
      const repoState = plan.repo_state;
      if (
        (plan.mode === "apply-update" || plan.mode === "check-and-apply") &&
        repoState.has_git &&
        repoState.dirty &&
        !flags.allowDirty
      ) {
        throw new Error(
          "Repository has uncommitted changes; refuse to auto-update without --allow-dirty true.",
        );
      }
      for (const entry of plan.commands) {
        const check = entry.check !== false;
        results.push(runCommand(entry.cmd, entry.cwd || undefined, check));
      }
    }

    const payload = {
      ok: true as const,
      dry_run: flags.dryRun,
      results,
      ...plan,
    };
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      process.stdout.write(
        `mode=${plan.mode} strategy=${plan.strategy} dry_run=${flags.dryRun}\n`,
      );
      for (const entry of plan.commands) {
        process.stdout.write(`$ ${entry.cmd.join(" ")}\n`);
      }
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = { ok: false, error: message };
    if (flags.json) {
      process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 1;
  }
}

process.exit(main());
