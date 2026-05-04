# Blank-profile binding regression note

Session-derived finding:

- Symptom: a newly bound Grix agent answered with an existing agent identity (for example, self-identifying as 河马 and calling the user 老郭) even though the intended target was a blank/empty agent.
- Root cause: `grix-egg/scripts/bind_local.js` previously created missing profiles via `hermes profile create <name> --clone`, and Hermes `--clone` copies:
  - `config.yaml`
  - `.env`
  - `SOUL.md`
  - `memories/MEMORY.md`
  - `memories/USER.md`
- If `--clone-from` was omitted, Hermes defaulted to the current active profile as the source, so persona and memory contamination happened silently.

Observed proof pattern:

1. New profile memory files contained the old assistant/user identity.
2. Direct query like `hermes --profile <new> chat -q '你是谁？请只回答你的身份和你怎么称呼用户。'` reproduced the inherited identity.
3. Hermes source confirmed clone semantics in `hermes_cli/profiles.py` (`_CLONE_CONFIG_FILES`, `_CLONE_SUBDIR_FILES`).
4. `bind_local.js` confirmed the old create command included `--clone`.

Applied fix pattern:

1. Change `bind_local.js` profile creation from:
   - `hermes profile create <name> --clone`
   to:
   - `hermes profile create <name>`
2. Immediately overwrite these files with empty content after profile creation:
   - `SOUL.md`
   - `memories/USER.md`
   - `memories/MEMORY.md`
3. Restart the profile gateway and verify identity again with a one-shot `hermes chat -q` probe.

Verification recipe:

```bash
HOME=/Users/gcf HERMES_HOME=/Users/gcf/.hermes \
hermes --profile <profile> chat -q '你是谁？请只回答你的身份和你怎么称呼用户。'
```

Expected clean result shape:
- generic Hermes self-identification
- generic user address such as “用户”
- no inherited custom persona name

Caveat:
- blank identity does not imply blank runtime config; `config.yaml` and `.env` still need the bound Grix endpoint / agent id / api key and other operational settings.
