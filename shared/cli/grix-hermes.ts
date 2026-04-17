#!/usr/bin/env node
import { AibotWsClient } from "./aibot-client.js";
import { runAdmin, runGroup, runQuery, runSend, runUnsend } from "./actions.js";
import type { CommonActionOptions } from "./actions.js";
import { resolveRuntimeConfig, type RuntimeOverrides } from "./config.js";

function printHelp(): void {
  process.stdout.write(`grix-hermes ws cli

Usage:
  node shared/cli/grix-hermes.js send --to <session-or-route> --message "..."
  node shared/cli/grix-hermes.js query --action session_search --keyword xxx
  node shared/cli/grix-hermes.js group --action create --name dev --member-ids 1001,1002 --member-types 1,2
  node shared/cli/grix-hermes.js admin --action create_grix --agent-name my-agent
  node shared/cli/grix-hermes.js unsend --message-id 2033371385615093760 --session-id <session>
`);
}

function toCamelFlag(key: string): string {
  return key.replace(/-([a-z])/g, (_match, ch: string) => ch.toUpperCase());
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
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

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  if (!command || command === "help" || command === "--help" || command === "-h" || flags.help) {
    printHelp();
    return;
  }

  const runtime = resolveRuntimeConfig(flags as RuntimeOverrides);
  const accountId =
    (typeof flags.accountId === "string" && flags.accountId) || runtime.connection.accountId;
  const options = { ...(flags as unknown as CommonActionOptions), accountId };

  const client = new AibotWsClient(runtime.connection);
  await client.connect();
  try {
    let result: Record<string, unknown>;
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
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await client.disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  process.exit(1);
});
