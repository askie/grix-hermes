#!/usr/bin/env node

import { dispatchCardBuilder } from "../../shared/cli/card-links.mjs";

function toCamelFlag(key) {
  return key.replace(/-([a-z])/g, (_match, ch) => ch.toUpperCase());
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = toCamelFlag(token.slice(2));
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { positional, flags };
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const kind = positional[0];
if (!kind || ["help", "--help", "-h"].includes(kind)) {
  console.log(`Usage:
  node scripts/card-link.mjs conversation --session-id <id> --session-type group --title <title>
  node scripts/card-link.mjs user-profile --user-id <id> --nickname <name> [--avatar-url <url>]
  node scripts/card-link.mjs egg-status --install-id <id> --status running --step installing --summary <text>`);
  process.exit(0);
}

console.log(dispatchCardBuilder(kind, flags));
