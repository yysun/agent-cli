# Plan: Upgrade llm-runtime to 0.7

## Goal

Make `llm-runtime` 0.7.0 the installed contract and ensure the shared adapter, CLI,
and Electron app treat approval and human-input cancellation as explicit terminal
outcomes while preserving provider-valid chat history.

## Current Context

- `package.json` pins `llm-runtime` 0.6.6. The sibling development package and
  current `node_modules/llm-runtime` link expose 0.7.0, while `package-lock.json`
  still records the linked package as 0.6.6.
- `core/agent-runtime.ts` returns legacy `{ approved: boolean, reason? }` objects to
  `onToolApproval`, handles only completed/tool-calls/failed results, and requires a
  non-empty final answer for every non-pending turn.
- `cli/src/tool-approval-ui.ts` and `electron/tool-approval-session.ts` expose
  boolean approval decisions. Electron timeout and unavailable-renderer fallbacks
  currently have only message strings, not typed cancel reasons.
- `cli/src/human-input-ui.ts` accepts legacy `allowFreeformInput`, emits a custom
  selection artifact, and represents skip/unavailable separately from cancellation.
  `core/agent-runtime.ts` serializes that artifact directly as a tool result and
  always resumes the model.
- `electron/main.ts` and `cli/src/turn-executor.ts` persist sanitized turn messages,
  then assume success requires assistant text. The renderer response has no turn
  status or cancellation metadata.
- `llm-runtime` 0.7.0 exports `normalizeAskUserInputOutcome`,
  `createAskUserInputResult`, explicit approval decision types, a `cancelled`
  completion status/event, and cancellation metadata.
- `tests/unit/agent-runtime.test.js`, `turn-executor.test.js`,
  `electron-tool-approval-session.test.js`, `electron-human-input-*`,
  `human-input-turn-flow.test.js`, and `agent-cli.test.js` cover the affected
  seams. `tests/e2e/electron-ask-user-input.e2e.test.js` is live-model dependent
  and must not be the only migration evidence.

## Decisions

- Use the 0.7 decision union end-to-end at host approval boundaries:
  `{ decision: "approve" }` or
  `{ decision: "cancel", reason, message? }`. Do not retain a boolean adapter at
  the runtime boundary.
- Keep approval rendering and timeout ownership in the CLI/Electron layers. Core
  passes exact runtime decisions through and handles the runtime's terminal
  cancellation result.
- Return one exact discriminated host turn union from `runChatTurn`:
  - `{ status: "completed", assistantText: string, messages }`
  - `{ status: "tool_calls", assistantText: string, messages, toolCalls }`
  - `{ status: "cancelled", assistantText: "", messages, cancellation }`
  `cancellation` is a host union:
  - the 0.7 `RuntimeToolApprovalCancellation` unchanged for
    `kind: "tool_approval"`; or
  - `{ kind: "human_input", reason, toolCallId, toolName, message? }`, where
    `reason` preserves the 0.7 `AskUserInputCancellationReason`.
  Callers persist sanitized messages before presenting the outcome.
- Expose the same `status`, `assistantText`, and optional `cancellation` union in the
  Electron IPC response. The renderer branches on `status`, reloads messages for
  cancellation, and logs a cancellation label derived from `cancellation.kind` and
  `reason`; it does not route the outcome through the rejection handler.
- Keep Electron IPC request IDs as transport metadata, but make the submitted
  decision/outcome explicit. Strip transport-only data before runtime validation.
- Replace `allowFreeformInput` with the 0.7 `allowOther` contract. Free-form input is
  valid only for single-select questions that opt in.
- Parse only the exact `ask_user_input` tool and strict 0.7 nested question/option
  shape before rendering. Do not invent IDs, accept flat payloads or string options,
  accept fewer than two unique declared options, coerce invalid selection types, or
  retain legacy human-input aliases. A malformed request becomes a host
  `kind: "human_input", reason: "invalid"` cancellation before either UI opens.
- Convert UI input to the canonical raw answered/cancelled outcome, validate it with
  `normalizeAskUserInputOutcome`, create answered tool messages with
  `createAskUserInputResult`, and never resume the model for a cancelled outcome.
