# AP: upgrade-llm-runtime-v0-5-0

- Story slug: `upgrade-llm-runtime-v0-5-0`
- Created: `2026-05-16`
- [x] Implemented
- Related requirement: `./.docs/reqs/2026/05/16/req-upgrade-llm-runtime-v0-5-0.md`
- Related test spec: none required for this internal dependency migration

## Goal

Upgrade `llm-runtime` to `0.5.0`, adapt the runtime integration to the breaking API changes, and restore passing build and unit-test coverage without widening scope beyond compatibility work.

## Assumptions

1. The owning application integration surface is `core/runtime-client.ts`.
2. The primary verification surfaces are `tests/unit/runtime-client.test.js` and `tests/unit/agent-cli.test.js`.
3. The dependency upgrade may also require regenerating compiled outputs in `core/*.js` and `bin/agent-cli.js` because this repo ships built artifacts.
4. A targeted live E2E may be needed if the migration changes prompt shape or tool-loop behavior in ways that unit mocks cannot expose.

## Key Design Decisions

1. Confirm the `0.5.0` break surface before editing code.
2. Keep the migration centered in `core/runtime-client.ts` unless the new API forces small adjacent changes in tests or package metadata.
3. Preserve the existing prompt layering and tool execution model unless the new `llm-runtime` API requires a minimal shape change.
4. Prefer adapting to the library's supported `0.5.0` API instead of introducing local compatibility abstractions that mimic `0.4.x`.
5. Use `createRuntime(...)` plus the lower-level `runCompletionLoop(...)` path so Agent CLI preserves its host-owned approval gate, persisted-state shaping, and explicit prompt layering without `complete(...)` injecting package-owned system instructions.
6. Because raw `runCompletionLoop(...)` does not guarantee a bound `toolExecutor`, create an explicit runtime-backed tool executor with exported `executeToolCall(...)` helpers and fall back to it when the callback does not receive one.
7. Preserve the existing prompt-layer order, but collapse the ordered layers into one runtime system message for live-model adherence after the migration changed the execution path.

## Architecture Review

1. The repo has a single clear adapter boundary to `llm-runtime`, so the migration can stay localized in `core/runtime-client.ts` plus tests and dependency metadata.
2. Published `0.5.0` docs and types confirm that `createLLMEnvironment(...)`, `disposeLLMEnvironment(...)`, and `respondWithTools(...)` are no longer part of the public root API.
3. Published `0.5.0` docs and types promote `createRuntime(...)`, `complete(...)`, and `runCompletionLoop(...)`; only `complete(...)` auto-binds a tool executor, while `runCompletionLoop(...)` keeps prompt ownership with the host.
4. The smallest compatible migration path is to keep Agent CLI's host-owned state and approval gate, use `runCompletionLoop(...)` for the loop itself, and bind runtime tool execution explicitly with exported `executeToolCall(...)` helpers.
5. No blocking architecture flaws remain after inspecting the published `0.5.0` package surface.

## File-Level Plan

1. Inspect the `0.5.0` package surface.
   - confirm exported functions, types, and migration points relative to current usage
   - identify the minimum required source changes
2. Update dependency metadata.
   - change `package.json`
   - update lockfile or installed package state if the repo uses one in-versioned form
3. Update runtime integration.
   - adapt `core/runtime-client.ts` from `createLLMEnvironment(...)` plus `respondWithTools(...)` to `createRuntime(...)` plus `complete(...)`
   - use `runCompletionLoop(...)` plus an explicit runtime-backed tool executor inside `onToolCallsResponse(...)` after host approval decisions
   - update comment blocks as needed
4. Update tests.
   - revise `tests/unit/runtime-client.test.js` mocks and assertions for the new API
   - adjust `tests/unit/agent-cli.test.js` only if behavior-facing assertions need compatible updates
5. Run validation.
   - compile/build
   - focused tests first, then the full suite if the focused pass succeeds
   - include the live prompt-and-skill E2E when the runtime migration changes live model behavior
6. Update docs/status.
   - mark plan progress complete
   - add done doc after verification

## Implementation Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Validation Strategy

1. Run `npm run build:ts` after the dependency and source changes.
2. Run focused unit tests for `tests/unit/runtime-client.test.js` and `tests/unit/agent-cli.test.js`.
3. Run the live `tests/e2e/agent-cli.e2e.test.js` slice if prompt or tool-loop behavior drifts under the new runtime path.
4. Run the full repo test suite if the focused checks pass.
5. If the upgrade changes installed artifacts or lock metadata, ensure the final repo state is internally consistent before commit.

## Risks

1. `llm-runtime` `0.5.0` may remove or rename currently used exports such as environment creation or tool-response helpers, forcing a deeper adapter rewrite than expected.
2. Mock-based tests may pass while live runtime semantics drift; behavior assertions should stay tied to outputs and persisted messages, not just call signatures.
3. The shipped compiled outputs can become stale if the migration updates TS but not generated JS.
