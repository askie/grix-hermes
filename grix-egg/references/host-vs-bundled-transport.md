# Host vs bundled transport for grix-egg

## What was confirmed

During debugging, the user correctly pointed out that the real problem was not missing `access_token`, but that `grix-egg` was not reusing the WS channel already established by Hermes / `grix.py`.

Evidence from the code path:

1. `grix-egg/scripts/bootstrap.ts`
   - `stepCreateWs()` shells out to `grix-admin/scripts/admin.js --action create_grix`

2. `shared/cli/skill-wrapper.ts`
   - creates `new AibotWsClient(runtime.connection)`
   - calls `await client.connect()`
   - dispatches actions, then disconnects

3. `shared/cli/aibot-client.ts`
   - `connect()` does `new WebSocket(endpoint, ...)`
   - then sends `auth`
   - then uses `agent_invoke`

4. `shared/cli/actions.ts`
   - `runAdmin()` calls `client.agentInvoke("agent_api_create", createPayload)`

This means the current so-called WS path is actually a **bundled independent WS client**, not a reuse of the host session channel.

## Correct interpretation

When a user says:
- “grix.py already built the WS channel”
- “why can't the plugin directly use it?”
- “do not ask for access token”

Treat that as a root-cause correction, not just a preference.

The diagnosis should become:
- `create_new` should prefer reusable host session credentials when available
- if reusable host session credentials are absent, HTTP fallback is acceptable
- but that fallback should use an access token obtained live through `grix-register login/register`, not a presumed environment variable
- the longer-term architectural gap is still a true host bridge for direct `grix_invoke` reuse

## Important negative finding

Do not assume this bridge already exists.

In this session, after changing `detect.path` semantics from `ws` to `host` and removing token-oriented detection, tests started failing in a meaningful way:

- HTTP create-and-bind tests failed at detect
- legacy WS detection tests failed because the code only renamed the path to `host`
- `unsupported cmd for hermes` still remained on real host-style create attempts

Interpretation:
- renaming path semantics is not enough
- without a real host bridge, this is a **fake host transport refactor**

## Durable lesson

Before refactoring `grix-egg` to “host transport first”:

1. locate an actual host-call bridge, or
2. implement one as a prerequisite task

Only after that should bootstrap switch create_new primary behavior away from bundled WS / HTTP fallback.

## Temporary safe fallback

If the host bridge does not exist yet, the honest temporary workaround is:
- use `create_new` with host-first semantics, allowing HTTP fallback only after the operator has obtained an access token through `grix-register login/register`
- or use `--route existing` with explicit credentials / `--bind-json`

Do not describe `--access-token` as something that should already exist in env. If HTTP fallback is needed, the expected operator flow is to ask for account/email + password, obtain a fresh token, then continue.
