import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const DEFAULT_BASE_URL = "https://grix.dhf.pub";
const DEFAULT_CLIENT = "grix-hermes";
const DEFAULT_CLIENT_TYPE = "hermes";
const DEFAULT_HOST_TYPE = "hermes";
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
  profileName?: string;
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

const REQUIRED_WS_KEYS = ["GRIX_ENDPOINT", "GRIX_AGENT_ID", "GRIX_API_KEY"] as const;
type RequiredWsKey = (typeof REQUIRED_WS_KEYS)[number];

interface WsCredentialCandidate {
  source: string;
  sourcePath: string;
  profileName?: string;
  values: Partial<Record<RequiredWsKey, string>>;
  missingKeys: RequiredWsKey[];
}

export interface WsCredentialDiagnostics {
  hermesHome: string;
  selectedSource: string;
  selectedSourcePath: string;
  selectedProfileName?: string;
  checked: Array<{
    source: string;
    sourcePath: string;
    profileName?: string;
    missingKeys: RequiredWsKey[];
  }>;
  missingKeys: RequiredWsKey[];
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

function cleanKeyValueMap(
  input: Partial<Record<RequiredWsKey, unknown>>,
): Partial<Record<RequiredWsKey, string>> {
  const output: Partial<Record<RequiredWsKey, string>> = {};
  for (const key of REQUIRED_WS_KEYS) {
    const value = cleanText(input[key]);
    if (value) output[key] = value;
  }
  return output;
}

function collectMissingKeys(values: Partial<Record<RequiredWsKey, string>>): RequiredWsKey[] {
  return REQUIRED_WS_KEYS.filter((key) => !cleanText(values[key]));
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

function readEnvCandidate(
  source: string,
  sourcePath: string,
  env: Partial<Record<RequiredWsKey, unknown>>,
  profileName?: string,
): WsCredentialCandidate {
  const values = cleanKeyValueMap(env);
  return {
    source,
    sourcePath,
    profileName,
    values,
    missingKeys: collectMissingKeys(values),
  };
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => cleanText(item)).filter(Boolean))];
}

function profileEnvPath(hermesHome: string, profileName: string): string {
  return path.join(hermesHome, "profiles", profileName, ".env");
}

function listProfileNames(hermesHome: string, configYaml: Record<string, unknown>): string[] {
  const configured = dedupeStrings([
    cleanText(process.env.HERMES_PROFILE),
    cleanText(process.env.HERMES_PROFILE_NAME),
    cleanText(process.env.PROFILE_NAME),
    cleanText((configYaml.default_profile as string | undefined) ?? ""),
    cleanText((configYaml.current_profile as string | undefined) ?? ""),
  ]);
  if (configured.length > 0) return configured;

  const profilesDir = path.join(hermesHome, "profiles");
  if (!fs.existsSync(profilesDir)) return [];
  return fs.readdirSync(profilesDir)
    .filter((entry) => fs.existsSync(profileEnvPath(hermesHome, entry)))
    .sort();
}

