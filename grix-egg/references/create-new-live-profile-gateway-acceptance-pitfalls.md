# create_new real-world pitfalls: nested profile, gateway false negative, and verify_acceptance false pass

## Session pattern

A real `grix-egg create_new` run for a normal user created remote agent `芬达` successfully, but three separate post-create issues appeared:

1. `bind` recorded `profile_dir` under the CURRENT profile tree:
   - state file showed `/Users/gcf/.hermes/profiles/grix-online/profiles/fenda`
   - but Hermes `profile show fenda` resolved the live profile to `/Users/gcf/.hermes/profiles/fenda`
   - result: the generated `.env` / `config.yaml` landed in the wrong nested directory and the real profile had no messaging config

2. `start_gateway.js` reported failure even though the gateway did come up:
   - `hermes --profile fenda gateway status` returned launchd metadata only
   - `statusIsRunning()` treated that as not-running because it only looks for string hints like `running`
   - gateway log later showed real success:
     - `Connected to wss://...`
     - `✓ grix connected`

3. `verify_acceptance.js` returned a false positive:
   - probe was `验收探针-请回复验收通过`
   - expected substring was `验收通过`
   - script only string-searches the whole queried history JSON for `expectedSubstring`
   - because the probe message itself contained `验收通过`, the script passed even though the agent never replied

## Operational conclusions

### A. Do not trust `bind.profile_dir` blindly on host-path create_new

After `create_new`, compare:
- state/bind result `profile_dir`
- `hermes --profile <name> profile show <name>` reported path

If the state path is nested under the current protected profile, e.g.
`~/.hermes/profiles/<current>/profiles/<new>`
while Hermes resolves the live profile to
`~/.hermes/profiles/<new>`,
then treat bind as path-skewed and fix the real live profile before declaring success.

Minimum live-profile checks:
- `<live_profile>/config.yaml` contains
  ```yaml
  channels:
    grix:
      wsUrl: <API_ENDPOINT>
  ```
- `<live_profile>/.env` contains real `GRIX_ENDPOINT`, `GRIX_AGENT_ID`, `GRIX_API_KEY`

### B. Gateway status can false-negative on macOS launchd

If `bootstrap` fails at `step=gateway` with message pattern:
- `Hermes gateway did not report a running state after startup`
- but `gateway status` shows launchd plist + PID metadata

then immediately verify with the actual gateway log before classifying as startup failure.

Ground truth is the log, not the string matcher:
- `Connecting to grix...`
- `[Grix] Connected to ...`
- `✓ grix connected`
- `Gateway running with 1 platform(s)`

Treat this as a `start_gateway.js` status-detection false negative, not a real startup failure.

### C. `verify_acceptance.js` is not sufficient when expected text appears in the probe itself

Current helper is too weak for authoritative acceptance because it:
- does not filter by `sender_id`
- does not ensure the matched message happened after the probe
- only checks whether serialized history contains the expected substring anywhere

So it can pass when the probe itself contains the expected substring.

For authoritative acceptance, use the stricter bootstrap acceptance logic or manual verification with all three conditions:
1. sender is the target agent
2. content contains expected substring
3. message is later than the probe (prefer `msg_id`, otherwise timestamp)

### D. Post-create access control must be checked explicitly for normal-user onboarding

In this session the created profile initially denied the requesting human and logged:
- `Unauthorized user: <USER_ID> on grix`

The generated `.env` had `GRIX_ALLOWED_USERS` set to the host agent id instead of the requester.

So after normal-user creation, verify one of these is true in the LIVE profile:
- `GRIX_ALLOWED_USERS` includes the requester user id, or
- `GRIX_ALLOW_ALL_USERS=true`

Do not assume the default host-path bind access control is correct for the requesting human.
