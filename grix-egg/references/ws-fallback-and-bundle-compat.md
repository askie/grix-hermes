# WS create fallback and bundle-layout compatibility

## Session takeaways

1. Real smoke test progressed past the old source-layout failure:
   - old blocker: `Cannot find module '/.../grix-admin/scripts/admin.js'`
   - after adding thin shims + build outputs, this layer was resolved

2. The next real blocker was runtime capability:
   - `grix error: code=4004 msg=unsupported cmd for hermes`
   - meaning: current Hermes/Grix host runtime did not expose WS admin create

3. Correct product behavior for `bootstrap.js`:
   - if detect says `ws`
   - and WS create fails with `unsupported cmd for hermes`
   - and caller supplied `--access-token`
   - then bootstrap should automatically fall back to HTTP create-and-bind
   - checkpoint should record:
     - `steps.detect.result.path = http`
     - `steps.detect.result.ws_admin_fallback = unsupported cmd for hermes`

4. Real-environment verification caveat:
   - code-level fallback can be green in tests
   - but live fallback still requires a real `GRIX_ACCESS_TOKEN`
   - in this session, `~/.hermes/.env` did not contain `GRIX_ACCESS_TOKEN`
   - so lack of token must be reported as an environment limitation, not as missing fallback code

5. bind_local bundle validation learned compatibility rule:
   - new layout may ship `shared/cli/skill-wrapper.js`
   - older tests / bundles may still have `shared/cli/grix-hermes.js`
   - validation must accept either shared CLI entry, while still requiring:
     - `bin/grix-hermes.js`
     - `lib/manifest.js`
     - `grix-admin/SKILL.md`

## Practical verification pattern

After making bootstrap or bundle-layout fixes, verify in this order:

1. `npm run build`
2. `npm test`
3. real or semi-real smoke run
4. if smoke fails, separate:
   - source/bundle missing-file failures
   - host capability failures
   - missing HTTP fallback credentials

## Error classification snippets

### Runtime capability failure

- `grix error: code=4004 msg=unsupported cmd for hermes`
- `agent_invoke failed: ... unsupported cmd for hermes`

Interpret as: WS channel exists, but host runtime does not support WS admin create.

### Bundle-layout validation false negative

- `Install dir is not a valid grix-hermes bundle: ...`

Interpret carefully: may be a real bad install dir, or may be validation logic that only recognizes one shared CLI filename.
