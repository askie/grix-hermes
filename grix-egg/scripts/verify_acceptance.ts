#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { resolveRuntimeConfig } from "../../shared/cli/config.js";
import { AibotWsClient } from "../../shared/cli/aibot-client.js";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

async function getWsClient(hermesHome: string, profileName?: string): Promise<AibotWsClient> {
  const config = resolveRuntimeConfig({ hermesHome, profileName });
  const client = new AibotWsClient(config.connection);
  await client.connect();
  return client;
}

interface Flags {
  sessionId: string;
  probeMessage: string;
  expectedSubstring: string;
  timeoutSeconds: number;
  pollIntervalSeconds: number;
  historyLimit: number;
  node: string;
  hermesHome: string;
  profileName: string;
  json: boolean;
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    sessionId: "",
    probeMessage: "",
    expectedSubstring: "",
    timeoutSeconds: 15,
    pollIntervalSeconds: 1,
    historyLimit: 10,
    node: "node",
    hermesHome: "",
    profileName: "",
    json: false,
  };
  const take = (i: number): [string, number] => {
    const next = argv[i + 1];
    if (next === undefined) throw new Error(`Missing value after ${argv[i]}`);
    return [next, i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === "--session-id") { const [v, j] = take(i); flags.sessionId = v; i = j; continue; }
    if (token === "--probe-message") { const [v, j] = take(i); flags.probeMessage = v; i = j; continue; }
    if (token === "--expected-substring") { const [v, j] = take(i); flags.expectedSubstring = v; i = j; continue; }
    if (token === "--timeout-seconds") { const [v, j] = take(i); flags.timeoutSeconds = Number.parseInt(v, 10); i = j; continue; }
    if (token === "--poll-interval-seconds") { const [v, j] = take(i); flags.pollIntervalSeconds = Number.parseFloat(v); i = j; continue; }
    if (token === "--history-limit") { const [v, j] = take(i); flags.historyLimit = Number.parseInt(v, 10); i = j; continue; }
    if (token === "--node") { const [v, j] = take(i); flags.node = v; i = j; continue; }
    if (token === "--hermes-home") { const [v, j] = take(i); flags.hermesHome = v; i = j; continue; }
    if (token === "--profile-name") { const [v, j] = take(i); flags.profileName = v; i = j; continue; }
    if (token === "--json") { flags.json = true; continue; }
  }
  return flags;
}

async function main(): Promise<number> {
  let flags: Flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }

  try {
    if (!flags.sessionId) throw new Error("--session-id is required");
    if (!flags.probeMessage) throw new Error("--probe-message is required");
    if (!flags.expectedSubstring) throw new Error("--expected-substring is required");

    const hermesHome = cleanText(flags.hermesHome) || cleanText(process.env.HERMES_HOME) || "~/.hermes";
    const expandedHome = hermesHome.startsWith("~")
      ? path.join(os.homedir(), hermesHome.slice(2))
      : path.resolve(hermesHome);
    const profileName = cleanText(flags.profileName) || undefined;

    const sendClient = await getWsClient(expandedHome, profileName);
    let sendPayload: Record<string, unknown>;
    try {
      sendPayload = await sendClient.sendText(flags.sessionId, flags.probeMessage);
    } finally {
      await sendClient.disconnect();
    }

    const expectedLower = flags.expectedSubstring.toLowerCase();
    const deadline = Date.now() + Math.max(flags.timeoutSeconds, 1) * 1000;
    let lastQuery: Record<string, unknown> = {};

    while (Date.now() < deadline) {
      const pollClient = await getWsClient(expandedHome, profileName);
      try {
        const queryResult = await pollClient.agentInvoke("message_history", {
          session_id: flags.sessionId,
          limit: flags.historyLimit,
        });
        lastQuery = (queryResult ?? {}) as Record<string, unknown>;
      } finally {
        await pollClient.disconnect();
      }
      const haystack = JSON.stringify(lastQuery).toLowerCase();
      if (haystack.includes(expectedLower)) {
        const payload = {
          ok: true,
          verified: true,
          session_id: flags.sessionId,
          probe_send: sendPayload,
          query_result: lastQuery,
        };
        if (flags.json) {
          process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        } else {
          process.stdout.write(`verified=true session_id=${flags.sessionId}\n`);
        }
        return 0;
      }
      await sleep(Math.max(flags.pollIntervalSeconds, 0.1) * 1000);
    }

    throw new Error(
      "Acceptance verification did not observe the expected identity text.\n" +
        `expected: ${flags.expectedSubstring}\n` +
        `last_query: ${JSON.stringify(lastQuery)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (flags.json) {
      process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 1;
  }
}

process.exit(await main());
