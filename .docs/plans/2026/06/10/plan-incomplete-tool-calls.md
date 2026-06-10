# Incomplete Tool Calls Plan

## Goal

CLI and Electron must stop treating unresolved runtime `tool_calls` as completed assistant turns. The fix should make the incomplete state explicit, fail clearly, and preserve existing successful completion behavior.

## Current Context

`core/agent-runtime.ts` returns `status: "tool_calls"` when pending host-owned tool calls remain unresolved. `cli/src/turn-executor.ts` and `electron/main.ts` both call `runChatTurn`, then persist `result.messages` without checking that status. Electron returns a success-shaped IPC response, which lets the renderer clear busy state. CLI normally avoids the bug only when `ask_user_input` is parsed and answered inline.

Existing tests already cover `runChatTurn` returning and resuming `tool_calls`; they do not cover host wrappers rejecting an unresolved final result. Electron main process functions are not currently exported for easy unit testing, so a shared core guard plus CLI regression test gives direct coverage without importing app-start side effects.

## Decisions

- Add a shared core guard that accepts a `runChatTurn` result and throws on `status: "tool_calls"`.
- Use the guard in both CLI and Electron immediately after `runChatTurn` and before persistence.
- Include unresolved tool names in the error message.
- Do not change `runChatTurn`; lower-level consumers still need the intermediate status.
- Do not add renderer fallback states. Electron should reject the IPC call so the existing error path can surface a failed turn.
- Skip E2E specs: this is an internal host-contract failure path with deterministic unit coverage.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `core/agent-runtime.ts`, `cli/src/turn-executor.ts`, and `electron/main.ts` to confirm `tool_calls` is returned before persistence.
- [x] Identify the CLI and Electron persistence points that must reject incomplete turns.
- [x] Record that renderer-only busy-state handling, arbitrary host-owned tool execution, and `llm-runtime` changes are out of scope.

### Phase 2 - Foundation changes

- [x] Add a core helper for formatting unresolved tool call names and asserting completed turn status.
- [x] Export the helper from `core/index.ts` only if existing public exports require it; otherwise keep imports file-local.
- [x] Update helper tests so malformed or missing tool names still produce a clear fallback.

### Phase 3 - Host implementation

- [x] Call the shared completion guard in `cli/src/turn-executor.ts` before `persistCompletedChat`.
- [x] Call the shared completion guard in `electron/main.ts` before `persistCompletedChat`.
- [x] Confirm successful completed-turn persistence remains unchanged.

### Phase 4 - Tests and verification wiring

- [x] Add a unit test for the shared guard error text and pass-through behavior.
- [x] Add a CLI regression test proving unresolved `tool_calls` reports failure and does not persist partial messages.
- [x] Run `npm run build` and targeted unit tests for changed behavior.
- [x] Run `npm run check` if targeted verification passes.

### Phase 5 - Documentation and status

- [x] Update this plan with completed task checkboxes after evidence exists.
- [x] Create `.docs/done/2026/06/10/incomplete-tool-calls.md` with the implemented behavior and verification.
- [x] Record final evidence that both CLI and Electron call sites enforce the completed-turn contract.

## Validation

- `npm run build`
- `npx vitest run tests/unit/agent-runtime.test.js tests/unit/agent-cli.test.js`
- `npm run check`
- `npm run electron:main:build`

## Rollback / Risk

Risk is low because the runtime result contract is unchanged. The behavioral change is intentionally host-facing: an unresolved host-owned tool call now fails instead of saving misleading partial transcript state. Rollback would remove the guard calls from CLI and Electron.
