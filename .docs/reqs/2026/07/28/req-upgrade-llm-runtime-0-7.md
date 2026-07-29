# Requirement: Upgrade llm-runtime to 0.7

## Problem

Agent CLI is pinned to `llm-runtime` 0.6.6 and its shared runtime adapter, terminal UI,
and Electron UI still implement the pre-0.7 approval and human-input contracts.
`llm-runtime` 0.7.0 makes tool approval fail closed: only an explicit approve
decision permits execution, denial becomes a terminal cancellation, and executable
tool batches are approved before any tool in the batch runs. It also separates
`ask_user_input` preference collection from execution approval and validates its
answered or cancelled outcomes.

Updating only the package version would leave the CLI and Electron hosts returning
invalid approval responses, treating cancellation as failure or missing output, and
resuming model execution after cancelled human input.

## Requirement

Upgrade the project to `llm-runtime` 0.7.0 and migrate the shared runtime boundary,
CLI, and Electron app to its explicit approval, cancellation, and human-input
contracts.

Both hosts must return exact approve-or-cancel decisions for executable tool calls.
A denial, dismissal, timeout, invalid response, or approval callback failure must
stop the current turn without executing the rejected batch or asking the model to
retry. Cancellation must be represented as a normal terminal turn outcome, kept
distinct from completion and failure, and surfaced accurately by the CLI and
Electron renderer.

`ask_user_input` must remain host-rendered. The CLI and Electron app must honor the
0.7 request schema, including per-question `allowOther`, produce validated canonical
answer outcomes, and stop the host workflow instead of resuming the model when the
input is skipped, dismissed, rejected, timed out, unavailable, or invalid.

## Acceptance Criteria

- [x] `package.json` and `package-lock.json` resolve `llm-runtime` 0.7.0 without a
  stale 0.6.x package record.
- [x] The shared runtime adapter returns only the 0.7 approve-or-cancel decision
  shape to `onToolApproval`; legacy `{ approved: boolean }` responses are absent
  from the runtime boundary.
- [x] CLI approval, Electron approval, unavailable-renderer, and timeout paths map
  to explicit approve, rejected, dismissed, or timeout decisions without any
  fail-open path.
- [x] Runtime-reported `approval_invalid` and `approval_callback_error`
  cancellations remain terminal host cancellations: neither becomes an ordinary
  failure, fabricated completion, or host-initiated model retry.
- [x] A buffered or streamed runtime approval cancellation returns a distinct
  cancelled host turn, persists provider-valid history, and does not require final
  assistant text.
- [x] The CLI ends a cancelled turn cleanly without printing a fabricated assistant
  answer or reporting an ordinary runtime failure.
- [x] Electron returns cancellation status and metadata to the renderer, clears the
  pending interaction, reloads the persisted transcript, and reports cancellation
  instead of success or failure.
- [x] CLI and Electron `ask_user_input` parsing uses `allowOther`, validates canonical
  option/free-form answers through the 0.7 runtime helper, and resumes the model only
  for an answered outcome.
- [x] Malformed `ask_user_input` requests are rejected before either host renders a
  coerced prompt; missing/duplicate IDs, invalid selection types, undeclared or
  insufficient options, flat legacy payloads, string-only options, and legacy
  human-input tool aliases are not silently repaired.
- [x] Skipped, dismissed, timed-out, unavailable, or invalid human input cancels the
  host turn without adding a fabricated tool result or making another model request.
- [x] Focused tests cover approval decision mapping, buffered and streamed
  cancellation, provider-valid persistence, `allowOther`, canonical human-input
  answers, and cancelled human-input behavior in both host compositions.
- [x] CLI/core checks, unit tests, and Electron build/type checks pass; relevant
  user-facing documentation describes terminal cancellation rather than model retry.

## Constraints

- Keep workspace files, tool arguments, credentials, chat history, and long-term
  memory local.
- Preserve the runtime-owned executable batch preflight; do not recreate approval
  sequencing in either UI.
- Preserve context isolation and the existing non-queued answer IPC channels so an
  Electron turn cannot deadlock while awaiting input.
- Persist only provider-valid chat history. An assistant tool call cancelled before
  execution must not remain as an orphaned persisted message.
- Keep control tools and host-owned human-input tools out of the executable approval
  UI.
- The live Electron model E2E may require `GOOGLE_API_KEY`; deterministic tests must
  provide the primary contract evidence.

## Non-Goals

- Adding approval allowlists, remembered decisions, per-tool policies, or new
  permission modes.
- Preserving the legacy boolean runtime approval response through a compatibility
  flag or fallback.
- Moving prompt rendering, timeout clocks, or raw input collection into
  `llm-runtime`.
- Redesigning the CLI prompt or Electron approval cards.
- Refactoring provider, MCP, skill-loading, chat-storage, or workspace architecture
  unrelated to the 0.7 migration.
