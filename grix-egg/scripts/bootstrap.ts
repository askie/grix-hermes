#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Section 1: Utility functions
// ---------------------------------------------------------------------------

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

function projectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

function defaultInstallDir(hermesHome: string): string {
  return path.join(hermesHome, "skills", "grix-hermes");
}

function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Section 2: Types
// ---------------------------------------------------------------------------

const STEP_NAMES = ["install", "bind", "soul", "gateway"] as const;
type StepName = (typeof STEP_NAMES)[number];

type StepStatus = "pending" | "done" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

interface StateFile {
  version: 1;
  install_id: string;
  agent_name: string;
  profile_name: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  steps: Record<StepName, StepState>;
}

interface Flags {
  installId: string;
  agentName: string;
  soulContent: string;
  soulFile: string;
  isMain: string;
  route: string;
  profileName: string;
  installDir: string;
  hermesHome: string;
  hermes: string;
  node: string;
  agentId: string;
  apiEndpoint: string;
  apiKey: string;
  bindJson: string;
  resume: boolean;
  dryRun: boolean;
  json: boolean;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface RuntimeCredentials {
  agentId: string;
  agentName: string;
  apiEndpoint: string;
  apiKey: string;
  profileName: string;
}

class BootstrapError extends Error {
  step: StepName;
  stepNumber: number;
  suggestion: string;
  rawError: string;
  constructor(step: StepName, stepNumber: number, reason: string, suggestion: string, rawError: string) {
    super(reason);
    this.name = "BootstrapError";
    this.step = step;
    this.stepNumber = stepNumber;
    this.suggestion = suggestion;
    this.rawError = rawError;
  }
}

// ---------------------------------------------------------------------------
// Section 3: Command execution
// ---------------------------------------------------------------------------

function runCommand(
  cmd: string[],
  options?: { env?: NodeJS.ProcessEnv; cwd?: string; inputText?: string; check?: boolean },
): CommandResult {
  const [bin, ...rest] = cmd;
  if (!bin) throw new Error("runCommand received empty cmd");
  const result = spawnSync(bin, rest, {
    encoding: "utf8",
    env: options?.env,
    cwd: options?.cwd,
    input: options?.inputText,
  });
  const output: CommandResult = {
    code: result.status ?? -1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
  if (options?.check !== false && output.code !== 0) {
    throw new Error(output.stderr || output.stdout || `command failed: ${cmd.join(" ")}`);
  }
  return output;
}

function parseJsonOutput(result: CommandResult): Record<string, unknown> {
  const raw = cleanText(result.stdout);
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function appendTextFlag(cmd: string[], flag: string, value: unknown): void {
  const text = cleanText(value);
  if (text) cmd.push(flag, text);
}

function cleanList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  return cleanText(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function ensurePrivateDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch {
    // Best-effort on filesystems that do not support POSIX permissions.
  }
}

function writePrivateFileAtomic(filePath: string, contents: string): void {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, contents, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tmpPath, 0o600);
  } catch {
    // Best-effort on filesystems that do not support POSIX permissions.
  }
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort on filesystems that do not support POSIX permissions.
  }
}

function redactStateValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactStateValue(item));
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalized === "apikey" || normalized.endsWith("apikey")) {
      result[key] = cleanText(child) ? "ak_***" : "";
      continue;
    }
    result[key] = redactStateValue(child);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Section 4: State file management
// ---------------------------------------------------------------------------

function getStateFilePath(hermesHome: string, installId: string): string {
  return path.join(hermesHome, "tmp", `grix-egg-${installId}.json`);
}

function makeFreshState(flags: Flags): StateFile {
  const emptyStep = (): StepState => ({ status: "pending", at: null, result: null, error: null });
  const steps: Record<StepName, StepState> = {} as Record<StepName, StepState>;
  for (const name of STEP_NAMES) steps[name] = emptyStep();
  return {
    version: 1,
    install_id: flags.installId,
    agent_name: flags.agentName,
    profile_name: flags.profileName || flags.agentName,
    started_at: isoNow(),
    updated_at: isoNow(),
    completed_at: null,
    steps,
  };
}

function loadState(filePath: string): StateFile | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as StateFile;
  } catch {
    return null;
  }
}

function saveState(filePath: string, state: StateFile): void {
  const dir = path.dirname(filePath);
  ensurePrivateDir(dir);
  state.updated_at = isoNow();
  writePrivateFileAtomic(filePath, JSON.stringify(redactStateValue(state), null, 2));
}

