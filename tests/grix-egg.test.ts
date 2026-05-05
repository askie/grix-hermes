import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeExecutable(filePath: string, contents: string): string {
  fs.writeFileSync(filePath, contents, { encoding: "utf8", mode: 0o700 });
  fs.chmodSync(filePath, 0o700);
  return filePath;
}

function modeOf(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

function writeFakeNode(filePath: string): string {
  return writeExecutable(filePath, `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const script = process.argv[2] || "";
const args = process.argv.slice(3);
const stateDir = process.env.FAKE_STATE_DIR;
function out(value) { process.stdout.write(JSON.stringify(value, null, 2) + "\\n"); }
function arg(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ""; }
function save(name, value) { fs.writeFileSync(path.join(stateDir, name), typeof value === "string" ? value : JSON.stringify(value, null, 2)); }
if (script.endsWith("bin/grix-hermes.js")) {
  process.stdout.write(arg("--dest") || "installed");
} else if (script.endsWith("admin.js")) {
  out({ data: { agent_id: "agent-target", agent_name: "safeagent", api_endpoint: "wss://target", api_key: "ak_123_SECRET" } });
} else if (script.endsWith("bind_local.js")) {
  save("bind-input.json", fs.readFileSync(0, "utf8"));
  save("bind-args.json", args);
  out({ profile_name: arg("--profile-name") || "safeagent" });
} else if (script.endsWith("create_api_agent_and_bind.js")) {
  save("http-create-args.json", args);
  out({ bind_result: { agent_id: "http-agent", agent_name: "httpagent", profile_name: "httpagent", api_endpoint: "wss://http-target", api_key: "ak_123_HTTPSECRET" } });
} else if (script.endsWith("grix_auth.js")) {
  save("http-login-args.json", args);
  out({ ok: true, action: "login", access_token: "token-from-login" });
} else if (script.endsWith("start_gateway.js")) {
  out({ ok: true, start_mode: "service_start" });
} else if (script.endsWith("group.js")) {
  save("group-args.json", args);
  out({ data: { session_id: "session-accept" } });
} else if (script.endsWith("send.js")) {
  const to = arg("--to");
  const message = arg("--message");
  if (stateDir) {
    fs.appendFileSync(path.join(stateDir, "send-calls.jsonl"), JSON.stringify({ to, message }) + "\\n");
  }
  const failMatch = process.env.FAKE_SEND_FAIL_MATCH || "";
  const failTarget = process.env.FAKE_SEND_FAIL_TARGET || "";
  if ((failMatch && message.includes(failMatch)) || (failTarget && to === failTarget)) {
    process.stderr.write("simulated send failure");
    process.exit(7);
  }
  if (message.includes("probe") || message.includes("ping")) {
    save("probe-message.txt", message);
    out({ ok: true, ack: { message_id: "100" } });
  }
  else out({ ok: true, ack: { message_id: "50" } });
} else if (script.endsWith("query.js")) {
  save("query-args.json", args);
  const falseOnly = process.env.FAKE_ACCEPTANCE_MODE === "false-only";
  const acceptedSender = process.env.FAKE_ACCEPTANCE_SENDER || "agent-target";
  out({
    data: {
      messages: falseOnly ? [
        { id: "99", sender_id: acceptedSender, content: "identity-ok before probe" },
        { id: "101", sender_id: "other-agent", content: "identity-ok wrong sender" }
      ] : [
        { id: "99", sender_id: acceptedSender, content: "identity-ok before probe" },
        { id: "101", sender_id: "other-agent", content: "identity-ok wrong sender" },
        { id: "102", sender_id: acceptedSender, content: "identity-ok after probe" }
      ]
    }
  });
} else if (script.endsWith("card-link.js")) {
  process.stdout.write("card-link");
} else {
  process.stderr.write("Unexpected fake node script: " + script + "\\n");
  process.exit(9);
}
`);
}

function readSendCalls(tmp: string): Array<{ to: string; message: string }> {
  const filePath = path.join(tmp, "send-calls.jsonl");
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { to: string; message: string });
}

