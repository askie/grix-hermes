import { randomUUID } from "node:crypto";
import WebSocket from "ws";

function nowMs() {
  return Date.now();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseCode(payload) {
  const code = Number(payload?.code ?? 0);
  return Number.isFinite(code) ? code : 0;
}

function parseMessage(payload) {
  return normalizeText(payload?.msg) || normalizeText(payload?.message) || "unknown error";
}

function packetError(packet) {
  return new Error(`grix ${packet.cmd}: code=${parseCode(packet.payload)} msg=${parseMessage(packet.payload)}`);
}

function buildAuthPayload(config) {
  return {
    agent_id: config.agentId,
    api_key: config.apiKey,
    client: config.client,
    client_type: config.clientType,
    client_version: config.clientVersion,
    protocol_version: "aibot-agent-api-v1",
    contract_version: config.contractVersion ?? 1,
    host_type: config.hostType || "hermes",
    capabilities: config.capabilities || ["session_route", "thread_v1", "inbound_media_v1", "local_action_v1"],
    local_actions: config.localActions || ["exec_approve", "exec_reject"]
  };
}

export class AibotWsClient {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.seq = nowMs();
    this.authed = false;
    this.pending = new Map();
  }

  ensureReady(requireAuthed = true) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("grix websocket is not connected");
    }
    if (requireAuthed && !this.authed) {
      throw new Error("grix websocket is not authenticated");
    }
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.authed) {
      return;
    }
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.endpoint, {
        handshakeTimeout: this.config.connectTimeoutMs
      });
      this.ws = ws;

      ws.on("open", () => resolve());
      ws.on("error", (error) => reject(error));
      ws.on("close", (_code, reason) => {
        const message = normalizeText(reason) || "grix websocket closed";
        this.rejectAll(new Error(message));
        this.authed = false;
      });
      ws.on("message", (data) => {
        void this.handleMessage(data);
      });
    });

    const authPacket = await this.request(
      "auth",
      buildAuthPayload(this.config),
      { expected: ["auth_ack"], timeoutMs: 10000, requireAuthed: false }
    );
    if (parseCode(authPacket.payload) !== 0) {
      throw packetError(authPacket);
    }
    this.authed = true;
  }

  async disconnect(reason = "done") {
    this.rejectAll(new Error(reason));
    this.authed = false;
    const ws = this.ws;
    this.ws = null;
    if (!ws) {
      return;
    }
    await new Promise((resolve) => {
      ws.once("close", () => resolve());
      ws.close(1000, reason);
      setTimeout(resolve, 500);
    });
  }

  rejectAll(error) {
    for (const { timer, reject } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  nextSeq() {
    this.seq += 1;
    return this.seq;
  }

  sendPacket(cmd, payload, seq = 0) {
    this.ensureReady(false);
    this.ws.send(JSON.stringify({ cmd, seq, payload }));
  }

  request(cmd, payload, options = {}) {
    this.ensureReady(options.requireAuthed !== false);
    const seq = this.nextSeq();
    const expected = new Set(options.expected || []);
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : (this.config.requestTimeoutMs || 20000);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`${cmd} timeout`));
      }, timeoutMs);
      this.pending.set(seq, { expected, resolve, reject, timer });
      this.sendPacket(cmd, payload, seq);
    });
  }

  async handleMessage(data) {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data ?? "");
    if (!text) {
      return;
    }
    let packet;
    try {
      packet = JSON.parse(text);
    } catch {
      return;
    }
    if (!packet || typeof packet !== "object") {
      return;
    }
    if (packet.cmd === "ping") {
      this.sendPacket("pong", { ts: nowMs() }, Number(packet.seq) > 0 ? Number(packet.seq) : 0);
      return;
    }
    const seq = Number(packet.seq || 0);
    const pending = this.pending.get(seq);
    if (!pending) {
      return;
    }
    if (!pending.expected.has(packet.cmd)) {
      if (packet.cmd === "error") {
        clearTimeout(pending.timer);
        this.pending.delete(seq);
        pending.reject(packetError(packet));
      }
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(seq);
    pending.resolve(packet);
  }

  async agentInvoke(action, params = {}, options = {}) {
    const normalizedAction = normalizeText(action);
    if (!normalizedAction) {
      throw new Error("grix agent_invoke requires action");
    }
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : 15000;
    const packet = await this.request(
      "agent_invoke",
      {
        invoke_id: randomUUID(),
        action: normalizedAction,
        params,
        timeout_ms: timeoutMs
      },
      { expected: ["agent_invoke_result"], timeoutMs }
    );
    if (parseCode(packet.payload) !== 0) {
      throw packetError(packet);
    }
    return packet.payload?.data;
  }

  async sendText(sessionId, text, options = {}) {
    const normalizedSessionId = normalizeText(sessionId);
    const normalizedText = String(text ?? "");
    if (!normalizedSessionId) {
      throw new Error("grix send_msg requires session_id");
    }
    if (!normalizedText.trim()) {
      throw new Error("grix send_msg requires content");
    }
    const payload = {
      session_id: normalizedSessionId,
      msg_type: 1,
      content: normalizedText
    };
    if (normalizeText(options.replyToMessageId)) {
      payload.quoted_message_id = normalizeText(options.replyToMessageId);
    }
    if (normalizeText(options.threadId)) {
      payload.thread_id = normalizeText(options.threadId);
    }
    if (normalizeText(options.eventId)) {
      payload.event_id = normalizeText(options.eventId);
    }
    const packet = await this.request(
      "send_msg",
      payload,
      { expected: ["send_ack", "send_nack", "error"], timeoutMs: options.timeoutMs }
    );
    if (packet.cmd !== "send_ack") {
      throw packetError(packet);
    }
    return packet.payload;
  }

  async deleteMessage(sessionId, messageId, options = {}) {
    const normalizedSessionId = normalizeText(sessionId);
    const normalizedMessageId = normalizeText(messageId);
    if (!normalizedSessionId) {
      throw new Error("grix delete_msg requires session_id");
    }
    if (!/^\d+$/.test(normalizedMessageId)) {
      throw new Error("grix delete_msg requires numeric msg_id");
    }
    const packet = await this.request(
      "delete_msg",
      {
        session_id: normalizedSessionId,
        msg_id: normalizedMessageId
      },
      { expected: ["send_ack", "send_nack", "error"], timeoutMs: options.timeoutMs }
    );
    if (packet.cmd !== "send_ack") {
      throw packetError(packet);
    }
    return packet.payload;
  }

  async resolveSessionRoute(channel, accountId, routeSessionKey, options = {}) {
    const packet = await this.request(
      "session_route_resolve",
      {
        channel: normalizeText(channel),
        account_id: normalizeText(accountId),
        route_session_key: normalizeText(routeSessionKey)
      },
      { expected: ["send_ack", "send_nack", "error"], timeoutMs: options.timeoutMs }
    );
    if (packet.cmd !== "send_ack") {
      throw packetError(packet);
    }
    const sessionId = normalizeText(packet.payload?.session_id);
    if (!sessionId) {
      throw new Error("grix session_route_resolve ack missing session_id");
    }
    return packet.payload;
  }
}
