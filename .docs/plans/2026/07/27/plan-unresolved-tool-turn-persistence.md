# PLAN: unresolved-tool-turn-persistence

- Story slug: `unresolved-tool-turn-persistence`
- Created: `2026-07-27`
- REQ: `.docs/reqs/2026/07/27/req-unresolved-tool-turn-persistence.md`

## Goal

A turn rejected for unresolved tool calls keeps the transcript it already produced, still reports the rejection, and surfaces that failure in the Electron UI. The `ask_user_input` flow gains deterministic coverage, and the live E2E says plainly when the model failed to comply.

## Current Context

Rejection and persistence order:

- `cli/src/turn-executor.ts:508` — `assertCompletedChatTurn(turnResult)` runs at `:510`, immediately before `persistCompletedChat` at `:512`. Throwing there skips persistence entirely, and the `catch` block only persists stream-trace events.
- `electron/main.ts` — `executeRuntimeTurn` calls `assertCompletedChatTurn(result)` before `persistCompletedChat`, same ordering, same consequence.
- `core/agent-runtime.ts:465` — `assertCompletedChatTurn` throws when `result.status === 'tool_calls'`. `runChatTurn` already returns a fully populated `messages` array alongside that status (`:944`), so the data needed to persist is present and simply discarded.
- Deterministic probe result: one prior message + one user message + one assistant message = **3 messages returned, 0 persisted**, then `LLM turn paused with unresolved tool calls: some_host_tool`.

Where the unresolved call comes from:

- `llm-runtime` `runtime.js:871` returns the whole batch to the host when any call is host-owned (`isKnownHostOwnedToolCall`, `:252` — a declared tool with no `execute`).
- `core/agent-runtime.ts:682` `handlePendingToolCalls` returns `false` as soon as any handler reports `{ handled: false }`, which breaks the loop and leaves `status: 'tool_calls'`.
- Both hosts' `handleToolCall` return `{ handled: false }` for anything that is not a human-input tool (`cli/src/turn-executor.ts:482`, `electron/main.ts` `handleToolCall`).

Renderer error path:

- `electron/renderer/src/features/chat/ChatComposer.tsx:48` — `submitContent` does `await onSubmitMessage(...)` with no `catch`, so a rejected IPC promise becomes an unhandled rejection. `setContent('')` never runs, so the typed text does survive in the box.
- `useDesktopWorkspace.ts` `submitMessage` wraps its body in `withBusy`, which clears the busy label in `finally` but re-throws. No `log('error', ...)` entry is produced and the transcript is never refreshed, so the persisted state stays invisible until a manual reload.

Live E2E:

- `tests/e2e/electron-ask-user-input.e2e.test.js:137` waits on `.aw-human-input` with a bare 60s timeout; `:151` then asserts non-empty persisted assistant text.
- Three runs on identical code: prompt at ~5s, no prompt in 90s, and one full success. In the success run the model also emitted two spurious `load_skill` calls for a non-existent skill before complying.

## Decisions

- **Persist first, then assert — but sanitize before persisting.** Move `assertCompletedChatTurn` to after `persistCompletedChat` in both hosts, preserving the intent of `4e143ff` (the turn still fails and is never reported as completed) while keeping the transcript.

  **Naive persistence is unsafe and must not be implemented.** The rejected turn's message array ends with an assistant message carrying `tool_calls` that have no matching `tool` result — that is precisely why the turn was rejected. `normalizePersistedMessage` (`core/chat-store.ts:107`) preserves `tool_calls`, so that orphan would be written to `messages.jsonl` and replayed as history on the next turn. OpenAI and Anthropic both reject a conversation in which an assistant `tool_calls` message is not followed by a result for every `tool_call_id`, so saving the transcript naively would poison the chat and make **every subsequent turn in it fail**. That is a worse outcome than the data loss being fixed.

  Therefore: persist only messages that form a valid conversation. Drop assistant messages whose `tool_calls` have no matching `tool` message, and drop any orphaned `tool` messages. The user's message and every completed tool exchange survive; the unresolved fragment does not.
- **Do not auto-recover the unresolved call.** Rejected: resolving unhandled host-owned calls with the `executeDefault` "unhandled" artifact so the model can retry. It would change turn semantics for every host, risks tool-call loops, and reverses a deliberate maintainer decision. Out of scope per the REQ non-goals.
- **Do not change `assertCompletedChatTurn`.** Its contract and its existing test stay as they are; only the call ordering moves.
- **Deterministic coverage sits at the core + session-manager seam, not inside Electron.** `runAgentTurn` and `executeRuntimeTurn` are not exported from `electron/main.ts`, and exporting them purely for a test would widen the module's public surface for no runtime benefit. `runChatTurn` driven through the real `HumanInputSessionManager` and a fake renderer exercises exactly the composition Electron main wires together. Recorded as a known limitation: the IPC registration itself stays covered only by the live E2E.
- **Keep the live E2E live.** Add diagnosis, not mocking: when the prompt never appears, check whether the turn finished anyway and fail with "model did not emit ask_user_input" instead of a bare locator timeout.
- **No retry policy for live E2E.** A retry would hide the non-compliance rate rather than report it. Out of scope per the REQ non-goals.

## Phased Tasks

### Phase 1 - Reproduce deterministically

- [x] Add a test to `tests/unit/agent-runtime.test.js` (or a new suite) asserting `runChatTurn` returns `status: 'tool_calls'` *with* a populated `messages` array when `handleToolCall` reports `{ handled: false }`, pinning the data that must survive.
- [x] Add a test to `tests/unit/turn-executor.test.js` asserting the CLI currently loses that data, so the fix has a failing test to satisfy.

