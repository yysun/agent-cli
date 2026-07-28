# PLAN: code-review-fixes

- Story slug: `code-review-fixes`
- Created: `2026-07-27`
- REQ: `.docs/reqs/2026/07/27/req-code-review-fixes.md`

## Goal

Make the six reviewed defects impossible to hit: `ask` tool permission actually prompts in both surfaces, an unset history limit sends full history, `npm run check` fails on type errors, traversing chat ids are rejected before any filesystem access, an in-flight Electron turn cannot have its workspace swapped, and the runtime-turn IPC path cannot overwrite a stored chat with renderer-supplied history.

## Current Context

Runtime and gating:

- `core/agent-runtime.ts:634` — `onToolApproval` short-circuits to `{ approved: true }` when `approvalGate?.requestApproval` is not a function. `RunChatTurnParams.approvalGate` is already declared at `:114`.
- `core/agent-runtime.ts:338` — `RUNTIME_CONTROL_TOOL_NAMES` already identifies `final_answer` / `need_user_input` / `blocked`. `llm-runtime` invokes `onToolApproval` for executable tools; control tools terminate the loop instead.
- `cli/src/turn-executor.ts:181` — `executeTurn` accepts `approvalGate` and forwards it at `:270`, but `cli/src/agent-cli.ts:710` and `:611` never pass one.
- `cli/src/turn-executor.ts:457` — `handleToolCall` already intercepts human-input tools before default execution; approval must not double-prompt for those.
- `electron/main.ts:419` — `runChatTurn` is called with no `approvalGate`.
- `electron/renderer/src/constants/runtime-options.ts:10` — the composer offers Auto/Ask/Read; `useDesktopWorkspace.ts:105` hardcodes the initial value to `'auto'` and `submitMessage` sends it on every turn.

History limit:

- `cli/src/turn-executor.ts:199` — `Number(undefined) -> NaN` falls back to `0`.
- `core/agent-runtime.ts:496` — `selectContextMessages` returns `messages` for a non-integer/negative limit and `[]` for `0`. The "no limit" contract already exists; only the CLI's fallback is wrong.
- `electron/main.ts:387` — `resolveHistoryMessageLimit` already returns `undefined` when unset. This is the correct reference behavior.

Typecheck:

- `tsconfig.core.json` and `tsconfig.cli.json` both set `noCheck: true` with `noEmit: true`. `tsconfig.cli.json` also sets `rootDir: ./cli/src` while `cli/src` imports `../../core/*`.
- Known errors behind `noCheck` (captured with `npx tsc --project <p> --noCheck false`): `core/agent-config.ts(305,22)` TS2339 `webSearch`, `core/agent-runtime.ts(711,13)` TS2322 `LLMChatMessage[]`, `core/chat-store.ts(397,25)` TS2339 `setCurrent`, plus 5x TS6059 from the wrong `rootDir`.
- `package.json` `check` chains `build` plus `node --check` on the built bundle and each test file. Restoring real checking makes `build` the gate.

Chat storage:

- `core/paths.ts:63` — `buildWorldChatDirectoryPath` joins caller input with no containment check. Verified in a temp workspace: `deletePersistedChat('../../victim')` removed a directory outside the chats root.
- `core/chat-store.ts:36` — `createChatId` produces `{yyyymmdd}T{hhmmss}Z-{8 hex}`. Historical ids must stay loadable, so validation rejects traversal shapes rather than enforcing that format.
- Public entry points needing validation: `loadChatById` (`:332`), `setCurrentChat` (`:427`), `deletePersistedChat` (`:404`), `persistCompletedChat` (`:464`), and `readCurrentChatId` (`:245`, reads an id off disk that is then used as a path).

Electron global state:

