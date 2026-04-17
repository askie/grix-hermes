#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from "node:url";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function buildLink(label: string, url: string): string {
  return `[${cleanText(label)}](${url})`;
}

export interface ConversationCardParams {
  sessionId: string;
  sessionType: string;
  title: string;
  peerId?: string;
  label?: string;
}

export function buildConversationCard(params: ConversationCardParams): string {
  const sessionId = cleanText(params.sessionId);
  const sessionType = cleanText(params.sessionType);
  const title = cleanText(params.title);
  if (!sessionId || !sessionType || !title) {
    throw new Error("conversation card requires sessionId, sessionType, and title");
  }
  const query = new URLSearchParams({
    session_id: sessionId,
    session_type: sessionType,
    title,
  });
  const peerId = cleanText(params.peerId);
  if (peerId) query.set("peer_id", peerId);
  return buildLink(
    cleanText(params.label) || "打开会话",
    `grix://card/conversation?${query.toString()}`,
  );
}

export interface UserProfileCardParams {
  userId: string;
  nickname: string;
  peerType?: string;
  avatarUrl?: string;
  label?: string;
}

export function buildUserProfileCard(params: UserProfileCardParams): string {
  const userId = cleanText(params.userId);
  const nickname = cleanText(params.nickname);
  if (!userId || !nickname) {
    throw new Error("user profile card requires userId and nickname");
  }
  const query = new URLSearchParams({
    user_id: userId,
    peer_type: cleanText(params.peerType) || "2",
    nickname,
  });
  const avatarUrl = cleanText(params.avatarUrl);
  if (avatarUrl) query.set("avatar_url", avatarUrl);
  return buildLink(
    cleanText(params.label) || "查看 Agent 资料",
    `grix://card/user_profile?${query.toString()}`,
  );
}

export interface EggStatusCardParams {
  installId: string;
  status: string;
  step: string;
  summary: string;
  targetAgentId?: string;
  errorCode?: string;
  errorMessage?: string;
  label?: string;
}

export function buildEggStatusCard(params: EggStatusCardParams): string {
  const installId = cleanText(params.installId);
  const status = cleanText(params.status);
  const step = cleanText(params.step);
  const summary = cleanText(params.summary);
  if (!installId || !status || !step || !summary) {
    throw new Error("egg status card requires installId, status, step, and summary");
  }
  const query = new URLSearchParams({ install_id: installId, status, step, summary });
  const targetAgentId = cleanText(params.targetAgentId);
  if (targetAgentId) query.set("target_agent_id", targetAgentId);
  const errorCode = cleanText(params.errorCode);
  if (errorCode) query.set("error_code", errorCode);
  const errorMessage = cleanText(params.errorMessage);
  if (errorMessage) query.set("error_msg", errorMessage);
  return buildLink(
    cleanText(params.label) || "安装状态",
    `grix://card/egg_install_status?${query.toString()}`,
  );
}

export function dispatchCardBuilder(kind: string, params: Record<string, unknown>): string {
  if (kind === "conversation") return buildConversationCard(params as unknown as ConversationCardParams);
  if (kind === "user-profile") return buildUserProfileCard(params as unknown as UserProfileCardParams);
  if (kind === "egg-status") return buildEggStatusCard(params as unknown as EggStatusCardParams);
  throw new Error(`Unsupported card kind: ${kind}`);
}

function toCamelFlag(key: string): string {
  return key.replace(/-([a-z])/g, (_match, ch: string) => ch.toUpperCase());
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = toCamelFlag(token.slice(2));
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { positional, flags };
}

function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  const thisUrl = import.meta.url;
  const entryUrl = pathToFileURL(process.argv[1]).href;
  return thisUrl === entryUrl;
}

export function runCli(argv: string[]): void {
  const { positional, flags } = parseArgs(argv);
  const kind = positional[0];
  if (!kind || ["help", "--help", "-h"].includes(kind)) {
    process.stdout.write(`Usage:
  node shared/cli/card-links.js conversation --session-id <id> --session-type group --title <title>
  node shared/cli/card-links.js user-profile --user-id <id> --nickname <name> [--avatar-url <url>]
  node shared/cli/card-links.js egg-status --install-id <id> --status running --step installing --summary <text>
`);
    return;
  }
  process.stdout.write(`${dispatchCardBuilder(kind, flags)}\n`);
}

if (isDirectRun()) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

// Convince tsc this file is a module when no exports are used directly.
export const __cardLinksModule = true;
export { fileURLToPath };
