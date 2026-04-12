import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const DEFAULT_BASE_URL = "https://grix.dhf.pub";
const DEFAULT_CAPABILITIES = ["session_route", "thread_v1", "inbound_media_v1", "local_action_v1"];
const DEFAULT_LOCAL_ACTIONS = ["exec_approve", "exec_reject"];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const result = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) {
    return {};
  }
  const parsed = YAML.parse(text);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [...fallback];
}

function cleanInt(value, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveHermesHome(overrides = {}) {
  return path.resolve(
    cleanText(overrides.hermesHome)
      || cleanText(process.env.HERMES_HOME)
      || path.join(homedir(), ".hermes")
  );
}

function resolvePlatformConfig(configYaml) {
  const topLevel = configYaml?.platforms?.grix;
  if (topLevel && typeof topLevel === "object") {
    return topLevel;
  }
  const nested = configYaml?.gateway?.platforms?.grix;
  if (nested && typeof nested === "object") {
    return nested;
  }
  return {};
}

function mergedEnv(hermesHome) {
  const envFile = path.join(hermesHome, ".env");
  return {
    ...parseEnvFile(envFile),
    ...process.env
  };
}

export function resolveRuntimeConfig(overrides = {}) {
  const hermesHome = resolveHermesHome(overrides);
  const env = mergedEnv(hermesHome);
  const configYaml = readYaml(path.join(hermesHome, "config.yaml"));
  const grix = resolvePlatformConfig(configYaml);
  const extra = grix?.extra && typeof grix.extra === "object" ? grix.extra : {};

  const endpoint = cleanText(overrides.endpoint)
    || cleanText(env.GRIX_ENDPOINT)
    || cleanText(extra.endpoint);
  const agentId = cleanText(overrides.agentId)
    || cleanText(env.GRIX_AGENT_ID)
    || cleanText(extra.agent_id);
  const apiKey = cleanText(overrides.apiKey)
    || cleanText(env.GRIX_API_KEY)
    || cleanText(grix?.api_key)
    || cleanText(grix?.token);
  const accountId = cleanText(overrides.accountId)
    || cleanText(env.GRIX_ACCOUNT_ID)
    || cleanText(extra.account_id)
    || "main";

  if (!endpoint || !agentId || !apiKey) {
    throw new Error(
      "Missing Grix runtime config. Need endpoint, agent_id, and api_key from Hermes env/config."
    );
  }

  return {
    hermesHome,
    baseUrl: cleanText(overrides.baseUrl) || cleanText(env.GRIX_WEB_BASE_URL) || DEFAULT_BASE_URL,
    connection: {
      endpoint,
      agentId,
      apiKey,
      accountId,
      client: cleanText(overrides.client) || cleanText(env.GRIX_CLIENT) || cleanText(extra.client) || "grix-hermes",
      clientType: cleanText(overrides.clientType) || cleanText(env.GRIX_CLIENT_TYPE) || cleanText(extra.client_type) || "hermes",
      clientVersion: cleanText(overrides.clientVersion) || cleanText(extra.client_version) || "0.1.0",
      hostType: cleanText(overrides.hostType) || cleanText(extra.host_type) || "hermes",
      hostVersion: cleanText(overrides.hostVersion) || cleanText(extra.host_version) || undefined,
      contractVersion: cleanInt(overrides.contractVersion || extra.contract_version, 1),
      capabilities: cleanList(overrides.capabilities || env.GRIX_CAPABILITIES || extra.capabilities, DEFAULT_CAPABILITIES),
      localActions: cleanList(overrides.localActions || extra.local_actions, DEFAULT_LOCAL_ACTIONS),
      connectTimeoutMs: cleanInt(overrides.connectTimeoutMs || env.GRIX_CONNECT_TIMEOUT_MS || extra.connect_timeout_ms, 10000),
      requestTimeoutMs: cleanInt(overrides.requestTimeoutMs || env.GRIX_REQUEST_TIMEOUT_MS || extra.request_timeout_ms, 20000)
    }
  };
}