describe("grix-egg bootstrap", () => {
  it("incubates a fresh agent with only business inputs and auto-generated process params", () => {
    const tmp = makeTempDir("grix-egg-minimal-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--agent-name", "雪碧",
      "--profile-name-suffix", "xuebi",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        FAKE_ACCEPTANCE_SENDER: "agent-target",
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      install_id: string;
      agent_name: string;
      profile_name: string;
      path?: string;
      interaction_status: string;
      delivery: {
        target: string;
        attempts: Array<{ kind: string }>;
      };
      summary: string;
      acceptance: {
        session_id: string;
        reply_content: string;
      };
      links: {
        acceptance_conversation: string;
      };
    };
    assert.match(output.install_id, /^egg-[0-9a-f]{8}$/);
    assert.equal(output.agent_name, "雪碧");
    assert.equal(output.profile_name, "egg-xuebi");
    assert.equal(output.path, "host");
    assert.equal(output.interaction_status, "none");
    assert.equal(output.delivery.target, "");
    assert.equal(output.delivery.attempts.length, 0);
    assert.match(output.summary, /agent「雪碧」已创建完成/);
    assert.equal(output.acceptance.session_id, "session-accept");
    assert.equal(output.acceptance.reply_content, "identity-ok after probe");
    assert.match(output.links.acceptance_conversation, /grix:\/\/card\/conversation\?/);

    const statePath = path.join(hermesHome, "tmp", `grix-egg-${output.install_id}.json`);
    assert.equal(fs.existsSync(statePath), true);

    const bindArgs = JSON.parse(fs.readFileSync(path.join(tmp, "bind-args.json"), "utf8")) as string[];
    assert.equal(bindArgs.includes("--install-id"), false);
    assert.equal(bindArgs[bindArgs.indexOf("--profile-name") + 1], output.profile_name);
    assert.equal(bindArgs[bindArgs.indexOf("--hermes-home") + 1], hermesHome);
    assert.equal(fs.readFileSync(path.join(tmp, "probe-message.txt"), "utf8"), "@agent-target probe");
    const queryArgs = JSON.parse(fs.readFileSync(path.join(tmp, "query-args.json"), "utf8")) as string[];
    assert.equal(queryArgs[queryArgs.indexOf("--action") + 1], "message_history");
  });

  it("sends the full success interaction loop to an explicit status target", () => {
    const tmp = makeTempDir("grix-egg-status-target-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-status-target",
      "--agent-name", "statusagent",
      "--profile-name", "statusagent",
      "--status-target", "session-status",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      interaction_status: string;
      delivery: {
        target: string;
        target_source: string;
        attempts: Array<{ kind: string; ok: boolean }>;
      };
      summary: string;
    };
    assert.equal(output.interaction_status, "full");
    assert.equal(output.delivery.target, "session-status");
    assert.equal(output.delivery.target_source, "status_target");
    assert.deepEqual(
      output.delivery.attempts.map((attempt) => [attempt.kind, attempt.ok]),
      [
        ["running_card", true],
        ["acceptance_card", true],
        ["final_text", true],
        ["final_card", true],
      ],
    );
    assert.match(output.summary, /测试群入口已发送/);

    const targetCalls = readSendCalls(tmp).filter((call) => call.to === "session-status");
    assert.equal(targetCalls.length, 4);
    assert.match(targetCalls[0]!.message, /grix:\/\/card\/egg_install_status\?.*status=running/);
    assert.match(targetCalls[1]!.message, /grix:\/\/card\/conversation\?/);
    assert.match(targetCalls[2]!.message, /agent「statusagent」已创建完成/);
    assert.match(targetCalls[3]!.message, /grix:\/\/card\/egg_install_status\?.*status=success/);
  });

  it("normalizes the requested English suffix when auto-generating a profile name for a non-ASCII agent name", () => {
    const tmp = makeTempDir("grix-egg-suffix-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--agent-name", "红色",
      "--profile-name-suffix", "Hong Se",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        FAKE_ACCEPTANCE_SENDER: "agent-target",
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      install_id: string;
      profile_name: string;
    };
    assert.match(output.install_id, /^egg-[0-9a-f]{8}$/);
    assert.equal(output.profile_name, "egg-hong-se");

    const bindArgs = JSON.parse(fs.readFileSync(path.join(tmp, "bind-args.json"), "utf8")) as string[];
    assert.equal(bindArgs[bindArgs.indexOf("--profile-name") + 1], output.profile_name);
  });

  it("fails fast when a non-ASCII agent name omits both profile-name and profile-name-suffix", () => {
    const tmp = makeTempDir("grix-egg-missing-suffix-");
    const hermesHome = path.join(tmp, "hermes");
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--agent-name", "红色",
      "--hermes-home", hermesHome,
      "--json",
    ], {
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires --profile-name-suffix or an explicit --profile-name/);
  });

  it("rejects a profile-name suffix that cannot be normalized to ASCII", () => {
    const tmp = makeTempDir("grix-egg-bad-suffix-");
    const hermesHome = path.join(tmp, "hermes");
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--agent-name", "红色",
      "--profile-name-suffix", "红色",
      "--hermes-home", hermesHome,
      "--json",
    ], {
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid --profile-name-suffix/);
  });

  it("incubates an empty agent with only install id and agent name", () => {
    const tmp = makeTempDir("grix-egg-empty-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-empty",
      "--agent-name", "emptyagent",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      path?: string;
      steps: Record<string, { status: string }>;
    };
    assert.equal(output.path, "host");
    assert.ok(output.steps.soul);
    assert.ok(output.steps.accept);
    assert.equal(output.steps.soul.status, "skipped");
    assert.equal(output.steps.accept.status, "done");
    assert.ok(fs.existsSync(path.join(tmp, "bind-input.json")));
    assert.equal(fs.existsSync(path.join(tmp, "group-args.json")), true);
  });

  it("keeps WS-created api keys out of checkpoints while binding with the real key", () => {
    const tmp = makeTempDir("grix-egg-ws-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-secure",
      "--agent-name", "safeagent",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--member-ids", "user-1",
      "--accept-timeout-seconds", "1",
      "--accept-poll-interval-seconds", "0.1",
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      path?: string;
      steps: {
        accept: { status: string };
      };
    };
    assert.equal(output.path, "host");
    assert.equal(output.steps.accept.status, "done");
    const statePath = path.join(hermesHome, "tmp", "grix-egg-egg-secure.json");
    const stateText = fs.readFileSync(statePath, "utf8");
    assert.equal(modeOf(statePath), 0o600);
    assert.ok(!stateText.includes("ak_123_SECRET"));
    assert.ok(!stateText.includes("_api_key"));

    const state = JSON.parse(stateText) as {
      steps: {
        accept: { result: Record<string, string> };
      };
    };
    assert.equal(state.steps.accept.result.reply_msg_id, "102");
    assert.equal(state.steps.accept.result.reply_sender_id, "agent-target");
    assert.equal(state.steps.accept.result.reply_content, "identity-ok after probe");
    assert.equal(state.steps.accept.result.expected_substring, "");

    const bindInput = fs.readFileSync(path.join(tmp, "bind-input.json"), "utf8");
    assert.ok(bindInput.includes("ak_123_SECRET"));

    const groupArgs = JSON.parse(fs.readFileSync(path.join(tmp, "group-args.json"), "utf8")) as string[];
    assert.equal(groupArgs[groupArgs.indexOf("--member-ids") + 1], "user-1,agent-target");
    assert.equal(groupArgs[groupArgs.indexOf("--member-types") + 1], "1,2");
  });

  it("does not default host-path bindings to caller-only access", () => {
    const tmp = makeTempDir("grix-egg-access-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-access",
      "--agent-name", "openagent",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
        GRIX_ACCOUNT_ID: "acct-host",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const bindArgs = JSON.parse(fs.readFileSync(path.join(tmp, "bind-args.json"), "utf8")) as string[];
    assert.equal(bindArgs[bindArgs.indexOf("--account-id") + 1], "acct-host");
    assert.equal(bindArgs[bindArgs.indexOf("--allowed-users") + 1], "");
    assert.equal(bindArgs[bindArgs.indexOf("--allow-all-users") + 1], "true");
  });

  it("rejects acceptance matches from old messages or the wrong sender", () => {
    const tmp = makeTempDir("grix-egg-accept-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-false-accept",
      "--agent-name", "safeagent",
      "--status-target", "session-accept-failed",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--accept-timeout-seconds", "0.2",
      "--accept-poll-interval-seconds", "0.1",
      "--expected-substring", "identity-ok after probe",
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        FAKE_ACCEPTANCE_MODE: "false-only",
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 1);
    const output = JSON.parse(result.stderr) as {
      reason: string;
      interaction_status: string;
      delivery: {
        attempts: Array<{ kind: string; ok: boolean }>;
      };
    };
    assert.match(output.reason, /验收超时/);
    assert.equal(output.interaction_status, "full");
    assert.deepEqual(
      output.delivery.attempts.map((attempt) => [attempt.kind, attempt.ok]),
      [
        ["running_card", true],
        ["acceptance_card", true],
        ["failure_text", true],
        ["failure_card", true],
      ],
    );

    const targetCalls = readSendCalls(tmp).filter((call) => call.to === "session-accept-failed");
    assert.equal(targetCalls.length, 4);
    assert.equal(targetCalls.some((call) => call.message.includes("status=success")), false);
  });

  it("falls back to HTTP when no reusable host Grix session exists and an access token is available", () => {
    const tmp = makeTempDir("grix-egg-http-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-http",
      "--agent-name", "httpagent",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--access-token", "token",
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        FAKE_ACCEPTANCE_SENDER: "http-agent",
        GRIX_ENDPOINT: "",
        GRIX_AGENT_ID: "",
        GRIX_API_KEY: "",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(tmp, "http-create-args.json")), true);
    const statePath = path.join(hermesHome, "tmp", "grix-egg-egg-http.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      path: string;
      steps: {
        detect: { result: Record<string, string> };
        create: { result: Record<string, string> };
        bind: { status: string };
      };
    };
    assert.equal(state.path, "http");
    assert.equal(state.steps.detect.result.path, "http");
    assert.equal(state.steps.create.result.path, "http");
    assert.equal(state.steps.bind.status, "done");
  });

  it("logs in with account/password before HTTP fallback when no access token is provided", () => {
    const tmp = makeTempDir("grix-egg-http-login-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-http-login",
      "--agent-name", "httpagent",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--email", "user@example.com",
      "--password", "secret",
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        FAKE_ACCEPTANCE_SENDER: "http-agent",
        GRIX_ENDPOINT: "",
        GRIX_AGENT_ID: "",
        GRIX_API_KEY: "",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const loginArgs = JSON.parse(fs.readFileSync(path.join(tmp, "http-login-args.json"), "utf8")) as string[];
    assert.equal(loginArgs[0], "login");
    assert.equal(loginArgs[loginArgs.indexOf("--email") + 1], "user@example.com");
    assert.equal(loginArgs[loginArgs.indexOf("--password") + 1], "secret");

    const httpArgs = JSON.parse(fs.readFileSync(path.join(tmp, "http-create-args.json"), "utf8")) as string[];
    assert.equal(httpArgs[httpArgs.indexOf("--access-token") + 1], "token-from-login");

    const statePath = path.join(hermesHome, "tmp", "grix-egg-egg-http-login.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      steps: {
        detect: { result: Record<string, string> };
        create: { result: Record<string, string> };
      };
    };
    assert.equal(state.steps.detect.result.token_source, "login_with_account_password");
    assert.equal(state.steps.create.result.token_source, "login_with_account_password");
  });

  it("fails fast when host Grix create capability is unsupported instead of silently falling back to HTTP", () => {
    const tmp = makeTempDir("grix-egg-ws-fallback-");
    const hermesHome = path.join(tmp, "hermes");
    fs.mkdirSync(hermesHome, { recursive: true });
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    fs.writeFileSync(
      path.join(hermesHome, ".env"),
      [
        "GRIX_ENDPOINT=wss://caller",
        "GRIX_AGENT_ID=caller-agent",
        "GRIX_API_KEY=***",
      ].join("\n"),
      { encoding: "utf8" },
    );

    fs.writeFileSync(fakeNode, fs.readFileSync(fakeNode, "utf8").replace(
      'out({ data: { agent_id: "agent-target", agent_name: "safeagent", api_endpoint: "wss://target", api_key: "ak_123_SECRET" } });',
      'process.stderr.write("grix error: code=4004 msg=unsupported cmd for hermes\\n"); process.exit(4);',
    ));

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-ws-fallback",
      "--agent-name", "fallbackagent",
      "--status-target", "session-create-failed",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--access-token", "token",
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        GRIX_ENDPOINT: "",
        GRIX_AGENT_ID: "",
        GRIX_API_KEY: "",
      },
    });

    assert.equal(result.status, 1);
    const output = JSON.parse(result.stderr) as {
      reason: string;
      interaction_status: string;
      delivery: {
        attempts: Array<{ kind: string; ok: boolean }>;
      };
    };
    assert.match(output.reason, /unsupported cmd for hermes/);
    assert.equal(output.interaction_status, "full");
    assert.deepEqual(
      output.delivery.attempts.map((attempt) => [attempt.kind, attempt.ok]),
      [
        ["running_card", true],
        ["failure_text", true],
        ["failure_card", true],
      ],
    );
    assert.equal(fs.existsSync(path.join(tmp, "http-create-args.json")), false);
    const statePath = path.join(hermesHome, "tmp", "grix-egg-egg-ws-fallback.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      path: string;
      interaction_status: string;
      steps: {
        detect: { result: Record<string, string> };
        create: { status: string; result: Record<string, string> | null };
      };
    };
    assert.equal(state.path, "host");
    assert.equal(state.interaction_status, "full");
    assert.equal(state.steps.detect.result.path, "host");
    assert.equal(state.steps.create.status, "failed");
    assert.equal(state.steps.create.result, null);
  });

  it("uses profile env credentials for host detection when the Hermes root env is incomplete", () => {
    const tmp = makeTempDir("grix-egg-profile-env-");
    const hermesHome = path.join(tmp, "hermes");
    const profileDir = path.join(hermesHome, "profiles", "safeagent");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(hermesHome, ".env"), "GRIX_ENDPOINT=wss://root-only\n");
    fs.writeFileSync(
      path.join(profileDir, ".env"),
      [
        "GRIX_ENDPOINT=wss://profile-target",
        "GRIX_AGENT_ID=profile-agent",
        "GRIX_API_KEY=ak_123_PROFILE",
      ].join("\n"),
    );

    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-profile-env",
      "--agent-name", "safeagent",
      "--profile-name", "safeagent",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        GRIX_ENDPOINT: "",
        GRIX_AGENT_ID: "",
        GRIX_API_KEY: "",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(tmp, "http-create-args.json")), false);

    const statePath = path.join(hermesHome, "tmp", "grix-egg-egg-profile-env.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      path: string;
      steps: {
        detect: {
          result: Record<string, string>;
        };
        create: {
          result: Record<string, string>;
        };
      };
    };
    assert.equal(state.path, "host");
    assert.equal(state.steps.detect.result.path, "host");
    assert.equal(state.steps.create.result.path, "host");
    assert.equal(state.steps.detect.result.ws_source, "Hermes profile .env (safeagent)");
    assert.equal(state.steps.detect.result.ws_profile_name, "safeagent");
  });

  it("falls back to home-channel as the status delivery target when status-target is omitted", () => {
    const tmp = makeTempDir("grix-egg-home-channel-status-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-home-channel-status",
      "--agent-name", "homeagent",
      "--profile-name", "homeagent",
      "--home-channel", "session-home",
      "--home-channel-name", "当前会话",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      interaction_status: string;
      delivery: {
        target_source: string;
        attempts: Array<{ kind: string; ok: boolean }>;
      };
      links: {
        status_target: string;
      };
    };
    assert.equal(output.interaction_status, "full");
    assert.equal(output.links.status_target, "session-home");
    assert.equal(output.delivery.target_source, "home_channel");

    const sendCalls = readSendCalls(tmp);

    const statusMessages = sendCalls.filter((call) =>
      call.to === "session-home" && call.message.includes("grix://card/egg_install_status?"),
    );
    const conversationMessages = sendCalls.filter((call) =>
      call.to === "session-home" && call.message.includes("grix://card/conversation?"),
    );
    const finalTextMessages = sendCalls.filter((call) =>
      call.to === "session-home" && call.message.includes("agent「homeagent」已创建完成"),
    );

    assert.equal(statusMessages.length >= 2, true);
    assert.equal(conversationMessages.length >= 1, true);
    assert.equal(finalTextMessages.length, 1);
    assert.deepEqual(
      output.delivery.attempts.map((attempt) => [attempt.kind, attempt.ok]),
      [
        ["running_card", true],
        ["acceptance_card", true],
        ["final_text", true],
        ["final_card", true],
      ],
    );
  });

  it("uses install-context current_chat_session_id as the delivery fallback and inherits home-channel-name", () => {
    const tmp = makeTempDir("grix-egg-install-context-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const installContextPath = path.join(tmp, "install-context.json");
    fs.writeFileSync(installContextPath, JSON.stringify({
      install_id: "egg-install-context",
      current_chat_session_id: "session-context",
      main_agent: {
        home_channel_name: "当前对话",
      },
    }, null, 2));

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-install-context",
      "--agent-name", "contextagent",
      "--profile-name", "contextagent",
      "--install-context", installContextPath,
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      interaction_status: string;
      delivery: {
        target: string;
        target_source: string;
      };
    };
    assert.equal(output.interaction_status, "full");
    assert.equal(output.delivery.target, "session-context");
    assert.equal(output.delivery.target_source, "install_context.current_chat_session_id");

    const sendCalls = readSendCalls(tmp).filter((call) => call.to === "session-context");
    assert.equal(sendCalls.length, 4);

    const bindArgs = JSON.parse(fs.readFileSync(path.join(tmp, "bind-args.json"), "utf8")) as string[];
    assert.equal(bindArgs[bindArgs.indexOf("--home-channel") + 1], "session-context");
    assert.equal(bindArgs[bindArgs.indexOf("--home-channel-name") + 1], "当前对话");
  });

  it("marks interaction status as degraded when the final summary cannot be delivered", () => {
    const tmp = makeTempDir("grix-egg-delivery-degraded-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-delivery-degraded",
      "--agent-name", "deliveryagent",
      "--profile-name", "deliveryagent",
      "--status-target", "session-degraded",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        FAKE_SEND_FAIL_MATCH: "验收回复为",
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      interaction_status: string;
      delivery: {
        attempts: Array<{ kind: string; ok: boolean; error: string | null }>;
      };
    };
    assert.equal(output.interaction_status, "degraded");
    assert.deepEqual(
      output.delivery.attempts.map((attempt) => [attempt.kind, attempt.ok]),
      [
        ["running_card", true],
        ["acceptance_card", true],
        ["final_text", false],
        ["final_card", true],
      ],
    );
    assert.match(output.delivery.attempts[2]!.error || "", /simulated send failure/);

    const statePath = path.join(hermesHome, "tmp", "grix-egg-egg-delivery-degraded.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      interaction_status: string;
      delivery: {
        attempts: Array<{ kind: string; ok: boolean }>;
      };
    };
    assert.equal(state.interaction_status, "degraded");
    assert.equal(state.delivery.attempts[2]!.kind, "final_text");
    assert.equal(state.delivery.attempts[2]!.ok, false);
  });

  it("accepts host create payloads wrapped in createdAgent", () => {
    const tmp = makeTempDir("grix-egg-created-agent-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    fs.writeFileSync(
      fakeNode,
      fs.readFileSync(fakeNode, "utf8").replace(
        'out({ data: { agent_id: "agent-target", agent_name: "safeagent", api_endpoint: "wss://target", api_key: "ak_123_SECRET" } });',
        'out({ ok: true, action: "create_grix", createdAgent: { id: "agent-created", agent_name: "createdagent", api_endpoint: "wss://created", api_key: "ak_123_CREATEDSECRET" } });',
      ),
    );
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-created-agent",
      "--agent-name", "createdagent",
      "--profile-name", "createdagent",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--json",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_STATE_DIR: tmp,
        FAKE_ACCEPTANCE_SENDER: "agent-created",
        GRIX_ENDPOINT: "wss://caller",
        GRIX_AGENT_ID: "caller-agent",
        GRIX_API_KEY: "ak_123_CALLER",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const bindInput = fs.readFileSync(path.join(tmp, "bind-input.json"), "utf8");
    assert.match(bindInput, /agent-created/);
    assert.match(bindInput, /ak_123_CREATEDSECRET/);
  });
});

