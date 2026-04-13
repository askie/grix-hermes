import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS, installEntries, manifestData, runtimeDependencyEntries } from "../lib/manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("manifest exposes 8 skills", () => {
  const dependencyEntries = runtimeDependencyEntries();
  assert.equal(SKILLS.length, 8);
  assert.ok(installEntries().includes("bin"));
  assert.ok(installEntries().includes("lib"));
  assert.ok(installEntries().includes("shared"));
  assert.ok(installEntries().includes("package.json"));
  assert.ok(dependencyEntries.some((entry) => entry.dest === path.join("node_modules", "yaml")));
  assert.ok(dependencyEntries.some((entry) => entry.dest === path.join("node_modules", "ws")));
  assert.ok(installEntries().includes("grix-query"));
});

test("manifest data shape is stable", () => {
  const manifest = manifestData();
  assert.equal(manifest.name, "grix-hermes");
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.skills.length, 8);
  assert.ok(typeof manifest.install_dir === "string" && manifest.install_dir.length > 0);
});

test("package.json exposes a publish-safe CLI bin", () => {
  assert.equal(packageJson.bin["grix-hermes"], "bin/grix-hermes.mjs");
});
