#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { hasWsCredentials } from "../../shared/cli/config.js";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanBoolText(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  const normalized = cleanText(value).toLowerCase();
  return normalized === "true" || normalized === "false" ? normalized : "";
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

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

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

function appendBoolFlag(cmd: string[], flag: string, value: unknown): void {
  const normalized = cleanBoolText(value);
  if (normalized) cmd.push(flag, normalized);
}

interface BindOptions {
  profile_name: string;
  profile_mode: string;
  clone_from: string;
  account_id: string;
  allowed_users: string;
  allow_all_users: string;
  home_channel: string;
  home_channel_name: string;
  is_main: string;
}

function mergeBindOptions(
  payload: Record<string, unknown>,
  profileName: string,
  isMainText: string,
): BindOptions {
  const bind = asRecord(payload.bind);
  const install = asRecord(payload.install);
  return {
    profile_name:
      cleanText(profileName) ||
      cleanText(bind.profile_name) ||
      cleanText(install.profile_name),
    profile_mode:
      cleanText(bind.profile_mode) ||
      cleanText(payload.profile_mode) ||
      "create-or-reuse",
    clone_from: cleanText(bind.clone_from) || cleanText(payload.clone_from),
    account_id: cleanText(bind.account_id) || cleanText(payload.account_id),
    allowed_users: cleanText(bind.allowed_users) || cleanText(payload.allowed_users),
    allow_all_users: cleanBoolText(bind.allow_all_users || payload.allow_all_users),
    home_channel: cleanText(bind.home_channel) || cleanText(payload.home_channel),
    home_channel_name: cleanText(bind.home_channel_name) || cleanText(payload.home_channel_name),
    is_main: isMainText || cleanBoolText(bind.is_main || payload.is_main),
  };
}

function buildBindInputPayload(
  payload: Record<string, unknown>,
  bindOptions: BindOptions,
): Record<string, unknown> {
  const bindHermes = asRecord(payload.bind_hermes);
  if (Object.keys(bindHermes).length > 0) {
    return {
      ...bindHermes,
      profile_name: bindOptions.profile_name || cleanText(bindHermes.profile_name),
    };
  }
  const remoteAgent = asRecord(payload.remote_agent);
  if (Object.keys(remoteAgent).length > 0) {
    return {
      profile_name:
        bindOptions.profile_name ||
        cleanText(remoteAgent.profile_name || remoteAgent.agent_name),
      agent_name: cleanText(remoteAgent.agent_name || remoteAgent.name),
      agent_id: cleanText(remoteAgent.agent_id || remoteAgent.id),
      api_endpoint: cleanText(remoteAgent.api_endpoint),
      api_key: cleanText(remoteAgent.api_key),
      is_main: bindOptions.is_main,
    };
  }
  return payload;
}

function inferProfileName(
  payload: Record<string, unknown>,
  install: Record<string, unknown>,
): string {
  const direct = cleanText(payload.profile_name) || cleanText(install.profile_name);
  if (direct) return direct;
  const remoteAgent = asRecord(payload.remote_agent);
  if (Object.keys(remoteAgent).length > 0) {
    return cleanText(remoteAgent.profile_name || remoteAgent.agent_name || remoteAgent.name);
  }
  const register = asRecord(payload.grix_register);
  if (Object.keys(register).length > 0) {
    return cleanText(register.profile_name || register.agent_name);
  }
  const admin = asRecord(payload.grix_admin);
  if (Object.keys(admin).length > 0) {
    return cleanText(admin.profile_name || admin.agent_name);
  }
  const bindHermes = asRecord(payload.bind_hermes);
  if (Object.keys(bindHermes).length > 0) {
    return cleanText(bindHermes.profile_name || bindHermes.agent_name);
  }
  return "";
}

interface BindStep {
  kind: "register" | "admin" | "bind";
  primary_cmd: string[];
  primary_input: string | null;
  followup_cmd?: string[];
}

interface ScriptPaths {
  createAndBindScript: string;
  adminScript: string;
  cardScript: string;
  sendScript: string;
  groupScript: string;
  queryScript: string;
  startScript: string;
  node: string;
  hermes: string;
}

