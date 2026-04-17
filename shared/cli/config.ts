import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const DEFAULT_BASE_URL = "https://grix.dhf.pub";
const DEFAULT_CLIENT = "grix-hermes";
const DEFAULT_CLIENT_TYPE = "openclaw";
const DEFAULT_HOST_TYPE = "openclaw";
const DEFAULT_CAPABILITIES = [
  "session_route",
  "thread_v1",
  "inbound_media_v1",
  "local_action_v1",
  "agent_invoke",
];
const DEFAULT_LOCAL_ACTIONS = ["exec_approve", "exec_reject"];

export interface RuntimeConnectionConfig {
  endpoint: string;
  agentId: string;
  apiKey: string;
  accountId: string;
  client: string;
  clientType: string;
  clientVersion: string;
  hostType: string;
  hostVersion?: string;
  contractVersion: number;
  capabilities: string[];
  localActions: string[];
  adapterHint?: string;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface RuntimeConfig {
  hermesHome: string;
  baseUrl: string;
  connection: RuntimeConnectionConfig;
}

export interface RuntimeOverrides {
  hermesHome?: string;
  baseUrl?: string;
  endpoint?: string;
  agentId?: string;
  apiKey?: string;
  accountId?: string;
  client?: string;
  clientType?: string;
  clientVersion?: string;
  hostType?: string;
  hostVersion?: string;
  contractVersion?: string | number;
  capabilities?: string | string[];
  localActions?: string | string[];
  adapterHint?: string;
  connectTimeoutMs?: string | number;
  requestTimeoutMs?: string | number;
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readYaml(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) return {};
  const parsed = YAML.parse(text);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanList(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [...fallback];
}

function cleanInt(value: unknown, fallback: number): number {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function resolveHermesHome(overrides: RuntimeOverrides = {}): string {
  return path.resolve(
    cleanText(overrides.hermesHome) ||
      cleanText(process.env.HERMES_HOME) ||
      path.join(homedir(), ".hermes"),
  );
}

function resolvePlatformConfig(configYaml: Record<string, unknown>): Record<string, unknown> {
  const platforms = (configYaml.platforms as Record<string, unknown> | undefined)?.grix;
  if (platforms && typeof platforms === "object") {
    return platforms as Record<string, unknown>;
  }
  const gw = configYaml.gateway as Record<string, unknown> | undefined;
  const nested = (gw?.platforms as Record<string, unknown> | undefined)?.grix;
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }
  return {};
}

function mergedEnv(hermesHome: string): Record<string, string | undefined> {
  const envFile = path.join(hermesHome, ".env");
  return { ...parseEnvFile(envFile), ...process.env };
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return "";
}

export function hasWsCredentials(overrides: RuntimeOverrides = {}): boolean {
  // Check process.env first — Hermes may have loaded the profile .env into its
  // own process.env and child processes inherit it.
  if (process.env.GRIX_ENDPOINT && process.env.GRIX_AGENT_ID && process.env.GRIX_API_KEY) {
    return true;
  }
  // Try the default profile .env + config.yaml via resolveRuntimeConfig.
  try {
    resolveRuntimeConfig(overrides);
    return true;
  } catch {
    return false;
  }
}

export function resolveRuntimeConfig(overrides: RuntimeOverrides = {}): RuntimeConfig {
  const hermesHome = resolveHermesHome(overrides);
  const env = mergedEnv(hermesHome);
  const configYaml = readYaml(path.join(hermesHome, "config.yaml"));
  const grix = resolvePlatformConfig(configYaml);
  const extra =
    grix.extra && typeof grix.extra === "object"
      ? (grix.extra as Record<string, unknown>)
      : {};

  const endpoint = firstNonEmpty(overrides.endpoint, env.GRIX_ENDPOINT, extra.endpoint);
  const agentId = firstNonEmpty(overrides.agentId, env.GRIX_AGENT_ID, extra.agent_id);
  const apiKey = firstNonEmpty(
    overrides.apiKey,
    env.GRIX_API_KEY,
    grix.api_key,
    grix.token,
  );
  const accountId =
    firstNonEmpty(overrides.accountId, env.GRIX_ACCOUNT_ID, extra.account_id) || "main";

  if (!endpoint || !agentId || !apiKey) {
    throw new Error(
      "Missing Grix runtime config. Need endpoint, agent_id, and api_key from Hermes env/config.",
    );
  }

  const connection: RuntimeConnectionConfig = {
    endpoint,
    agentId,
    apiKey,
    accountId,
    client:
      cleanText(overrides.client) ||
      cleanText(env.GRIX_CLIENT) ||
      cleanText(extra.client) ||
      DEFAULT_CLIENT,
    clientType:
      cleanText(overrides.clientType) ||
      cleanText(env.GRIX_CLIENT_TYPE) ||
      cleanText(extra.client_type) ||
      DEFAULT_CLIENT_TYPE,
    clientVersion:
      cleanText(overrides.clientVersion) ||
      cleanText(env.GRIX_CLIENT_VERSION) ||
      cleanText(extra.client_version) ||
      "0.1.0",
    hostType:
      cleanText(overrides.hostType) ||
      cleanText(env.GRIX_HOST_TYPE) ||
      cleanText(extra.host_type) ||
      DEFAULT_HOST_TYPE,
    contractVersion: cleanInt(
      overrides.contractVersion ?? env.GRIX_CONTRACT_VERSION ?? extra.contract_version,
      1,
    ),
    capabilities: cleanList(
      overrides.capabilities ?? env.GRIX_CAPABILITIES ?? extra.capabilities,
      DEFAULT_CAPABILITIES,
    ),
    localActions: cleanList(
      overrides.localActions ?? env.GRIX_LOCAL_ACTIONS ?? extra.local_actions,
      DEFAULT_LOCAL_ACTIONS,
    ),
    connectTimeoutMs: cleanInt(
      overrides.connectTimeoutMs ?? env.GRIX_CONNECT_TIMEOUT_MS ?? extra.connect_timeout_ms,
      10000,
    ),
    requestTimeoutMs: cleanInt(
      overrides.requestTimeoutMs ?? env.GRIX_REQUEST_TIMEOUT_MS ?? extra.request_timeout_ms,
      20000,
    ),
  };

  const hostVersion =
    cleanText(overrides.hostVersion) ||
    cleanText(env.GRIX_HOST_VERSION) ||
    cleanText(extra.host_version);
  if (hostVersion) connection.hostVersion = hostVersion;

  const adapterHint =
    cleanText(overrides.adapterHint) ||
    cleanText(env.GRIX_ADAPTER_HINT) ||
    cleanText(extra.adapter_hint);
  if (adapterHint) connection.adapterHint = adapterHint;

  return {
    hermesHome,
    baseUrl:
      cleanText(overrides.baseUrl) || cleanText(env.GRIX_WEB_BASE_URL) || DEFAULT_BASE_URL,
    connection,
  };
}
