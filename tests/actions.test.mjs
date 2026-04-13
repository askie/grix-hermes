import test from "node:test";
import assert from "node:assert/strict";
import { runAdmin, runSend } from "../shared/cli/actions.mjs";

test("admin create_agent creates category by name when needed", async () => {
  const calls = [];
  const client = {
    async agentInvoke(action, params) {
      calls.push({ action, params });
      if (action === "agent_api_create") {
        return { id: "9001", agent_name: "writer-hermes" };
      }
      if (action === "agent_category_list") {
        return { categories: [] };
      }
      if (action === "agent_category_create") {
        return { id: "55", name: "写作" };
      }
      if (action === "agent_category_assign") {
        return { ok: true };
      }
      throw new Error(`unexpected action ${action}`);
    }
  };

  const result = await runAdmin(client, {
    accountId: "main",
    action: "create_agent",
    agentName: "writer-hermes",
    categoryName: "写作",
    parentCategoryId: "0"
  });

  assert.equal(result.createdAgent.id, "9001");
  assert.equal(result.category.id, "55");
  assert.equal(result.assignment.ok, true);
  assert.deepEqual(calls.map((item) => item.action), [
    "agent_api_create",
    "agent_category_list",
    "agent_category_create",
    "agent_category_assign"
  ]);
});

test("send resolves route target and sends text", async () => {
  const result = await runSend(
    {
      async resolveSessionRoute(_channel, _accountId, routeSessionKey) {
        assert.equal(routeSessionKey, "agent:main:grix:group:g_1001");
        return { session_id: "resolved-session" };
      },
      async sendText(sessionId, message, options) {
        assert.equal(sessionId, "resolved-session");
        assert.equal(message, "hello");
        assert.equal(options.threadId, undefined);
        return { msg_id: "18889990099" };
      }
    },
    {
      accountId: "main",
      to: "agent:main:grix:group:g_1001",
      message: "hello"
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.ack.msg_id, "18889990099");
});
