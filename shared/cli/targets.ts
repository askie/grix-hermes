import type { AibotWsClient } from "./aibot-client.js";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function isRouteSessionKey(value: unknown): boolean {
  return /^agent:main:grix:/i.test(cleanText(value));
}

function normalizeAibotSessionTarget(raw: unknown): string {
  return cleanText(raw).replace(/^grix:/i, "").replace(/^session:/i, "").trim();
}

export interface ResolvedAibotOutboundTarget {
  sessionId: string;
  threadId?: string;
  rawTarget: string;
  normalizedTarget: string;
  resolveSource: "direct" | "sessionRouteMap";
}

export interface ResolveOutboundParams {
  client: AibotWsClient;
  accountId: string;
  to: unknown;
}

export async function resolveAibotOutboundTarget({
  client,
  accountId,
  to,
}: ResolveOutboundParams): Promise<ResolvedAibotOutboundTarget> {
  const rawTarget = cleanText(to);
  if (!rawTarget) {
    throw new Error("grix outbound target must be non-empty");
  }
  const normalizedTarget = normalizeAibotSessionTarget(rawTarget);
  if (!normalizedTarget) {
    throw new Error("grix outbound target must contain session_id or route_session_key");
  }
  if (!isRouteSessionKey(rawTarget) && !isRouteSessionKey(normalizedTarget)) {
    if (normalizedTarget.includes(":")) {
      const [sessionId, threadId] = normalizedTarget.split(/:(.+)/, 2);
      const result: ResolvedAibotOutboundTarget = {
        sessionId: cleanText(sessionId),
        rawTarget,
        normalizedTarget,
        resolveSource: "direct",
      };
      const trimmedThread = cleanText(threadId);
      if (trimmedThread) result.threadId = trimmedThread;
      return result;
    }
    return {
      sessionId: normalizedTarget,
      rawTarget,
      normalizedTarget,
      resolveSource: "direct",
    };
  }
  const ack = await client.resolveSessionRoute(
    "grix",
    accountId,
    isRouteSessionKey(rawTarget) ? rawTarget : normalizedTarget,
  );
  return {
    sessionId: cleanText((ack as { session_id?: unknown }).session_id),
    rawTarget,
    normalizedTarget,
    resolveSource: "sessionRouteMap",
  };
}

export interface ResolveDeleteParams {
  client: AibotWsClient;
  accountId: string;
  sessionId?: unknown;
  to?: unknown;
  topic?: unknown;
  currentChannelId?: unknown;
}

export async function resolveAibotDeleteTarget(params: ResolveDeleteParams): Promise<string> {
  const rawTarget =
    cleanText(params.sessionId) ||
    cleanText(params.to) ||
    cleanText(params.topic) ||
    cleanText(params.currentChannelId);
  if (!rawTarget) return "";
  const resolved = await resolveAibotOutboundTarget({
    client: params.client,
    accountId: params.accountId,
    to: rawTarget,
  });
  return resolved.sessionId;
}

function normalizeMessageId(value: unknown): string {
  const normalized = cleanText(value);
  return /^\d+$/.test(normalized) ? normalized : "";
}

export interface SilentUnsendPlan {
  targetDelete: { sessionId: string; messageId: string };
  commandDelete?: { sessionId: string; messageId: string };
  completionMessageId?: string;
}

export interface SilentUnsendInput {
  client: AibotWsClient;
  accountId: string;
  messageId: unknown;
  targetSessionId?: unknown;
  targetTo?: unknown;
  targetTopic?: unknown;
  currentChannelId?: unknown;
  currentMessageId?: unknown;
}

export async function resolveSilentUnsendPlan(params: SilentUnsendInput): Promise<SilentUnsendPlan> {
  const targetMessageId = normalizeMessageId(params.messageId);
  if (!targetMessageId) {
    throw new Error("Grix unsend requires numeric messageId.");
  }
  const targetSessionId = await resolveAibotDeleteTarget({
    client: params.client,
    accountId: params.accountId,
    sessionId: params.targetSessionId,
    to: params.targetTo,
    topic: params.targetTopic,
    currentChannelId: params.currentChannelId,
  });
  if (!targetSessionId) {
    throw new Error(
      "Grix unsend requires sessionId or to, or must run inside an active Grix conversation.",
    );
  }
  const targetDelete = { sessionId: targetSessionId, messageId: targetMessageId };
  const currentMessageId = normalizeMessageId(params.currentMessageId);
  if (!currentMessageId) {
    return { targetDelete };
  }
  if (currentMessageId === targetMessageId) {
    return { targetDelete, completionMessageId: currentMessageId };
  }
  const currentChannelId = cleanText(params.currentChannelId);
  if (!currentChannelId) {
    return { targetDelete };
  }
  const currentSessionId = await resolveAibotDeleteTarget({
    client: params.client,
    accountId: params.accountId,
    currentChannelId,
  });
  if (!currentSessionId) {
    throw new Error("Grix unsend could not resolve the current command message session.");
  }
  return {
    targetDelete,
    commandDelete: { sessionId: currentSessionId, messageId: currentMessageId },
    completionMessageId: currentMessageId,
  };
}