- `core/paths.ts:43` — `configureWorkspaceRoot` reassigns module-level `export let` bindings; `core/workspace-environment.ts:148` mutates `process.env`. Every IPC handler calls `prepareElectronWorkspace` (`electron/main.ts:303`).
- `electron/main.ts:720` — all handlers are registered through `invokeWithWorkspace`, which is the single natural place to serialize them.
- `electron/renderer/src/hooks/useDesktopWorkspace.ts:233,255,273` — `selectWorkspace`, `createChat`, `selectChat` do not check `busy`; only `submitMessage` (`:294`) does.

Renderer turn IPC:

- `electron/main.ts:514` — `runAgentTurn` builds its chat from `request.messages` and `request.chatId ?? 'electron-default-chat'`, then `executeRuntimeTurn` persists over that chat.
- `useDesktopWorkspace.ts` never calls `runAgentTurn`; the app uses `sendChatMessage` / `editAndResendMessage`, both of which load from disk.

Human-input infrastructure to mirror for approvals:

- `electron/human-input-session.ts:81` — `HumanInputSessionManager` owns request-id assignment, renderer send, timeout, and answer resolution. Only `requestId` is structurally required, so it generalizes cleanly.
- `electron/preload.cts:254` — `onHumanInputRequest` / `submitHumanInputAnswer` is the established request/answer bridge pattern.
- `electron/renderer/src/features/chat/HumanInputPrompt.tsx` + `RendererWorkspace.tsx:136` — the established in-transcript prompt rendering pattern.

Known unknowns:

- Removing `noCheck` may surface additional errors once the three known ones are fixed. Phase 3 iterates until clean.
- Live E2E (`test:e2e`, `test:e2e:electron`) requires `GOOGLE_API_KEY`; availability in this environment is unconfirmed.

## Decisions

- **Deny-by-default for approvals.** Timeout, destroyed renderer, and missing interactive prompt all resolve to *denied* with a stated reason, never approved. A permission control that fails open is the bug being fixed.
- **Reuse `approvalGate`, do not change the runtime contract.** `core/agent-runtime.ts` already has the correct shape and an existing passing test. Both hosts supply a gate; core is untouched except where typechecking forces a type-only correction.
- **Generalize the existing session manager rather than duplicate it.** Extract a `PendingRequestSessionManager<TRequest, TAnswer>` from `HumanInputSessionManager` and build `ToolApprovalSessionManager` on it. Rejected: copy-pasting the 80-line class, which would let the two timeout/cleanup paths drift.
- **Serialize Electron IPC through one mutex in `invokeWithWorkspace`.** The root cause is that a process-global workspace root is mutated by concurrent handlers; a queue at the single registration point fixes every handler at once. Rejected: threading an explicit workspace context through every core function (large, touches all of `core`, out of proportion to the REQ) and per-handler locks (same bug, more places to forget). The renderer `busy` guards are a second, independent layer, not the fix.
- **`agent:runTurn` loads its chat from disk and ignores renderer-supplied `messages`.** Rejected: deleting the channel (it is a published preload API and removal is broader than the REQ) and validating the incoming history (no validation makes renderer-authored history a safe source of truth for an overwrite). The `messages` field is removed from the request type so the contract is honest.
- **Chat-id validation rejects traversal, not format.** `..` segments, path separators, absolute paths, and empty ids are rejected; anything else is allowed so pre-existing chats stay loadable per the REQ constraint.
- **Type-only fixes for the `noCheck` errors.** Runtime behavior must not change while restoring checking; if an error can only be resolved by changing logic, stop and report rather than silently altering behavior.
- **No new env vars, feature flags, fallback modes, or compatibility layers.** Every fix changes the single live path. Explicitly rejected: an `AGENT_CLI_APPROVAL=off` escape hatch, a `legacy-chat-id` bypass, and keeping `noCheck` behind an opt-in script.
- **Strictness is unchanged.** `strict` stays `false`; this story restores checking at current strictness only (REQ non-goal).

## Phased Tasks

### Phase 1 - Discovery and scope lock

