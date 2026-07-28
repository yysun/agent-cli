# DONE: unresolved-tool-turn-persistence

- Story slug: `unresolved-tool-turn-persistence`
- Completed: `2026-07-27`
- REQ: `.docs/reqs/2026/07/27/req-unresolved-tool-turn-persistence.md`
- AP: `.docs/plans/2026/07/27/plan-unresolved-tool-turn-persistence.md`

## Summary

- **A rejected turn no longer destroys the transcript.** When a turn ended with an unresolved host-owned tool call, both hosts called `assertCompletedChatTurn` *before* `persistCompletedChat`, so the throw discarded everything — including the user's own message. Confirmed deterministically: 3 messages returned by `runChatTurn`, 0 persisted. Both hosts now persist first and assert second, so the rejection is still reported but the conversation survives.
- **Persisting naively would have been worse than the bug.** A rejected turn's message array ends with an assistant message whose `tool_calls` have no matching result — that is *why* it was rejected. Saving that orphan would make every later turn in the chat fail, because providers reject history where a tool call has no result for each `tool_call_id`. Added `selectPersistableMessages` in `core/agent-runtime.ts` to drop unresolved assistant calls and orphaned tool results while keeping user messages and completed exchanges. This was caught at the AR gate, before implementation.
- **The renderer now surfaces a failed turn.** `ChatComposer.submitContent` awaited the IPC promise with no `catch`, so a rejected turn became an unhandled rejection with nothing shown. `submitMessage` now logs a visible `Turn failed: …` entry, clears pending prompts, and reloads the persisted transcript so the surviving user message appears.
- **The `ask_user_input` flow has deterministic coverage.** `tests/unit/human-input-turn-flow.test.js` drives `runChatTurn` through the real `HumanInputSessionManager` and a fake renderer — the same composition Electron main wires up — covering request → answer → resume → final text, plus the rejected-turn variant.
- **The live Electron E2E now diagnoses itself.** It distinguishes model non-compliance from a product failure and says which occurred, instead of failing on a bare locator timeout or a downstream count.

## Verification

- `npm run check` — passes.
- `npm run test:unit` — **17 files / 176 tests pass**, up from 16 / 167.
- **Mutation-checked the fix.** Restoring the original assert-before-persist order fails the two new rejected-turn tests. They fail against the old behavior rather than merely passing against the new.
- `npm run electron:build` — passes.
- `zsh -ic 'npm run test:e2e'` — **4/4 pass** live.
- `zsh -ic 'npm run test:e2e:electron'` — **now passes**, where it previously failed on `main` and on the prior branch. Ran 4 times after the fix: 3 passed, 1 failed. The failure printed the new diagnostic and correctly identified a genuinely rejected turn (the model emitted a host-owned tool call the host does not handle), which is the residual model-compliance issue the REQ lists as a non-goal.
- Direct Playwright probe on the fixed code confirmed the persisted set is clean and provider-valid: `user`, `assistant(tool_calls=ask_user_input)`, matching `tool` result, final `assistant` text — no orphaned call.

## Notes

- **A deliberate prior assertion was reversed, intentionally.** `tests/unit/agent-cli.test.js` asserted `expect(messagesFile).toBe('')` — that a rejected turn persists *nothing* — from commit `4e143ff`. REQ requirement 1 explicitly changes that. The test was updated, not deleted: it still asserts the turn is rejected with the same error naming the tool, and now additionally asserts the user's message survives and no orphaned tool call is written. The intent of `4e143ff` (never record an unresolved turn as completed) is preserved; only the collateral data loss is gone. Flagging because it reverses an earlier maintainer decision.
- **Scope addition, called out deliberately:** the E2E carried two stale assertions unrelated to this story that kept it red regardless. `showToolMessages` has defaulted to `false` since commit `4f368f1`, and `groupMessagesForTranscript` hides tool messages when false — but the test expected tool cards visible *before* toggling and hidden after, exactly inverted. The `.aw-tool-title` selector was also stale; persisted tool messages render as `ToolTraceSection` with `.aw-tool-trace-title` since commit `9705a0c`. Both corrected. Test-only; no product behavior changed.
- **Known coverage limit:** the Electron IPC registration itself is still covered only by the live E2E. `runAgentTurn` and `executeRuntimeTurn` are not exported from `electron/main.ts`, and exporting them purely for a test would widen the module's public surface. The deterministic suite covers the composition they wire up, not the wiring.
- **Residual flakiness is expected and out of scope.** The fixture asks a live model to emit a specific tool call and a specific answer; `gemini-2.5-flash` complies most but not all of the time. Making it deterministic was an explicit non-goal. The suite now reports non-compliance clearly rather than failing confusingly.
- Rejected alternative, recorded in the plan: auto-recovering from an unresolved tool call by feeding a synthetic "unsupported tool" result back to the model. It would change turn semantics for every host, risk tool-call loops, and reverse a deliberate maintainer decision.
- Still-open review findings untouched: turn cancel/abort, secret redaction, renderer CSP, `events.jsonl` rotation, `messageId` persistence.
