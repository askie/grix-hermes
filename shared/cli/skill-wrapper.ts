import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function runSharedCliAction(action: string, extraArgs: string[]): never {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const sharedCli = path.resolve(scriptDir, "grix-hermes.js");
  const result = spawnSync(
    process.execPath,
    [sharedCli, action, ...extraArgs],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}