Resolved during AR against `llm-runtime@0.6.6`; recorded here so SS does not repeat the investigation.

- [x] **Control tools bypass approval structurally.** `runtime.js:69` defines `AGENT_CONTROL_TOOL_NAME_SET` and control results are dispatched through `onFinalAnswerToolCall` / `onBlockedToolCall` / `onNeedUserInputToolCall` (`runtime.js:791,843`) before `onToolCallsResponse` ever runs. `onToolApproval` is only reachable from the tool loop at `runtime.js:898`. No control-tool filter is needed in either gate.
- [x] **`onToolApproval` runs before `onToolCall`.** `runtime.js:898` (approval) precedes `runtime.js:907` (host handler) in the same iteration, and `tool_start` is emitted at `runtime.js:891` before both. Ordering is therefore: verbose tool-call diagnostic, then approval prompt, then host handling. SS must not try to reorder this.
- [x] **Canonical `ask_user_input` never reaches approval.** `builtins.js:111` declares it with no `execute`, so `isKnownHostOwnedToolCall` (`runtime.js:252`) is true and `hasHostOwnedToolCall` (`runtime.js:871`) returns the whole batch to our host loop before the approval site. The three non-builtin aliases in `cli/src/human-input-ui.ts` (`ask_human_input`, `human_intervention_request`, `ask_user_question`) are *not* builtins and would reach approval, so an explicit exclusion is still required for correctness.
- [x] **`onToolApproval` is called regardless of `toolPermission`.** `runtime.js:898` has no permission check; the `executionContext.toolPermission !== 'ask'` guard in `core/agent-runtime.ts:635` is load-bearing and must be preserved exactly.
- [x] Record the full error list from `npx tsc --project ./tsconfig.core.json --noCheck false` and `npx tsc --project ./tsconfig.cli.json --noCheck false` as the Phase 3 work list.
- [x] Confirm `runAgentTurn` has no caller in `electron/renderer/src` or `tests/`, so changing its chat-loading behavior breaks no current consumer.
- [x] Record the non-goals from the REQ (abort control, redaction, CSP, log rotation, `messageId` persistence, `strict` mode) so no adjacent cleanup enters this change.

### Phase 2 - Chat-id containment (no dependencies)

