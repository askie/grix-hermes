import fs from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS = [
  {
    name: "grix-admin",
    description: "Remote Grix agent creation/category management plus local Hermes profile binding."
  },
  {
    name: "grix-egg",
    description: "Hermes agent install-flow orchestrator for Grix package delivery, binding, and acceptance."
  },
  {
    name: "grix-group",
    description: "Grix group lifecycle and membership governance over the bundled websocket CLI."
  },
  {
    name: "grix-query",
    description: "Read-only Grix contact, session, and message lookup over the bundled websocket CLI."
  },
  {
    name: "grix-register",
    description: "HTTP-based Grix registration and first-agent bootstrap for Hermes."
  },
  {
    name: "grix-update",
    description: "Hermes skill-bundle update workflow for grix-hermes deployments."
  },
  {
    name: "message-send",
    description: "Hermes-native Grix message sending and conversation-card rules."
  },
  {
    name: "message-unsend",
    description: "Silent Grix unsend workflow over the bundled websocket CLI."
  }
];

const require = createRequire(import.meta.url);

export const SUPPORT_ENTRIES = ["bin", "lib", "shared", "package.json"];

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function packageMetadata() {
  const packageJsonPath = path.join(projectRoot(), "package.json");
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Fall through to the conservative fallback below.
  }
  return {};
}

function packageVersion() {
  const version = packageMetadata().version;
  if (typeof version === "string" && version.trim()) {
    return version.trim();
  }
  return "0.0.0";
}

export function runtimeDependencyEntries() {
  const dependencies = packageMetadata().dependencies;
  if (!dependencies || typeof dependencies !== "object") {
    return [];
  }
  return Object.keys(dependencies).map((name) => {
    const packageJsonPath = require.resolve(`${name}/package.json`);
    return {
      name,
      source: path.dirname(packageJsonPath),
      dest: path.join("node_modules", name),
    };
  });
}

export function defaultInstallDir() {
  const hermesHome = process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(homedir(), ".hermes");
  return path.join(hermesHome, "skills", "grix-hermes");
}

export function installEntries() {
  return [...SKILLS.map((skill) => skill.name), ...SUPPORT_ENTRIES];
}

export function manifestData() {
  return {
    name: "grix-hermes",
    version: packageVersion(),
    install_dir: defaultInstallDir(),
    skills: SKILLS
  };
}
