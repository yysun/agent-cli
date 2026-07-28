# REQ: code-review-fixes

- Story slug: `code-review-fixes`
- Created: `2026-07-27`
- Status: Complete

## Problem

An in-depth review of the repository found six defects in which documented, user-selectable behavior is silently absent or unsafe. Four of them are invisible at runtime: the user selects an option, sees no error, and gets the opposite behavior.

1. **`tool-permission: ask` never prompts.** `core/agent-runtime.ts` only calls the approval gate when a caller supplies `approvalGate`. Neither `cli/src/agent-cli.ts` nor `electron/main.ts` supplies one, so `onToolApproval` returns `{ approved: true }` unconditionally. `--tool-permission ask`, `AGENT_CLI_TOOL_PERMISSION=ask`, and the Electron composer's "Ask" option all auto-approve every tool call, including writes and shell commands.
2. **The CLI sends no conversation history by default.** `cli/src/turn-executor.ts` computes `Number(undefined) -> NaN` and falls back to `0`, and `selectContextMessages` treats `0` as "send no prior messages". Unless `AGENT_CLI_PAST_MESSAGES` is set, interactive mode is memoryless.
3. **The typecheck steps check nothing.** `tsconfig.core.json` and `tsconfig.cli.json` set `noCheck: true`, which suppresses all type errors, so `npm run build` and `npm run check` are no-ops for type safety. Three real type errors and a wrong `rootDir` are currently hidden.
4. **`chatId` is used unvalidated as a filesystem path.** `buildWorldChatDirectoryPath` joins caller input onto the chats root with no containment check, so a traversing id reads or removes paths outside `.agent-world/chats`.
5. **Workspace root is global mutable state with no in-flight guard.** Every Electron IPC handler reassigns the module-level path bindings and mutates `process.env`. The renderer does not block workspace or chat switching while a turn is running, so an in-flight turn can have its root and credentials swapped underneath it.
6. **`agent:runTurn` lets the renderer overwrite persisted chats.** The handler accepts renderer-supplied `messages` as the chat history and writes the result over `messages.jsonl`, so a call naming an existing chat destroys that chat's history.

## Requirement

Each of the six defects must be corrected so that the behavior the user selects is the behavior that runs, and so the build fails when the code stops typechecking.

1. When tool permission resolves to `ask`, every non-control tool call must be presented to the user for approval before it executes, in both the CLI and the Electron app. A denial must prevent execution and report the denial reason to the model.
2. When no history limit is configured, a chat turn must send the full persisted conversation history. An explicit limit of `0` must continue to mean "send no prior messages".
3. `npm run build` and `npm run check` must fail on TypeScript type errors in `core/` and `cli/src/`.
4. A chat id that resolves outside the workspace chats root must be rejected with a clear error before any filesystem read, write, or removal.
5. A workspace or chat switch must not change the workspace root, credentials, or storage paths that an in-flight chat turn is using.
6. The Electron runtime-turn IPC path must not overwrite a persisted chat with renderer-supplied history.

## Acceptance Criteria

- [x] With tool permission `ask`, a CLI turn requesting a non-control tool prompts on the terminal and does not execute the tool until the user answers.
- [x] A CLI approval denial results in the tool not executing and the denial reason reaching the runtime.
- [x] With tool permission `ask`, an Electron turn requesting a non-control tool surfaces an approval prompt in the renderer and does not execute the tool until the user answers.
- [x] An Electron approval denial results in the tool not executing and the denial reason reaching the runtime.
- [x] Control tools (`final_answer`, `need_user_input`, `blocked`) and host-handled human-input tools are never gated by the approval prompt.
- [x] With `AGENT_CLI_PAST_MESSAGES` unset and no `--past-messages` flag, a CLI turn sends every persisted message in the chat to the runtime.
- [x] With `AGENT_CLI_PAST_MESSAGES=0` or `--past-messages 0`, a CLI turn sends no prior messages.
- [x] With `AGENT_CLI_PAST_MESSAGES=N` for `N > 0`, a CLI turn sends the last `N` persisted messages.
- [x] `npm run check` fails when a type error is introduced into `core/` or `cli/src/`, and passes on the corrected tree.
- [x] `noCheck` is absent from `tsconfig.core.json` and `tsconfig.cli.json`, and both projects typecheck clean.
- [x] `loadChatById`, `setCurrentChat`, `deletePersistedChat`, and `persistCompletedChat` reject a chat id that resolves outside the chats root, before touching the filesystem.
- [x] Rejected chat ids include ids containing path separators, `..` segments, absolute paths, and empty or whitespace-only strings.
- [x] The Electron renderer prevents workspace selection, chat creation, and chat selection while a turn is in flight.
- [x] Concurrent Electron IPC operations run serially, so a workspace switch dispatched during a turn is queued behind it and the turn persists to the workspace root it started with.
- [x] The human-input and tool-approval answer channels still resolve while a queued operation holds the serial queue.
- [x] The `agent:runTurn` IPC path no longer persists renderer-supplied message history over an existing chat's stored messages.
- [x] The Electron tool-permission control initializes from the workspace runtime configuration rather than a hardcoded `auto`.
- [x] `npm run check`, `npm run test:unit`, and `npm run electron:build` pass on the final tree.

## Constraints

- Storage layout stays `.agent-world/chats/{chatId}/` exactly as documented in `AGENTS.md`; chat-id validation must not change the id format produced by `createChatId`.
- Existing persisted chats created by prior versions must remain loadable. Validation rejects traversal, not historical ids.
- Approval prompts must not deadlock a non-interactive CLI run. When no interactive prompt is available and permission is `ask`, the turn must fail or deny explicitly rather than hang.
- The Electron approval prompt reuses the existing renderer request/answer IPC pattern; it must not require `nodeIntegration` or relax `contextIsolation` or `sandbox`.
- Fixing the `noCheck` type errors must not change runtime behavior. Type-only corrections are preferred over logic changes.
- CLI flag precedence stays `CLI flags > .env AGENT_CLI_* defaults`.
- Keep local ESM imports using `.js` extensions per `AGENTS.md`.

## Non-Goals

- Adding a cancel/abort control for an in-flight turn (review finding 7).
- Redacting secrets from verbose trace output or `events.jsonl` (finding 9).
- Adding a Content-Security-Policy to the renderer document (finding 10).
- Rotating `events.jsonl` or adding write locking to chat persistence (finding 11).
- Changing whether `assertCompletedChatTurn` discards a turn's transcript (finding 12).
- Persisting a stable per-message `id` to make `editAndResendMessage`'s `messageId` lookup functional (finding 13).
- De-duplicating `buildSkillSelectionKey` across the three copies, removing the committed `bin/agent-cli.js`, removing per-file header changelogs, or adding renderer component tests.
- Enabling `strict` mode in the TypeScript configs. This story restores checking at the current strictness only.
- Adding a persistent approval allowlist, per-tool permission rules, or "remember this choice" behavior.
