import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAdmin } from "../shared/cli/actions.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function modeOf(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

describe("grix-admin", () => {
  it("rotates an agent key and updates an env file with masked output", async () => {
    const tmp = makeTempDir("grix-admin-rotate-");
    const oldHome = process.env.HOME;
    process.env.HOME = tmp;
    try {
      const envFile = path.join(tmp, "profile.env");
      fs.writeFileSync(envFile, "GRIX_AGENT_ID=agent-secure\nGRIX_API_KEY=ak_123_OLD\n");
      const calls: Array<{ method: string; payload: unknown }> = [];
      const client = {
        async agentInvoke(method: string, payload: unknown): Promise<unknown> {
          calls.push({ method, payload });
          return {
            agent_id: "agent-secure",
            api_key: "ak_123_ROTATED",
          };
        },
      };

      const result = await runAdmin(client as never, {
        action: "key_rotate",
        agentId: "agent-secure",
        envFile,
        accountId: "main",
      });

      assert.deepEqual(calls, [
        { method: "agent_api_key_rotate", payload: { agent_id: "agent-secure" } },
      ]);
      assert.equal(result.action, "key_rotate");
      assert.deepEqual(result.rotatedAgent, {
        agent_id: "agent-secure",
        api_key: "***",
      });
      assert.equal(fs.readFileSync(envFile, "utf8"), "GRIX_AGENT_ID=agent-secure\nGRIX_API_KEY=ak_123_ROTATED\n");
      assert.equal(modeOf(envFile), 0o600);
      assert.equal(typeof result.tempKeyFile, "string");
      const tempKeyFile = result.tempKeyFile as string;
      assert.match(tempKeyFile, /grix-key-\d+\.tmp$/);
      assert.equal(modeOf(tempKeyFile), 0o600);
      assert.match(fs.readFileSync(tempKeyFile, "utf8"), /ak_123_ROTATED/);
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = oldHome;
      }
    }
  });
});
