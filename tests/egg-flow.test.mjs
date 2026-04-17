import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function writeFakeHermes(filePath) {
  writeExecutable(
    filePath,
    [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const rawArgs = process.argv.slice(2);",
      "let args = rawArgs;",
      "let profileName = '';",
      "if (args[0] === '--profile') {",
      "  profileName = args[1] || '';",
      "  args = args.slice(2);",
      "}",
      "const home = process.env.HERMES_HOME;",
      "const statePath = process.env.FAKE_HERMES_STATE;",
      "const logPath = process.env.FAKE_HERMES_LOG;",
      "if (logPath) fs.appendFileSync(logPath, JSON.stringify({ profileName, args }) + '\\n');",
      "const readState = () => {",
      "  if (!statePath || !fs.existsSync(statePath)) return { running: false };",
      "  return JSON.parse(fs.readFileSync(statePath, 'utf8'));",
      "};",
      "const writeState = (next) => { if (statePath) fs.writeFileSync(statePath, JSON.stringify(next), 'utf8'); };",
      "if (args[0] === 'profile' && args[1] === 'create') {",
      "  const name = args[2];",
      "  const dir = !name || name === 'default' ? home : path.join(home, 'profiles', name);",
      "  fs.mkdirSync(dir, { recursive: true });",
      "  process.stdout.write(`created ${dir}\\n`);",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'gateway' && args[1] === 'start') {",
      "  if (process.env.FAKE_HERMES_BROKEN_START === '1') {",
      "    process.stdout.write('start attempted but gateway still inactive\\n');",
      "    process.exit(0);",
      "  }",
      "  writeState({ running: true });",
      "  process.stdout.write('Gateway started\\n');",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'gateway' && args[1] === 'status') {",
      "  const state = readState();",
      "  if (state.running) {",
      "    process.stdout.write('Gateway service is installed and running.\\n');",
      "  } else {",
      "    process.stdout.write('✗ Gateway is not running\\n');",
      "  }",
      "  process.exit(0);",
      "}",
      "console.error(`unsupported fake hermes command: ${rawArgs.join(' ')}`);",
      "process.exit(1);",
      ""
    ].join("\n")
  );
}

function writeJsonScript(filePath, bodyLines) {
  writeExecutable(
    filePath,
    [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "const args = process.argv.slice(2);",
      "if (process.env.TEST_SCRIPT_LOG) fs.appendFileSync(process.env.TEST_SCRIPT_LOG, JSON.stringify({ script: process.argv[1], args }) + '\\n');",
      ...bodyLines,
      ""
    ].join("\n")
  );
}