function probeWsCredentials(
  overrides: RuntimeOverrides = {},
): {
  candidate: WsCredentialCandidate | null;
  diagnostics: WsCredentialDiagnostics;
} {
  const hermesHome = resolveHermesHome(overrides);
  const configPath = path.join(hermesHome, "config.yaml");
  const configYaml = readYaml(configPath);
  const grix = resolvePlatformConfig(configYaml);
  const extra =
    grix.extra && typeof grix.extra === "object"
      ? (grix.extra as Record<string, unknown>)
      : {};

  const candidates: WsCredentialCandidate[] = [];

  const overrideCandidate = readEnvCandidate(
    "explicit overrides",
    "runtime overrides",
    {
      GRIX_ENDPOINT: overrides.endpoint,
      GRIX_AGENT_ID: overrides.agentId,
      GRIX_API_KEY: overrides.apiKey,
    },
    cleanText(overrides.profileName),
  );
  if (Object.keys(overrideCandidate.values).length > 0) {
    candidates.push(overrideCandidate);
  }

  candidates.push(readEnvCandidate("process.env", "process.env", process.env));

  const rootEnvPath = path.join(hermesHome, ".env");
  candidates.push(readEnvCandidate("Hermes root .env", rootEnvPath, parseEnvFile(rootEnvPath)));

  const profileNames = dedupeStrings([
    cleanText(overrides.profileName),
    ...listProfileNames(hermesHome, configYaml),
  ]);
  for (const profileName of profileNames) {
    const envPath = profileEnvPath(hermesHome, profileName);
    candidates.push(
      readEnvCandidate(`Hermes profile .env (${profileName})`, envPath, parseEnvFile(envPath), profileName),
    );
  }

  candidates.push(readEnvCandidate("Hermes config.yaml", configPath, {
    GRIX_ENDPOINT: extra.endpoint,
    GRIX_AGENT_ID: extra.agent_id,
    GRIX_API_KEY: grix.api_key ?? grix.token,
  }));

  const candidate = candidates.find((item) => item.missingKeys.length === 0) ?? null;
  return {
    candidate,
    diagnostics: {
      hermesHome,
      selectedSource: candidate?.source || "",
      selectedSourcePath: candidate?.sourcePath || "",
      selectedProfileName: candidate?.profileName,
      checked: candidates.map((item) => ({
        source: item.source,
        sourcePath: item.sourcePath,
        profileName: item.profileName,
        missingKeys: [...item.missingKeys],
      })),
      missingKeys: candidate ? [] : [...REQUIRED_WS_KEYS],
    },
  };
}

export function formatWsCredentialDiagnostics(diagnostics: WsCredentialDiagnostics): string {
  const checks = diagnostics.checked
    .map((item) => {
      const profile = item.profileName ? ` profile=${item.profileName}` : "";
      const missing =
        item.missingKeys.length === 0 ? "complete" : `missing=${item.missingKeys.join(",")}`;
      return `${item.source} [${item.sourcePath}]${profile}: ${missing}`;
    })
    .join("; ");
  if (diagnostics.selectedSource) {
    const profile = diagnostics.selectedProfileName
      ? ` (profile=${diagnostics.selectedProfileName})`
      : "";
    return `WS credentials resolved from ${diagnostics.selectedSource} [${diagnostics.selectedSourcePath}]${profile}. Checked: ${checks}`;
  }
  return `WS credentials not found under ${diagnostics.hermesHome}. Checked: ${checks}`;
}

export function getWsCredentialDiagnostics(
  overrides: RuntimeOverrides = {},
): WsCredentialDiagnostics {
  return probeWsCredentials(overrides).diagnostics;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return "";
}

export function hasWsCredentials(overrides: RuntimeOverrides = {}): boolean {
  return probeWsCredentials(overrides).candidate !== null;
}

export function resolveRuntimeConfig(overrides: RuntimeOverrides = {}): RuntimeConfig {
  const { candidate, diagnostics } = probeWsCredentials(overrides);
  const hermesHome = diagnostics.hermesHome;
  const env = mergedEnv(hermesHome);
  const configYaml = readYaml(path.join(hermesHome, "config.yaml"));
  const grix = resolvePlatformConfig(configYaml);
  const extra =
    grix.extra && typeof grix.extra === "object"
      ? (grix.extra as Record<string, unknown>)
      : {};
  const resolvedWs = candidate?.values ?? {};

  const endpoint = firstNonEmpty(overrides.endpoint, resolvedWs.GRIX_ENDPOINT, env.GRIX_ENDPOINT, extra.endpoint);
  const agentId = firstNonEmpty(overrides.agentId, resolvedWs.GRIX_AGENT_ID, env.GRIX_AGENT_ID, extra.agent_id);
  const apiKey = firstNonEmpty(
    overrides.apiKey,
    resolvedWs.GRIX_API_KEY,
    env.GRIX_API_KEY,
    grix.api_key,
    grix.token,
  );
  const accountId =
    firstNonEmpty(overrides.accountId, env.GRIX_ACCOUNT_ID, extra.account_id) || "main";

  if (!endpoint || !agentId || !apiKey) {
    throw new Error(
      `Missing Grix runtime config. Need endpoint, agent_id, and api_key from Hermes env/config. ${formatWsCredentialDiagnostics(diagnostics)}`,
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