### Phase 2 - Preserve the transcript on rejection

- [x] Add and export `selectPersistableMessages(messages)` in `core/agent-runtime.ts`: drop assistant messages whose `tool_calls` lack a matching `tool` message by `tool_call_id`, and drop `tool` messages whose `tool_call_id` matches no retained assistant call. Pure function, no I/O.
- [x] Unit-test `selectPersistableMessages` directly: unresolved trailing assistant call removed, completed exchanges retained, user messages always retained, orphaned tool messages removed, already-valid arrays returned unchanged.
- [x] Reorder `cli/src/turn-executor.ts` so `persistCompletedChat` runs before `assertCompletedChatTurn`, persisting `selectPersistableMessages(turnResult.messages)`, and update `chat.messages` to the same sanitized list before the assert throws.
- [x] Reorder `electron/main.ts` `executeRuntimeTurn` so `persistCompletedChat` runs before `assertCompletedChatTurn`, persisting the sanitized list.
- [x] Assert with a test that a chat persisted from a rejected turn contains no assistant `tool_calls` entry lacking a matching tool result, so the next turn's replayed history is provider-valid.
- [x] Confirm a rejected turn still throws, still reports the unresolved tool name, and is not returned as a completed turn from either host.
- [x] Confirm stream-trace persistence in the CLI `catch` block still runs and does not double-write.

### Phase 3 - Surface the failure in the renderer

- [x] Catch turn failures in `useDesktopWorkspace.submitMessage`, add a `log('error', ...)` entry, refresh messages from storage so the persisted user message appears, and clear the pending prompts.
- [x] Ensure the composer does not clear typed content on a failed send, and that `busy` is released.
- [x] Verify no unhandled rejection escapes `ChatComposer.submitContent`.

### Phase 4 - Deterministic ask_user_input coverage

- [x] Add `tests/unit/human-input-turn-flow.test.js` driving `runChatTurn` with a mocked `streamComplete` that emits a host-owned `ask_user_input` call, resolved through a real `HumanInputSessionManager` and a fake renderer, then resumed to a final answer.
- [x] Assert the request reaches the fake renderer, the answer resolves the tool message, the turn resumes, and the final assistant text is present in the returned messages.
- [x] Assert the rejected-turn variant keeps the user message in the returned messages.

### Phase 5 - Make the live E2E diagnose itself

- [x] In `tests/e2e/electron-ask-user-input.e2e.test.js`, replace the bare `.aw-human-input` wait with a wait that also watches for turn completion, and fail with an explicit "model did not emit ask_user_input" message naming the model when the turn finishes without the prompt.
- [x] Add a second diagnosis for the "turn finished but produced no final answer" mode, distinguishing a rejected turn (renderer logged `Turn failed:`) from model non-compliance.
- [x] **Added during SS:** the suite carried two stale assertions unrelated to this story, which blocked it from ever going green. `showToolMessages` defaults to `false` and `groupMessagesForTranscript` hides tool messages when it is false, but the test expected tool cards visible *before* toggling and hidden after — inverted since commit `4f368f1` defaulted verbose off. The `.aw-tool-title` selector was also stale: persisted tool messages render as `ToolTraceSection` with `.aw-tool-trace-title` since commit `9705a0c`. Correct both. Test-only change, no product behavior touched.

### Phase 6 - Verification and documentation

- [x] Verify the CLI reports a rejected turn on stderr and that the chat reloads afterward with the user's message intact and no orphaned tool-call entry.
- [x] Run `npm run check`, `npm run test:unit`, `npm run electron:build`; record results.
- [x] Run `npm run test:e2e` and `npm run test:e2e:electron` through an interactive shell so `GOOGLE_API_KEY` is present; record results honestly including model non-compliance.
- [x] Update the file header comment blocks of every edited source file.
- [x] Update `.docs/tests/test-code-review-fixes.md` only if a scenario it describes changes.

## Validation

- `npm run check` — exit 0.
- `npm run test:unit` — all pass; count increases with the new suites. Baseline after the previous story is 16 files / 167 tests.
- `npm run electron:build` — exit 0.
- `zsh -ic 'npm run test:e2e'` — expected to pass (4/4 previously).
- `zsh -ic 'npm run test:e2e:electron'` — may still fail on model non-compliance. That is acceptable only if the failure message now names the cause. Report what actually happened.

Behavioral evidence to capture:

- Before/after message counts in `messages.jsonl` for a rejected turn: currently 0 persisted, must become the full set including the user message.
- The rejection still throws and names the tool.

## Rollback / Risk

- **Sanitizing could drop more than intended.** If `selectPersistableMessages` is too aggressive it silently deletes real conversation. Mitigation: it removes only messages provably orphaned by `tool_call_id`, never user or plain assistant messages, and the unit tests pin an already-valid array as unchanged.
- **Persisting a rejected turn could record a half-finished turn as if it were complete.** Mitigation: the assert still throws, so no caller treats it as completed; `persistWorldChat` writes only `messageCount` and timestamps, and adds no completion marker. The chat simply contains the messages that really happened.
- **A rejected turn now writes to disk where it previously did not**, so a failing turn mutates `messages.jsonl`. This is the intended fix, but it means a repeatedly failing turn appends user messages. Acceptable: the same is already true of every successful turn, and losing the user's message is the worse failure.
- **Reordering in two hosts risks divergence.** Mitigation: the CLI change is covered by a direct unit test; the Electron change is covered by inspection plus the shared core-level test.
- Each phase is independently revertible. Phase 5 touches only the E2E test.
