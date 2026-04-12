function cleanText(value) {
  return String(value ?? "").trim();
}

function isRouteSessionKey(value) {
  return /^agent:main:grix:/i.test(cleanText(value));
}

function normalizeAibotSessionTarget(raw) {
  return cleanText(raw).replace(/^grix:/i, "").replace(/^session:/i, "").trim();
}

export async function resolveAibotOutboundTarget({ client, accountId, to }) {
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
      return {
        sessionId: cleanText(sessionId),
        threadId: cleanText(threadId) || undefined,
        rawTarget,
        normalizedTarget,
        resolveSource: "direct"
      };
    }
    return {
      sessionId: normalizedTarget,
      threadId: undefined,
      rawTarget,
      normalizedTarget,
      resolveSource: "direct"
    };
  }
  const ack = await client.resolveSessionRoute("grix", accountId, isRouteSessionKey(rawTarget) ? rawTarget : normalizedTarget);
  return {
    sessionId: cleanText(ack.session_id),
    threadId: undefined,
    rawTarget,
    normalizedTarget,
    resolveSource: "sessionRouteMap"
  };
}

export async function resolveAibotDeleteTarget({ client, accountId, sessionId, to, topic, currentChannelId }) {
  const rawTarget = cleanText(sessionId) || cleanText(to) || cleanText(topic) || cleanText(currentChannelId);
  if (!rawTarget) {
    return "";
  }
  const resolved = await resolveAibotOutboundTarget({
    client,
    accountId,
    to: rawTarget
  });
  return resolved.sessionId;
}

function normalizeMessageId(value) {
  const normalized = cleanText(value);
  return /^\d+$/.test(normalized) ? normalized : "";
}

export async function resolveSilentUnsendPlan(params) {
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
    currentChannelId: params.currentChannelId
  });
  if (!targetSessionId) {
    throw new Error("Grix unsend requires sessionId or to, or must run inside an active Grix conversation.");
  }
  const targetDelete = {
    sessionId: targetSessionId,
    messageId: targetMessageId
  };
  const currentMessageId = normalizeMessageId(params.currentMessageId);
  if (!currentMessageId) {
    return { targetDelete };
  }
  if (currentMessageId === targetMessageId) {
    return {
      targetDelete,
      completionMessageId: currentMessageId
    };
  }
  const currentChannelId = cleanText(params.currentChannelId);
  if (!currentChannelId) {
    return { targetDelete };
  }
  const currentSessionId = await resolveAibotDeleteTarget({
    client: params.client,
    accountId: params.accountId,
    currentChannelId
  });
  if (!currentSessionId) {
    throw new Error("Grix unsend could not resolve the current command message session.");
  }
  return {
    targetDelete,
    commandDelete: {
      sessionId: currentSessionId,
      messageId: currentMessageId
    },
    completionMessageId: currentMessageId
  };
}
