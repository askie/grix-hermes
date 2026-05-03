# WS create capability failures and bundle-layout compatibility

## Session takeaways

1. Real smoke test progressed past the old source-layout failure:
   - old blocker: `Cannot find module '/.../grix-admin/scripts/admin.js'`
   - after adding thin shims + build outputs, this layer was resolved

2. The next real blocker was runtime capability:
   - `grix error: code=4004 msg=unsupported cmd for hermes`
   - meaning: current Hermes/Grix host runtime did not expose host/admin create capability

3. Correct product behavior for `bootstrap.js` now:
   - if detect says `host`
   - and host create fails with `unsupported cmd for hermes`
   - bootstrap should keep host-path semantics and fail fast
   - checkpoint/state should keep:
     - `steps.detect.result.path = host`
     - top-level `state.path = host`
     - `steps.create.status = failed`
   - it should NOT automatically fall back to HTTP create-and-bind just because `--access-token` was supplied

4. Real-environment verification caveat:
   - independent HTTP tooling may still exist in the repo
   - but that is separate from `create_new` semantics
   - if the environment lacks `GRIX_ACCESS_TOKEN`, report that only as a limitation for the independent HTTP path
   - do not misreport it as the reason `create_new` failed

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
2. `npm test -- --test-name-pattern=grix-egg`
3. `npm pack --dry-run`
4. if smoke fails, separate:
   - source/bundle missing-file failures
   - host capability failures
   - independent HTTP credential limitations

## Error classification snippets

### Runtime capability failure

- `grix error: code=4004 msg=unsupported cmd for hermes`
- `agent_invoke failed: ... unsupported cmd for hermes`

Interpret as: host session credentials exist, but the runtime does not expose reusable host/admin create capability.

### Bundle-layout validation false negative

- `Install dir is not a valid grix-hermes bundle: ...`

Interpret carefully: may be a real bad install dir, or may be validation logic that only recognizes one shared CLI filename.
