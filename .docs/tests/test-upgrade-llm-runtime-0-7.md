# E2E Spec: Upgrade llm-runtime to 0.7

These scenarios cover the user-visible CLI and Electron boundaries changed by the
0.7 migration. Deterministic host-composition tests are the primary evidence because
live model tool selection is nondeterministic.

## Executable Evidence

- CLI approval and clean cancellation:
  `npx vitest run tests/unit/turn-executor.test.js tests/unit/agent-cli.test.js`.
- Buffered/streamed runtime cancellation, metadata preservation, no retry, and
  canonical host-owned resume:
  `npx vitest run tests/unit/agent-runtime.test.js`.
- Electron approval rendering-session contract, rejected/dismissed/timeout mapping,
  pending cleanup, IPC response serialization, renderer cancellation branching, and
  transcript reload decision:
  `npx vitest run tests/unit/electron-tool-approval-session.test.js tests/unit/electron-workspace-queue.test.js tests/unit/electron-turn-outcome.test.js`.
- Electron answer construction, strict `allowOther`, skip/dismiss semantics, session
  timeout, and transport normalization:
  `npx vitest run tests/unit/electron-human-input-selection.test.js tests/unit/electron-human-input-session.test.js`.
- Full Electron-style request/answer/resume/persist and cancelled-no-resume
  composition:
  `npx vitest run tests/unit/human-input-turn-flow.test.js`.
- Both live suites require `GOOGLE_API_KEY` and authorization to send their
  workspace-derived prompts to Google:
  `npm run test:e2e` and `npm run test:e2e:electron`. If either precondition is
  blocked, record the exact blocker for both; do not claim them as passed.

## Scenario: CLI approval denial cancels the turn

1. Start a CLI turn with tool permission `ask` and a runtime response that requests
   an executable tool.
2. Answer `n` at the approval prompt.
3. Confirm the tool executor is never called and the runtime does not request a
   second model turn.
4. Confirm the CLI exits the turn cleanly without a fabricated assistant answer or
   a generic failure message.
5. Reload the chat and confirm the user message remains but the cancelled assistant
   tool call is not persisted as an orphan.

## Scenario: Electron approval denial cancels the turn

1. Start an Electron chat turn with tool permission `ask` and an executable tool
   request.
2. Confirm the approval card names the tool and no execution occurs before a
   decision.
3. Click Deny.
4. Confirm the main process returns a cancelled turn with rejected cancellation
   metadata and the renderer logs cancellation rather than “Message sent” or
   “Turn failed.”
5. Reload the chat and confirm no orphaned assistant tool call was persisted.

## Scenario: Approval timeout fails closed

1. Start an Electron approval session with a short host-owned timeout and do not
   answer it.
2. Confirm the result is
   `{ decision: "cancel", reason: "timeout" }`.
3. Confirm the pending request is removed and no tool executes.

## Scenario: Missing approval capability fails closed

1. Configure the shared runtime with tool permission `ask` but no callable host
   approval gate.
2. Invoke the runtime approval callback for an executable tool.
3. Confirm it returns `{ decision: "cancel", reason: "dismissed" }` and never
   defaults to approval.

## Scenario: Answered human input resumes once

1. Start a host-composed turn whose first runtime result requests
   `ask_user_input` with one single-select question, two declared options, and
   `allowOther: true`.
2. Submit either a declared option ID or a non-empty custom answer.
3. Confirm the answer is normalized to
   `{ status: "answered", answers: { <question-id>: <value> } }`.
4. Confirm one matching tool-result message is appended and the runtime resumes
   exactly once to produce the final assistant answer.
5. Confirm persisted history contains the assistant tool call, matching tool
   result, and final assistant answer.

## Scenario: Cancelled human input does not resume

1. Start the same host-composed input turn.
2. Skip or dismiss the prompt, or let the Electron host timeout expire.
3. Confirm the host returns a cancelled turn with the matching reason.
4. Confirm there is no tool-result message, no second runtime request, and no
   fabricated assistant answer.
5. Confirm persisted history remains provider-valid after sanitization.

## Scenario: Invalid free-form input fails closed

1. Request a single-select question without `allowOther`.
2. Submit a string that is not one of the declared option IDs.
3. Confirm runtime normalization produces an invalid cancelled outcome.
4. Confirm neither CLI nor Electron resumes the model with that value.

## Scenario: Malformed request is not coerced

1. Run the shared parser matrix with each of: missing/duplicate question ID,
   invalid selection type, fewer than two options, missing/duplicate option ID,
   string-only option, flat legacy question/options payload, and a legacy
   human-input tool alias.
2. Confirm neither CLI nor Electron renders a repaired prompt.
3. Confirm the host returns
   `{ kind: "human_input", reason: "invalid" }`.
4. Confirm no tool result or second runtime request is produced.
5. Submit an undeclared free-form value without `allowOther` and confirm the same
   invalid cancellation path. Repeat with `allowOther: true` and confirm the exact
   value is accepted only for single-select.

## Scenario: Runtime approval callback contract fails closed

1. Feed the host adapter buffered and streamed runtime cancellations with
   `approval_invalid` and `approval_callback_error`.
2. Confirm the exact reason and tool-call metadata reach the host turn result and
   Electron response.
3. Confirm the host does not re-enter completion, fabricate assistant text, or throw
   an ordinary failure.
