export function cleanText(value: unknown): string {
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
