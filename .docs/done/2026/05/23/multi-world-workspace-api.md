# Multi-World Workspace API

## Summary

- Added a workspace registry API in `core/workspace-store.ts` for listing, creating, selecting, renaming, deleting, and resolving worlds.
- Moved active world state under `.agent-world/worlds/{worldId}` with `registry.json` at the workspace level.
- Added `--world` support to `agent-cli` and `agent-world-cli`.
- Added `agent-world-cli worlds list|create|use|rename|delete`.
- Layered skill discovery from workspace skills and selected-world skills, with world skills overriding duplicate workspace skill IDs.
- Kept `AGENTS.md`, `.env`, and root `runtime.json` workspace-level only.

## Verification

- `npm run test:unit`
- `npm run test:syntax`
- `npm run test:e2e:relay`
- `npm run web:typecheck`
- CR pass fixed non-selecting world creation so `worlds create` does not switch active worlds unless `--default` is passed.

## Notes

- No migration or backwards compatibility for the old singleton `.agent-world/world.json` layout was included, per request.
- Existing generated `bin/` outputs were rebuilt by the verification commands.
