import fs from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillDefinition {
  name: string;
  description: string;
}

export const SKILLS: SkillDefinition[] = [
  {
    name: "grix-admin",
    description:
      "Low-level WS admin for remote Grix agents, API keys, categories, assignment, and status.",
  },
  {
    name: "grix-egg",
    description:
      "Hermes agent incubation orchestrator for empty-agent bootstrap, binding, gateway, and acceptance.",
  },
  {
    name: "grix-group",
    description:
      "Grix group lifecycle and membership governance over the bundled websocket CLI.",
  },
  {
    name: "grix-query",
    description:
      "Grix contact, session, and message lookup over the bundled websocket CLI.",
  },
  {
    name: "grix-register",
    description: "Low-level HTTP registration, login, access-token, and API-agent creation.",
  },
  {
    name: "grix-update",
    description: "Hermes skill-bundle update workflow for grix-hermes deployments.",
  },
  {
    name: "message-send",
    description: "Hermes-native Grix message sending and conversation-card rules.",
  },
  {
    name: "message-unsend",
    description: "Silent Grix unsend workflow over the bundled websocket CLI.",
  },
];

const require = createRequire(import.meta.url);

export const SUPPORT_ENTRIES = ["bin", "lib", "shared", "package.json"];

export function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

interface PackageMetadata {
  version?: string;
  dependencies?: Record<string, string>;
}

function packageMetadata(): PackageMetadata {
  const packageJsonPath = path.join(projectRoot(), "package.json");
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as PackageMetadata;
    }
  } catch {
    // fall through to conservative fallback
  }
  return {};
}

function packageVersion(): string {
  const version = packageMetadata().version;
  if (typeof version === "string" && version.trim()) {
    return version.trim();
  }
  return "0.0.0";
}

export interface RuntimeDependencyEntry {
  name: string;
  source: string;
  dest: string;
}

export function runtimeDependencyEntries(): RuntimeDependencyEntry[] {
  const dependencies = packageMetadata().dependencies;
  if (!dependencies || typeof dependencies !== "object") {
    return [];
  }
  return Object.keys(dependencies).map((name) => {
    const packageJsonPath = require.resolve(`${name}/package.json`) as string;
    return {
      name,
      source: path.dirname(packageJsonPath),
      dest: path.join("node_modules", name),
    };
  });
}

export function defaultInstallDir(): string {
  const hermesHome = process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(homedir(), ".hermes");
  return path.join(hermesHome, "skills", "grix-hermes");
}

export function installEntries(): string[] {
  return [...SKILLS.map((skill) => skill.name), ...SUPPORT_ENTRIES];
}

export interface ManifestData {
  name: string;
  version: string;
  install_dir: string;
  skills: SkillDefinition[];
}

export function manifestData(): ManifestData {
  return {
    name: "grix-hermes",
    version: packageVersion(),
    install_dir: defaultInstallDir(),
    skills: SKILLS,
  };
}
