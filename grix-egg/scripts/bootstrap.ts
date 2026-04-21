#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { hasWsCredentials } from "../../shared/cli/config.js";

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

const STEP_NAMES = ["detect", "install", "create", "bind", "soul", "gateway", "accept"] as const;
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
  route: string;
  path: "ws" | "http" | "";
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  steps: Record<StepName, StepState>;
}

interface Flags {
  installId: string;
  agentName: string;
  statusTarget: string;
  soulContent: string;
  soulFile: string;
  accessToken: string;
  baseUrl: string;
  avatarUrl: string;
  categoryName: string;
  isMain: string;
  route: string;
  profileName: string;
  installDir: string;
  hermesHome: string;
  hermes: string;
  node: string;
  probeMessage: string;
  expectedSubstring: string;
  memberIds: string;
  resume: boolean;
  dryRun: boolean;
  json: boolean;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
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
    route: flags.route,
    path: "",
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
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  state.updated_at = isoNow();
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
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
    statusTarget: "",
    soulContent: "",
    soulFile: "",
    accessToken: "",
    baseUrl: "",
    avatarUrl: "",
    categoryName: "",
    isMain: "true",
    route: "create_new",
    profileName: "",
    installDir: "",
    hermesHome: "",
    hermes: "hermes",
    node: "node",
    probeMessage: "",
    expectedSubstring: "",
    memberIds: "",
    resume: false,
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    const next = argv[i + 1];
    if (token === "--install-id" && next !== undefined) { flags.installId = next; i += 1; continue; }
    if (token === "--agent-name" && next !== undefined) { flags.agentName = next; i += 1; continue; }
    if (token === "--status-target" && next !== undefined) { flags.statusTarget = next; i += 1; continue; }
    if (token === "--soul-content" && next !== undefined) { flags.soulContent = next; i += 1; continue; }
    if (token === "--soul-file" && next !== undefined) { flags.soulFile = next; i += 1; continue; }
    if (token === "--access-token" && next !== undefined) { flags.accessToken = next; i += 1; continue; }
    if (token === "--base-url" && next !== undefined) { flags.baseUrl = next; i += 1; continue; }
    if (token === "--avatar-url" && next !== undefined) { flags.avatarUrl = next; i += 1; continue; }
    if (token === "--category-name" && next !== undefined) { flags.categoryName = next; i += 1; continue; }
    if (token === "--is-main" && next !== undefined) { flags.isMain = next; i += 1; continue; }
    if (token === "--route" && next !== undefined) { flags.route = next; i += 1; continue; }
    if (token === "--profile-name" && next !== undefined) { flags.profileName = next; i += 1; continue; }
    if (token === "--install-dir" && next !== undefined) { flags.installDir = next; i += 1; continue; }
    if (token === "--hermes-home" && next !== undefined) { flags.hermesHome = next; i += 1; continue; }
    if (token === "--hermes" && next !== undefined) { flags.hermes = next; i += 1; continue; }
    if (token === "--node" && next !== undefined) { flags.node = next; i += 1; continue; }
    if (token === "--probe-message" && next !== undefined) { flags.probeMessage = next; i += 1; continue; }
    if (token === "--expected-substring" && next !== undefined) { flags.expectedSubstring = next; i += 1; continue; }
    if (token === "--member-ids" && next !== undefined) { flags.memberIds = next; i += 1; continue; }
    if (token === "--resume") { flags.resume = true; continue; }
    if (token === "--dry-run") { flags.dryRun = true; continue; }
    if (token === "--json") { flags.json = true; continue; }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Section 6: Error suggestion mapping
// ---------------------------------------------------------------------------

function suggestForError(step: StepName, errorMessage: string): string {
  const lower = errorMessage.toLowerCase();
  switch (step) {
    case "detect":
      if (lower.includes("no") && lower.includes("access-token")) {
        return "提供 --access-token 进行 HTTP 注册，或在已配置 GRIX_ENDPOINT/GRIX_AGENT_ID/GRIX_API_KEY 的 Hermes agent 中运行。";
      }
      return "检查运行环境是否有 Grix WS 凭证，或提供 --access-token 走 HTTP 路径。";
    case "install":
      return "确认 npm 包已安装，或指定正确的 --install-dir。";
    case "create":
      if (lower.includes("already") || lower.includes("已存在") || lower.includes("duplicate")) {
        return "Agent 已存在。使用 --route existing 继续安装，或用不同的 --agent-name 重试。";
      }
      if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("auth")) {
        return "认证失败。WS 路径：检查 GRIX_API_KEY 是否过期；HTTP 路径：检查 --access-token 是否有效。";
      }
      return "创建远端 agent 失败。检查网络连通性和认证凭证。";
    case "bind":
      if (lower.includes("***") || lower.includes("mask") || lower.includes("遮掩")) {
        return "API key 被遮掩。这通常是因为 Hermes 输出过滤。确保 --inherit-keys global 已自动传入。";
      }
      if (lower.includes("profile") && (lower.includes("exist") || lower.includes("已存在"))) {
        return "Profile 已存在。脚本自动使用 create-or-reuse 模式。如需全新创建，先删除旧 profile。";
      }
      return "绑定失败。检查 .env 文件权限和 profile 目录是否可写。";
    case "soul":
      return "SOUL.md 写入失败。检查 profile 目录是否存在且有写权限。";
    case "gateway":
      if (lower.includes("not found") || lower.includes("not available")) {
        return "Hermes CLI 未找到。确保 hermes 在 PATH 中，或用 --hermes 指定完整路径。";
      }
      return "网关启动失败。检查 SOUL.md 和 .env 内容是否正确，查看 Hermes 日志获取详情。";
    case "accept":
      if (lower.includes("timeout") || lower.includes("超时")) {
        return "Agent 未在超时时间内回复预期内容。检查：(1) SOUL.md 内容，(2) 网关是否在线，(3) agent 是否已连接。";
      }
      if (lower.includes("session_id") || lower.includes("session")) {
        return "测试群创建失败。检查 Grix 连接和 WS session 是否有效。";
      }
      return "验收测试失败。检查 agent 是否在线并能正常回复。";
  }
}

