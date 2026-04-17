import { resolveAibotOutboundTarget, resolveSilentUnsendPlan } from "./targets.mjs";

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanInt(value, fallback = undefined) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanBool(value, fallback = undefined) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = cleanText(value).toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function cleanList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  return cleanText(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function extractCategoryList(data) {
  if (Array.isArray(data)) {
    return data;
  }
  const record = asRecord(data);
  if (!record) {
    return [];
  }
  for (const key of ["categories", "list", "items", "rows", "data"]) {
    if (Array.isArray(record[key])) {
      return record[key];
    }
  }
  return [];
}

function extractAgentId(data) {
  const record = asRecord(data) || {};
  return cleanText(record.id || record.agent_id);
}

function extractCategoryId(data) {
  const record = asRecord(data) || {};
  return cleanText(record.id || record.category_id);
}

function findCategoryByName(data, name, parentId) {
  return extractCategoryList(data).find((item) => {
    const record = asRecord(item) || {};
    return cleanText(record.name) === cleanText(name)
      && cleanText(record.parent_id ?? record.parentId ?? "0") === cleanText(parentId || "0");
  }) || null;
}

export async function runQuery(client, options) {
  const action = cleanText(options.action);
  const map = {
    contact_search: "contact_search",
    session_search: "session_search",
    message_history: "message_history",
    message_search: "message_search"
  };
  if (!map[action]) {
    throw new Error(`Unsupported grix query action: ${action}`);
  }
  const params = {};
  if (cleanText(options.id)) {
    params.id = cleanText(options.id);
  }
  if (cleanText(options.keyword)) {
    params.keyword = cleanText(options.keyword);
  }
  if (cleanText(options.sessionId)) {
    params.session_id = cleanText(options.sessionId);
  }
  if (cleanText(options.beforeId)) {
    params.before_id = cleanText(options.beforeId);
  }
  const limit = cleanInt(options.limit);
  if (limit !== undefined) {
    params.limit = limit;
  }
  const offset = cleanInt(options.offset);
  if (offset !== undefined) {
    params.offset = offset;
  }
  return {
    ok: true,
    accountId: options.accountId,
    action,
    data: await client.agentInvoke(map[action], params)
  };
}

export async function runGroup(client, options) {
  const action = cleanText(options.action);
  const map = {
    create: "group_create",
    detail: "group_detail_read",
    leave: "group_leave_self",
    add_members: "group_member_add",
    remove_members: "group_member_remove",
    update_member_role: "group_member_role_update",
    update_all_members_muted: "group_all_members_muted_update",
    update_member_speaking: "group_member_speaking_update",
    dissolve: "group_dissolve"
  };
  if (!map[action]) {
    throw new Error(`Unsupported grix group action: ${action}`);
  }
  const params = {};
  if (cleanText(options.name)) {
    params.name = cleanText(options.name);
  }
  if (cleanText(options.sessionId)) {
    params.session_id = cleanText(options.sessionId);
  }
  const memberIds = cleanList(options.memberIds);
  if (memberIds.length > 0) {
    params.member_ids = memberIds;
  }
  const memberTypes = cleanList(options.memberTypes).map((item) => Number.parseInt(item, 10)).filter((item) => Number.isFinite(item));
  if (memberTypes.length > 0) {
    params.member_types = memberTypes;
  }
  if (cleanText(options.memberId)) {
    params.member_id = cleanText(options.memberId);
  }
  const memberType = cleanInt(options.memberType);
  if (memberType !== undefined) {
    params.member_type = memberType;
  }
  const role = cleanInt(options.role);
  if (role !== undefined) {
    params.role = role;
  }
  const allMembersMuted = cleanBool(options.allMembersMuted);
  if (allMembersMuted !== undefined) {
    params.all_members_muted = allMembersMuted;
  }
  const isSpeakMuted = cleanBool(options.isSpeakMuted);
  if (isSpeakMuted !== undefined) {
    params.is_speak_muted = isSpeakMuted;
  }
  const canSpeakWhenAllMuted = cleanBool(options.canSpeakWhenAllMuted);
  if (canSpeakWhenAllMuted !== undefined) {
    params.can_speak_when_all_muted = canSpeakWhenAllMuted;
  }
  return {
    ok: true,
    accountId: options.accountId,
    action,
    data: await client.agentInvoke(map[action], params)
  };
}

async function listCategories(client) {
  return client.agentInvoke("agent_category_list", {});
}

export async function runAdmin(client, options) {
  const action = cleanText(options.action || "create_grix");
  if (action === "list_categories") {
    return {
      ok: true,
      accountId: options.accountId,
      action,
      data: await listCategories(client)
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
        sort_order: cleanInt(options.sortOrder || options.categorySortOrder)
      })
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
        sort_order: cleanInt(options.sortOrder || options.categorySortOrder)
      })
    };
  }
  if (action === "assign_category") {
    return {
      ok: true,
      accountId: options.accountId,
      action,
      data: await client.agentInvoke("agent_category_assign", {
        agent_id: cleanText(options.agentId),
        category_id: cleanText(options.categoryId)
      })
    };
  }
  if (action !== "create_grix") {
    throw new Error(`Unsupported grix admin action: ${action}`);
  }

  const createPayload = {
    agent_name: cleanText(options.agentName),
    introduction: cleanText(options.introduction) || undefined,
    is_main: cleanBool(options.isMain, false) ?? false
  };
  const createdAgent = await client.agentInvoke("agent_api_create", createPayload);
  const createdAgentId = extractAgentId(createdAgent);
  let category = null;
  let assignment = null;

  const categoryId = cleanText(options.categoryId);
  const categoryName = cleanText(options.categoryName);
  if (categoryId && categoryName) {
    throw new Error("create_grix cannot accept both categoryId and categoryName");
  }

  let resolvedCategoryId = categoryId;
  if (!resolvedCategoryId && categoryName) {
    const parentCategoryId = cleanText(options.parentCategoryId || "0");
    const rawListData = await listCategories(client);
    category = findCategoryByName(rawListData, categoryName, parentCategoryId);
    if (!category) {
      category = await client.agentInvoke("agent_category_create", {
        name: categoryName,
        parent_id: parentCategoryId,
        sort_order: cleanInt(options.categorySortOrder)
      });
    }
    resolvedCategoryId = extractCategoryId(category);
  }

  if (resolvedCategoryId && createdAgentId) {
    assignment = await client.agentInvoke("agent_category_assign", {
      agent_id: createdAgentId,
      category_id: resolvedCategoryId
    });
  }

  return {
    ok: true,
    accountId: options.accountId,
    action,
    requestedIsMain: createPayload.is_main,
    createdAgent,
    category,
    assignment
  };
}

