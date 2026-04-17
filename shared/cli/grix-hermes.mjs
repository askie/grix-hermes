#!/usr/bin/env node

import { AibotWsClient } from "./aibot-client.mjs";
import { runAdmin, runGroup, runQuery, runSend, runUnsend } from "./actions.mjs";
import { resolveRuntimeConfig } from "./config.mjs";

function printHelp() {
  console.log(`grix-hermes ws cli

Usage:
  node shared/cli/grix-hermes.mjs send --to <session-or-route> --message "..."
  node shared/cli/grix-hermes.mjs query --action session_search --keyword xxx
  node shared/cli/grix-hermes.mjs group --action create --name dev --member-ids 1001,1002 --member-types 1,2
  node shared/cli/grix-hermes.mjs admin --action create_grix --agent-name my-agent
  node shared/cli/grix-hermes.mjs unsend --message-id 2033371385615093760 --session-id <session>
`);
}

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

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  if (!command || command === "help" || command === "--help" || command === "-h" || flags.help) {
    printHelp();
    return;
  }

  const runtime = resolveRuntimeConfig(flags);
  const options = {
    ...flags,
    accountId: flags.accountId || runtime.connection.accountId
  };

  const client = new AibotWsClient(runtime.connection);
  await client.connect();
  try {
    let result;
    if (command === "query") {
      result = await runQuery(client, options);
    } else if (command === "send") {
      result = await runSend(client, options);
    } else if (command === "group") {
      result = await runGroup(client, options);
    } else if (command === "admin") {
      result = await runAdmin(client, options);
    } else if (command === "unsend") {
      result = await runUnsend(client, options);
    } else {
      throw new Error(`Unsupported command: ${command}`);
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