// ---------------------------------------------------------------------------
// Section 7: Script path resolution
// ---------------------------------------------------------------------------

interface ScriptPaths {
  adminScript: string;
  bindScript: string;
  createAndBindScript: string;
  installBin: string;
  startScript: string;
  cardScript: string;
  sendScript: string;
  groupScript: string;
  queryScript: string;
}

function resolveScripts(root: string): ScriptPaths {
  return {
    adminScript: path.join(root, "grix-admin", "scripts", "admin.js"),
    bindScript: path.join(root, "grix-admin", "scripts", "bind_local.js"),
    createAndBindScript: path.join(root, "grix-register", "scripts", "create_api_agent_and_bind.js"),
    installBin: path.join(root, "bin", "grix-hermes.js"),
    startScript: path.join(root, "grix-egg", "scripts", "start_gateway.js"),
    cardScript: path.join(root, "message-send", "scripts", "card-link.js"),
    sendScript: path.join(root, "message-send", "scripts", "send.js"),
    groupScript: path.join(root, "grix-group", "scripts", "group.js"),
    queryScript: path.join(root, "grix-query", "scripts", "query.js"),
  };
}

// ---------------------------------------------------------------------------
// Section 8: Step executors
// ---------------------------------------------------------------------------

function stepDetect(
  flags: Flags,
  state: StateFile,
  _scripts: ScriptPaths,
  hermesHome: string,
): void {
  if (stepIsDone(state, "detect")) return;

  const useWs = hasWsCredentials({ hermesHome });
  if (useWs) {
    markStepDone(state, "detect", { path: "ws" });
  } else if (cleanText(flags.accessToken)) {
    markStepDone(state, "detect", { path: "http" });
  } else {
    throw new BootstrapError(
      "detect", 1,
      "未检测到 Grix WS 凭证，且未提供 --access-token",
      "提供 --access-token 进行 HTTP 注册，或在已配置 GRIX_ENDPOINT/GRIX_AGENT_ID/GRIX_API_KEY 的环境中运行。",
      "hasWsCredentials=false, accessToken=empty",
    );
  }
}

