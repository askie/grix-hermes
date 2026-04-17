import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeConfig } from "../shared/cli/config.mjs";

test("runtime config loads from HERMES_HOME files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-"));
  fs.writeFileSync(path.join(tempDir, ".env"), "GRIX_ENDPOINT=wss://env/ws\nGRIX_AGENT_ID=9001\nGRIX_API_KEY=env-key\n");
  fs.writeFileSync(path.join(tempDir, "config.yaml"), "platforms:\n  grix:\n    enabled: true\n    api_key: yaml-key\n    extra:\n      endpoint: wss://yaml/ws\n      agent_id: 8001\n");
  const previous = process.env.HERMES_HOME;
  process.env.HERMES_HOME = tempDir;
  try {
    const runtime = resolveRuntimeConfig();
    assert.equal(runtime.connection.endpoint, "wss://env/ws");
    assert.equal(runtime.connection.agentId, "9001");
    assert.equal(runtime.connection.apiKey, "env-key");
  } finally {
    if (previous === undefined) {
      delete process.env.HERMES_HOME;
    } else {
      process.env.HERMES_HOME = previous;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runtime config defaults to authorized ws handshake", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-"));
  fs.writeFileSync(path.join(tempDir, ".env"), "GRIX_ENDPOINT=wss://env/ws\nGRIX_AGENT_ID=9001\nGRIX_API_KEY=env-key\n");
  const previous = process.env.HERMES_HOME;
  process.env.HERMES_HOME = tempDir;
  try {
    const runtime = resolveRuntimeConfig();
    assert.equal(runtime.connection.clientType, "openclaw");
    assert.equal(runtime.connection.hostType, "openclaw");
    assert.deepEqual(runtime.connection.capabilities, [
      "session_route",
      "thread_v1",
      "inbound_media_v1",
      "local_action_v1",
      "agent_invoke"
    ]);
  } finally {
    if (previous === undefined) {
      delete process.env.HERMES_HOME;
    } else {
      process.env.HERMES_HOME = previous;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runtime config uses the single grix credential set", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-"));
  fs.writeFileSync(
    path.join(tempDir, ".env"),
    [
      "GRIX_ENDPOINT=wss://default/ws",
      "GRIX_AGENT_ID=9001",
      "GRIX_API_KEY=default-key",
      "GRIX_ACCOUNT_ID=acct-main"
    ].join("\n") + "\n"
  );
  const previous = process.env.HERMES_HOME;
  process.env.HERMES_HOME = tempDir;
  try {
    const runtime = resolveRuntimeConfig();
    assert.equal(runtime.connection.endpoint, "wss://default/ws");
    assert.equal(runtime.connection.agentId, "9001");
    assert.equal(runtime.connection.apiKey, "default-key");
    assert.equal(runtime.connection.accountId, "acct-main");
  } finally {
    if (previous === undefined) {
      delete process.env.HERMES_HOME;
    } else {
      process.env.HERMES_HOME = previous;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