function buildBindStep(
  payload: Record<string, unknown>,
  scripts: ScriptPaths,
  installDir: string,
  bindOptions: BindOptions,
  hermesHome: string,
): BindStep {
  const register = asRecord(payload.grix_register);
  const admin = asRecord(payload.grix_admin);

  if (Object.keys(register).length > 0) {
    const cmd = [
      scripts.node,
      scripts.createAndBindScript,
      "--profile-mode",
      bindOptions.profile_mode,
      "--install-dir",
      installDir,
      "--hermes",
      scripts.hermes,
      "--node",
      scripts.node,
    ];
    appendTextFlag(cmd, "--access-token", register.access_token);
    appendTextFlag(cmd, "--agent-name", register.agent_name || bindOptions.profile_name);
    appendTextFlag(cmd, "--avatar-url", register.avatar_url);
    appendTextFlag(cmd, "--base-url", register.base_url);
    appendTextFlag(cmd, "--profile-name", bindOptions.profile_name);
    // HTTP registration is only used when there are no WS credentials,
    // which means this is the first/main agent setup. Always is_main=true.
    cmd.push("--is-main", "true");
    appendTextFlag(cmd, "--clone-from", bindOptions.clone_from);
    appendTextFlag(cmd, "--account-id", bindOptions.account_id);
    appendTextFlag(cmd, "--allowed-users", bindOptions.allowed_users);
    appendBoolFlag(cmd, "--allow-all-users", bindOptions.allow_all_users);
    appendTextFlag(cmd, "--home-channel", bindOptions.home_channel);
    appendTextFlag(cmd, "--home-channel-name", bindOptions.home_channel_name);
    cmd.push("--json");
    return { kind: "register", primary_cmd: cmd, primary_input: null };
  }

  if (Object.keys(admin).length > 0) {
    const createCmd = [scripts.node, scripts.adminScript, "--action", "create_grix"];
    appendTextFlag(createCmd, "--agent-name", admin.agent_name || bindOptions.profile_name);
    appendTextFlag(createCmd, "--introduction", admin.introduction);
    appendBoolFlag(createCmd, "--is-main", bindOptions.is_main || admin.is_main);
    appendTextFlag(createCmd, "--category-id", admin.category_id);
    appendTextFlag(createCmd, "--category-name", admin.category_name);
    appendTextFlag(createCmd, "--parent-category-id", admin.parent_category_id);

    const bindCmd = [
      scripts.node,
      path.join(projectRoot(), "grix-admin", "scripts", "bind_local.js"),
      "--from-json",
      "-",
      "--profile-mode",
      bindOptions.profile_mode,
      "--install-dir",
      installDir,
      "--hermes",
      scripts.hermes,
      "--node",
      scripts.node,
    ];
    appendTextFlag(bindCmd, "--profile-name", bindOptions.profile_name);
    appendBoolFlag(bindCmd, "--is-main", bindOptions.is_main);
    appendTextFlag(bindCmd, "--clone-from", bindOptions.clone_from);
    appendTextFlag(bindCmd, "--account-id", bindOptions.account_id);
    appendTextFlag(bindCmd, "--allowed-users", bindOptions.allowed_users);
    appendBoolFlag(bindCmd, "--allow-all-users", bindOptions.allow_all_users);
    appendTextFlag(bindCmd, "--home-channel", bindOptions.home_channel);
    appendTextFlag(bindCmd, "--home-channel-name", bindOptions.home_channel_name);
    bindCmd.push("--json");

    return {
      kind: "admin",
      primary_cmd: createCmd,
      primary_input: null,
      followup_cmd: bindCmd,
    };
  }

  // Auto-detect: if neither grix_register nor grix_admin is specified but the task
  // needs agent creation (has agent_name but no bind_hermes/remote_agent credentials),
  // probe for WS credentials and route to grix_admin automatically.
  const bindHermes = asRecord(payload.bind_hermes);
  const remoteAgent = asRecord(payload.remote_agent);
  const hasDirectCredentials =
    Object.keys(bindHermes).length > 0 || Object.keys(remoteAgent).length > 0;

  if (!hasDirectCredentials) {
    const agentName =
      cleanText(payload.agent_name) ||
      cleanText(bindOptions.profile_name);
    if (agentName) {
      if (hasWsCredentials({ hermesHome })) {
        const createCmd = [scripts.node, scripts.adminScript, "--action", "create_grix"];
        appendTextFlag(createCmd, "--agent-name", agentName);
        appendBoolFlag(createCmd, "--is-main", bindOptions.is_main);

        const autoBindCmd = [
          scripts.node,
          path.join(projectRoot(), "grix-admin", "scripts", "bind_local.js"),
          "--from-json",
          "-",
          "--profile-mode",
          bindOptions.profile_mode,
          "--install-dir",
          installDir,
          "--hermes",
          scripts.hermes,
          "--node",
          scripts.node,
        ];
        appendTextFlag(autoBindCmd, "--profile-name", bindOptions.profile_name);
        appendBoolFlag(autoBindCmd, "--is-main", bindOptions.is_main);
        appendTextFlag(autoBindCmd, "--clone-from", bindOptions.clone_from);
        appendTextFlag(autoBindCmd, "--account-id", bindOptions.account_id);
        appendTextFlag(autoBindCmd, "--allowed-users", bindOptions.allowed_users);
        appendBoolFlag(autoBindCmd, "--allow-all-users", bindOptions.allow_all_users);
        appendTextFlag(autoBindCmd, "--home-channel", bindOptions.home_channel);
        appendTextFlag(autoBindCmd, "--home-channel-name", bindOptions.home_channel_name);
        autoBindCmd.push("--json");

        return {
          kind: "admin",
          primary_cmd: createCmd,
          primary_input: null,
          followup_cmd: autoBindCmd,
        };
      }

      throw new Error(
        "No grix_register (with access_token) or grix_admin specified, " +
        "and no Grix WS credentials found in the current environment. " +
        "Provide grix_register with access_token for HTTP registration, " +
        "or run inside a Hermes agent with GRIX_ENDPOINT/GRIX_AGENT_ID/GRIX_API_KEY configured.",
      );
    }
  }

  const bindCmd = [
    scripts.node,
    path.join(projectRoot(), "grix-admin", "scripts", "bind_local.js"),
    "--from-json",
    "-",
    "--profile-mode",
    bindOptions.profile_mode,
    "--install-dir",
    installDir,
    "--hermes",
    scripts.hermes,
    "--node",
    scripts.node,
  ];
  appendTextFlag(bindCmd, "--profile-name", bindOptions.profile_name);
  appendBoolFlag(bindCmd, "--is-main", bindOptions.is_main);
  appendTextFlag(bindCmd, "--clone-from", bindOptions.clone_from);
  appendTextFlag(bindCmd, "--account-id", bindOptions.account_id);
  appendTextFlag(bindCmd, "--allowed-users", bindOptions.allowed_users);
  appendBoolFlag(bindCmd, "--allow-all-users", bindOptions.allow_all_users);
  appendTextFlag(bindCmd, "--home-channel", bindOptions.home_channel);
  appendTextFlag(bindCmd, "--home-channel-name", bindOptions.home_channel_name);
  bindCmd.push("--json");
  const bindPayload = buildBindInputPayload(payload, bindOptions);
  return {
    kind: "bind",
    primary_cmd: bindCmd,
    primary_input: JSON.stringify(bindPayload),
  };
}