- Keep the generic `RuntimeToolCallHandler` transport, but tighten its result to
  `{ handled: false } | { handled: true, result: unknown }`. For the exact
  `ask_user_input` name, `result` must be an `AskUserInputRawResponse`. In
  `core/agent-runtime.ts`'s pending-tool branch, build `PendingHumanInput` from the
  exact tool call and parsed request, then:
  1. treat an unhandled/malformed request as `reason: "invalid"`;
  2. normalize a handled raw response with `normalizeAskUserInputOutcome`;
  3. return a host human-input cancellation immediately for a cancelled outcome,
     without appending a tool result or entering another completion pass; or
  4. append `createAskUserInputResult(...)` only for an answered outcome and resume.
  Non-human host-owned tools retain the existing generic serialization path.
- Treat unavailable CLI input and destroyed/failed Electron renderers as dismissed,
  and host timer expiry as timeout. A user pressing Deny is rejected; Cancel is
  dismissed; Skip is skipped.
- Reuse current UI structure and pending-session plumbing. Reject approval
  allowlists, new environment variables, compatibility flags, runtime-owned timers,
  and broad renderer redesign.

## Phased Tasks

### Phase 1 - Lock the dependency and public host contracts

- [x] Update `package.json` and `package-lock.json` so the root dependency and linked
  package record both identify `llm-runtime` 0.7.0.
- [x] Import the 0.7 approval, cancellation, and human-input types/helpers in
  `core/agent-runtime.ts` and define discriminated host turn outcomes that do not
  require assistant text after cancellation.
- [x] Define and export the exact completed/tool-calls/cancelled result union and
  tool-approval/human-input cancellation union in `core/agent-runtime.ts`, then
  mirror its serializable fields in Electron main/preload/renderer API types.
- [x] Update `cli/src/tool-approval-ui.ts` and the `ApprovalGate` boundary in
  `cli/src/turn-executor.ts` to return exact approve/cancel decisions.
- [x] Update `electron/tool-approval-session.ts`, renderer desktop API types, and
  `ToolApprovalPrompt.tsx` so rejected, dismissed, and timed-out states retain an
  explicit cancellation reason.

### Phase 2 - Migrate runtime cancellation behavior

- [x] Update buffered and streamed branches in `core/agent-runtime.ts` to capture the
  runtime `cancelled` result/event, keep its metadata, avoid a retry, and return a
  cancelled host turn without requiring final text.
- [x] Preserve `approval_invalid` and `approval_callback_error` metadata from both
  buffered and streamed runtime outcomes and prove neither path enters the host
  resume loop or becomes an ordinary thrown failure.
- [x] Ensure `core/agent-runtime.ts` does not append a final assistant message for a
  cancelled approval and leaves callers enough messages to sanitize the orphaned
  tool call.
- [x] Update `cli/src/turn-executor.ts` so cancellation persists sanitized history,
  clears pending output, and returns without a fabricated answer or ordinary failure.
- [x] Update `electron/main.ts`, renderer response types, and
  `useDesktopWorkspace.ts` so cancellation is returned, reloaded, and logged as
  cancellation rather than successful completion or failure.
- [x] Add a side-effect-free response serializer in `electron/turn-outcome.ts` that copies
  `status`, empty/non-empty `assistantText`, and the exact optional cancellation
  union into IPC responses. Add
  `electron/renderer/src/features/chat/turn-outcome.ts` to return the renderer log
  message and `reloadTranscript` decision; make `useDesktopWorkspace.ts` use it so
  cancelled responses reload history and skip both success and rejection handling.

### Phase 3 - Adopt the 0.7 human-input contract

- [x] Update `cli/src/human-input-ui.ts` request parsing and selection output to use
  per-question `allowOther` and canonical answered/cancelled outcomes.
- [x] Make `cli/src/human-input-ui.ts` reject malformed 0.7 requests and legacy
  aliases before rendering; return enough parse detail for core to convert an
  invalid request into a human-input cancellation instead of an unresolved tool.