export async function runUnsend(client, options) {
  const plan = await resolveSilentUnsendPlan({
    client,
    accountId: options.accountId,
    messageId: options.messageId,
    targetSessionId: options.sessionId,
    targetTo: options.to,
    targetTopic: options.topic,
    currentChannelId: options.currentChannelId,
    currentMessageId: options.currentMessageId
  });

  const targetAck = await client.deleteMessage(plan.targetDelete.sessionId, plan.targetDelete.messageId);
  let commandAck = null;
  if (plan.commandDelete) {
    commandAck = await client.deleteMessage(plan.commandDelete.sessionId, plan.commandDelete.messageId);
  }

  return {
    ok: true,
    accountId: options.accountId,
    targetDelete: plan.targetDelete,
    commandDelete: plan.commandDelete || null,
    completionMessageId: plan.completionMessageId || null,
    targetAck,
    commandAck
  };
}

export async function runSend(client, options) {
  const message = String(options.message ?? "");
  if (!message.trim()) {
    throw new Error("message-send requires message");
  }
  const target = cleanText(options.to || options.target);
  if (!target) {
    throw new Error("message-send requires to/target");
  }
  const resolved = await resolveAibotOutboundTarget({
    client,
    accountId: options.accountId,
    to: target
  });
  const ack = await client.sendText(
    resolved.sessionId,
    message,
    {
      threadId: cleanText(options.threadId) || resolved.threadId,
      replyToMessageId: cleanText(options.replyToMessageId),
      eventId: cleanText(options.eventId)
    }
  );
  return {
    ok: true,
    accountId: options.accountId,
    target,
    resolvedTarget: resolved,
    message,
    ack
  };
}
