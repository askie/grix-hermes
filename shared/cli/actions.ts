import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AibotWsClient } from "./aibot-client.js";
import {
  resolveAibotOutboundTarget,
  resolveSilentUnsendPlan,
} from "./targets.js";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanInt(value: unknown, fallback: number | undefined = undefined): number | undefined {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanBool(
  value: unknown,
  fallback: boolean | undefined = undefined,
): boolean | undefined {
  if (typeof value === "boolean") return value;
  const normalized = cleanText(value).toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function cleanList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  return cleanText(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractCategoryList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  if (!record) return [];
  for (const key of ["categories", "list", "items", "rows", "data"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractAgentId(data: unknown): string {
  const record = asRecord(data) ?? {};
  return cleanText(record.id ?? record.agent_id);
}

function extractCategoryId(data: unknown): string {
  const record = asRecord(data) ?? {};
  return cleanText(record.id ?? record.category_id);
}

function findCategoryByName(
  data: unknown,
  name: string,
  parentId: string,
): Record<string, unknown> | null {
  const match = extractCategoryList(data).find((item) => {
    const record = asRecord(item) ?? {};
    return (
      cleanText(record.name) === cleanText(name) &&
      cleanText(record.parent_id ?? record.parentId ?? "0") === cleanText(parentId || "0")
    );
  });
  return match ? (match as Record<string, unknown>) : null;
}

export interface CommonActionOptions {
  action?: string;
  accountId?: string;
  id?: string;
  keyword?: string;
  sessionId?: string;
  beforeId?: string;
  limit?: string | number;
  offset?: string | number;
  name?: string;
  memberIds?: string | string[];
  memberTypes?: string | string[];
  memberId?: string;
  memberType?: string | number;
  role?: string | number;
  allMembersMuted?: unknown;
  isSpeakMuted?: unknown;
  canSpeakWhenAllMuted?: unknown;
  to?: string;
  target?: string;
  topic?: string;
  currentChannelId?: string;
  currentMessageId?: string;
  messageId?: string;
  replyToMessageId?: string;
  threadId?: string;
  eventId?: string;
  message?: string;
  agentName?: string;
  agentId?: string;
  introduction?: string;
  isMain?: unknown;
  categoryId?: string;
  categoryName?: string;
  parentCategoryId?: string;
  parentId?: string;
  sortOrder?: string | number;
  categorySortOrder?: string | number;
  envFile?: string;
}

export async function runQuery(
  client: AibotWsClient,
  options: CommonActionOptions,
): Promise<Record<string, unknown>> {
  const action = cleanText(options.action);
  const map: Record<string, string> = {
    contact_search: "contact_search",
    session_search: "session_search",
    message_history: "message_history",
    message_search: "message_search",
  };
  const mapped = map[action];
  if (!mapped) throw new Error(`Unsupported grix query action: ${action}`);
  const params: Record<string, unknown> = {};
  if (cleanText(options.id)) params.id = cleanText(options.id);
  if (cleanText(options.keyword)) params.keyword = cleanText(options.keyword);
  if (cleanText(options.sessionId)) params.session_id = cleanText(options.sessionId);
  if (cleanText(options.beforeId)) params.before_id = cleanText(options.beforeId);
  const limit = cleanInt(options.limit);
  if (limit !== undefined) params.limit = limit;
  const offset = cleanInt(options.offset);
  if (offset !== undefined) params.offset = offset;
  return {
    ok: true,
    accountId: options.accountId,
    action,
    data: await client.agentInvoke(mapped, params),
  };
}

export async function runGroup(
  client: AibotWsClient,
  options: CommonActionOptions,
): Promise<Record<string, unknown>> {
  const action = cleanText(options.action);
  const map: Record<string, string> = {
    create: "group_create",
    detail: "group_detail_read",
    leave: "group_leave_self",
    add_members: "group_member_add",
    remove_members: "group_member_remove",
    update_member_role: "group_member_role_update",
    update_all_members_muted: "group_all_members_muted_update",
    update_member_speaking: "group_member_speaking_update",
    dissolve: "group_dissolve",
  };
  const mapped = map[action];
  if (!mapped) throw new Error(`Unsupported grix group action: ${action}`);
  const params: Record<string, unknown> = {};
  if (cleanText(options.name)) params.name = cleanText(options.name);
  if (cleanText(options.sessionId)) params.session_id = cleanText(options.sessionId);
  const memberIds = cleanList(options.memberIds);
  if (memberIds.length > 0) params.member_ids = memberIds;
  const memberTypes = cleanList(options.memberTypes)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item));
  if (memberTypes.length > 0) params.member_types = memberTypes;
  if (cleanText(options.memberId)) params.member_id = cleanText(options.memberId);
  const memberType = cleanInt(options.memberType);
  if (memberType !== undefined) params.member_type = memberType;
  const role = cleanInt(options.role);
  if (role !== undefined) params.role = role;
  const allMembersMuted = cleanBool(options.allMembersMuted);
  if (allMembersMuted !== undefined) params.all_members_muted = allMembersMuted;
  const isSpeakMuted = cleanBool(options.isSpeakMuted);
  if (isSpeakMuted !== undefined) params.is_speak_muted = isSpeakMuted;
  const canSpeakWhenAllMuted = cleanBool(options.canSpeakWhenAllMuted);
  if (canSpeakWhenAllMuted !== undefined) {
    params.can_speak_when_all_muted = canSpeakWhenAllMuted;
  }
  return {
    ok: true,
    accountId: options.accountId,
    action,
    data: await client.agentInvoke(mapped, params),
  };
}

function maskResult(data: unknown): unknown {
  const record = asRecord(data);
  if (!record) return data;
  const masked = { ...record };
  if ("api_key" in masked) masked.api_key = "***";
  return masked;
}

interface ConfigHermesResult {
  ok: boolean;
  envFile: string;
  tempKeyFile: string;
  message: string;
}

function configHermes(
  envFilePath: string,
  agentId: string,
  apiEndpoint: string,
  apiKey: string,
): ConfigHermesResult {
  const envDir = path.dirname(envFilePath);
  fs.mkdirSync(envDir, { recursive: true });

  const envLines: string[] = [];
  const existing: Record<string, string> = {};
  if (fs.existsSync(envFilePath)) {
    for (const line of fs.readFileSync(envFilePath, "utf8").split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        existing[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }
  }
  existing.GRIX_AGENT_ID = agentId;
  existing.GRIX_ENDPOINT = apiEndpoint;
  existing.GRIX_API_KEY = apiKey;
  for (const [k, v] of Object.entries(existing)) {
    envLines.push(`${k}=${v}`);
  }
  fs.writeFileSync(envFilePath, envLines.join("\n") + "\n", "utf8");

  const tmpDir = path.join(os.homedir(), ".hermes", "tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tempKeyFile = path.join(tmpDir, `grix-key-${Date.now()}.tmp`);
  fs.writeFileSync(tempKeyFile, JSON.stringify({
    agent_id: agentId,
    api_endpoint: apiEndpoint,
    api_key: apiKey,
    configured_env: envFilePath,
    created_at: new Date().toISOString(),
  }, null, 2), "utf8");

  return {
    ok: true,
    envFile: envFilePath,
    tempKeyFile,
    message: `Hermes 的 Grix 渠道参数已配置到 ${envFilePath}`,
  };
}

async function listCategories(client: AibotWsClient): Promise<unknown> {
  return client.agentInvoke("agent_category_list", {});
}

export async function runAdmin(
  client: AibotWsClient,
  options: CommonActionOptions,
): Promise<Record<string, unknown>> {
  const action = cleanText(options.action || "create_grix");
  if (action === "list_categories") {
    return {
      ok: true,
      accountId: options.accountId,
      action,
      data: await listCategories(client),
    };
  }
  if (action === "create_category") {
    return {
      ok: true,
      accountId: options.accountId,
      action,
      data: await client.agentInvoke("agent_category_create", {
        name: cleanText(options.name),
        parent_id: cleanText(options.parentId || options.parentCategoryId || "0"),
        sort_order: cleanInt(options.sortOrder ?? options.categorySortOrder),
      }),
    };
  }
  if (action === "update_category") {
    return {
      ok: true,
      accountId: options.accountId,
      action,
      data: await client.agentInvoke("agent_category_update", {
        category_id: cleanText(options.categoryId),
        name: cleanText(options.name),
        parent_id: cleanText(options.parentId || options.parentCategoryId || "0"),
        sort_order: cleanInt(options.sortOrder ?? options.categorySortOrder),
      }),
    };
  }
  if (action === "assign_category") {
    return {
      ok: true,
      accountId: options.accountId,
      action,
      data: await client.agentInvoke("agent_category_assign", {
        agent_id: cleanText(options.agentId),
        category_id: cleanText(options.categoryId),
      }),
    };
  }
  if (action === "config_hermes") {
    const envFilePath = cleanText(options.envFile);
    if (!envFilePath) throw new Error("config_hermes requires --env-file (absolute path to .env)");
    const agentId = cleanText(options.agentId);
    const apiEndpoint = cleanText(options.to || options.target);
    const apiKey = cleanText(options.message);
    if (!agentId || !apiEndpoint || !apiKey) {
      throw new Error("config_hermes requires --agent-id, --to (api_endpoint), --message (api_key)");
    }
    return {
      ok: true,
      accountId: options.accountId,
      action,
      configHermes: configHermes(envFilePath, agentId, apiEndpoint, apiKey),
    };
  }
  if (action !== "create_grix") {
    throw new Error(`Unsupported grix admin action: ${action}`);
  }

  const createPayload: Record<string, unknown> = {
    agent_name: cleanText(options.agentName),
    is_main: cleanBool(options.isMain, false) ?? false,
  };
  const intro = cleanText(options.introduction);
  if (intro) createPayload.introduction = intro;

  const createdAgent = await client.agentInvoke("agent_api_create", createPayload);
  const createdAgentId = extractAgentId(createdAgent);
  let category: unknown = null;
  let assignment: unknown = null;

  const categoryId = cleanText(options.categoryId);
  const categoryName = cleanText(options.categoryName);
  if (categoryId && categoryName) {
    throw new Error("create_grix cannot accept both categoryId and categoryName");
  }

  let resolvedCategoryId = categoryId;
  if (!resolvedCategoryId && categoryName) {
    const parentCategoryId = cleanText(options.parentCategoryId || "0");
    const rawListData = await listCategories(client);
    const found = findCategoryByName(rawListData, categoryName, parentCategoryId);
    if (found) {
      category = found;
    } else {
      category = await client.agentInvoke("agent_category_create", {
        name: categoryName,
        parent_id: parentCategoryId,
        sort_order: cleanInt(options.categorySortOrder),
      });
    }
    resolvedCategoryId = extractCategoryId(category);
  }

  if (resolvedCategoryId && createdAgentId) {
    assignment = await client.agentInvoke("agent_category_assign", {
      agent_id: createdAgentId,
      category_id: resolvedCategoryId,
    });
  }

  const envFilePath = cleanText(options.envFile);
  if (envFilePath) {
    const createdRecord = asRecord(createdAgent) ?? {};
    const apiKey = cleanText(createdRecord.api_key);
    const apiEndpoint = cleanText(createdRecord.api_endpoint);
    if (!apiKey || !apiEndpoint || !createdAgentId) {
      return {
        ok: false,
        error: "create_grix succeeded but response missing api_key/api_endpoint/agent_id for config_hermes",
      };
    }
    const configResult = configHermes(envFilePath, createdAgentId, apiEndpoint, apiKey);
    return {
      ok: true,
      accountId: options.accountId,
      action,
      requestedIsMain: createPayload.is_main,
      createdAgent: maskResult(createdAgent),
      category,
      assignment,
      configHermes: configResult,
    };
  }

  return {
    ok: true,
    accountId: options.accountId,
    action,
    requestedIsMain: createPayload.is_main,
    createdAgent,
    category,
    assignment,
  };
}

export async function runUnsend(
  client: AibotWsClient,
  options: CommonActionOptions,
): Promise<Record<string, unknown>> {
  const plan = await resolveSilentUnsendPlan({
    client,
    accountId: options.accountId ?? "main",
    messageId: options.messageId,
    targetSessionId: options.sessionId,
    targetTo: options.to,
    targetTopic: options.topic,
    currentChannelId: options.currentChannelId,
    currentMessageId: options.currentMessageId,
  });

  const targetAck = await client.deleteMessage(
    plan.targetDelete.sessionId,
    plan.targetDelete.messageId,
  );
  let commandAck: Record<string, unknown> | null = null;
  if (plan.commandDelete) {
    commandAck = await client.deleteMessage(
      plan.commandDelete.sessionId,
      plan.commandDelete.messageId,
    );
  }

  return {
    ok: true,
    accountId: options.accountId,
    targetDelete: plan.targetDelete,
    commandDelete: plan.commandDelete ?? null,
    completionMessageId: plan.completionMessageId ?? null,
    targetAck,
    commandAck,
  };
}

export async function runSend(
  client: AibotWsClient,
  options: CommonActionOptions,
): Promise<Record<string, unknown>> {
  const message = String(options.message ?? "");
  if (!message.trim()) throw new Error("message-send requires message");
  const target = cleanText(options.to || options.target);
  if (!target) throw new Error("message-send requires to/target");
  const resolved = await resolveAibotOutboundTarget({
    client,
    accountId: options.accountId ?? "main",
    to: target,
  });
  const ack = await client.sendText(resolved.sessionId, message, {
    threadId: cleanText(options.threadId) || resolved.threadId || "",
    replyToMessageId: cleanText(options.replyToMessageId),
    eventId: cleanText(options.eventId),
  });
  return {
    ok: true,
    accountId: options.accountId,
    target,
    resolvedTarget: resolved,
    message,
    ack,
  };
}
