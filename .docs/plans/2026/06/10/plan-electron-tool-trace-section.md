# Electron Tool Trace Section Plan

## Goal

Electron transcript verbose diagnostics must display one compact collapsed tool trace for each request/response pair instead of separate tool cards. The display should match the CRM-style lightweight progress-row pattern while preserving Agent CLI diagnostic titles and contracts.

## Current Context

`electron/renderer/src/features/chat/ChatTranscript.tsx` renders persisted tool-related messages and current-turn `tool_call` / `tool_result` events through `ToolCard`, creating separate card-like entries. `electron/renderer/src/features/chat/transcript-events.ts` already owns deterministic event summaries, visibility filtering, and CLI-like title helpers. `electron/renderer/src/utils/message-utils.ts` resolves persisted tool titles by matching `tool_call_id` to earlier assistant tool calls.

`../rlpCRM/src/components/chat/SSEProgressMessage.tsx` uses a compact dot/title/chevron row with expandable details for server activity. Agent CLI should borrow that structure, not its data model or Tailwind styling.

Existing Electron tests are helper-focused in `tests/unit/electron-transcript-events.test.js`; there is no DOM test environment for React components. Regression coverage should therefore target pure grouping helpers.

The worktree already has unrelated uncommitted changes for `incomplete-tool-calls`; this plan must not revert or rewrite them.

## Decisions

- Add pure renderer helpers to group tool request and result records by id before React renders them.
- Render grouped tool diagnostics through a new borderless `ToolTraceSection` component instead of the existing `ToolCard`.
- Keep reasoning, model response, warning, error, and ordinary chat message rendering on the existing paths.
- Use the call title as the primary collapsed title when present; use result title for result-only rows; keep status as `requested`, `completed`, or `error`.
- Show request and response detail blocks only when expanded, preserving raw bodies and whitespace.
- Do not change IPC payloads, persisted message shape, runtime callbacks, CLI output, or verbose-mode settings.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `ChatTranscript.tsx`, `transcript-events.ts`, `message-utils.ts`, and `desktop-api.ts` to confirm tool ids and title metadata are available in the renderer.
- [x] Inspect `../rlpCRM/src/components/chat/SSEProgressMessage.tsx` to confirm the reference pattern is a compact collapsed row, not a card.
- [x] Record that IPC contracts, runtime tool execution, CLI verbose output, and global transcript redesign are out of scope.

### Phase 2 - Foundation helpers

- [x] Add pure grouping helpers in `electron/renderer/src/features/chat/transcript-events.ts` for current-turn tool events.
- [x] Add pure grouping helpers in `electron/renderer/src/utils/message-utils.ts` for persisted assistant/tool message pairs.
- [x] Keep unmatched request-only and response-only records visible as single trace sections with clear status.

### Phase 3 - Renderer implementation

- [x] Replace tool request/result `ToolCard` rendering in `ChatTranscript.tsx` with one `ToolTraceSection` row per grouped trace.
- [x] Keep `ToolCard` for reasoning, model summaries, warnings, and errors so non-tool diagnostics retain existing behavior.
- [x] Update `electron/renderer/src/styles.css` so `.aw-tool-trace` is compact and borderless, without changing ordinary chat cards.

### Phase 4 - Tests and verification wiring

- [x] Extend `tests/unit/electron-transcript-events.test.js` to cover current-turn request/result grouping and unmatched fallback behavior.
- [x] Extend `tests/unit/electron-transcript-events.test.js` to cover persisted message request/result grouping and response title lookup.
- [x] Run `npm run electron:renderer:check` and record the result.
- [x] Run `npm run test:unit -- tests/unit/electron-transcript-events.test.js` and record the result.

### Phase 5 - Documentation and status

- [x] Update this plan with completed checkboxes only after corresponding code or evidence exists.
- [x] Create `.docs/done/2026/06/10/electron-tool-trace-section.md` with implemented behavior and verification evidence.
- [x] Review the final diff for scope, user-owned changes, and stale card styling paths.

## Validation

- `npm run electron:renderer:check` must pass.
- `npm run test:unit -- tests/unit/electron-transcript-events.test.js` must pass.
- Code review must confirm runtime/IPC contracts are unchanged and the renderer still gates tool traces behind verbose mode.

## Rollback / Risk

Risk is limited to Electron transcript display. A bad grouping key could hide either the request or response detail, so tests must cover paired and unmatched records. Rollback is to restore separate `ToolCard` rendering for tool calls and results and remove the new grouping helpers/styles.
