# REQ: unresolved-tool-turn-persistence

- Story slug: `unresolved-tool-turn-persistence`
- Created: `2026-07-27`
- Status: Complete

## Problem

Running the live Electron E2E suite (`tests/e2e/electron-ask-user-input.e2e.test.js`) surfaced two distinct problems. The suite fails on `main` (9705a0c) as well as on the `code-review-fixes` branch, so neither is a regression from that story.

**1. A rejected turn discards the user's message and all completed work.**

When a turn ends with a host-owned tool call that no host handler claims, `runChatTurn` returns `status: 'tool_calls'` and `assertCompletedChatTurn` throws. Both surfaces call that assert *before* `persistCompletedChat`, so nothing is written at all.

Confirmed deterministically with a mocked runtime: for a turn with one prior message, `runChatTurn` returned `status=tool_calls` holding **3 messages ready to persist** — the prior message, the user's new message, and the assistant message — and the assert then threw `LLM turn paused with unresolved tool calls: some_host_tool`. Every one of those messages was discarded.

The user-visible result is that their message vanishes from the chat, the transcript is unchanged, and the renderer receives a rejected IPC promise carrying a developer-facing string ("Host must handle these tool calls before completing the turn") that no UI surfaces. This is review finding 12, now confirmed reachable in practice rather than theoretically.

Rejecting the turn is deliberate (commit `4e143ff`) and correct — an unresolved tool call must not be recorded as a completed turn. Destroying the transcript is not part of that intent.

**2. The live Electron E2E is nondeterministic and cannot gate anything.**

The fixture instructs `gemini-2.5-flash` to emit a specific `ask_user_input` call and then a specific final answer. The model does not reliably comply. Across three runs on identical code: the prompt rendered in ~5s once, never appeared within 90s once, and the full flow succeeded once. When the model instead emits an unhandled host-owned tool call, problem 1 fires and the suite fails at `:151` with `expected 0 to be greater than 0` — a confusing symptom several layers removed from the cause.

A test that passes or fails based on model sampling cannot gate a merge, and its failure message does not point at the real defect.

## Requirement

1. A turn that is rejected for unresolved tool calls must still persist the conversation work that actually completed, including the user's message. Rejection must not destroy transcript state.
2. The rejection must still be reported. The turn must not be recorded as successfully completed, and the caller must receive a clear error.
3. The Electron renderer must surface a failed turn to the user instead of dropping a rejected promise.
4. The `ask_user_input` request/answer/resume/persist flow must be covered by a deterministic test that does not depend on live model behavior.
5. The live Electron E2E must fail with a message that identifies model non-compliance when that is the cause, rather than a bare locator timeout or a downstream assertion.

## Acceptance Criteria

- [x] When a turn is rejected for unresolved tool calls, the user's message and all completed tool messages are present in `messages.jsonl` afterward.
- [x] A rejected turn still raises an error to the caller and is not persisted as a completed turn.
- [x] The rejection error text names the unresolved tool.
- [x] The CLI reports a rejected turn on stderr and leaves the chat loadable with the user's message intact.
- [x] The Electron renderer logs a visible error entry when a turn fails, and clears the busy state.
- [x] A deterministic test covers the `ask_user_input` request/answer/resume/persist path using the same `HumanInputSessionManager` composition the Electron main process wires up, with a fake renderer standing in for IPC.
- [x] A chat persisted from a rejected turn contains no assistant `tool_calls` entry without a matching tool result, so replaying it as history stays valid for the provider.
- [x] A deterministic test covers the rejected-turn path and asserts the transcript survives.
- [x] The live Electron E2E distinguishes model non-compliance from a product failure and says which occurred.
- [x] `npm run check`, `npm run test:unit`, and `npm run electron:build` pass.

## Constraints

- Preserve the intent of `4e143ff`: an unresolved tool-call turn must never be reported as completed.
- Do not change `assertCompletedChatTurn`'s throwing contract; existing callers and `tests/unit/agent-runtime.test.js` depend on it.
- Persisting a rejected turn must not mark it as having a final assistant answer when it does not.
- Keep the live E2E live. Replacing it with a mock is not the goal; it must remain a real end-to-end check.
- Keep local ESM imports using `.js` extensions per `AGENTS.md`.

## Non-Goals

- Making the model reliably comply with the fixture prompt, or switching E2E providers/models.
- Auto-recovering from an unresolved tool call by feeding a synthetic "unsupported tool" result back to the model so it can retry. Considered and rejected in the plan; it changes turn semantics well beyond this fix.
- Adding retry/backoff to live E2E runs as a general policy.
- Renderer component test infrastructure.
- Any of the still-open review findings: turn cancel/abort, secret redaction, renderer CSP, `events.jsonl` rotation, or `messageId` persistence.
