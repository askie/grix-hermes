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

export const SUPPORT_ENTRIES = ["shared"];

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
    version: "0.1.0",
    install_dir: defaultInstallDir(),
    skills: SKILLS
  };
}