- [x] Update Electron human-input session and renderer types/helpers/components so
  submitted answers contain exact question-to-option/free-form values and explicit
  skipped/dismissed/timeout cancellation.
- [x] Use `normalizeAskUserInputOutcome` in `core/agent-runtime.ts` before resuming
  host-owned input calls, use `createAskUserInputResult` for answered outcomes, and
  terminate the host turn for cancelled or invalid outcomes.
- [x] Branch inside `core/agent-runtime.ts`'s pending host-owned tool handler before
  its generic `serializeToolResult` path, using the exact
  `{ handled: false } | { handled: true, result }` contract documented above.
- [x] Update the live Electron E2E fixture and relevant docs from
  `allowFreeformInput` to `allowOther` without adding a legacy compatibility mode.

### Phase 4 - Focused regression coverage

- [x] Update `tests/unit/agent-runtime.test.js` for explicit approval mapping,
  buffered/streamed approval cancellation, no final-text requirement, canonical
  human-input resume, cancelled input with no second completion call, and preserved
  `approval_invalid` / `approval_callback_error` reasons.
- [x] Update `tests/unit/turn-executor.test.js` and
  `tests/unit/electron-tool-approval-session.test.js` for exact approve/rejected/
  dismissed/timeout decisions and clean shell cancellation.
- [x] Update `tests/unit/electron-human-input-selection.test.js`,
  `electron-human-input-session.test.js`, `human-input-turn-flow.test.js`, and nearby
  CLI tests for `allowOther`, canonical answers, strict request validation, and
  cancellation.
- [x] Update `tests/unit/agent-cli.test.js` for terminal prompt/result behavior and
  add focused renderer outcome-log coverage so Electron cancellation cannot be
  reported as successful send or ordinary failure.
- [x] Add `tests/unit/electron-turn-outcome.test.js` covering the exported main
  response serializer and renderer outcome helper for approval rejection,
  `approval_invalid`, `approval_callback_error`, and human-input cancellation;
  assert every cancelled case requests transcript reload and produces a cancellation
  log instead of success/failure.
- [x] Add a strict shared-parser matrix in `tests/unit/human-input-turn-flow.test.js`
  covering both host compositions through their shared
  `parseHumanInputRequest`: missing/duplicate question IDs, invalid selection type,
  fewer than two options, duplicate/missing option IDs, string options, flat legacy
  payload, legacy tool alias, and undeclared free-form answers. Assert invalid
  requests are never sent to the CLI prompt or Electron renderer.
- [x] Run focused affected unit files and record the exact pass/fail evidence before
  broader verification.

### Phase 5 - Build, documentation, and complete verification

- [x] Update `README.md` so approval denial is terminal, batch approval happens
  before execution, and `ask_user_input` cancellation does not resume the model.
- [x] Run `npm run check`, `npm run test:unit`, and `npm run electron:build`; fix
  migration-caused failures without weakening tests.
- [x] Attempt `npm run test:e2e` and `npm run test:e2e:electron` only when
  `GOOGLE_API_KEY` is available and the external data boundary is authorized.
  Otherwise record the blocker for both live suites and execute every deterministic
  command mapped in `.docs/tests/test-upgrade-llm-runtime-0-7.md`.
- [x] Confirm no edited runtime boundary still returns `{ approved: boolean }`, no
  current request/example uses `allowFreeformInput`, and no cancelled host flow
  fabricates a tool result or assistant answer.
- [x] Record verification and review evidence, mark completed plan tasks only after
  evidence exists, and update the requirement checkboxes during VR.

## Validation

- Focused tests:
  `npx vitest run tests/unit/agent-runtime.test.js tests/unit/turn-executor.test.js tests/unit/agent-cli.test.js tests/unit/electron-tool-approval-session.test.js tests/unit/electron-human-input-selection.test.js tests/unit/electron-human-input-session.test.js tests/unit/electron-workspace-queue.test.js tests/unit/electron-turn-outcome.test.js tests/unit/human-input-turn-flow.test.js`.
