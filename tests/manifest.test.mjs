import test from "node:test";
import assert from "node:assert/strict";
import { SKILLS, installEntries, manifestData } from "../lib/manifest.mjs";

test("manifest exposes 8 skills", () => {
  assert.equal(SKILLS.length, 8);
  assert.ok(installEntries().includes("shared"));
  assert.ok(installEntries().includes("grix-query"));
});

test("manifest data shape is stable", () => {
  const manifest = manifestData();
  assert.equal(manifest.name, "grix-hermes");
  assert.equal(manifest.skills.length, 8);
  assert.ok(typeof manifest.install_dir === "string" && manifest.install_dir.length > 0);
});