function writeSoul(profileDir: string, payload: Record<string, unknown>): string {
  const soulFile = cleanText(payload.soul_file);
  const soulMarkdown = payload.soul_markdown;
  let content: string;
  if (soulFile) {
    content = fs.readFileSync(soulFile, "utf8");
  } else if (typeof soulMarkdown === "string" && cleanText(soulMarkdown)) {
    content = soulMarkdown;
  } else {
    return "";
  }
  const target = path.join(profileDir, "SOUL.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${content.trimEnd()}\n`, "utf8");
  return target;
}

function backupExistingState(
  hermesHome: string,
  route: string,
  profileDir: string,
  installDir: string,
): string {
  if (route !== "hermes_existing") return "";
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

function buildInstallCommand(nodeBin: string, installDir: string): string[] {
  return [
    nodeBin,
    path.join(projectRoot(), "bin", "grix-hermes.js"),
    "install",
    "--dest",
    installDir,
    "--force",
  ];
}

function buildStartCommand(
  scripts: ScriptPaths,
  hermesHome: string,
  profileName: string,
): string[] {
  return [
    scripts.node,
    scripts.startScript,
    "--profile-name",
    profileName,
    "--hermes-home",
    hermesHome,
    "--hermes",
    scripts.hermes,
    "--json",
  ];
}

function buildCardCommand(
  scripts: ScriptPaths,
  installId: string,
  status: string,
  step: string,
  summary: string,
): string[] {
  return [
    scripts.node,
    scripts.cardScript,
    "egg-status",
    "--install-id",
    installId,
    "--status",
    status,
    "--step",
    step,
    "--summary",
    summary,
  ];
}

function sendMessage(
  scripts: ScriptPaths,
  target: string,
  message: string,
  env: NodeJS.ProcessEnv,
): Record<string, unknown> {
  const result = runCommand(
    [scripts.node, scripts.sendScript, "--to", target, "--message", message],
    { env },
  );
  return parseJsonOutput(result);
}

function maybeSendStatusCard(
  scripts: ScriptPaths,
  installId: string,
  status: string,
  step: string,
  summary: string,
  target: string,
  env: NodeJS.ProcessEnv,
): Record<string, unknown> | null {
  if (!cleanText(target)) return null;
  const card = runCommand(buildCardCommand(scripts, installId, status, step, summary), { env });
  return sendMessage(scripts, target, cleanText(card.stdout), env);
}

function extractSessionId(payload: Record<string, unknown>): string {
  for (const key of ["session_id", "sessionId"]) {
    const value = cleanText(payload[key]);
    if (value) return value;
  }
  for (const nestedKey of ["data", "ack", "resolvedTarget"]) {
    const nested = asRecord(payload[nestedKey]);
    if (Object.keys(nested).length > 0) {
      const sessionId = extractSessionId(nested);
      if (sessionId) return sessionId;
    }
  }
  return "";
}

function createAcceptanceGroup(
  scripts: ScriptPaths,
  acceptance: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Record<string, unknown> {
  const memberIds = asList(acceptance.member_ids)
    .map((item) => cleanText(item))
    .filter(Boolean);
  const memberTypes = asList(acceptance.member_types)
    .map((item) => cleanText(item))
    .filter(Boolean);
  const cmd = [
    scripts.node,
    scripts.groupScript,
    "--action",
    "create",
    "--name",
    cleanText(acceptance.group_name) || "Grix Hermes Acceptance",
  ];
  if (memberIds.length > 0) cmd.push("--member-ids", memberIds.join(","));
  if (memberTypes.length > 0) cmd.push("--member-types", memberTypes.join(","));
  return parseJsonOutput(runCommand(cmd, { env }));
}

async function verifyAcceptance(
  scripts: ScriptPaths,
  env: NodeJS.ProcessEnv,
  sessionId: string,
  acceptance: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const probeMessage = cleanText(acceptance.probe_message);
  const expectedSubstring = cleanText(acceptance.expected_substring);
  if (!probeMessage || !expectedSubstring) {
    return {
      verified: false,
      pending_manual: true,
      reason: "acceptance probe_message or expected_substring is missing",
    };
  }

  const sendPayload = sendMessage(scripts, sessionId, probeMessage, env);
  const timeoutSeconds = Number.parseInt(cleanText(acceptance.timeout_seconds) || "15", 10);
  const pollInterval = Number.parseFloat(cleanText(acceptance.poll_interval_seconds) || "1");
  const expectedLower = expectedSubstring.toLowerCase();

  const deadline = Date.now() + Math.max(timeoutSeconds, 1) * 1000;
  let lastQuery: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const queryResult = runCommand(
      [
        scripts.node,
        scripts.queryScript,
        "--action",
        "message_history",
        "--session-id",
        sessionId,
        "--limit",
        cleanText(acceptance.history_limit) || "10",
      ],
      { env },
    );
    lastQuery = parseJsonOutput(queryResult);
    const haystack = JSON.stringify(lastQuery).toLowerCase();
    if (expectedLower && haystack.includes(expectedLower)) {
      return {
        verified: true,
        pending_manual: false,
        probe_send: sendPayload,
        query_result: lastQuery,
      };
    }
    await sleep(Math.max(pollInterval, 0.1) * 1000);
  }

  throw new Error(
    "Acceptance verification did not observe the expected identity text.\n" +
      `expected: ${expectedSubstring}\n` +
      `last_query: ${JSON.stringify(lastQuery)}`,
  );
}

interface Flags {
  fromFile: string;
  profileName: string;
  installDir: string;
  hermesHome: string;
  hermes: string;
  node: string;
  dryRun: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    fromFile: "",
    profileName: "",
    installDir: "",
    hermesHome: "",
    hermes: "hermes",
    node: "node",
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    const next = argv[i + 1];
    if (token === "--from-file" && next !== undefined) { flags.fromFile = next; i += 1; continue; }
    if (token === "--profile-name" && next !== undefined) { flags.profileName = next; i += 1; continue; }
    if (token === "--install-dir" && next !== undefined) { flags.installDir = next; i += 1; continue; }
    if (token === "--hermes-home" && next !== undefined) { flags.hermesHome = next; i += 1; continue; }
    if (token === "--hermes" && next !== undefined) { flags.hermes = next; i += 1; continue; }
    if (token === "--node" && next !== undefined) { flags.node = next; i += 1; continue; }
    if (token === "--dry-run") { flags.dryRun = true; continue; }
    if (token === "--json") { flags.json = true; continue; }
  }
  return flags;
}

function loadPayload(flags: Flags): Record<string, unknown> {
  if (flags.fromFile) {
    return JSON.parse(fs.readFileSync(flags.fromFile, "utf8")) as Record<string, unknown>;
  }
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) throw new Error("No install flow JSON provided.");
  return JSON.parse(raw) as Record<string, unknown>;
}

