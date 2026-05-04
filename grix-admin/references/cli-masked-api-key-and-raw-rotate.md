# Admin CLI masks API keys; use raw WS client when you need the plaintext immediately

Observed workflow:

1. `node grix-admin/scripts/admin.js --action create_grix --agent-name <NAME>` succeeds.
2. The returned `createdAgent.api_key` in CLI JSON is masked (`ak_...hint`) rather than the full secret.
3. `--action key_rotate` via the same CLI also masks `rotatedAgent.api_key` in stdout by design.
4. For `grix-egg --route existing`, a masked key is not enough; you need the real `api_key` value.

## Why this happens

`shared/cli/actions.ts` applies `maskResult()` to admin CLI output, so stdout is safe for display but unsuitable as a source of bind credentials.

## Reliable raw-key retrieval

When you need the plaintext key for immediate local binding, call the shared WS client directly instead of relying on masked CLI stdout:

```bash
node --input-type=module - <<'NODE'
import { resolveRuntimeConfig } from './shared/cli/config.js';
import { AibotWsClient } from './shared/cli/aibot-client.js';

const client = new AibotWsClient(resolveRuntimeConfig().connection);
await client.connect();
const data = await client.agentInvoke('agent_api_key_rotate', {
  agent_id: '<AGENT_ID>'
}, { timeoutMs: 15000 });
console.log(JSON.stringify(data, null, 2));
await client.disconnect();
NODE
```

This returns the raw server payload, including plaintext `api_key`, which can then be passed straight into `grix-egg/scripts/bootstrap.js --route existing`.

## When to prefer other paths

- If updating an existing `.env`, `grix-admin --action key_rotate --env-file <PATH>` is still appropriate because it writes the new key through the helper flow.
- If you only need human-readable confirmation, the masked CLI output is fine.
- If you need a bindable credential payload right now, use the raw WS-client pattern above.