function markStepDone(state: StateFile, step: StepName, result: Record<string, unknown>): void {
  state.steps[step] = { status: "done", at: isoNow(), result, error: null };
}

function markStepFailed(state: StateFile, step: StepName, error: string): void {
  state.steps[step] = { status: "failed", at: isoNow(), result: null, error };
}

function markStepSkipped(state: StateFile, step: StepName): void {
  state.steps[step] = { status: "skipped", at: isoNow(), result: null, error: null };
}

function stepIsDone(state: StateFile, step: StepName): boolean {
  return state.steps[step]?.status === "done";
}

// ---------------------------------------------------------------------------
// Section 5: Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    installId: "",
    agentName: "",
    soulContent: "",
    soulFile: "",
    isMain: "true",
    route: "existing",
    profileName: "",
    installDir: "",
    hermesHome: "",
    hermes: "hermes",
    node: "node",
    agentId: "",
    apiEndpoint: "",
    apiKey: "",
    bindJson: "",
    resume: false,
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    const next = argv[i + 1];
    if (token === "--install-id" && next !== undefined) { flags.installId = next; i += 1; continue; }
    if (token === "--agent-name" && next !== undefined) { flags.agentName = next; i += 1; continue; }
    if (token === "--soul-content" && next !== undefined) { flags.soulContent = next; i += 1; continue; }
    if (token === "--soul-file" && next !== undefined) { flags.soulFile = next; i += 1; continue; }
    if (token === "--is-main" && next !== undefined) { flags.isMain = next; i += 1; continue; }
    if (token === "--route" && next !== undefined) { flags.route = next; i += 1; continue; }
    if (token === "--profile-name" && next !== undefined) { flags.profileName = next; i += 1; continue; }
    if (token === "--install-dir" && next !== undefined) { flags.installDir = next; i += 1; continue; }
    if (token === "--hermes-home" && next !== undefined) { flags.hermesHome = next; i += 1; continue; }
    if (token === "--hermes" && next !== undefined) { flags.hermes = next; i += 1; continue; }
    if (token === "--node" && next !== undefined) { flags.node = next; i += 1; continue; }
    if (token === "--agent-id" && next !== undefined) { flags.agentId = next; i += 1; continue; }
    if (token === "--api-endpoint" && next !== undefined) { flags.apiEndpoint = next; i += 1; continue; }
    if (token === "--api-key" && next !== undefined) { flags.apiKey = next; i += 1; continue; }
    if (token === "--bind-json" && next !== undefined) { flags.bindJson = next; i += 1; continue; }
    if (token === "--resume") { flags.resume = true; continue; }
    if (token === "--dry-run") { flags.dryRun = true; continue; }
    if (token === "--json") { flags.json = true; continue; }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Section 6: Script path resolution
// ---------------------------------------------------------------------------

interface ScriptPaths {
  bindScript: string;
  createAndBindScript: string;
  installBin: string;
  startScript: string;
}

function resolveScripts(root: string): ScriptPaths {
  return {
    bindScript: path.join(root, "grix-egg", "scripts", "bind_local.js"),
    createAndBindScript: path.join(root, "grix-register", "scripts", "create_api_agent_and_bind.js"),
    installBin: path.join(root, "bin", "grix-hermes.js"),
    startScript: path.join(root, "grix-egg", "scripts", "start_gateway.js"),
  };
}

// ---------------------------------------------------------------------------
// Section 7: Credentials helpers
// ---------------------------------------------------------------------------