- [x] Add `assertSafeChatId(chatId)` and `resolveChatDirectoryPath(chatId)` to `core/paths.ts` that reject empty/whitespace ids, ids containing `/` or `\`, ids with `.` or `..` segments, and any id whose resolved path escapes `AGENT_WORLD_CHATS_ROOT` (checked via `path.relative`).
- [x] Route `buildWorldChatDirectoryPath` in `core/paths.ts` through the validator so every derived metadata/messages/summary/events path inherits containment.
- [x] Apply validation at the `core/chat-store.ts` entry points `loadChatById`, `setCurrentChat`, `deletePersistedChat`, and `persistCompletedChat` so the error is raised before `fs` is touched.
- [x] Make `readCurrentChatId` in `core/chat-store.ts` discard an on-disk `current.json` id that fails validation, so a poisoned pointer file degrades to "create a new chat" instead of throwing on startup.
- [x] Add unit tests in `tests/unit/chat-store.test.js` covering `../` traversal, absolute paths, separator-bearing ids, and empty ids for each guarded entry point, plus a positive case proving a `createChatId`-shaped id still round-trips.
- [x] Add unit tests in `tests/unit/paths.test.js` asserting `buildWorldChatDirectoryPath` throws for traversal input and returns a contained path for a valid id.

### Phase 3 - Restore typechecking

- [x] Remove `"noCheck": true` from `tsconfig.core.json` and from `tsconfig.cli.json`.
- [x] Remove the incorrect `"rootDir": "./cli/src"` from `tsconfig.cli.json` (both projects are `noEmit`, so `rootDir` serves no purpose and forces TS6059 on `../../core` imports).
- [x] Fix `core/agent-config.ts:305` TS2339 by giving `normalizedConfig` a real TypeScript `AgentConfig` type instead of the JSDoc `@type` annotation TS ignores in `.ts` files.
- [x] Fix `core/agent-runtime.ts:711` TS2322 by typing the resumed `context.messages` to what `LLMToolExecutionContext` declares, without changing the values passed.
- [x] Fix `core/chat-store.ts:397` TS2339 by annotating the `createPersistedChat` options parameter with `{ setCurrent?: boolean }`.
- [x] Re-run both project typechecks and fix any newly surfaced errors with type-only changes; if any error cannot be resolved without altering runtime behavior, stop and report it instead of changing logic.
- [x] Verify `npm run build` fails when a deliberate type error is introduced into `core/`, then revert the probe.
- [x] **Added during SS:** `electron/tsconfig.json` includes only `./preload.cts`, so `electron/main.ts` and its helpers were never typechecked either — the same defect as the `noCheck` finding, and this story adds substantial new code there. Add `electron/tsconfig.main.json` (`noEmit`) covering the main-process sources and run it from `electron:main:build` before esbuild, mirroring the `build:cli` tsc-then-esbuild pattern. Kept separate from `electron/tsconfig.json` because that project emits `preload.cjs`; adding main to it would emit a second, conflicting `main.js`.

### Phase 4 - CLI approval gate and history fallback

- [x] Fix `cli/src/turn-executor.ts:199` so an unset/invalid `pastMessages` yields `undefined` (full history) while an explicit `0` still yields `0`, and confirm the value flows to `runChatTurn` unchanged.
- [x] Create `cli/src/tool-approval-ui.ts` exporting `formatToolApprovalPrompt(request)` and `createCliApprovalGate({ prompt, output })`, where the gate renders tool name and bounded arguments, accepts approve/deny, and returns `{ approved: false, reason }` when no prompt is available.
- [x] Reuse the bounded-argument summarizer from `cli/src/tool-trace-renderer.ts` for the prompt body so approval output cannot dump an unbounded payload into the terminal.
- [x] Wire `cli/src/turn-executor.ts` to construct the CLI gate from `inputPrompt` when the caller supplies no `approvalGate`, and pass it to `runChatTurn`.
- [x] Ensure the approval prompt clears the pending-dots animation via `pendingDisplay.clear()` and restores it afterward, matching the existing `handleToolCall` human-input sequence.
- [x] Have the CLI gate return `{ approved: true }` without prompting for any name matching `isHumanInputToolName` from `cli/src/human-input-ui.ts`, so the non-builtin human-input aliases cannot produce an approval prompt followed by a human-input prompt.
- [x] Add unit tests in `tests/unit/turn-executor` coverage (new file or existing suite) for: unset `pastMessages` sends full history, `0` sends none, `N` sends the last `N`, approval approves, approval denies with reason, and no-prompt denies without hanging.

### Phase 5 - Electron approval gate

- [x] Extract a generic `PendingRequestSessionManager<TRequest, TAnswer>` in `electron/pending-request-session.ts` (or in place in `electron/human-input-session.ts`) carrying the request-id assignment, send, timeout, and resolve logic currently in `HumanInputSessionManager`.
- [x] Re-express `HumanInputSessionManager` on top of the generic manager with no behavior change, keeping `tests/unit/electron-human-input-session.test.js` passing unmodified.
- [x] Add `ToolApprovalSessionManager` with a deny-shaped unavailable/timeout answer, and add `TOOL_APPROVAL_REQUEST_CHANNEL` / `TOOL_APPROVAL_ANSWER_CHANNEL` constants to `electron/main.ts`.
- [x] Pass an `approvalGate` into `runChatTurn` from `electron/main.ts:executeRuntimeTurn` that routes requests through `ToolApprovalSessionManager` to `params.rendererWebContents`, denying when the renderer is absent or destroyed.
- [x] Have the Electron gate return `{ approved: true }` without prompting for any name matching `isHumanInputToolName`, matching the CLI gate, since `electron/main.ts:handleToolCall` already owns those tools.
- [x] Register the approval answer handler directly with `ipcMain.handle` in `registerIpcHandlers`, alongside `HUMAN_INPUT_ANSWER_CHANNEL` at `electron/main.ts:731` and **not** through `registerAgentIpcHandlers`. The answer channel must stay off the Phase 6 serial queue or every approval deadlocks against the turn holding the queue.
- [x] Expose `onToolApprovalRequest` and `submitToolApprovalAnswer` in `electron/preload.cts`, with request/answer types mirroring the human-input types.
- [x] Mirror the new bridge types into `electron/renderer/src/types/desktop-api.ts`.
- [x] Add `pendingToolApprovalRequest` state, an `onToolApprovalRequest` subscription, and a `submitToolApprovalAnswer` action to `electron/renderer/src/hooks/useDesktopWorkspace.ts`, clearing the pending request after each completed send/edit exactly as the human-input state does.
- [x] Create `electron/renderer/src/features/chat/ToolApprovalPrompt.tsx` rendering tool name, bounded arguments, and Approve/Deny actions, and render it in `electron/renderer/src/app/RendererWorkspace.tsx` next to `HumanInputPrompt`.
- [x] Add unit tests in `tests/unit/electron-tool-approval-session.test.js` for approve, deny, unknown request id, duplicate request id, destroyed renderer, and timeout-denies.

### Phase 6 - Electron workspace-switch safety and turn IPC

- [x] Add a serial operation queue in `electron/main.ts` and run every handler registered through `invokeWithWorkspace` on it, so no two IPC handlers mutate the global workspace root concurrently.
- [x] Capture the resolved workspace root once at the start of `executeRuntimeTurn` and use that captured value for the persisted result instead of re-reading the module-level `WORKSPACE_ROOT` after the turn.
- [x] Change `runAgentTurn` in `electron/main.ts` to load its chat from storage (matching `sendChatMessage`) and stop building a chat from `request.messages`; remove the `'electron-default-chat'` literal fallback.
- [x] Remove `messages` from `AgentTurnRequest` in `electron/main.ts`, from `AgentCliDesktopRunTurnRequest` in `electron/preload.cts`, and from the mirrored renderer type, so the contract no longer advertises renderer-supplied history.
- [x] Delete `normalizeChatMessages` usage that becomes dead after the change, or keep only the call sites that normalize disk-loaded messages.
- [x] Guard `selectWorkspace`, `createChat`, and `selectChat` in `electron/renderer/src/hooks/useDesktopWorkspace.ts` with the existing `busy` check used by `submitMessage`.
- [x] Add `toolPermission` and `reasoningEffort` to the `runtimeSummary` returned by `loadWorkspaceMetadata` in `electron/main.ts`, sourced from `loadPersistedRuntimeConfig()`.
- [x] Initialize the renderer `toolPermission` and `reasoningEffort` state from `runtimeSummary` in `applyWorkspaceMetadata` so the workspace `.env` setting is no longer overridden by a hardcoded `auto`.
- [x] Add unit tests for the serial queue behavior (`tests/unit/electron-workspace-queue.test.js`).
- [ ] **Not done:** a dedicated unit test for `runAgentTurn` rejecting renderer-supplied history. `runAgentTurn` is not exported from `electron/main.ts`, and exporting it purely for a test would widen the module's public surface. The behavior is instead enforced structurally: `messages` was removed from `AgentTurnRequest` and `AgentCliDesktopRunTurnRequest`, so no caller can supply it and the handler reads history from storage. Recorded as a follow-up.

### Phase 7 - Verification and documentation

- [x] Run `npm run check` and record the result.
- [x] Run `npm run test:unit` and record pass counts before and after.
- [x] Run `npm run electron:build` and record the result.
- [x] Attempt `npm run test:e2e` and `npm run test:e2e:electron`; if `GOOGLE_API_KEY` is unavailable, record them as blocked rather than claiming they passed.
- [x] Update `README.md` so the tool-permission section states that `ask` prompts before each tool call and that an unset `AGENT_CLI_PAST_MESSAGES` means full history.
- [x] Update the file header comment blocks of every edited source file with the new behavior.
- [x] Mark completed plan tasks `- [x]` only after the corresponding change or evidence exists.

## Validation

Commands the agent must run and report verbatim:

- `npm run check` — must exit 0. Must exit non-zero when a deliberate type error is present (probe, then revert).
- `npm run test:unit` — all suites pass; baseline is 13 files / 130 tests, and the count must increase with the new tests.
- `npm run electron:build` — main bundle, renderer typecheck, and renderer build all succeed.
- `npm run test:e2e` and `npm run test:e2e:electron` — live-LLM suites requiring `GOOGLE_API_KEY`. Report blocked if the key is absent; do not report as passed.

Behavioral evidence to capture:

- A CLI turn with `--tool-permission ask` prints an approval prompt and blocks on it; denial yields a denial reason to the runtime and no tool execution. Assert by mocking `streamComplete` and capturing the `onToolApproval` callback, following the existing pattern at `tests/unit/agent-runtime.test.js:1016`, then invoking it and checking the returned `{ approved, reason }`.
- With `AGENT_CLI_PAST_MESSAGES` unset, the message array handed to the runtime contains every persisted message. Assert against the `messages` field of the captured `streamComplete` options, as `tests/unit/agent-runtime.test.js:267` already does for an explicit limit.
- The approval gate returns `{ approved: true }` without consulting the prompt when `toolPermission` is not `ask`, and when the tool name is a human-input name.
- `deletePersistedChat('../../victim')` throws before any `fs` call, and the sibling directory survives. Assert the directory still exists after the rejected call.
- Electron: two overlapping IPC calls are observed to run serially rather than interleaved. Assert by resolving the first handler only after the second has been dispatched, and checking the recorded start/end order.

## Rollback / Risk

- **Highest risk: the Electron approval prompt is new UI on the critical send path.** A bug here can hang every turn instead of only gated ones. Mitigation: the gate only engages when permission resolves to `ask`; deny-by-default on timeout (bounded, reusing the existing 30-minute human-input constant) and on a destroyed renderer; unit tests cover both failure paths.
- **Serializing IPC could deadlock if a queued handler awaits another IPC call.** A running turn holds the queue while awaiting a renderer answer, so the human-input and tool-approval answer channels must resolve off the queue. This is already structurally true: `HUMAN_INPUT_ANSWER_CHANNEL` is registered directly with `ipcMain.handle` at `electron/main.ts:731` rather than through `registerAgentIpcHandlers`, and Phase 5 registers the approval answer channel the same way. Mitigation: verify during Phase 6 that no handler routed through `invokeWithWorkspace` awaits another IPC round trip, and add a unit test proving an answer resolves while a queued operation is in flight. This exclusion is load-bearing — putting either answer handler on the queue would deadlock every approval.
- **Removing `noCheck` may surface more errors than the three known ones**, expanding Phase 3. Mitigation: type-only fixes; stop and report if behavior would have to change.
- **Chat-id validation could reject a legitimate pre-existing id.** Mitigation: reject traversal shapes only, never enforce the `createChatId` format; the positive round-trip test guards this.
- **Behavior change for existing users:** the CLI now sends full history by default, which increases token usage for anyone relying on the accidental truncation. This is the documented intent of the REQ; `README.md` is updated to state it.
- Rollback: each phase is an independent commit-sized unit. Phases 2, 3, 4, 5, and 6 can be reverted individually; only Phase 5's renderer wiring depends on Phase 5's main-process changes.
