import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatWsCredentialDiagnostics,
  getWsCredentialDiagnostics,
  hasWsCredentials,
  resolveRuntimeConfig,
} from "../shared/cli/config.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withPatchedEnv(
  env: Record<string, string | undefined>,
  run: () => void,
): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("shared cli config", () => {
  it("falls back to a matching profile env when the Hermes root env is incomplete", () => {
    const hermesHome = makeTempDir("grix-config-profile-");
    const profileDir = path.join(hermesHome, "profiles", "safeagent");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(hermesHome, ".env"), "GRIX_ENDPOINT=wss://root-only\n");
    fs.writeFileSync(
      path.join(profileDir, ".env"),
      [
        "GRIX_ENDPOINT=wss://profile-endpoint",
        "GRIX_AGENT_ID=profile-agent",
        "GRIX_API_KEY=ak_123_PROFILE",
      ].join("\n"),
    );

    withPatchedEnv({
      GRIX_ENDPOINT: undefined,
      GRIX_AGENT_ID: undefined,
      GRIX_API_KEY: undefined,
      HERMES_PROFILE: undefined,
      HERMES_PROFILE_NAME: undefined,
      PROFILE_NAME: undefined,
    }, () => {
      const diagnostics = getWsCredentialDiagnostics({
        hermesHome,
        profileName: "safeagent",
      });
      assert.equal(hasWsCredentials({ hermesHome, profileName: "safeagent" }), true);
      assert.equal(diagnostics.selectedSource, "Hermes profile .env (safeagent)");
      assert.equal(diagnostics.selectedProfileName, "safeagent");

      const runtime = resolveRuntimeConfig({ hermesHome, profileName: "safeagent" });
      assert.equal(runtime.connection.endpoint, "wss://profile-endpoint");
      assert.equal(runtime.connection.agentId, "profile-agent");
      assert.equal(runtime.connection.apiKey, "ak_123_PROFILE");
    });
  });

  it("reports the checked locations when WS credentials are missing", () => {
    const hermesHome = makeTempDir("grix-config-missing-");
    fs.writeFileSync(path.join(hermesHome, ".env"), "GRIX_ENDPOINT=wss://root-only\n");

    withPatchedEnv({
      GRIX_ENDPOINT: undefined,
      GRIX_AGENT_ID: undefined,
      GRIX_API_KEY: undefined,
      HERMES_PROFILE: undefined,
      HERMES_PROFILE_NAME: undefined,
      PROFILE_NAME: undefined,
    }, () => {
      const diagnostics = getWsCredentialDiagnostics({ hermesHome });
      const summary = formatWsCredentialDiagnostics(diagnostics);
      assert.equal(hasWsCredentials({ hermesHome }), false);
      assert.match(summary, /WS credentials not found/);
      assert.match(summary, /Hermes root \.env/);
      assert.match(summary, /missing=GRIX_AGENT_ID,GRIX_API_KEY/);
    });
  });
});
