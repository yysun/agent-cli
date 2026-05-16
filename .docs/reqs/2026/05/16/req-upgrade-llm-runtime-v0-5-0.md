# REQ: upgrade-llm-runtime-v0-5-0

- Story slug: `upgrade-llm-runtime-v0-5-0`
- Created: `2026-05-16`
- Status: Completed

## Summary

Upgrade Agent CLI from `llm-runtime` `^0.4.0` to `0.5.0` and adapt the codebase to the breaking API changes while preserving the current CLI behavior, runtime selection, prompt layering, tool execution flow, and persistence behavior.

## Problem

Agent CLI currently depends on `llm-runtime` `^0.4.0` and directly integrates with its environment creation, tool resolution, and turn-loop APIs inside `core/runtime-client.ts`. The requested upgrade targets `0.5.0`, which is a breaking release. The repo must update its dependency and any affected integration code so builds and tests pass again without regressing Agent CLI's current behavior.

## Requirements

1. The repo must depend on `llm-runtime` `0.5.0` after the upgrade.
2. Any code paths broken by the `0.5.0` API change must be updated to the new supported API.
3. Agent CLI must continue to resolve provider credentials and runtime target selection as it does today unless `0.5.0` explicitly requires a compatible shape change.
4. Agent CLI must continue to layer the built-in prompt, optional `AGENTS.md`, and optional skill inventory as separate runtime prompt contributions.
5. Agent CLI must continue to resolve skills through `llm-runtime` and execute `load_skill` through the runtime-supported tool flow.
6. Agent CLI must continue to support streamed assistant text, warning/error propagation, reasoning text handling, tool-call reporting, tool-result reporting, and persisted chat updates.
7. Agent CLI must continue to support approval-gated tool execution behavior where currently implemented.
8. Remote control and relay behavior must remain unchanged unless the runtime break forces a narrow compatible adaptation in the shared runtime client.
9. Existing unit tests covering runtime-client and CLI behavior must be updated or expanded to reflect any required API-shape changes.
10. Build and unit-test verification must pass after the upgrade.
11. If `0.5.0` removes or replaces a currently used API, the implementation must adapt to the new supported path rather than pinning old compatibility wrappers inside application code unless that is the smallest safe migration.

## Non-Goals

1. Rewriting Agent CLI's overall runtime architecture is not required.
2. Changing prompt semantics, storage layout, remote protocol, or CLI UX beyond what is required for runtime compatibility is not required.
3. Adding new user-facing features from `llm-runtime` `0.5.0` is not required unless they are necessary to restore parity.
4. Upgrading unrelated dependencies is not required.

## Acceptance Criteria

1. `package.json` declares `llm-runtime` `0.5.0`.
2. The TypeScript source compiles successfully with the new `llm-runtime` types and runtime API.
3. The runtime-client unit tests pass against the upgraded dependency surface.
4. The CLI unit tests pass without regressions in existing observable behavior.
5. Any source changes required by the breaking release are limited to the minimum set needed for compatibility.
6. The repo's documented verification for this story reflects the commands actually run.

## Open Questions

None.
