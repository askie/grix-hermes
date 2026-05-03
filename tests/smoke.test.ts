import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("smoke", () => {
  it("package.json has correct name and bin", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(pkg.name, "@dhf-hermes/grix");
    assert.equal(pkg.bin["grix-hermes"], "bin/grix-hermes.js");
  });

  it("all SKILL.md files exist", () => {
    const skills = [
      "grix-admin",
      "grix-egg",
      "grix-key-rotate",
      "grix-group",
      "grix-query",
      "grix-register",
      "grix-update",
      "message-send",
      "message-unsend",
    ];
    for (const skill of skills) {
      const skillMd = path.join(root, skill, "SKILL.md");
      assert.ok(fs.existsSync(skillMd), `missing ${skill}/SKILL.md`);
    }
  });

  it("compiled shared modules exist", () => {
    const modules = [
      "shared/cli/card-links.js",
    ];
    for (const mod of modules) {
      assert.ok(fs.existsSync(path.join(root, mod)), `missing ${mod}`);
    }
  });
});