- Core/CLI check: `npm run check`.
- Full unit suite: `npm run test:unit`.
- Electron compile and bundle: `npm run electron:build`.
- Live CLI E2E when `GOOGLE_API_KEY` exists: `npm run test:e2e`.
- Live Electron E2E when `GOOGLE_API_KEY` exists:
  `npm run test:e2e:electron`.
- Static absence checks:
  `rg -n "approved: (true|false)|allowFreeformInput" core cli electron tests/e2e README.md`
  and inspection of any intentional renderer transport exceptions.
- Expected evidence: explicit decision unions reach `llm-runtime`; cancelled
  completion does not invoke another completion pass; persisted messages contain no
  orphaned assistant tool call; answered human input creates one canonical tool
  result and resumes once.

### Acceptance-to-evidence map

- Dependency resolution: `npm ls llm-runtime --depth=0`, manifest/lock inspection.
- Approval decision mapping: `turn-executor.test.js`,
  `electron-tool-approval-session.test.js`, and `agent-runtime.test.js`.
- Approval cancellation including invalid/callback-error reasons:
  `agent-runtime.test.js` buffered and streamed terminal-event cases.
- Provider-valid cancellation persistence and clean CLI output:
  `turn-executor.test.js`, `agent-cli.test.js`.
- Electron status/metadata/reload/log behavior: typed Electron build, a pure
  main response serializer plus renderer outcome helper in
  `electron-turn-outcome.test.js`, and the deterministic Electron main/session
  composition cases named in the E2E spec.
- Strict request parsing, `allowOther`, canonical answered outcomes:
  `electron-human-input-selection.test.js`, `agent-cli.test.js`, and
  `human-input-turn-flow.test.js`.
- Human-input skip/dismiss/timeout/invalid cancellation without resume:
  `electron-human-input-session.test.js`, `human-input-turn-flow.test.js`, and
  `agent-runtime.test.js`.
- Full regression and packaging compatibility: `npm run check`,
  `npm run test:unit`, and `npm run electron:build`.

## Execution Evidence

- `npm ls llm-runtime --depth=0` resolves `llm-runtime@0.7.0`.
- Focused migration suite passed after all CR and initial VR fixes: 9 files and
  120 tests.
- `npm run check` passed after all CR fixes.
- `npm run test:unit` passed after initial VR fixes: 18 files and 194 tests.
- `npm run electron:build` passed: Electron main TypeScript/bundle, renderer
  TypeScript, and Vite production build.
- `npm run test:e2e` attempted all four live CLI scenarios, but Google requests
  failed at the external fetch boundary. An escalation request was denied because
  the live suite would send workspace-derived prompts to Gemini without explicit
  authorization.
- `npm run test:e2e:electron` was not attempted after the same external
  data-boundary denial. No live E2E pass is claimed; deterministic local
  composition tests provide the migration evidence.
- Independent AR passed after two remediation loops. Independent CR triggered fixes
  for comma-bearing `allowOther` answers, numeric option-ID collisions, and a
  terminal cancellation-token collision. Exact declared IDs now win and reversible
  leading-backslash escaping keeps every free-form string representable. Final CR
  passed with no material findings. Initial VR then caught a missing-gate fail-open
  path and missing cancelled-human-input host-composition coverage; both were fixed,
  all deterministic validation was rerun, and the post-fix CR passed with no
  material findings. Final VR passed all 12 acceptance criteria with no blocking
  findings.

## Rollback / Risk

- The highest risk is accidentally converting cancellation back into failure or
  completion at a shell boundary. Discriminated result types and buffered/streamed
  tests mitigate this.
- Changing the human-input payload can strand an Electron turn if renderer and main
  process types diverge. Update preload-facing types, session normalization, renderer
  answer builders, and main-process conversion in one phase, then build Electron.
- The runtime freezes approval snapshots and preflights whole batches. Host code
  must not mutate requests or execute tools while rendering approval.
- Sanitization is load-bearing: a cancelled approval leaves an assistant tool call
  without a result in runtime messages. Persist through `selectPersistableMessages`
  before reusing the chat.
- Rollback requires restoring 0.6.6 and the old boolean/input contracts together.
  A partial package-only rollback or host-only rollback is invalid.
