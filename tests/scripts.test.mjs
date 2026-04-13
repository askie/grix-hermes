import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("message-send card helper prints conversation card", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "message-send/scripts/card-link.mjs"),
      "conversation",
      "--session-id",
      "session-1",
      "--session-type",
      "group",
      "--title",
      "测试群"
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /grix:\/\/card\/conversation/);
});

test("message-send send helper shows usage on help", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "message-send/scripts/send.mjs"), "--help"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /send --to/);
});

test("grix-admin bind_local dry-run builds Hermes bind plan", () => {
  const result = spawnSync(
    "python3",
    [
      path.join(root, "grix-admin/scripts/bind_local.py"),
      "--agent-name",
      "demo-agent",
      "--agent-id",
      "9001",
      "--api-endpoint",
      "wss://example/ws",
      "--api-key",
      "ak_test",
      "--skill-endpoint",
      "wss://example/ws-skill",
      "--skill-agent-id",
      "9002",
      "--skill-api-key",
      "ak_skill",
      "--profile-name",
      "demo-agent",
      "--dry-run",
      "--json"
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.agent_name, "demo-agent");
  assert.equal(payload.profile_name, "demo-agent");
  assert.equal(payload.env_updates.GRIX_SKILL_ENDPOINT, "wss://example/ws-skill");
  assert.equal(payload.env_updates.GRIX_SKILL_AGENT_ID, "9002");
  assert.equal(payload.env_updates.GRIX_SKILL_API_KEY, "ak_skill");
  assert.equal(Array.isArray(payload.commands), true);
  assert.ok(payload.commands.length >= 1);
});

test("grix-update dry-run builds update plan", () => {
  const result = spawnSync(
    "python3",
    [
      path.join(root, "grix-update/scripts/grix_update.py"),
      "--mode",
      "check-and-apply",
      "--repo-root",
      root,
      "--dry-run",
      "--json"
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "check-and-apply");
  assert.ok(payload.commands.some((entry) => entry.cmd.includes("pull")));
});

test("grix-admin bind_from_json forwards remote result", () => {
  const payload = JSON.stringify({
    createdAgent: {
      id: "9001",
      agent_name: "demo-agent",
      api_endpoint: "wss://example/ws",
      api_key: "ak_test"
    }
  });
  const result = spawnSync(
    "python3",
    [
      path.join(root, "grix-admin/scripts/bind_from_json.py"),
      "--profile-name",
      "demo-agent",
      "--dry-run",
      "--json"
    ],
    { input: payload, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.agent_name, "demo-agent");
});

test("grix-register create_api_agent_and_bind can reuse existing json", () => {
  const fixturePath = path.join(root, "tests/tmp-created-agent.json");
  const payload = {
    agent_id: "9001",
    agent_name: "demo-agent",
    api_endpoint: "wss://example/ws",
    api_key: "ak_test"
  };
  fs.writeFileSync(fixturePath, JSON.stringify(payload), "utf8");
  try {
    const result = spawnSync(
      "python3",
      [
        path.join(root, "grix-register/scripts/create_api_agent_and_bind.py"),
        "--agent-json-file",
        fixturePath,
        "--profile-name",
        "demo-agent",
        "--skill-endpoint",
        "wss://example/ws-skill",
        "--skill-agent-id",
        "9002",
        "--skill-api-key",
        "ak_skill",
        "--dry-run",
        "--json"
      ],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.bind_result.agent_name, "demo-agent");
    assert.equal(parsed.bind_result.env_updates.GRIX_SKILL_ENDPOINT, "wss://example/ws-skill");
    assert.equal(parsed.bind_result.env_updates.GRIX_SKILL_AGENT_ID, "9002");
    assert.equal(parsed.bind_result.env_updates.GRIX_SKILL_API_KEY, "ak_skill");
  } finally {
    fs.rmSync(fixturePath, { force: true });
  }
});
