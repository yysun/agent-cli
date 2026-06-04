# Electron Verbose Mode Plan

## Goal

Make the Electron toggle behave like CLI verbose mode: it gates reasoning/thinking and runtime diagnostics, while enabled Electron turns stream those diagnostics into the transcript before the turn completes.

## Current Context

- `electron/renderer/src/features/settings/SettingsPanel.tsx` renders the current "Show tool messages" panel and switch labels.
- `electron/renderer/src/features/chat/transcript-events.ts` filters runtime events and currently preserves reasoning visibility when tool messages are hidden.
- `electron/renderer/src/features/chat/ChatTranscript.tsx` renders persisted tool messages and transient turn event cards.
- `electron/main.ts` collects reasoning/tool/model events during `runChatTurn`, but returns them only after `executeRuntimeTurn` completes.
- `electron/preload.cts` and `electron/renderer/src/types/desktop-api.ts` define the IPC bridge surface consumed by `useDesktopWorkspace`.
- `electron/renderer/src/hooks/useDesktopWorkspace.ts` submits turns and sets `turnEvents` only from the final response.
- `tests/unit/electron-transcript-events.test.js` covers runtime-event filtering and currently asserts reasoning stays visible in hidden-tool mode.
- Implementation updated the toggle to default off because CLI verbose mode is opt-in and the user phrased the behavior as "once enabled".

## Decisions

- Keep the existing `showToolMessages` state name internally to minimize churn, but change user-facing copy to "Verbose mode" and reinterpret the state as the verbose gate.
- Add a renderer-safe IPC subscription for turn events instead of changing persisted messages or waiting for final responses.
- Emit the same event objects that are already returned in `turnEvents`, preserving deterministic final state.
- Exclude E2E coverage for this story because live reasoning/tool streams depend on provider behavior; unit tests and Electron type/build checks give more stable evidence for the contract.
- Reject separate "thinking" or "reasoning" toggles because the requirement is to make the existing mode verbose.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `SettingsPanel.tsx`, `transcript-events.ts`, `ChatTranscript.tsx`, `electron/main.ts`, `preload.cts`, `desktop-api.ts`, and `useDesktopWorkspace.ts` to confirm the current label, filtering, and final-response-only event delivery.
- [x] Identify the existing persisted chat path that must be preserved while changing transient runtime-event visibility.
- [x] Record the non-goals around CLI formatting, storage changes, and extra toggles so the implementation stays narrow.

### Phase 2 - IPC event foundation

- [x] Update `electron/main.ts` with a dedicated turn-event IPC channel and a small event emitter helper that records and sends each runtime event to the requesting renderer.
- [x] Update `electron/preload.cts` and `electron/renderer/src/types/desktop-api.ts` so the renderer can subscribe to current-turn events and unsubscribe cleanly.
- [x] Update `useDesktopWorkspace.ts` so active-turn events append as they arrive and final responses still replace state with the complete returned event list.

### Phase 3 - Verbose-mode behavior

- [x] Update `SettingsPanel.tsx` so the setting title and switch accessible label say "Verbose mode".
- [x] Update `transcript-events.ts` so reasoning, tool calls, tool results, and model responses are visible only when verbose mode is enabled, while warnings and errors remain visible.
- [x] Confirm persisted tool message visibility still follows the same verbose gate in `ChatTranscript.tsx` without changing message storage.
- [x] Update `useDesktopWorkspace.ts` so verbose diagnostics are disabled by default, matching CLI verbose opt-in behavior.
- [x] Update `transcript-events.ts` so expanded verbose tool call/result bodies preserve raw text instead of returning truncated summaries.

### Phase 4 - Tests and verification wiring

- [x] Update `tests/unit/electron-transcript-events.test.js` to assert hidden verbose mode hides reasoning plus runtime diagnostics and enabled verbose mode shows them.
- [x] Run `npm run electron:build` and record the result: passed on 2026-06-04.
- [x] Run `npx vitest run tests/unit/electron-transcript-events.test.js` and record the result: passed on 2026-06-04 with 6 tests.
- [x] Run `npm run test:unit` and record the result: passed on 2026-06-04 with 12 files and 118 tests.

### Phase 5 - Documentation and status

- [x] Update this plan with completed tasks and verification evidence.
- [x] Create `.docs/done/2026/06/04/electron-verbose-mode.md` with the finished behavior and checks.
- [x] Record VR evidence against every acceptance criterion before commit.

## Validation

- `npm run electron:build` must pass.
- `npx vitest run tests/unit/electron-transcript-events.test.js` must pass.
- `npm run test:unit` must pass.
- Code review must confirm no storage schema, CLI formatting, or extra setting was introduced.

## Rollback / Risk

The main risk is leaking stale events across overlapping turns or chats. The renderer should clear `turnEvents` at the start of a send/edit and unsubscribe on cleanup, while the main process should only emit to the `WebContents` that initiated the turn. Rollback is limited to removing the new IPC subscription and restoring final-response-only event display.
