import test from "node:test";
import assert from "node:assert/strict";
import { buildConversationCard, buildEggStatusCard, buildUserProfileCard } from "../shared/cli/card-links.mjs";

test("conversation card encodes title", () => {
  const card = buildConversationCard({
    sessionId: "session-1",
    sessionType: "group",
    title: "测试群 A"
  });
  assert.ok(card.includes("grix://card/conversation?"));
  assert.ok(card.includes("title=%E6%B5%8B%E8%AF%95%E7%BE%A4+A"));
});

test("user profile card includes user id", () => {
  const card = buildUserProfileCard({
    userId: "2035123456789012345",
    nickname: "writer-hermes"
  });
  assert.ok(card.includes("user_id=2035123456789012345"));
});

test("egg status card includes status and summary", () => {
  const card = buildEggStatusCard({
    installId: "eggins_1",
    status: "running",
    step: "installing",
    summary: "已开始安装"
  });
  assert.ok(card.includes("status=running"));
  assert.ok(card.includes("summary="));
});
