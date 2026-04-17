import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import type { RuntimeConnectionConfig } from "./config.js";

function nowMs(): number {
  return Date.now();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

interface GrixPacket {
  cmd: string;
  seq?: number;
  payload?: Record<string, unknown>;
}

function parseCode(payload: Record<string, unknown> | undefined): number {
  const code = Number((payload?.code as number | string | undefined) ?? 0);
  return Number.isFinite(code) ? code : 0;
}

function parseMessage(payload: Record<string, unknown> | undefined): string {
  return (
    normalizeText(payload?.msg) || normalizeText(payload?.message) || "unknown error"
  );
}

function packetError(packet: GrixPacket): Error {
  return new Error(
    `grix ${packet.cmd}: code=${parseCode(packet.payload)} msg=${parseMessage(packet.payload)}`,
  );
}

function buildAuthPayload(config: RuntimeConnectionConfig): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    agent_id: config.agentId,
    api_key: config.apiKey,
    client: config.client,
    client_type: config.clientType,
    client_version: config.clientVersion,
    protocol_version: "aibot-agent-api-v1",
    contract_version: config.contractVersion ?? 1,
    host_type: config.hostType || "openclaw",
    capabilities: config.capabilities || [
      "session_route",
      "thread_v1",
      "inbound_media_v1",
      "local_action_v1",
      "agent_invoke",
    ],
    local_actions: config.localActions || ["exec_approve", "exec_reject"],
  };
  const hostVersion = normalizeText(config.hostVersion);
  if (hostVersion) payload.host_version = hostVersion;
  const adapterHint = normalizeText(config.adapterHint);
  if (adapterHint) payload.adapter_hint = adapterHint;
  return payload;
}

interface PendingRequest {
  expected: Set<string>;
  resolve: (packet: GrixPacket) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface RequestOptions {
  expected?: string[];
  timeoutMs?: number;
  requireAuthed?: boolean;
}

export interface SendTextOptions {
  threadId?: string;
  replyToMessageId?: string;
  eventId?: string;
  timeoutMs?: number;
}

export class AibotWsClient {
  private readonly config: RuntimeConnectionConfig;
  private ws: WebSocket | null = null;
  private seq = nowMs();
  private authed = false;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(config: RuntimeConnectionConfig) {
    this.config = config;
  }

