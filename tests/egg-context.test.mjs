import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("grix-egg validate_install_context reports missing fields", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "grix-egg/scripts/validate_install_context.mjs")],
    {
      input: JSON.stringify({ install: { route: "openclaw_create_new" } }),
      encoding: "utf8"
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "hermes_create_new");
  assert.deepEqual(payload.missing, ["install_id", "main_agent"]);
});