function normalizeRoute(rawRoute: unknown): string {
  const route = cleanText(rawRoute);
  if (route === "openclaw_create_new") return "hermes_create_new";
  if (route === "openclaw_existing") return "hermes_existing";
  return route;
}

function requiredForRoute(route: string): string[] {
  if (route === "hermes_create_new" || route === "hermes_existing") {
    return ["install_id", "main_agent"];
  }
  return ["install_id"];
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

  const root = projectRoot();
  const scripts: ScriptPaths = {
    createAndBindScript: path.join(root, "grix-register", "scripts", "create_api_agent_and_bind.js"),
    adminScript: path.join(root, "grix-admin", "scripts", "admin.js"),
    cardScript: path.join(root, "message-send", "scripts", "card-link.js"),
    sendScript: path.join(root, "message-send", "scripts", "send.js"),
    groupScript: path.join(root, "grix-group", "scripts", "group.js"),
    queryScript: path.join(root, "grix-query", "scripts", "query.js"),
    startScript: path.join(root, "grix-egg", "scripts", "start_gateway.js"),
    node: flags.node,
    hermes: flags.hermes,
  };

  let payload: Record<string, unknown> = {};
  let installId = "";
  let statusTarget = "";
  let env: NodeJS.ProcessEnv | undefined;

  try {
    payload = loadPayload(flags);
    const install = asRecord(payload.install);
    const route = normalizeRoute(install.route || payload.route || payload.install_route);
    const missing = requiredForRoute(route).filter(
      (key) => !cleanText(payload[key] ?? install[key]),
    );
    if (missing.length > 0) {
      throw new Error(`Missing install flow fields: ${missing.join(", ")}`);
    }

    const hermesHome = resolveHermesHome(flags.hermesHome);
    const requestedProfileName =
      cleanText(flags.profileName) || inferProfileName(payload, install);
    const isMainText = cleanBoolText(payload.is_main || install.is_main);
    const bindOptions = mergeBindOptions(payload, requestedProfileName, isMainText);
    const installDir = path.resolve(
      cleanText(flags.installDir) ||
        cleanText(payload.install_dir) ||
        defaultInstallDir(hermesHome),
    );

    installId = cleanText(payload.install_id || install.install_id);
    statusTarget = cleanText(payload.status_target || install.status_target);
    const conversationCardTarget = cleanText(
      payload.conversation_card_target || payload.card_target || statusTarget,
    );
    const acceptance = asRecord(payload.acceptance);

    const bindStep = buildBindStep(payload, scripts, installDir, bindOptions, hermesHome);
    const installCmd = buildInstallCommand(scripts.node, installDir);

    if (flags.dryRun) {
      const dryRunPayload = {
        ok: true,
        dry_run: true,
        route,
        install_id: installId,
        install_dir: installDir,
        hermes_home: hermesHome,
        profile_name: bindOptions.profile_name,
        commands: {
          install_bundle: installCmd,
          bind: bindStep,
          start_gateway: buildStartCommand(scripts, hermesHome, bindOptions.profile_name || cleanText(payload.profile_name)),
        },
      };
      if (flags.json) {
        process.stdout.write(`${JSON.stringify(dryRunPayload, null, 2)}\n`);
      } else {
        process.stdout.write(`${JSON.stringify(dryRunPayload)}\n`);
      }
      return 0;
    }

    env = { ...process.env, HERMES_HOME: hermesHome };
    const executionLog: Record<string, unknown> = {
      route,
      install_id: installId,
      install_dir: installDir,
      hermes_home: hermesHome,
    };

    maybeSendStatusCard(
      scripts,
      installId,
      "running",
      "preparing",
      "开始执行 Hermes Grix 安装",
      statusTarget,
      env,
    );

    const profileDirForBackup = resolveProfileDir(hermesHome, bindOptions.profile_name);
    const backupDir = backupExistingState(hermesHome, route, profileDirForBackup, installDir);
    if (backupDir) executionLog.backup_dir = backupDir;

    const installResultRaw = runCommand(installCmd, { env, cwd: root });
    executionLog.install_result = {
      install_dir: cleanText(installResultRaw.stdout) || installDir,
      stderr: cleanText(installResultRaw.stderr),
    };

    const bindResultRaw = runCommand(bindStep.primary_cmd, {
      env,
      inputText: bindStep.primary_input ?? undefined,
    });
    if (bindStep.kind === "admin" && bindStep.followup_cmd) {
      const createdPayload = parseJsonOutput(bindResultRaw);
      const followupRaw = runCommand(bindStep.followup_cmd, {
        env,
        inputText: JSON.stringify(createdPayload),
      });
      const bindPayload = parseJsonOutput(followupRaw);
      const bindResult =
        bindPayload.bind_result && typeof bindPayload.bind_result === "object"
          ? (bindPayload.bind_result as Record<string, unknown>)
          : bindPayload;
      executionLog.bind_result = bindResult;
    } else {
      const bindPayload = parseJsonOutput(bindResultRaw);
      const bindResult =
        bindPayload.bind_result && typeof bindPayload.bind_result === "object"
          ? (bindPayload.bind_result as Record<string, unknown>)
          : bindPayload;
      executionLog.bind_result = bindResult;
    }
    const bindResult = executionLog.bind_result as Record<string, unknown>;

    const resolvedProfileName =
      cleanText(bindResult.profile_name) || bindOptions.profile_name;
    if (!resolvedProfileName) {
      throw new Error("Bind flow did not resolve a Hermes profile name.");
    }
    const profileDir = resolveProfileDir(hermesHome, resolvedProfileName);
    executionLog.profile_name = resolvedProfileName;
    executionLog.profile_dir = profileDir;

    const soulPath = writeSoul(profileDir, payload);
    if (soulPath) executionLog.soul_path = soulPath;

    const startResult = parseJsonOutput(
      runCommand(
        buildStartCommand(scripts, hermesHome, resolvedProfileName),
        { env },
      ),
    );
    executionLog.start_result = startResult;

    if (Object.keys(acceptance).length > 0) {
      const groupPayload = createAcceptanceGroup(scripts, acceptance, env);
      const acceptanceSessionId = extractSessionId(groupPayload);
      if (!acceptanceSessionId) {
        throw new Error(
          `Acceptance group creation did not return a session_id: ${JSON.stringify(groupPayload)}`,
        );
      }

      const conversationCard = runCommand(
        [
          scripts.node,
          scripts.cardScript,
          "conversation",
          "--session-id",
          acceptanceSessionId,
          "--session-type",
          cleanText(acceptance.session_type) || "group",
          "--title",
          cleanText(acceptance.group_name) || "验收测试群",
        ],
        { env },
      );
      const conversationCardText = cleanText(conversationCard.stdout);

      let cardDelivery: Record<string, unknown> | null = null;
      if (conversationCardTarget) {
        cardDelivery = sendMessage(scripts, conversationCardTarget, conversationCardText, env);
      }

      const verification = await verifyAcceptance(
        scripts,
        env,
        acceptanceSessionId,
        acceptance,
      );

      executionLog.acceptance = {
        group_create: groupPayload,
        session_id: acceptanceSessionId,
        conversation_card: conversationCardText,
        card_delivery: cardDelivery,
        verification,
      };
    }

    maybeSendStatusCard(
      scripts,
      installId,
      "success",
      "complete",
      "Hermes Grix 安装、绑定和启动完成",
      statusTarget,
      env,
    );

    const payloadOut = { ok: true, dry_run: false, ...executionLog };
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(payloadOut, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(payloadOut)}\n`);
    }
    return 0;
  } catch (error) {
    if (env && installId && statusTarget) {
      try {
        maybeSendStatusCard(
          scripts,
          installId,
          "failed",
          "error",
          cleanText(error instanceof Error ? error.message : String(error)),
          statusTarget,
          env,
        );
      } catch {
        // best-effort
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    const payloadOut = { ok: false, error: message };
    if (flags.json) {
      process.stderr.write(`${JSON.stringify(payloadOut, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 1;
  }
}

process.exit(await main());