function backupExistingState(
  hermesHome: string,
  route: string,
  profileDir: string,
  installDir: string,
): string {
  if (route !== "existing") return "";
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

function stepCreate(
  flags: Flags,
  state: StateFile,
  scripts: ScriptPaths,
  hermesHome: string,
  env: NodeJS.ProcessEnv,
): void {
  if (stepIsDone(state, "create")) return;

  const detectedPath = state.steps.detect?.result?.["path"];
  if (detectedPath === "ws") {
    stepCreateWs(flags, state, scripts, env);
  } else {
    stepCreateHttp(flags, state, scripts, hermesHome, env);
  }
}

function stepCreateWs(
  flags: Flags,
  state: StateFile,
  scripts: ScriptPaths,
  env: NodeJS.ProcessEnv,
): void {
  const cmd = [flags.node, scripts.adminScript, "--action", "create_grix"];
  appendTextFlag(cmd, "--agent-name", flags.agentName);
  appendTextFlag(cmd, "--introduction", flags.agentName);
  appendTextFlag(cmd, "--is-main", flags.isMain);
  appendTextFlag(cmd, "--category-name", flags.categoryName);

  const result = runCommand(cmd, { env });
  const payload = parseJsonOutput(result);

  const createdAgent = extractNested(payload, "data") || payload;
  const agentId = cleanText(createdAgent.agent_id || createdAgent.id);
  const apiEndpoint = cleanText(createdAgent.api_endpoint || createdAgent.endpoint);
  const apiKey = cleanText(createdAgent.api_key);
  const agentName = cleanText(createdAgent.agent_name || createdAgent.name || flags.agentName);

  if (!agentId || !apiEndpoint) {
    throw new BootstrapError(
      "create", 3,
      `WS 创建 agent 未返回有效凭证。agent_id=${agentId}, api_endpoint=${apiEndpoint}`,
      "检查 WS 连接和 GRIX_API_KEY 是否有效。确认 agent_api_create 接口正常。",
      result.stderr || result.stdout,
    );
  }

  markStepDone(state, "create", {
    path: "ws",
    agent_id: agentId,
    agent_name: agentName,
    api_endpoint: apiEndpoint,
    api_key: apiKey ? "ak_***" : "",
  });

  // Store full credentials internally (not in the state file's visible result)
  state.steps.create.result!._agent_id = agentId;
  state.steps.create.result!._api_endpoint = apiEndpoint;
  state.steps.create.result!._api_key = apiKey;
}

function stepCreateHttp(
  flags: Flags,
  state: StateFile,
  scripts: ScriptPaths,
  hermesHome: string,
  env: NodeJS.ProcessEnv,
): void {
  const installDir = cleanText(flags.installDir) || defaultInstallDir(hermesHome);
  const profileName = cleanText(flags.profileName) || flags.agentName;
  const cmd = [
    flags.node,
    scripts.createAndBindScript,
    "--access-token", flags.accessToken,
    "--agent-name", flags.agentName,
    "--profile-mode", "create-or-reuse",
    "--install-dir", installDir,
    "--profile-name", profileName,
    "--is-main", flags.isMain,
    "--json",
  ];
  appendTextFlag(cmd, "--base-url", flags.baseUrl);
  appendTextFlag(cmd, "--avatar-url", flags.avatarUrl);

  const result = runCommand(cmd, { env });
  const payload = parseJsonOutput(result);

  const bindResult = extractNested(payload, "bind_result") || payload;
  const agentId = cleanText(bindResult.agent_id);
  const apiEndpoint = cleanText(bindResult.api_endpoint);
  const apiKey = cleanText(bindResult.api_key);
  const agentName = cleanText(bindResult.agent_name || flags.agentName);
  const resolvedProfileName = cleanText(bindResult.profile_name || flags.profileName);

  if (!agentId || !apiEndpoint) {
    throw new BootstrapError(
      "create", 3,
      `HTTP 创建 agent 未返回有效凭证。agent_id=${agentId}, api_endpoint=${apiEndpoint}`,
      "检查 --access-token 是否有效，网络是否能访问 Grix API。",
      result.stderr || result.stdout,
    );
  }

  markStepDone(state, "create", {
    path: "http",
    agent_id: agentId,
    agent_name: agentName,
    api_endpoint: apiEndpoint,
    api_key: apiKey ? "ak_***" : "",
    profile_name: resolvedProfileName,
  });
  state.steps.create.result!._agent_id = agentId;
  state.steps.create.result!._api_endpoint = apiEndpoint;
  state.steps.create.result!._api_key = apiKey;
}

function stepBind(
  flags: Flags,
  state: StateFile,
  scripts: ScriptPaths,
  hermesHome: string,
  env: NodeJS.ProcessEnv,
): void {
  if (stepIsDone(state, "bind")) return;

  const createResult = state.steps.create?.result;
  const detectedPath = state.steps.detect?.result?.["path"];

  if (detectedPath === "http") {
    // HTTP path: create_api_agent_and_bind already did binding
    // Extract bind result from create step
    const profileName = cleanText(createResult?.profile_name) || flags.profileName || flags.agentName;
    markStepDone(state, "bind", {
      profile_name: profileName,
      profile_dir: resolveProfileDir(hermesHome, profileName),
      via: "http_create_and_bind",
    });
    state.profile_name = profileName;
    return;
  }

  // WS path: need to run bind_local separately
  const agentId = cleanText(createResult?._agent_id);
  const agentName = cleanText(createResult?.agent_name) || flags.agentName;
  const apiEndpoint = cleanText(createResult?._api_endpoint);
  const apiKey = cleanText(createResult?._api_key);
  const installDir = cleanText(flags.installDir) || defaultInstallDir(hermesHome);
  const profileName = cleanText(flags.profileName) || flags.agentName;

  if (!agentId || !apiEndpoint) {
    throw new BootstrapError(
      "bind", 4,
      "绑定需要 create 步骤的 agent_id 和 api_endpoint",
      "create 步骤可能未完成或结果丢失。使用 --resume 从 create 步骤重试。",
      `agent_id=${agentId}, api_endpoint=${apiEndpoint}`,
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
        "soul", 5,
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

async function stepAccept(
  flags: Flags,
  state: StateFile,
  scripts: ScriptPaths,
  hermesHome: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (stepIsDone(state, "accept")) return;

  const probeMessage = cleanText(flags.probeMessage);
  const expectedSubstring = cleanText(flags.expectedSubstring);

  if (!probeMessage || !expectedSubstring) {
    markStepSkipped(state, "accept");
    return;
  }

  // Create test group
  const groupCmd = [
    flags.node, scripts.groupScript,
    "--action", "create",
    "--name", `验收测试-${state.agent_name}`,
  ];
  const memberIds = cleanText(flags.memberIds);
  if (memberIds) groupCmd.push("--member-ids", memberIds);
  const groupResult = runCommand(groupCmd, { env });
  const groupPayload = parseJsonOutput(groupResult);
  const acceptanceSessionId = extractSessionId(groupPayload);

  if (!acceptanceSessionId) {
    throw new BootstrapError(
      "accept", 7,
      `测试群创建未返回 session_id: ${JSON.stringify(groupPayload)}`,
      "检查 Grix WS 连接是否正常，session 是否有效。",
      groupResult.stderr || groupResult.stdout,
    );
  }

  // Send conversation card to status_target
  const statusTarget = cleanText(flags.statusTarget);
  if (statusTarget) {
    const cardCmd = [
      flags.node, scripts.cardScript,
      "conversation",
      "--session-id", acceptanceSessionId,
      "--session-type", "group",
      "--title", `验收测试-${state.agent_name}`,
    ];
    const cardResult = runCommand(cardCmd, { env });
    const cardText = cleanText(cardResult.stdout);
    if (cardText) {
      runCommand([flags.node, scripts.sendScript, "--to", statusTarget, "--message", cardText], { env });
    }
  }

  // Send probe message to test group
  runCommand([flags.node, scripts.sendScript, "--to", acceptanceSessionId, "--message", probeMessage], { env });

  // Poll message history for expected substring
  const timeoutSeconds = 15;
  const pollInterval = 1;
  const expectedLower = expectedSubstring.toLowerCase();
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastQuery: Record<string, unknown> = {};

  while (Date.now() < deadline) {
    const queryResult = runCommand([
      flags.node, scripts.queryScript,
      "--action", "message_history",
      "--session-id", acceptanceSessionId,
      "--limit", "10",
    ], { env });
    lastQuery = parseJsonOutput(queryResult);
    const haystack = JSON.stringify(lastQuery).toLowerCase();
    if (haystack.includes(expectedLower)) {
      markStepDone(state, "accept", {
        session_id: acceptanceSessionId,
        verified: true,
        probe_message: probeMessage,
        expected_substring: expectedSubstring,
        query_result: lastQuery,
      });
      return;
    }
    await sleep(pollInterval * 1000);
  }

  throw new BootstrapError(
    "accept", 7,
    `验收超时：agent 未在 ${timeoutSeconds} 秒内回复包含「${expectedSubstring}」的内容`,
    "检查：(1) SOUL.md 内容是否正确，(2) 网关是否在线（hermes --profile <name> gateway status），(3) agent 是否已连接到 Grix。",
    `last_query: ${JSON.stringify(lastQuery)}`,
  );
}

// ---------------------------------------------------------------------------
// Section 9: Helpers
// ---------------------------------------------------------------------------

function extractNested(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = payload[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractSessionId(payload: Record<string, unknown>): string {
  for (const key of ["session_id", "sessionId"]) {
    const value = cleanText(payload[key]);
    if (value) return value;
  }
  for (const nestedKey of ["data", "ack", "resolvedTarget"]) {
    const nested = extractNested(payload, nestedKey);
    if (Object.keys(nested).length > 0) {
      const sessionId = extractSessionId(nested);
      if (sessionId) return sessionId;
    }
  }
  return "";
}

function sendStatusCard(
  scripts: ScriptPaths,
  flags: Flags,
  status: string,
  step: string,
  summary: string,
  env: NodeJS.ProcessEnv,
): void {
  const target = cleanText(flags.statusTarget);
  if (!target) return;
  try {
    const cardCmd = [
      flags.node, scripts.cardScript,
      "egg-status",
      "--install-id", flags.installId,
      "--status", status,
      "--step", step,
      "--summary", summary,
    ];
    const cardResult = runCommand(cardCmd, { env });
    const cardText = cleanText(cardResult.stdout);
    if (cardText) {
      runCommand([flags.node, scripts.sendScript, "--to", target, "--message", cardText], { env });
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Section 10: Main orchestration
// ---------------------------------------------------------------------------

function buildResumeCommand(flags: Flags): string {
  const parts = ["node", "scripts/bootstrap.js"];
  parts.push("--install-id", flags.installId);
  parts.push("--agent-name", flags.agentName);
  if (flags.soulFile) parts.push("--soul-file", flags.soulFile);
  if (flags.soulContent) parts.push("--soul-content", `'${flags.soulContent.slice(0, 30)}...'`);
  if (flags.statusTarget) parts.push("--status-target", flags.statusTarget);
  if (flags.probeMessage) parts.push("--probe-message", flags.probeMessage);
  if (flags.expectedSubstring) parts.push("--expected-substring", flags.expectedSubstring);
  parts.push("--resume", "--json");
  return parts.join(" ");
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

  // Track current step for error reporting
  let currentStep: StepName = "detect";

  try {
    sendStatusCard(scripts, flags, "running", "preparing", "开始孵化 agent", env);
    saveState(stateFile, state);

    // Backup for existing route
    const profileName = state.profile_name || flags.profileName || flags.agentName;
    const profileDir = resolveProfileDir(hermesHome, profileName);
    const installDir = cleanText(flags.installDir) || defaultInstallDir(hermesHome);
    const backupDir = backupExistingState(hermesHome, flags.route, profileDir, installDir);

    // Step 1: detect
    currentStep = "detect";
    stepDetect(flags, state, scripts, hermesHome);
    saveState(stateFile, state);

    // Step 2: install
    currentStep = "install";
    stepInstall(flags, state, scripts, hermesHome, env);
    saveState(stateFile, state);

    // Step 3: create
    currentStep = "create";
    stepCreate(flags, state, scripts, hermesHome, env);
    saveState(stateFile, state);

    // Step 4: bind
    currentStep = "bind";
    stepBind(flags, state, scripts, hermesHome, env);
    saveState(stateFile, state);

    // Step 5: soul
    currentStep = "soul";
    stepSoul(flags, state, scripts, hermesHome);
    saveState(stateFile, state);

    // Step 6: gateway
    currentStep = "gateway";
    stepGateway(flags, state, scripts, hermesHome, env);
    saveState(stateFile, state);

    // Step 7: accept (async due to polling)
    currentStep = "accept";
    await stepAccept(flags, state, scripts, hermesHome, env);
    saveState(stateFile, state);

    // Success
    state.completed_at = isoNow();
    saveState(stateFile, state);

    sendStatusCard(scripts, flags, "success", "complete", "Agent 孵化完成", env);

    const output: Record<string, unknown> = {
      ok: true as const,
      install_id: state.install_id,
      agent_name: state.agent_name,
      profile_name: state.profile_name,
      route: state.route,
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
    const suggestion = error instanceof BootstrapError ? error.suggestion : suggestForError(currentStep, reason);
    const rawError = error instanceof BootstrapError ? error.rawError : reason;

    if (error instanceof BootstrapError) {
      markStepFailed(state, error.step, reason);
    } else {
      markStepFailed(state, currentStep, reason);
    }
    saveState(stateFile, state);

    sendStatusCard(scripts, flags, "failed", stepName, reason.slice(0, 100), env);

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
