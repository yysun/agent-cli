# DONE: code-review-fixes

- Story slug: `code-review-fixes`
- Completed: `2026-07-27`
- REQ: `.docs/reqs/2026/07/27/req-code-review-fixes.md`
- AP: `.docs/plans/2026/07/27/plan-code-review-fixes.md`
- E2E spec: `.docs/tests/test-code-review-fixes.md`

## Summary

- **`tool-permission: ask` now actually prompts.** No caller had ever supplied an `approvalGate`, so `onToolApproval` returned `{ approved: true }` unconditionally and every tool call — including writes and shell — auto-approved in both surfaces. Added `cli/src/tool-approval-ui.ts` (terminal prompt) and `electron/tool-approval-session.ts` + `ToolApprovalPrompt.tsx` (in-chat approval card), wired into `cli/src/turn-executor.ts` and `electron/main.ts`.
- **Approvals deny by default.** A missing interactive prompt, a destroyed renderer, a failed send, and a timeout all resolve to *denied* with a reason. A permission control that fails open was the defect being fixed.
- **The CLI no longer drops conversation history.** `Number(undefined) -> NaN` fell through to `0`, and `selectContextMessages` treats `0` as "send nothing", so interactive mode was memoryless unless `AGENT_CLI_PAST_MESSAGES` was set. An unset limit now means full history; explicit `0` still means none.
- **Typechecking is restored.** `noCheck: true` in `tsconfig.core.json` and `tsconfig.cli.json` had made `npm run build` and `npm run check` no-ops for type safety. Removed it, dropped the wrong `rootDir` from the CLI project, and fixed the six real type errors it had been hiding — all type-only, no behavior change.
- **Chat ids can no longer escape the chats root.** `assertSafeChatId` in `core/paths.ts` rejects separators, `..`/`.` segments, absolute paths, NUL, and empty ids, with a `path.relative` containment check behind it. Applied at `loadChatById`, `setCurrentChat`, `deletePersistedChat`, and `persistCompletedChat`; a poisoned `current.json` now degrades to a fresh chat instead of throwing.
- **An in-flight Electron turn can no longer have its workspace swapped.** Workspace root and credentials are process-global, so all workspace-touching IPC handlers now run on a serial queue, the turn captures its root at start, and the renderer blocks workspace/chat switching while busy.
- **`agent:runTurn` no longer accepts renderer-supplied history.** It loaded a caller-provided transcript and wrote it over `messages.jsonl`; it now reads from storage like `chat:sendMessage`, and `messages` was removed from the request contract so no caller can supply it.
- **The Electron tool-permission control initializes from workspace config** instead of forcing a hardcoded `auto` over `.env` on every turn.

## Verification

- `npm run check` — passes. Verified it is a real gate: injecting a deliberate type error into `core/` makes it exit `2`; reverting returns it to `0`.
- `npm run test:unit` — 16 files / 167 tests pass, up from 13 / 130. New: `turn-executor.test.js` (10), `electron-tool-approval-session.test.js` (11), `electron-workspace-queue.test.js` (3), plus chat-id cases added to `paths.test.js` and `chat-store.test.js`.
- **Mutation-checked the two headline tests.** Reverting the history fallback fails 1 test; reverting the approval-gate wiring fails 5. The tests fail against the original bugs rather than merely passing against the fix.
- `npm run electron:build` — passes, including the newly added `electron/tsconfig.main.json` check.
- Re-ran the original exploit probe: `deletePersistedChat('../../victim')` now throws `Invalid chat ID: ../../victim` before any `fs` call, and the sibling directory and its contents survive.
- Resolved the plan's central unknown by reading `llm-runtime@0.6.6` source: control tools are dispatched before the approval site (`runtime.js:791,843`), `onToolApproval` runs before `onToolCall` (`:898` vs `:907`), and `onToolApproval` is called regardless of `toolPermission` — so the `!== 'ask'` guard in `core/agent-runtime.ts` is load-bearing.
- `npm run test:e2e` (live Gemini) — **4/4 pass** on this branch.
- `npm run test:e2e:electron` (live Gemini) — **fails, but fails identically on `main` (9705a0c) at the same assertion**, so it is pre-existing and not a regression from this change. See Notes.

## Notes

- **Electron E2E is failing on `main` as well, and is additionally flaky.** `tests/e2e/electron-ask-user-input.e2e.test.js` fails at `:151` (`expected 0 to be greater than 0` — no non-empty assistant message persisted after the `ask_user_input` answer) on both `main` and this branch, so this change did not cause it. Separately, the earlier step is nondeterministic: across runs on identical code the `.aw-human-input` prompt rendered in ~5s once and never appeared within 90s another time, because the live `gemini-2.5-flash` model does not reliably emit the `ask_user_input` call the fixture prompt asks for. A direct Playwright probe confirmed the renderer itself is healthy on this branch — the prompt renders, `#tool-permission-select` correctly reads `auto`, the busy label transitions `Sending message` → `Waiting for input`, and there are no page errors. Worth a separate story: both the flaky model dependence and the missing post-answer assistant message.
- **Note on running live E2E locally:** `GOOGLE_API_KEY` is exported from `~/.zshrc`, which only interactive shells source. Non-interactive tool shells do not see it, so the suites must be run through an interactive shell (`zsh -ic 'npm run test:e2e'`) or the key moved to `~/.zshenv`.
- Electron logged its built-in warning that the renderer has **no Content-Security-Policy** — review finding 10, recorded below as a non-goal for this story.

- **Scope extension, called out deliberately:** `electron/tsconfig.json` included only `./preload.cts`, so `electron/main.ts` and its helpers were never typechecked either — the same defect class as the `noCheck` finding, in a file this story adds ~60 lines to. Added `electron/tsconfig.main.json` (`noEmit`) and ran it from `electron:main:build`. Kept as a separate project because `electron/tsconfig.json` emits `preload.cjs` and adding main there would emit a conflicting `main.js`.
- **One planned test was not written:** a dedicated unit test for `runAgentTurn` rejecting renderer-supplied history. `runAgentTurn` is not exported from `electron/main.ts`, and exporting it purely for a test would widen the module's public surface. The behavior is enforced structurally instead (field removed from both request types, history read from storage). Worth revisiting if `electron/main.ts` ever grows a testable seam.
- **Two acceptance criteria rest on code inspection rather than an automated test** — the renderer's busy guards and the tool-permission control initialization. The repo has no React component test infrastructure, and adding it was an explicit REQ non-goal. Both are covered by live scenarios in the E2E spec, which are blocked on the missing API key.
- **Behavior change for existing users:** the CLI now sends the full conversation by default, which increases token usage for anyone who was unknowingly relying on the accidental truncation. `README.md` documents the new default.
- Untouched review findings, all recorded as REQ non-goals: turn cancel/abort, secret redaction in trace output and `events.jsonl`, renderer CSP, `events.jsonl` rotation and chat write locking, `assertCompletedChatTurn` discarding a turn's transcript, and the dead `messageId` lookup in `editAndResendMessage`.
- `strict` mode remains `false`. This story restored checking at the existing strictness only; enabling `strict` would be a separate, larger story.