describe("grix-egg gateway startup", () => {
  it("installs a missing service before retrying gateway start", () => {
    const tmp = makeTempDir("grix-egg-gateway-");
    const hermesHome = path.join(tmp, "hermes");
    fs.mkdirSync(path.join(hermesHome, "profiles", "safeagent"), { recursive: true });
    fs.writeFileSync(path.join(hermesHome, "profiles", "safeagent", "config.yaml"), "channels:\n  grix:\n    wsUrl: wss://gateway\n");
    fs.writeFileSync(path.join(hermesHome, "profiles", "safeagent", ".env"), "GRIX_ENDPOINT=wss://gateway\nGRIX_AGENT_ID=agent\nGRIX_API_KEY=ak_123_SECRET\n");
    const fakeHermes = writeExecutable(path.join(tmp, "fake-hermes.js"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const stateDir = process.env.FAKE_STATE_DIR;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(stateDir, "hermes.log"), args.join(" ") + "\\n");
const gatewayIndex = args.indexOf("gateway");
const sub = gatewayIndex >= 0 ? args[gatewayIndex + 1] : "";
const installed = path.join(stateDir, "installed");
const started = path.join(stateDir, "started");
if (sub === "status") {
  if (fs.existsSync(started)) process.stdout.write("running");
  else if (fs.existsSync(installed)) process.stdout.write("installed but not running");
  else process.stdout.write("not installed");
} else if (sub === "start") {
  if (!fs.existsSync(installed)) {
    process.stderr.write("service not installed");
    process.exit(1);
  }
  fs.writeFileSync(started, "1");
  process.stdout.write("started");
} else if (sub === "install") {
  fs.writeFileSync(installed, "1");
  process.stdout.write("installed");
} else if (sub === "run") {
  fs.writeFileSync(started, "1");
  process.stdout.write("running foreground");
} else {
  process.stderr.write("unexpected hermes args: " + args.join(" "));
  process.exit(9);
}
`);

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "start_gateway.js"),
      "--profile-name", "safeagent",
      "--hermes-home", hermesHome,
      "--hermes", fakeHermes,
      "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, FAKE_STATE_DIR: tmp },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).start_mode, "service_install_start");
    assert.match(fs.readFileSync(path.join(tmp, "hermes.log"), "utf8"), /gateway install/);
  });
  it("treats launchd-loaded gateway status as running", () => {
    const tmp = makeTempDir("grix-egg-gateway-launchd-");
    const hermesHome = path.join(tmp, "hermes");
    fs.mkdirSync(path.join(hermesHome, "profiles", "safeagent"), { recursive: true });
    fs.writeFileSync(path.join(hermesHome, "profiles", "safeagent", "config.yaml"), "channels:\n  grix:\n    wsUrl: wss://gateway\n");
    fs.writeFileSync(path.join(hermesHome, "profiles", "safeagent", ".env"), "GRIX_ENDPOINT=wss://gateway\nGRIX_AGENT_ID=agent\nGRIX_API_KEY=ak_123_SECRET\n");
    const fakeHermes = writeExecutable(path.join(tmp, "fake-hermes.js"), `#!/usr/bin/env node
const args = process.argv.slice(2);
const gatewayIndex = args.indexOf("gateway");
const sub = gatewayIndex >= 0 ? args[gatewayIndex + 1] : "";
if (sub === "status") {
  process.stdout.write("launchd service loaded plist=/tmp/fake.plist pid=1234");
} else {
  process.stderr.write("unexpected hermes args: " + args.join(" "));
  process.exit(9);
}
`);

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "start_gateway.js"),
      "--profile-name", "safeagent",
      "--hermes-home", hermesHome,
      "--hermes", fakeHermes,
      "--json",
    ], {
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { already_running: boolean; start_mode: string };
    assert.equal(output.already_running, true);
    assert.equal(output.start_mode, "already_running");
  });

  it("fails when gateway output says messaging platforms were not loaded", () => {
    const tmp = makeTempDir("grix-egg-gateway-health-");
    const hermesHome = path.join(tmp, "hermes");
    fs.mkdirSync(path.join(hermesHome, "profiles", "safeagent"), { recursive: true });
    fs.writeFileSync(path.join(hermesHome, "profiles", "safeagent", "config.yaml"), "channels:\n  grix:\n    wsUrl: wss://gateway\n");
    fs.writeFileSync(path.join(hermesHome, "profiles", "safeagent", ".env"), "GRIX_ENDPOINT=wss://gateway\nGRIX_AGENT_ID=agent\nGRIX_API_KEY=ak_123_SECRET\n");
    const fakeHermes = writeExecutable(path.join(tmp, "fake-hermes.js"), `#!/usr/bin/env node
const args = process.argv.slice(2);
const gatewayIndex = args.indexOf("gateway");
const sub = gatewayIndex >= 0 ? args[gatewayIndex + 1] : "";
if (sub === "status") {
  process.stdout.write("running\\nNo messaging platforms enabled");
} else {
  process.stdout.write("ok");
}
`);

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "start_gateway.js"),
      "--profile-name", "safeagent",
      "--hermes-home", hermesHome,
      "--hermes", fakeHermes,
      "--json",
    ], {
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /did not load the grix messaging platform/);
  });
});

describe("grix-egg bind_local", () => {
  it("accepts the new shared skill-wrapper bundle layout", () => {
    const tmp = makeTempDir("grix-bind-wrapper-");
    const hermesHome = path.join(tmp, "hermes");
    const installDir = path.join(tmp, "bundle");
    for (const filePath of [
      "bin/grix-hermes.js",
      "lib/manifest.js",
      "shared/cli/skill-wrapper.js",
      "grix-admin/SKILL.md",
      "grix-egg/SKILL.md",
    ]) {
      const absolute = path.join(installDir, filePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, "");
    }
    const fakeHermes = writeExecutable(path.join(tmp, "fake-hermes.js"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
if (args[0] === "profile" && args[1] === "create") {
  fs.mkdirSync(path.join(process.env.HERMES_HOME, "profiles", args[2]), { recursive: true });
  process.stdout.write("created");
} else {
  process.stderr.write("unexpected hermes args: " + args.join(" "));
  process.exit(9);
}
`);

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bind_local.js"),
      "--agent-name", "wrapperagent",
      "--agent-id", "agent-wrapper",
      "--api-endpoint", "wss://wrapper",
      "--api-key", "ak_123_WRAPPERSECRET",
      "--profile-name", "wrapperagent",
      "--install-dir", installDir,
      "--hermes", fakeHermes,
      "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, HERMES_HOME: hermesHome },
    });

    assert.equal(result.status, 0, result.stderr);
    const envPath = path.join(hermesHome, "profiles", "wrapperagent", ".env");
    assert.equal(fs.existsSync(envPath), true);
  });

  it("writes profile env files privately and masks JSON output", () => {
    const tmp = makeTempDir("grix-bind-");
    const hermesHome = path.join(tmp, "hermes");
    const installDir = path.join(tmp, "bundle");
    for (const filePath of [
      "bin/grix-hermes.js",
      "lib/manifest.js",
      "shared/cli/grix-hermes.js",
      "grix-admin/SKILL.md",
      "grix-egg/SKILL.md",
    ]) {
      const absolute = path.join(installDir, filePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, "");
    }
    const fakeHermes = writeExecutable(path.join(tmp, "fake-hermes.js"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
if (args[0] === "profile" && args[1] === "create") {
  fs.mkdirSync(path.join(process.env.HERMES_HOME, "profiles", args[2]), { recursive: true });
  process.stdout.write("created");
} else {
  process.stderr.write("unexpected hermes args: " + args.join(" "));
  process.exit(9);
}
`);

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bind_local.js"),
      "--agent-name", "secureagent",
      "--agent-id", "agent-secure",
      "--api-endpoint", "wss://secure",
      "--api-key", "ak_123_BINDSECRET",
      "--profile-name", "secureagent",
      "--install-dir", installDir,
      "--hermes", fakeHermes,
      "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, HERMES_HOME: hermesHome },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes("ak_123_BINDSECRET"));
    const envPath = path.join(hermesHome, "profiles", "secureagent", ".env");
    assert.equal(modeOf(envPath), 0o600);
    assert.match(fs.readFileSync(envPath, "utf8"), /GRIX_API_KEY=ak_123_BINDSECRET/);
    assert.match(result.stdout, /"GRIX_API_KEY":\s*"ak_\*\*\*"/);
  });

  it("inherits source model config into the bound profile when inherit-keys is enabled", () => {
    const tmp = makeTempDir("grix-bind-model-");
    const hermesHome = path.join(tmp, "hermes");
    const installDir = path.join(tmp, "bundle");
    for (const filePath of [
      "bin/grix-hermes.js",
      "lib/manifest.js",
      "shared/cli/grix-hermes.js",
      "grix-admin/SKILL.md",
      "grix-egg/SKILL.md",
    ]) {
      const absolute = path.join(installDir, filePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, "");
    }
    fs.mkdirSync(hermesHome, { recursive: true });
    fs.writeFileSync(
      path.join(hermesHome, "config.yaml"),
      [
        "model:",
        "  default: gpt-5.4",
        "  provider: custom:selfopenai",
        "  base_url: http://127.0.0.1:18787/v1",
        "providers:",
        "  selfopenai:",
        "    api: http://127.0.0.1:18787/v1",
        "    key_env: SELFOPENAI_API_KEY",
        "    default_model: gpt-5.4",
        "fallback_providers:",
        "  - provider: custom",
        "    model: deepseek-v4-flash",
        "custom_providers:",
        "  - name: deepseek-openai",
        "    model: deepseek-v4-flash",
        "smart_model_routing:",
        "  summary_model: google/gemini-3-flash-preview",
        "auxiliary:",
        "  cheap_model:",
        "    provider: auto",
        "    model: ''",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(hermesHome, ".env"),
      [
        "SELFOPENAI_API_KEY=secret",
        "DEEPSEEK_API_KEY=deepseek-secret",
        "",
      ].join("\n"),
    );
    const fakeHermes = writeExecutable(path.join(tmp, "fake-hermes.js"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
if (args[0] === "profile" && args[1] === "create") {
  fs.mkdirSync(path.join(process.env.HERMES_HOME, "profiles", args[2]), { recursive: true });
  process.stdout.write("created");
} else {
  process.stderr.write("unexpected hermes args: " + args.join(" "));
  process.exit(9);
}
`);

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bind_local.js"),
      "--agent-name", "modelagent",
      "--agent-id", "agent-model",
      "--api-endpoint", "wss://model-endpoint",
      "--api-key", "ak_123_MODELSECRET",
      "--profile-name", "modelagent",
      "--install-dir", installDir,
      "--hermes", fakeHermes,
      "--inherit-keys", "global",
      "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, HERMES_HOME: hermesHome },
    });

    assert.equal(result.status, 0, result.stderr);
    const profileDir = path.join(hermesHome, "profiles", "modelagent");
    const configText = fs.readFileSync(path.join(profileDir, "config.yaml"), "utf8");
    const envText = fs.readFileSync(path.join(profileDir, ".env"), "utf8");
    assert.match(configText, /provider: custom:selfopenai/);
    assert.match(configText, /providers:\n  selfopenai:/);
    assert.match(configText, /fallback_providers:/);
    assert.match(configText, /custom_providers:/);
    assert.match(configText, /smart_model_routing:/);
    assert.match(configText, /auxiliary:/);
    assert.match(configText, /channels:\n  grix:\n    wsUrl: wss:\/\/model-endpoint/);
    assert.match(envText, /SELFOPENAI_API_KEY=secret/);
    assert.match(envText, /DEEPSEEK_API_KEY=deepseek-secret/);
  });

  it("creates blank persona files and does not clone the source profile by default", () => {
    const tmp = makeTempDir("grix-bind-blank-");
    const hermesHome = path.join(tmp, "hermes");
    const installDir = path.join(tmp, "bundle");
    for (const filePath of [
      "bin/grix-hermes.js",
      "lib/manifest.js",
      "shared/cli/grix-hermes.js",
      "grix-admin/SKILL.md",
      "grix-egg/SKILL.md",
    ]) {
      const absolute = path.join(installDir, filePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, "");
    }
    const fakeHermes = writeExecutable(path.join(tmp, "fake-hermes.js"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const stateDir = process.env.FAKE_STATE_DIR;
fs.writeFileSync(path.join(stateDir, "hermes-args.json"), JSON.stringify(args));
if (args[0] === "profile" && args[1] === "create") {
  const profileDir = path.join(process.env.HERMES_HOME, "profiles", args[2]);
  fs.mkdirSync(path.join(profileDir, "memories"), { recursive: true });
  fs.writeFileSync(path.join(profileDir, "SOUL.md"), "legacy soul\\n");
  fs.writeFileSync(path.join(profileDir, "memories", "USER.md"), "legacy user\\n");
  fs.writeFileSync(path.join(profileDir, "memories", "MEMORY.md"), "legacy memory\\n");
  process.stdout.write("created");
} else {
  process.stderr.write("unexpected hermes args: " + args.join(" "));
  process.exit(9);
}
`);

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bind_local.js"),
      "--agent-name", "blankagent",
      "--agent-id", "agent-blank",
      "--api-endpoint", "wss://blank",
      "--api-key", "ak_123_BLANKSECRET",
      "--profile-name", "blankagent",
      "--install-dir", installDir,
      "--hermes", fakeHermes,
      "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, HERMES_HOME: hermesHome, FAKE_STATE_DIR: tmp },
    });

    assert.equal(result.status, 0, result.stderr);
    const hermesArgs = JSON.parse(fs.readFileSync(path.join(tmp, "hermes-args.json"), "utf8")) as string[];
    assert.deepEqual(hermesArgs, ["profile", "create", "blankagent"]);
    const profileDir = path.join(hermesHome, "profiles", "blankagent");
    assert.equal(fs.readFileSync(path.join(profileDir, "SOUL.md"), "utf8"), "");
    assert.equal(fs.readFileSync(path.join(profileDir, "memories", "USER.md"), "utf8"), "");
    assert.equal(fs.readFileSync(path.join(profileDir, "memories", "MEMORY.md"), "utf8"), "");
  });

  it("accepts a source checkout install dir and writes channel config plus allow-all-users", () => {
    const tmp = makeTempDir("grix-bind-source-");
    const hermesHome = path.join(tmp, "hermes");
    const installDir = path.join(tmp, "repo");
    for (const filePath of [
      "bin/grix-hermes.js",
      "lib/manifest.js",
      "shared/cli/grix-hermes.js",
      "grix-admin/SKILL.md",
      "grix-egg/SKILL.md",
      ".git/HEAD",
    ]) {
      const absolute = path.join(installDir, filePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, filePath === ".git/HEAD" ? "ref: refs/heads/main\n" : "");
    }
    const fakeHermes = writeExecutable(path.join(tmp, "fake-hermes.js"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
if (args[0] === "profile" && args[1] === "create") {
  fs.mkdirSync(path.join(process.env.HERMES_HOME, "profiles", args[2]), { recursive: true });
  process.stdout.write("created");
} else {
  process.stderr.write("unexpected hermes args: " + args.join(" "));
  process.exit(9);
}
`);

    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bind_local.js"),
      "--agent-name", "sourceagent",
      "--agent-id", "agent-source",
      "--api-endpoint", "wss://source-endpoint",
      "--api-key", "ak_123_SOURCESECRET",
      "--profile-name", "sourceagent",
      "--install-dir", installDir,
      "--allow-all-users", "true",
      "--hermes", fakeHermes,
      "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, HERMES_HOME: hermesHome },
    });

    assert.equal(result.status, 0, result.stderr);
    const configText = fs.readFileSync(path.join(hermesHome, "profiles", "sourceagent", "config.yaml"), "utf8");
    assert.match(configText, /channels:\n  grix:\n    wsUrl: wss:\/\/source-endpoint/);
    const envText = fs.readFileSync(path.join(hermesHome, "profiles", "sourceagent", ".env"), "utf8");
    assert.match(envText, /GRIX_ALLOW_ALL_USERS=true/);
  });
});