  private ensureReady(requireAuthed = true): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("grix websocket is not connected");
    }
    if (requireAuthed && !this.authed) {
      throw new Error("grix websocket is not authenticated");
    }
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.authed) return;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.config.endpoint, {
        handshakeTimeout: this.config.connectTimeoutMs,
      });
      this.ws = ws;
      ws.on("open", () => resolve());
      ws.on("error", (error: Error) => reject(error));
      ws.on("close", (_code: number, reason: Buffer) => {
        const message = normalizeText(reason.toString()) || "grix websocket closed";
        this.rejectAll(new Error(message));
        this.authed = false;
      });
      ws.on("message", (data: RawData) => {
        void this.handleMessage(data);
      });
    });

    const authPacket = await this.request("auth", buildAuthPayload(this.config), {
      expected: ["auth_ack"],
      timeoutMs: 10000,
      requireAuthed: false,
    });
    if (parseCode(authPacket.payload) !== 0) {
      throw packetError(authPacket);
    }
    this.authed = true;
  }

  async disconnect(reason = "done"): Promise<void> {
    this.rejectAll(new Error(reason));
    this.authed = false;
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      ws.close(1000, reason);
      setTimeout(resolve, 500);
    });
  }

  private rejectAll(error: Error): void {
    for (const { timer, reject } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  private sendPacket(cmd: string, payload: Record<string, unknown>, seq = 0): void {
    this.ensureReady(false);
    this.ws!.send(JSON.stringify({ cmd, seq, payload }));
  }

  request(
    cmd: string,
    payload: Record<string, unknown>,
    options: RequestOptions = {},
  ): Promise<GrixPacket> {
    this.ensureReady(options.requireAuthed !== false);
    const seq = this.nextSeq();
    const expected = new Set(options.expected || []);
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? (options.timeoutMs as number)
      : this.config.requestTimeoutMs || 20000;

    return new Promise<GrixPacket>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`${cmd} timeout`));
      }, timeoutMs);
      this.pending.set(seq, { expected, resolve, reject, timer });
      this.sendPacket(cmd, payload, seq);
    });
  }

  private async handleMessage(data: RawData): Promise<void> {
    const text = Buffer.isBuffer(data)
      ? data.toString("utf8")
      : String(data ?? "");
    if (!text) return;
    let packet: GrixPacket;
    try {
      packet = JSON.parse(text) as GrixPacket;
    } catch {
      return;
    }
    if (!packet || typeof packet !== "object") return;
    if (packet.cmd === "ping") {
      this.sendPacket(
        "pong",
        { ts: nowMs() },
        Number(packet.seq) > 0 ? Number(packet.seq) : 0,
      );
      return;
    }
    const seq = Number(packet.seq || 0);
    const pending = this.pending.get(seq);
    if (!pending) return;
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

  async agentInvoke(
    action: string,
    params: Record<string, unknown> = {},
    options: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    const normalizedAction = normalizeText(action);
    if (!normalizedAction) {
      throw new Error("grix agent_invoke requires action");
    }
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1000, options.timeoutMs as number)
      : 15000;
    const packet = await this.request(
      "agent_invoke",
      {
        invoke_id: randomUUID(),
        action: normalizedAction,
        params,
        timeout_ms: timeoutMs,
      },
      { expected: ["agent_invoke_result"], timeoutMs },
    );
    if (parseCode(packet.payload) !== 0) throw packetError(packet);
    return (packet.payload as { data?: unknown })?.data;
  }

  async sendText(
    sessionId: string,
    text: string,
    options: SendTextOptions = {},
  ): Promise<Record<string, unknown>> {
    const normalizedSessionId = normalizeText(sessionId);
    const normalizedText = String(text ?? "");
    if (!normalizedSessionId) throw new Error("grix send_msg requires session_id");
    if (!normalizedText.trim()) throw new Error("grix send_msg requires content");
    const payload: Record<string, unknown> = {
      session_id: normalizedSessionId,
      msg_type: 1,
      content: normalizedText,
    };
    const replyTo = normalizeText(options.replyToMessageId);
    if (replyTo) payload.quoted_message_id = replyTo;
    const threadId = normalizeText(options.threadId);
    if (threadId) payload.thread_id = threadId;
    const eventId = normalizeText(options.eventId);
    if (eventId) payload.event_id = eventId;
    const packet = await this.request("send_msg", payload, {
      expected: ["send_ack", "send_nack", "error"],
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    });
    if (packet.cmd !== "send_ack") throw packetError(packet);
    return packet.payload ?? {};
  }

  async deleteMessage(
    sessionId: string,
    messageId: string,
    options: { timeoutMs?: number } = {},
  ): Promise<Record<string, unknown>> {
    const normalizedSessionId = normalizeText(sessionId);
    const normalizedMessageId = normalizeText(messageId);
    if (!normalizedSessionId) throw new Error("grix delete_msg requires session_id");
    if (!/^\d+$/.test(normalizedMessageId)) {
      throw new Error("grix delete_msg requires numeric msg_id");
    }
    const packet = await this.request(
      "delete_msg",
      { session_id: normalizedSessionId, msg_id: normalizedMessageId },
      {
        expected: ["send_ack", "send_nack", "error"],
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      },
    );
    if (packet.cmd !== "send_ack") throw packetError(packet);
    return packet.payload ?? {};
  }

  async resolveSessionRoute(
    channel: string,
    accountId: string,
    routeSessionKey: string,
    options: { timeoutMs?: number } = {},
  ): Promise<Record<string, unknown>> {
    const packet = await this.request(
      "session_route_resolve",
      {
        channel: normalizeText(channel),
        account_id: normalizeText(accountId),
        route_session_key: normalizeText(routeSessionKey),
      },
      {
        expected: ["send_ack", "send_nack", "error"],
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      },
    );
    if (packet.cmd !== "send_ack") throw packetError(packet);
    const sessionId = normalizeText((packet.payload as { session_id?: unknown })?.session_id);
    if (!sessionId) {
      throw new Error("grix session_route_resolve ack missing session_id");
    }
    return packet.payload ?? {};
  }
}
