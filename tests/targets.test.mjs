import test from "node:test";
import assert from "node:assert/strict";
import { resolveAibotOutboundTarget, resolveSilentUnsendPlan } from "../shared/cli/targets.mjs";

test("direct outbound target stays direct", async () => {
  const resolved = await resolveAibotOutboundTarget({
    client: {},
    accountId: "main",
    to: "2035999888777666555"
  });
  assert.equal(resolved.sessionId, "2035999888777666555");
  assert.equal(resolved.threadId, undefined);
  assert.equal(resolved.resolveSource, "direct");
});

test("direct outbound target can carry thread id", async () => {
  const resolved = await resolveAibotOutboundTarget({
    client: {},
    accountId: "main",
    to: "g_1001:topic-a"
  });
  assert.equal(resolved.sessionId, "g_1001");
  assert.equal(resolved.threadId, "topic-a");
});

test("route session key resolves through client", async () => {
  const resolved = await resolveAibotOutboundTarget({
    client: {
      async resolveSessionRoute(_channel, _accountId, routeSessionKey) {
        assert.equal(routeSessionKey, "agent:main:grix:group:g_1001:topic-a");
        return { session_id: "session-xyz" };
      }
    },
    accountId: "main",
    to: "agent:main:grix:group:g_1001:topic-a"
  });
  assert.equal(resolved.sessionId, "session-xyz");
  assert.equal(resolved.resolveSource, "sessionRouteMap");
});

test("silent unsend plan includes command delete when context exists", async () => {
  const plan = await resolveSilentUnsendPlan({
    client: {
      async resolveSessionRoute(_channel, _accountId, routeSessionKey) {
        return { session_id: routeSessionKey === "agent:main:grix:group:current" ? "current-session" : "target-session" };
      }
    },
    accountId: "main",
    messageId: "2033371385615093760",
    targetTo: "agent:main:grix:group:target",
    currentChannelId: "agent:main:grix:group:current",
    currentMessageId: "2033371385615093777"
  });
  assert.deepEqual(plan.targetDelete, {
    sessionId: "target-session",
    messageId: "2033371385615093760"
  });
  assert.deepEqual(plan.commandDelete, {
    sessionId: "current-session",
    messageId: "2033371385615093777"
  });
});