function extractNested(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = payload[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeBindPayload(payload: Record<string, unknown>, flags: Flags): RuntimeCredentials | null {
  const handoff = extractNested(payload, "handoff");
  const bindHermes = extractNested(payload, "bind_hermes");
  const handoffBindHermes = extractNested(handoff, "bind_hermes");
  const bindLocal = extractNested(payload, "bind_local");
  const handoffBindLocal = extractNested(handoff, "bind_local");
  const source = Object.keys(bindHermes).length > 0
    ? bindHermes
    : Object.keys(handoffBindHermes).length > 0
      ? handoffBindHermes
      : Object.keys(bindLocal).length > 0
        ? bindLocal
        : Object.keys(handoffBindLocal).length > 0
          ? handoffBindLocal
          : payload;

  const agentName = cleanText(source.agent_name || source.name || flags.agentName);
  const profileName = cleanText(source.profile_name || agentName || flags.profileName);
  const credentials: RuntimeCredentials = {
    agentId: cleanText(source.agent_id || source.id),
    agentName,
    apiEndpoint: cleanText(source.api_endpoint || source.endpoint),
    apiKey: cleanText(source.api_key),
    profileName,
  };
  return credentials.agentId && credentials.apiEndpoint && credentials.apiKey
    ? credentials
    : null;
}

function credentialsFromFlags(flags: Flags): RuntimeCredentials | null {
  const bindJson = cleanText(flags.bindJson);
  if (bindJson) {
    const raw = bindJson === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(expandHome(bindJson), "utf8");
    const payload = JSON.parse(raw) as Record<string, unknown>;
    return normalizeBindPayload(payload, flags);
  }

  const agentId = cleanText(flags.agentId);
  const apiEndpoint = cleanText(flags.apiEndpoint);
  const apiKey = cleanText(flags.apiKey);
  if (!agentId && !apiEndpoint && !apiKey) return null;

  return agentId && apiEndpoint && apiKey
    ? {
        agentId,
        agentName: cleanText(flags.agentName),
        apiEndpoint,
        apiKey,
        profileName: cleanText(flags.profileName) || cleanText(flags.agentName),
      }
    : null;
}

function requireExistingCredentials(flags: Flags): RuntimeCredentials {
  const credentials = credentialsFromFlags(flags);
  if (!credentials) {
    throw new BootstrapError(
      "bind", 1,
      "--route existing 需要提供 --agent-id、--api-endpoint、--api-key，或提供 --bind-json",
      "已有 agent 绑定必须显式提供完整凭证；不要从 checkpoint 或终端脱敏输出里恢复 API key。",
      "missing existing bind credentials",
    );
  }
  return credentials;
}

// ---------------------------------------------------------------------------
// Section 8: Backup helpers
// ---------------------------------------------------------------------------

function backupExistingState(
  hermesHome: string,
  profileDir: string,
  installDir: string,
): string {
  const candidates = [
    path.join(profileDir, ".env"),
    path.join(profileDir, "config.yaml"),
    path.join(profileDir, "SOUL.md"),
    installDir,
  ].filter((candidate) => fs.existsSync(candidate));
  if (candidates.length === 0) return "";

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const backupRoot = path.join(hermesHome, "backups", "grix-egg", timestamp);
  fs.mkdirSync(backupRoot, { recursive: true });

  for (const source of candidates) {
    const dest = path.join(backupRoot, path.basename(source));
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
      copyDirRecursive(source, dest);
    } else {
      fs.copyFileSync(source, dest);
    }
  }
  return backupRoot;
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Section 9: Step executors
// ---------------------------------------------------------------------------

function stepInstall(
  flags: Flags,
  state: StateFile,
  scripts: ScriptPaths,
  hermesHome: string,
  env: NodeJS.ProcessEnv,
): void {
  if (stepIsDone(state, "install")) return;

  const installDir = cleanText(flags.installDir) || defaultInstallDir(hermesHome);
  const cmd = [flags.node, scripts.installBin, "install", "--dest", installDir, "--force"];
  const root = projectRoot();
  const result = runCommand(cmd, { env, cwd: root });
  markStepDone(state, "install", {
    install_dir: installDir,
    stdout: cleanText(result.stdout),
  });
}

function stepBind(
  flags: Flags,
  state: StateFile,
  scripts: ScriptPaths,
  hermesHome: string,
  env: NodeJS.ProcessEnv,
  credentials: RuntimeCredentials,
): void {
  if (stepIsDone(state, "bind")) return;

  const agentId = cleanText(credentials.agentId);
  const agentName = cleanText(credentials.agentName) || flags.agentName;
  const apiEndpoint = cleanText(credentials.apiEndpoint);
  const apiKey = cleanText(credentials.apiKey);
  const installDir = cleanText(flags.installDir) || defaultInstallDir(hermesHome);
  const profileName = cleanText(credentials.profileName || flags.profileName) || flags.agentName;

  if (!agentId || !apiEndpoint || !apiKey) {
    throw new BootstrapError(
      "bind", 2,
      "绑定需要 agent_id、api_endpoint 和未脱敏 api_key",
      "请显式提供 --agent-id、--api-endpoint、--api-key 或 --bind-json。",
      `agent_id=${agentId}, api_endpoint=${apiEndpoint}, api_key=${apiKey ? "ak_***" : ""}`,
    );
  }

  const bindInput = JSON.stringify({
    agent_name: agentName,
    agent_id: agentId,
    api_endpoint: apiEndpoint,
    api_key: apiKey,
    is_main: flags.isMain,
    profile_name: profileName,
  });

  const cmd = [
    flags.node, scripts.bindScript,
    "--from-json", "-",
    "--profile-mode", "create-or-reuse",
    "--install-dir", installDir,
    "--hermes", flags.hermes,
    "--node", flags.node,
    "--inherit-keys", "global",
    "--is-main", flags.isMain,
    "--profile-name", profileName,
    "--json",
  ];

  const result = runCommand(cmd, { env, inputText: bindInput });
  const payload = parseJsonOutput(result);
  const bindResult = extractNested(payload, "bind_result") || payload;
  const resolvedProfile = cleanText(bindResult.profile_name) || profileName;

  markStepDone(state, "bind", {
    profile_name: resolvedProfile,
    profile_dir: resolveProfileDir(hermesHome, resolvedProfile),
  });
  state.profile_name = resolvedProfile;
}

function stepSoul(
  flags: Flags,
  state: StateFile,
  _scripts: ScriptPaths,
  hermesHome: string,
): void {
  if (stepIsDone(state, "soul")) return;

  const profileName = state.profile_name || flags.profileName || flags.agentName;
  const profileDir = resolveProfileDir(hermesHome, profileName);

  let content: string;
  const soulFile = cleanText(flags.soulFile);
  const soulContent = cleanText(flags.soulContent);

  if (soulFile) {
    if (!fs.existsSync(soulFile)) {
      throw new BootstrapError(
        "soul", 3,
        `SOUL 文件不存在: ${soulFile}`,
        "检查 --soul-file 路径是否正确。",
        `file not found: ${soulFile}`,
      );
    }
    content = fs.readFileSync(soulFile, "utf8");
  } else if (soulContent) {
    content = soulContent;
  } else {
    markStepSkipped(state, "soul");
    return;
  }

  const target = path.join(profileDir, "SOUL.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${content.trimEnd()}\n`, "utf8");

  markStepDone(state, "soul", { soul_path: target });
}

function stepGateway(
  flags: Flags,
  state: StateFile,
  scripts: ScriptPaths,
  hermesHome: string,
  env: NodeJS.ProcessEnv,
): void {
  if (stepIsDone(state, "gateway")) return;

  const profileName = state.profile_name || flags.profileName || flags.agentName;
  const cmd = [
    flags.node, scripts.startScript,
    "--profile-name", profileName,
    "--hermes-home", hermesHome,
    "--hermes", flags.hermes,
    "--json",
  ];

  const result = runCommand(cmd, { env });
  const payload = parseJsonOutput(result);

  markStepDone(state, "gateway", {
    profile_name: profileName,
    start_result: payload,
  });
}

// ---------------------------------------------------------------------------
// Section 10: Main orchestration
// ---------------------------------------------------------------------------

function buildResumeCommand(flags: Flags): string {
  const parts = ["node", "scripts/bootstrap.js"];
  parts.push("--install-id", flags.installId);
  parts.push("--agent-name", flags.agentName);
  parts.push("--route", "existing");
  if (flags.profileName) parts.push("--profile-name", flags.profileName);
  if (flags.soulFile) parts.push("--soul-file", flags.soulFile);
  if (flags.soulContent) parts.push("--soul-content", `'${flags.soulContent.slice(0, 30)}...'`);
  if (flags.agentId) parts.push("--agent-id", flags.agentId);
  if (flags.apiEndpoint) parts.push("--api-endpoint", flags.apiEndpoint);
  if (flags.bindJson && flags.bindJson !== "-") parts.push("--bind-json", flags.bindJson);
  parts.push("--resume", "--json");
  return parts.join(" ");
}

function validateProfileName(profileName: string): void {
  if (!/^(default|[a-z0-9][a-z0-9_-]{0,63})$/.test(profileName)) {
    throw new Error(
      `Invalid Hermes profile name: ${profileName}. Must match [a-z0-9][a-z0-9_-]{0,63}`,
    );
  }
}

async function main(): Promise<number> {
  let flags: Flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }

  if (!cleanText(flags.installId)) {
    process.stderr.write("Missing required flag: --install-id\n");
    return 1;
  }
  if (!cleanText(flags.agentName)) {
    process.stderr.write("Missing required flag: --agent-name\n");
    return 1;
  }
  try {
    validateProfileName(cleanText(flags.profileName) || cleanText(flags.agentName));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }

  const root = projectRoot();
  const scripts = resolveScripts(root);
  const hermesHome = resolveHermesHome(flags.hermesHome);
  const env: NodeJS.ProcessEnv = { ...process.env, HERMES_HOME: hermesHome };
  const stateFile = getStateFilePath(hermesHome, flags.installId);

  // Load or create state
  let state: StateFile;
  if (flags.resume) {
    const loaded = loadState(stateFile);
    if (!loaded) {
      process.stderr.write(`No checkpoint found for --install-id ${flags.installId}. Starting fresh.\n`);
      state = makeFreshState(flags);
    } else {
      state = loaded;
      // Allow flag overrides on resume
      if (cleanText(flags.agentName)) state.agent_name = flags.agentName;
      if (cleanText(flags.profileName)) state.profile_name = flags.profileName;
    }
  } else {
    state = makeFreshState(flags);
  }

  // Dry-run mode
  if (flags.dryRun) {
    const dryRunPayload = {
      ok: true,
      dry_run: true,
      install_id: flags.installId,
      agent_name: flags.agentName,
      profile_name: state.profile_name,
      route: flags.route,
      hermes_home: hermesHome,
      steps: Object.fromEntries(STEP_NAMES.map((name) => [name, state.steps[name]?.status || "pending"])),
    };
    process.stdout.write(`${JSON.stringify(dryRunPayload, null, 2)}\n`);
    return 0;
  }

  // Require existing credentials (agent created by AI agent beforehand)
  const credentials = requireExistingCredentials(flags);

  // Track current step for error reporting
  let currentStep: StepName = "install";

  try {
    saveState(stateFile, state);

    // Backup existing state
    const profileName = state.profile_name || flags.profileName || flags.agentName;
    const profileDir = resolveProfileDir(hermesHome, profileName);
    const installDir = cleanText(flags.installDir) || defaultInstallDir(hermesHome);
    const backupDir = backupExistingState(hermesHome, profileDir, installDir);

    // Step 1: install
    currentStep = "install";
    stepInstall(flags, state, scripts, hermesHome, env);
    saveState(stateFile, state);

    // Step 2: bind
    currentStep = "bind";
    stepBind(flags, state, scripts, hermesHome, env, credentials);
    saveState(stateFile, state);

    // Step 3: soul
    currentStep = "soul";
    stepSoul(flags, state, scripts, hermesHome);
    saveState(stateFile, state);

    // Step 4: gateway
    currentStep = "gateway";
    stepGateway(flags, state, scripts, hermesHome, env);
    saveState(stateFile, state);

    // Success
    state.completed_at = isoNow();
    saveState(stateFile, state);

    const output: Record<string, unknown> = {
      ok: true as const,
      install_id: state.install_id,
      agent_name: state.agent_name,
      profile_name: state.profile_name,
      steps: Object.fromEntries(
        STEP_NAMES.map((name) => [name, { status: state.steps[name].status }]),
      ),
    };
    if (backupDir) output.backup_dir = backupDir;
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  } catch (error) {
    const stepName = error instanceof BootstrapError ? error.step : currentStep;
    const stepNumber = error instanceof BootstrapError ? error.stepNumber : (STEP_NAMES.indexOf(currentStep) + 1);
    const reason = error instanceof Error ? error.message : String(error);
    const suggestion = error instanceof BootstrapError ? error.suggestion : "";
    const rawError = error instanceof BootstrapError ? error.rawError : reason;

    if (error instanceof BootstrapError) {
      markStepFailed(state, error.step, reason);
    } else {
      markStepFailed(state, currentStep, reason);
    }
    saveState(stateFile, state);

    const errorPayload = {
      ok: false as const,
      step: stepName,
      step_number: stepNumber,
      reason,
      suggestion,
      state_file: stateFile,
      resume_command: buildResumeCommand(flags),
      raw_error: rawError,
    };

    if (flags.json) {
      process.stderr.write(`${JSON.stringify(errorPayload, null, 2)}\n`);
    } else {
      process.stderr.write(`${JSON.stringify(errorPayload)}\n`);
    }
    return 1;
  }
}

process.exit(await main());
