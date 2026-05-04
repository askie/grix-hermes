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
  out({ profile_name: "safeagent" });
} else if (script.endsWith("create_api_agent_and_bind.js")) {
  save("http-create-args.json", args);
  out({ bind_result: { agent_id: "http-agent", agent_name: "httpagent", profile_name: "httpagent", api_endpoint: "wss://http-target", api_key: "ak_123_HTTPSECRET" } });
} else if (script.endsWith("start_gateway.js")) {
  out({ ok: true, start_mode: "service_start" });
} else if (script.endsWith("group.js")) {
  save("group-args.json", args);
  out({ data: { session_id: "session-accept" } });
} else if (script.endsWith("send.js")) {
  const message = arg("--message");
  if (message === "probe") out({ ok: true, ack: { message_id: "100" } });
  else out({ ok: true, ack: { message_id: "50" } });
} else if (script.endsWith("query.js")) {
  const falseOnly = process.env.FAKE_ACCEPTANCE_MODE === "false-only";
  out({
    data: {
      messages: falseOnly ? [
        { id: "99", sender_id: "agent-target", content: "identity-ok before probe" },
        { id: "101", sender_id: "other-agent", content: "identity-ok wrong sender" }
      ] : [
        { id: "99", sender_id: "agent-target", content: "identity-ok before probe" },
        { id: "101", sender_id: "other-agent", content: "identity-ok wrong sender" },
        { id: "102", sender_id: "agent-target", content: "identity-ok after probe" }
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

describe("grix-egg bootstrap", () => {
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
    assert.equal(output.steps.accept.status, "skipped");
    assert.ok(fs.existsSync(path.join(tmp, "bind-input.json")));
    assert.equal(fs.existsSync(path.join(tmp, "group-args.json")), false);
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
      "--probe-message", "probe",
      "--expected-substring", "identity-ok",
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
    const output = JSON.parse(result.stdout) as { path?: string };
    assert.equal(output.path, "host");
    const statePath = path.join(hermesHome, "tmp", "grix-egg-egg-secure.json");
    const stateText = fs.readFileSync(statePath, "utf8");
    assert.equal(modeOf(statePath), 0o600);
    assert.ok(!stateText.includes("ak_123_SECRET"));
    assert.ok(!stateText.includes("_api_key"));

    const bindInput = fs.readFileSync(path.join(tmp, "bind-input.json"), "utf8");
    assert.ok(bindInput.includes("ak_123_SECRET"));

    const groupArgs = JSON.parse(fs.readFileSync(path.join(tmp, "group-args.json"), "utf8")) as string[];
    assert.equal(groupArgs[groupArgs.indexOf("--member-ids") + 1], "user-1,agent-target");
    assert.equal(groupArgs[groupArgs.indexOf("--member-types") + 1], "1,2");
  });

  it("rejects acceptance matches from old messages or the wrong sender", () => {
    const tmp = makeTempDir("grix-egg-accept-");
    const hermesHome = path.join(tmp, "hermes");
    const fakeNode = writeFakeNode(path.join(tmp, "fake-node.js"));
    const result = spawnSync(process.execPath, [
      path.join(root, "grix-egg", "scripts", "bootstrap.js"),
      "--install-id", "egg-false-accept",
      "--agent-name", "safeagent",
      "--hermes-home", hermesHome,
      "--node", fakeNode,
      "--probe-message", "probe",
      "--expected-substring", "identity-ok",
      "--accept-timeout-seconds", "0.2",
      "--accept-poll-interval-seconds", "0.1",
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
    assert.match(result.stderr, /验收超时/);
  });

  it("fails create_new without a reusable host Grix session instead of requiring HTTP access-token fallback", () => {
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
        GRIX_ENDPOINT: "",
        GRIX_AGENT_ID: "",
        GRIX_API_KEY: "",
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /未检测到可复用的 Grix 宿主会话凭证/);
    assert.equal(fs.existsSync(path.join(tmp, "http-create-args.json")), false);
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
    assert.match(result.stderr, /unsupported cmd for hermes/);
    assert.equal(fs.existsSync(path.join(tmp, "http-create-args.json")), false);
    const statePath = path.join(hermesHome, "tmp", "grix-egg-egg-ws-fallback.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      path: string;
      steps: {
        detect: { result: Record<string, string> };
        create: { status: string; result: Record<string, string> | null };
      };
    };
    assert.equal(state.path, "host");
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
});

describe("grix-egg gateway startup", () => {
  it("installs a missing service before retrying gateway start", () => {
    const tmp = makeTempDir("grix-egg-gateway-");
    const hermesHome = path.join(tmp, "hermes");
    fs.mkdirSync(path.join(hermesHome, "profiles", "safeagent"), { recursive: true });
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
});
