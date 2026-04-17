#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const NEGATIVE_STATUS_HINTS = [
  "not running",
  "not installed",
  "installed but not running",
  "inactive",
  "stopped",
];

const POSITIVE_STATUS_HINTS = [
  "running",
  "healthy",
  "installed and running",
];

type StartSubcommand = "start" | "run";

interface Flags {
  profileName: string;
  hermesHome: string;
  hermes: string;
  startSubcommand: StartSubcommand;
  statusSubcommand: string;
  json: boolean;
}

interface CommandOutput {
  code: number;
  stdout: string;
  stderr: string;
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

function resolveHermesHome(explicit: string): string {
  const raw = cleanText(explicit) || cleanText(process.env.HERMES_HOME) || "~/.hermes";
  return path.resolve(expandHome(raw));
}

function resolveProfileDir(hermesHome: string, profileName: string): string {
  const normalized = cleanText(profileName);
  if (!normalized || normalized === "default") return hermesHome;
  return path.resolve(path.join(hermesHome, "profiles", normalized));
}

function ensureHermesBinary(hermesCmd: string): void {
  if (hermesCmd.includes(path.sep)) {
    const candidate = path.resolve(expandHome(hermesCmd));
    if (!fs.existsSync(candidate)) {
      throw new Error(`Hermes CLI not found: ${candidate}`);
    }
    return;
  }
  const result = spawnSync("which", [hermesCmd], { encoding: "utf8" });
  if ((result.status ?? -1) !== 0) {
    throw new Error(
      `Hermes CLI '${hermesCmd}' is not available in PATH. ` +
        "Install Hermes first or pass --hermes with an absolute path.",
    );
  }
}

function profilePrefix(hermesCmd: string, profileName: string): string[] {
  const normalized = cleanText(profileName);
  if (!normalized || normalized === "default") return [hermesCmd];
  return [hermesCmd, "--profile", normalized];
}

function runCommand(cmd: string[], env: NodeJS.ProcessEnv, check = true): CommandOutput {
  const [bin, ...rest] = cmd;
  if (!bin) throw new Error("runCommand received empty cmd");
  const result = spawnSync(bin, rest, { encoding: "utf8", env });
  const output: CommandOutput = {
    code: result.status ?? -1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
  if (check && output.code !== 0) {
    throw new Error(output.stderr || output.stdout || `command failed: ${cmd.join(" ")}`);
  }
  return output;
}

function summarizeOutput(result: CommandOutput): string {
  return [cleanText(result.stdout), cleanText(result.stderr)]
    .filter(Boolean)
    .join("\n");
}

function statusIsRunning(result: CommandOutput): boolean {
  if (result.code !== 0) return false;
  const combined = summarizeOutput(result).toLowerCase();
  if (!combined) return false;
  if (NEGATIVE_STATUS_HINTS.some((hint) => combined.includes(hint))) return false;
  return POSITIVE_STATUS_HINTS.some((hint) => combined.includes(hint));
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    profileName: "",
    hermesHome: "",
    hermes: "hermes",
    startSubcommand: "start",
    statusSubcommand: "status",
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    const next = argv[i + 1];
    if (token === "--profile-name" && next !== undefined) { flags.profileName = next; i += 1; continue; }
    if (token === "--hermes-home" && next !== undefined) { flags.hermesHome = next; i += 1; continue; }
    if (token === "--hermes" && next !== undefined) { flags.hermes = next; i += 1; continue; }
    if (token === "--start-subcommand" && next !== undefined) {
      if (next !== "start" && next !== "run") throw new Error(`Invalid --start-subcommand: ${next}`);
      flags.startSubcommand = next as StartSubcommand;
      i += 1;
      continue;
    }
    if (token === "--status-subcommand" && next !== undefined) { flags.statusSubcommand = next; i += 1; continue; }
    if (token === "--json") { flags.json = true; continue; }
  }
  return flags;
}

function main(): number {
  let flags: Flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }

  try {
    const hermesHome = resolveHermesHome(flags.hermesHome);
    const profileName = cleanText(flags.profileName);
    const profileDir = resolveProfileDir(hermesHome, profileName);
    if (!fs.existsSync(profileDir)) {
      throw new Error(`Hermes profile does not exist: ${profileDir}`);
    }

    ensureHermesBinary(flags.hermes);
    const env = { ...process.env, HERMES_HOME: hermesHome };

    const commandPrefix = profilePrefix(flags.hermes, profileName);
    const statusCmd = [...commandPrefix, "gateway", flags.statusSubcommand];
    const statusBefore = runCommand(statusCmd, env, false);
    const alreadyRunning = statusIsRunning(statusBefore);

    let startResult: CommandOutput | null = null;
    if (!alreadyRunning) {
      const startCmd = [...commandPrefix, "gateway", flags.startSubcommand];
      startResult = runCommand(startCmd, env, false);
      if (startResult.code !== 0) {
        throw new Error(
          "Failed to start Hermes gateway.\n" +
            `command: ${startCmd.join(" ")}\n` +
            `output:\n${summarizeOutput(startResult)}`,
        );
      }
    }

    const statusAfter = runCommand(statusCmd, env, false);
    if (!statusIsRunning(statusAfter)) {
      throw new Error(
        "Hermes gateway did not report a running state after startup.\n" +
          `command: ${statusCmd.join(" ")}\n` +
          `output:\n${summarizeOutput(statusAfter)}`,
      );
    }

    const payload = {
      ok: true as const,
      profile_name: profileName || "default",
      hermes_home: hermesHome,
      profile_dir: profileDir,
      already_running: alreadyRunning,
      start_subcommand: flags.startSubcommand,
      status_before: statusBefore,
      status_after: statusAfter,
      start_result: startResult,
    };
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
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
