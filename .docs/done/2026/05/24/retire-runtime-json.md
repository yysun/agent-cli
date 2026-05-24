# Retire Runtime JSON

## Summary

- Removed `runtime.json` from the active runtime configuration path.
- Runtime defaults now resolve from selected-world `world.json`, then selected-agent `agent.json`, then CLI flags.
- Agent creation and selection keep provider/model and other runtime settings in `agent.json`.
- Help text, missing-model errors, README, and AGENTS instructions now point to `world.json`, `agent.json`, and CLI flags.
- Deleted the tracked repo-root `runtime.json`.

## Verification

- `npm run test:unit`
- `npm run test:syntax`
- `npm run test:e2e:relay`
- `npm run web:typecheck`
- Runtime reference scan: active source/docs no longer recommend or read/write `runtime.json`; remaining references are retirement comments or absence assertions.

## Notes

- No migration or backwards compatibility was added.
- Pre-existing unrelated package/electron worktree changes were left untouched.
