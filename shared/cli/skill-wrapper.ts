import { AibotWsClient } from "./aibot-client.js";
import { resolveRuntimeConfig } from "./config.js";
import {
  runAdmin,
  runGroup,
  rotateAgentKey,
  runQuery,
  runSend,
  runUnsend,
  type CommonActionOptions,
} from "./actions.js";

type CliKind = "admin" | "group" | "key_rotate" | "query" | "send" | "unsend";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function toCamelCase(flagName: string): string {
  return cleanText(flagName)
    .split("-")
    .filter(Boolean)
    .map((part, index) => (
      index === 0 ? part : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
    ))
    .join("");
}

function parseArgs(argv: string[]): CommonActionOptions {
  const options: Record<string, unknown> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (!token.startsWith("--")) continue;
    const key = toCamelCase(token.slice(2));
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options as CommonActionOptions;
}

async function dispatch(kind: CliKind, options: CommonActionOptions): Promise<Record<string, unknown>> {
  const runtime = resolveRuntimeConfig();
  const client = new AibotWsClient(runtime.connection);
  await client.connect();
  try {
    if (kind === "admin") return await runAdmin(client, options);
    if (kind === "group") return await runGroup(client, options);
    if (kind === "key_rotate") return await rotateAgentKey(client, options);
    if (kind === "query") return await runQuery(client, options);
    if (kind === "send") return await runSend(client, options);
    return await runUnsend(client, options);
  } finally {
    await client.disconnect();
  }
}

export async function runSharedCliAction(kind: CliKind, argv = process.argv.slice(2)): Promise<void> {
  let options: CommonActionOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
    return;
  }

  try {
    const result = await dispatch(kind, options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