test("grix-egg start_gateway starts and verifies a profile gateway", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-start-"));
  const hermesHome = path.join(tempDir, "hermes-home");
  const profileDir = path.join(hermesHome, "profiles", "writer");
  const fakeHermes = path.join(tempDir, "fake-hermes.mjs");
  const statePath = path.join(tempDir, "state.json");
  const logPath = path.join(tempDir, "hermes.log");
  fs.mkdirSync(profileDir, { recursive: true });
  writeFakeHermes(fakeHermes);

  try {
    const result = spawnSync(
      "python3",
      [
        path.join(root, "grix-egg/scripts/start_gateway.py"),
        "--profile-name",
        "writer",
        "--hermes-home",
        hermesHome,
        "--hermes",
        fakeHermes,
        "--json"
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HERMES_HOME: hermesHome,
          FAKE_HERMES_STATE: statePath,
          FAKE_HERMES_LOG: logPath
        }
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    const resolvedProfileDir = fs.realpathSync(profileDir);
    assert.equal(payload.ok, true);
    assert.equal(payload.already_running, false);
    assert.equal(payload.profile_dir, resolvedProfileDir);
    assert.match(fs.readFileSync(logPath, "utf8"), /"gateway","start"/);
    assert.match(fs.readFileSync(logPath, "utf8"), /"gateway","status"/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("grix-egg start_gateway fails when status stays inactive", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-start-fail-"));
  const hermesHome = path.join(tempDir, "hermes-home");
  const profileDir = path.join(hermesHome, "profiles", "writer");
  const fakeHermes = path.join(tempDir, "fake-hermes.mjs");
  fs.mkdirSync(profileDir, { recursive: true });
  writeFakeHermes(fakeHermes);

  try {
    const result = spawnSync(
      "python3",
      [
        path.join(root, "grix-egg/scripts/start_gateway.py"),
        "--profile-name",
        "writer",
        "--hermes-home",
        hermesHome,
        "--hermes",
        fakeHermes,
        "--json"
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HERMES_HOME: hermesHome,
          FAKE_HERMES_BROKEN_START: "1"
        }
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /did not report a running state/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("grix-egg install_flow completes bind, SOUL write, startup, and acceptance", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-install-flow-"));
  const hermesHome = path.join(tempDir, "hermes-home");
  const fakeHermes = path.join(tempDir, "fake-hermes.mjs");
  const hermesState = path.join(tempDir, "hermes-state.json");
  const hermesLog = path.join(tempDir, "hermes.log");
  const helperLog = path.join(tempDir, "helpers.log");
  const fakeGroup = path.join(tempDir, "fake-group.mjs");
  const fakeSend = path.join(tempDir, "fake-send.mjs");
  const fakeQuery = path.join(tempDir, "fake-query.mjs");
  const payloadPath = path.join(tempDir, "install.json");

  fs.mkdirSync(hermesHome, { recursive: true });
  writeFakeHermes(fakeHermes);
  writeJsonScript(fakeGroup, [
    "console.log(JSON.stringify({ ok: true, data: { session_id: 'group-session-1' } }));"
  ]);
  writeJsonScript(fakeSend, [
    "console.log(JSON.stringify({ ok: true, ack: { msg_id: '1888' } }));"
  ]);
  writeJsonScript(fakeQuery, [
    "console.log(JSON.stringify({ ok: true, data: { messages: [{ content: 'writer-hermes identity verified' }] } }));"
  ]);

  fs.writeFileSync(
    payloadPath,
    JSON.stringify(
      {
        install_id: "egg_install_1",
        main_agent: "main-agent",
        install: { route: "hermes_create_new" },
        profile_name: "writer-hermes",
        is_main: true,
        status_target: "install-session",
        remote_agent: {
          agent_name: "writer-hermes",
          agent_id: "9001",
          api_endpoint: "wss://example/ws",
          api_key: "ak_test"
        },
        soul_markdown: "# Writer Hermes\nYou are the writer.",
        acceptance: {
          group_name: "验收测试群",
          member_ids: ["1001", "2001"],
          member_types: ["1", "2"],
          probe_message: "请介绍你自己",
          expected_substring: "writer-hermes",
          history_limit: 5
        }
      },
      null,
      2
    ),
    "utf8"
  );

  try {
    const result = spawnSync(
      "python3",
      [
        path.join(root, "grix-egg/scripts/install_flow.py"),
        "--from-file",
        payloadPath,
        "--hermes-home",
        hermesHome,
        "--hermes",
        fakeHermes,
        "--node",
        process.execPath,
        "--group-script",
        fakeGroup,
        "--send-script",
        fakeSend,
        "--query-script",
        fakeQuery,
        "--json"
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HERMES_HOME: hermesHome,
          FAKE_HERMES_STATE: hermesState,
          FAKE_HERMES_LOG: hermesLog,
          TEST_SCRIPT_LOG: helperLog
        }
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    const profileDir = path.join(hermesHome, "profiles", "writer-hermes");
    const installDir = path.join(hermesHome, "skills", "grix-hermes");
    const resolvedProfileDir = fs.realpathSync(profileDir);
    const resolvedInstallDir = fs.realpathSync(installDir);
    assert.equal(payload.ok, true);
    assert.equal(payload.profile_dir, resolvedProfileDir);
    assert.equal(payload.install_dir, resolvedInstallDir);
    assert.equal(fs.existsSync(path.join(profileDir, ".env")), true);
    assert.equal(fs.existsSync(path.join(profileDir, "config.yaml")), true);
    assert.equal(fs.existsSync(path.join(profileDir, "SOUL.md")), true);
    assert.match(fs.readFileSync(path.join(profileDir, "SOUL.md"), "utf8"), /Writer Hermes/);
    assert.match(fs.readFileSync(path.join(profileDir, ".env"), "utf8"), /GRIX_AGENT_ID=9001/);
    assert.match(fs.readFileSync(path.join(profileDir, "config.yaml"), "utf8"), /grix-hermes/);
    assert.equal(payload.acceptance.session_id, "group-session-1");
    assert.equal(payload.acceptance.verification.verified, true);
    assert.match(fs.readFileSync(helperLog, "utf8"), /fake-group/);
    assert.match(fs.readFileSync(helperLog, "utf8"), /fake-send/);
    assert.match(fs.readFileSync(helperLog, "utf8"), /fake-query/);
    assert.match(fs.readFileSync(hermesLog, "utf8"), /"profile","create","writer-hermes","--clone"/);
    assert.match(fs.readFileSync(hermesLog, "utf8"), /"gateway","start"/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
