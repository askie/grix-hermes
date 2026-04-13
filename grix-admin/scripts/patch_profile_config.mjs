#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const RESTRICTED_MANAGEMENT_SKILLS = [
  "grix-admin",
  "grix-register",
  "grix-update",
  "grix-egg"
];

function parseArgs(argv) {
  const flags = { externalDirs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--config" && argv[index + 1]) {
      flags.config = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--external-dir" && argv[index + 1]) {
      flags.externalDirs.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--management-policy" && argv[index + 1]) {
      flags.managementPolicy = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (token === "--json") {
      flags.json = true;
      continue;
    }
  }
  return flags;
}

function normalizeExternalDirs(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeSkillList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function looksLikeGrixHermesRoot(candidate) {
  return (
    fs.existsSync(path.join(candidate, "bin", "grix-hermes.mjs"))
    && fs.existsSync(path.join(candidate, "lib", "manifest.mjs"))
    && fs.existsSync(path.join(candidate, "grix-admin", "SKILL.md"))
  );
}

function isManagedGrixHermesPath(candidate) {
  const base = path.basename(candidate);
  return base.startsWith("grix-hermes") || looksLikeGrixHermesRoot(candidate);
}

function applyManagementPolicy(currentDisabledSkills, policy) {
  if (policy === "preserve") {
    return [...currentDisabledSkills];
  }
  const nextDisabledSkills = currentDisabledSkills.filter(
    (skillName) => !RESTRICTED_MANAGEMENT_SKILLS.includes(skillName)
  );
  if (policy === "restricted") {
    for (const skillName of RESTRICTED_MANAGEMENT_SKILLS) {
      if (!nextDisabledSkills.includes(skillName)) {
        nextDisabledSkills.push(skillName);
      }
    }
  }
  return nextDisabledSkills;
}

const flags = parseArgs(process.argv.slice(2));

if (!flags.config) {
  console.error(JSON.stringify({ ok: false, error: "Missing --config." }, null, 2));
  process.exit(1);
}

const configPath = path.resolve(flags.config);
const configDir = path.dirname(configPath);
const requestedExternalDirs = flags.externalDirs
  .map((entry) => path.resolve(entry))
  .filter(Boolean);

let config = {};
if (fs.existsSync(configPath)) {
  const raw = fs.readFileSync(configPath, "utf8");
  if (raw.trim()) {
    const parsed = YAML.parse(raw);
    if (parsed && typeof parsed === "object") {
      config = parsed;
    }
  }
}

if (!config.skills || typeof config.skills !== "object" || Array.isArray(config.skills)) {
  config.skills = {};
}

const managementPolicy = String(flags.managementPolicy || "preserve").trim() || "preserve";
if (!["preserve", "main", "restricted"].includes(managementPolicy)) {
  console.error(JSON.stringify({ ok: false, error: `Unsupported --management-policy: ${managementPolicy}` }, null, 2));
  process.exit(1);
}

const currentExternalDirs = normalizeExternalDirs(config.skills.external_dirs);
const currentDisabledSkills = normalizeSkillList(config.skills.disabled);
const requestedSet = new Set(requestedExternalDirs);
const nextExternalDirs = currentExternalDirs.filter((entry) => {
  const resolved = path.resolve(entry);
  if (!isManagedGrixHermesPath(resolved)) {
    return true;
  }
  return requestedSet.has(resolved);
});
for (const externalDir of requestedExternalDirs) {
  if (!nextExternalDirs.includes(externalDir)) {
    nextExternalDirs.push(externalDir);
  }
}
const nextDisabledSkills = applyManagementPolicy(currentDisabledSkills, managementPolicy);
config.skills.external_dirs = nextExternalDirs;
config.skills.disabled = nextDisabledSkills;

const payload = {
  ok: true,
  dry_run: Boolean(flags.dryRun),
  changed: (
    JSON.stringify(currentExternalDirs) !== JSON.stringify(nextExternalDirs)
    || JSON.stringify(currentDisabledSkills) !== JSON.stringify(nextDisabledSkills)
  ),
  config_path: configPath,
  external_dirs: nextExternalDirs,
  management_policy: managementPolicy,
  disabled_skills: nextDisabledSkills
};

if (!flags.dryRun) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, YAML.stringify(config), "utf8");
}

if (flags.json) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(configPath);
}
