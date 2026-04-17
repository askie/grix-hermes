import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

test("grix-hermes install writes a runnable bundle layout", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-install-"));
  const destDir = path.join(tempDir, "bundle");

  try {
    const installResult = spawnSync(
      process.execPath,
      [path.join(root, "bin/grix-hermes.mjs"), "install", "--dest", destDir],
      { encoding: "utf8" }
    );
    assert.equal(installResult.status, 0, installResult.stderr);
    assert.equal(installResult.stdout.trim(), destDir);
    assert.equal(fs.existsSync(path.join(destDir, "bin/grix-hermes.mjs")), true);
    assert.equal(fs.existsSync(path.join(destDir, "lib/manifest.mjs")), true);
    assert.equal(fs.existsSync(path.join(destDir, "shared/cli/grix-hermes.mjs")), true);
    assert.equal(fs.existsSync(path.join(destDir, "grix-admin/SKILL.md")), true);
    assert.equal(fs.existsSync(path.join(destDir, "package.json")), true);
    assert.equal(fs.existsSync(path.join(destDir, "node_modules/yaml/package.json")), true);
    assert.equal(fs.existsSync(path.join(destDir, "node_modules/ws/package.json")), true);

    const manifestResult = spawnSync(
      process.execPath,
      [path.join(destDir, "bin/grix-hermes.mjs"), "manifest"],
      { encoding: "utf8" }
    );
    assert.equal(manifestResult.status, 0, manifestResult.stderr);
    const manifest = JSON.parse(manifestResult.stdout);
    assert.equal(manifest.name, "grix-hermes");
    assert.equal(manifest.skills.length, 8);

    const configPath = path.join(tempDir, "config.yaml");
    fs.writeFileSync(configPath, "skills:\n  external_dirs: []\n", "utf8");
    const patchResult = spawnSync(
      process.execPath,
      [
        path.join(destDir, "grix-admin/scripts/patch_profile_config.mjs"),
        "--config",
        configPath,
        "--external-dir",
        destDir,
        "--management-policy",
        "restricted",
        "--json"
      ],
      { encoding: "utf8" }
    );
    assert.equal(patchResult.status, 0, patchResult.stderr);
    const patchPayload = JSON.parse(patchResult.stdout);
    assert.equal(patchPayload.external_dirs.includes(destDir), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("published tarball unpacks into a runnable bundle", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-readme-"));
  const installRoot = path.join(tempDir, "npm-prefix");
  const bundleDir = path.join(tempDir, "bundle");
  const npmCache = path.join(tempDir, "npm-cache");
  const packedTarballs = [];
    const packResult = spawnSync(
      "npm",
      ["pack", "--json", "--ignore-scripts"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_cache: npmCache
        }
      }
    );

  try {
    assert.equal(packResult.status, 0, packResult.stderr);
    const packPayload = JSON.parse(packResult.stdout);
    const tarballName = packPayload[0]?.filename;
    assert.ok(tarballName);
    const tarballPath = path.join(root, tarballName);
    packedTarballs.push(tarballPath);

    const packageRoot = path.join(installRoot, "node_modules", "@dhf-hermes", "grix");
    fs.mkdirSync(packageRoot, { recursive: true });

    const unpackResult = spawnSync(
      "tar",
      ["-xzf", tarballPath, "-C", packageRoot, "--strip-components", "1"],
      { encoding: "utf8" }
    );
    assert.equal(unpackResult.status, 0, unpackResult.stderr);

    fs.cpSync(path.join(root, "node_modules"), path.join(packageRoot, "node_modules"), { recursive: true });
    const cliPath = path.join(packageRoot, "bin", "grix-hermes.mjs");
    assert.equal(fs.existsSync(cliPath), true);

    const bundleInstallResult = spawnSync(
      process.execPath,
      [cliPath, "install", "--dest", bundleDir],
      { encoding: "utf8" }
    );
    assert.equal(bundleInstallResult.status, 0, bundleInstallResult.stderr);
    assert.equal(bundleInstallResult.stdout.trim(), bundleDir);
    assert.equal(fs.existsSync(path.join(bundleDir, "bin", "grix-hermes.mjs")), true);
    assert.equal(fs.existsSync(path.join(bundleDir, "node_modules", "yaml", "package.json")), true);
  } finally {
    for (const tarballPath of packedTarballs) {
      if (tarballPath) {
        fs.rmSync(tarballPath, { force: true });
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("grix-admin bind_local dry-run builds Hermes bind plan", () => {
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-home-"));
  const resolvedHermesHome = fs.realpathSync(hermesHome);
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
    {
      encoding: "utf8",
      env: {
        ...process.env,
        HERMES_HOME: hermesHome
      }
    }
  );
  try {
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.agent_name, "demo-agent");
    assert.equal(payload.profile_name, "demo-agent");
    assert.equal(payload.management_policy, "restricted");
    assert.equal(payload.install_dir, path.join(resolvedHermesHome, "skills", "grix-hermes"));
    assert.equal(payload.env_updates.GRIX_SKILL_ENDPOINT, "wss://example/ws-skill");
    assert.equal(payload.env_updates.GRIX_SKILL_AGENT_ID, "9002");
    assert.equal(payload.env_updates.GRIX_SKILL_API_KEY, "ak_skill");
    assert.equal(Array.isArray(payload.commands), true);
    assert.ok(payload.commands.length >= 1);
    assert.equal(payload.commands.at(-1).includes(path.join(resolvedHermesHome, "skills", "grix-hermes")), true);
  } finally {
    fs.rmSync(hermesHome, { recursive: true, force: true });
  }
});

test("grix-admin bind_local writes named profiles under HERMES_HOME", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-bind-local-"));
  const hermesHome = path.join(tempDir, "hermes-home");
  const installDir = path.join(tempDir, "bundle");
  const fakeHermesPath = path.join(tempDir, "fake-hermes.mjs");
  const logPath = path.join(tempDir, "fake-hermes.log");
  fs.mkdirSync(hermesHome, { recursive: true });

  fs.writeFileSync(
    fakeHermesPath,
    [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const args = process.argv.slice(2);",
      "const home = process.env.HERMES_HOME;",
      "if (process.env.TEST_HERMES_LOG) fs.appendFileSync(process.env.TEST_HERMES_LOG, JSON.stringify(args) + '\\n');",
      "if (args[0] === 'profile' && args[1] === 'create') {",
      "  const name = args[2];",
      "  const dir = !name || name === 'default' ? home : path.join(home, 'profiles', name);",
      "  fs.mkdirSync(dir, { recursive: true });",
      "  process.stdout.write(`created ${dir}\\n`);",
      "  process.exit(0);",
      "}",
      "console.error(`unsupported fake hermes command: ${args.join(' ')}`);",
      "process.exit(1);",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.chmodSync(fakeHermesPath, 0o755);

  try {
    const installResult = spawnSync(
      process.execPath,
      [path.join(root, "bin/grix-hermes.mjs"), "install", "--dest", installDir],
      { encoding: "utf8" }
    );
    assert.equal(installResult.status, 0, installResult.stderr);

    const result = spawnSync(
      "python3",
      [
        path.join(root, "grix-admin/scripts/bind_local.py"),
        "--agent-name",
        "writer-hermes",
        "--agent-id",
        "9001",
        "--api-endpoint",
        "wss://example/ws",
        "--api-key",
        "ak_test",
        "--profile-name",
        "writer-hermes",
        "--install-dir",
        installDir,
        "--hermes",
        fakeHermesPath,
        "--node",
        process.execPath,
        "--json"
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HERMES_HOME: hermesHome,
          TEST_HERMES_LOG: logPath
        }
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    const profileDir = fs.realpathSync(path.join(hermesHome, "profiles", "writer-hermes"));
    const resolvedInstallDir = fs.realpathSync(installDir);
    assert.equal(payload.profile_dir, profileDir);
    assert.equal(fs.existsSync(path.join(profileDir, ".env")), true);
    assert.equal(fs.existsSync(path.join(profileDir, "config.yaml")), true);
    assert.match(fs.readFileSync(path.join(profileDir, ".env"), "utf8"), /GRIX_AGENT_ID=9001/);
    assert.match(fs.readFileSync(path.join(profileDir, "config.yaml"), "utf8"), new RegExp(resolvedInstallDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(fs.readFileSync(logPath, "utf8"), /"profile","create","writer-hermes","--clone"/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("grix-admin patch_profile_config applies main and restricted policies", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-config-"));
  const configPath = path.join(tempDir, "config.yaml");
  fs.writeFileSync(
    configPath,
    [
      "skills:",
      "  disabled:",
      "    - custom-skill",
      "    - grix-admin",
      "  external_dirs:",
      "    - /old/grix-hermes",
      ""
    ].join("\n"),
    "utf8"
  );

  try {
    const mainResult = spawnSync(
      process.execPath,
      [
        path.join(root, "grix-admin/scripts/patch_profile_config.mjs"),
        "--config",
        configPath,
        "--external-dir",
        root,
        "--management-policy",
        "main",
        "--json"
      ],
      { encoding: "utf8" }
    );
    assert.equal(mainResult.status, 0, mainResult.stderr);
    const mainPayload = JSON.parse(mainResult.stdout);
    assert.deepEqual(mainPayload.external_dirs, [root]);
    assert.deepEqual(mainPayload.disabled_skills, ["custom-skill"]);

    const restrictedResult = spawnSync(
      process.execPath,
      [
        path.join(root, "grix-admin/scripts/patch_profile_config.mjs"),
        "--config",
        configPath,
        "--external-dir",
        root,
        "--management-policy",
        "restricted",
        "--json"
      ],
      { encoding: "utf8" }
    );
    assert.equal(restrictedResult.status, 0, restrictedResult.stderr);
    const restrictedPayload = JSON.parse(restrictedResult.stdout);
    assert.deepEqual(restrictedPayload.disabled_skills, [
      "custom-skill",
      "grix-admin",
      "grix-register",
      "grix-update",
      "grix-egg"
    ]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("grix-update dry-run builds update plan", () => {
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), "grix-hermes-update-home-"));
  const resolvedHermesHome = fs.realpathSync(hermesHome);
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
    {
      encoding: "utf8",
      env: {
        ...process.env,
        HERMES_HOME: hermesHome
      }
    }
  );
  try {
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "check-and-apply");
    assert.equal(payload.install_dir, path.join(resolvedHermesHome, "skills", "grix-hermes"));
    assert.ok(payload.commands.some((entry) => entry.cmd.includes("pull")));
    assert.ok(payload.commands.some((entry) => entry.cmd.includes(path.join(resolvedHermesHome, "skills", "grix-hermes"))));
  } finally {
    fs.rmSync(hermesHome, { recursive: true, force: true });
  }
});

test("grix-admin bind_from_json forwards remote result", () => {
  const payload = JSON.stringify({
    requestedIsMain: true,
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
  assert.equal(parsed.management_policy, "main");
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
        "--is-main",
        "true",
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
    assert.equal(parsed.bind_result.management_policy, "main");
    assert.equal(parsed.bind_result.env_updates.GRIX_SKILL_ENDPOINT, "wss://example/ws-skill");
    assert.equal(parsed.bind_result.env_updates.GRIX_SKILL_AGENT_ID, "9002");
    assert.equal(parsed.bind_result.env_updates.GRIX_SKILL_API_KEY, "ak_skill");
  } finally {
    fs.rmSync(fixturePath, { force: true });
  }
});
