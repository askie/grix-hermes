#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cardScript = path.resolve(scriptDir, "../../message-send/scripts/card-link.mjs");
const result = spawnSync(process.execPath, [cardScript, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
