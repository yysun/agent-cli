# Tool Message Collapse Title Plan

## Goal

Electron transcript tool cards must become scannable without hiding all tool messages: each card starts collapsed, gets its own borderless collapse control, and tool headings reuse the CLI diagnostic details without CLI row glyphs where the available data supports it.

## Current Context

- `electron/renderer/src/features/chat/ChatTranscript.tsx` renders both persisted chat messages and renderer-only turn events. Tool cards are currently stateless markup with a title, status pill, and body text.
- `electron/renderer/src/features/chat/transcript-events.ts` owns runtime event names and summaries. It now needs to produce first-line CLI diagnostic titles, not just raw tool names.
- `electron/renderer/src/utils/message-utils.ts` detects persisted tool-related messages and resolves persisted tool names. It now needs `tool_call_id` metadata so persisted tool results can render CLI result titles.
- `cli/src/tool-trace-renderer.ts` is the reference for the CLI visible tool row format. The renderer must mirror that first-line shape without importing Node-only CLI code into the browser bundle.
- `electron/renderer/src/styles.css` contains the tool-card layout and must absorb the new status/toggle arrangement without changing the transcript shell.
- Existing tests in `tests/unit/electron-transcript-events.test.js` cover helper summaries. E2E coverage exists for global tool-message visibility in `tests/e2e/electron-ask-user-input.e2e.test.js`, but the new per-card collapse interaction can be covered with focused component/helper tests and a human-readable E2E spec.

## Decisions

- Implement per-card collapse state in `ChatTranscript.tsx`, keyed by stable card identity from message index or event timestamp/type. This keeps the state local to the visual transcript and avoids changing runtime data.
- Use a small reusable `ToolCard` component inside `ChatTranscript.tsx` to avoid duplicating heading/toggle/body markup across runtime events and persisted messages.
- Use text arrow glyphs for the up/down control to keep the control dependency-free. The button gets `aria-label` and `aria-expanded`; visible status text remains intact and the button has no visual border.
- Collapse all collapsible tool cards by default; first click expands that one card.
- Mirror CLI diagnostic detail formatting for titles while omitting CLI row glyphs. Bare names such as `load_skill` are insufficient when the title can display `load_skill {"skill_id":"agent-world-skill"}` or `load_skill 5ms · 7 lines`.
- Do not introduce a new feature flag, environment variable, fallback storage model, or broader transcript redesign.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `electron/renderer/src/features/chat/ChatTranscript.tsx` to confirm all tool-card render paths are centralized enough for a local component extraction.
- [x] Inspect `electron/renderer/src/features/chat/transcript-events.ts` and `electron/renderer/src/utils/message-utils.ts` to confirm title resolution gaps for nested tool records and persisted content.
- [x] Inspect `electron/renderer/src/styles.css` to identify the smallest style change for a right-aligned status/toggle area.
- [x] Record that global tool-message visibility remains unchanged and per-card collapse is not a replacement for that setting.

### Phase 2 - Foundation changes

- [x] Update `electron/renderer/src/features/chat/transcript-events.ts` so runtime event titles use browser-safe CLI-style diagnostic-row titles.
- [x] Update `electron/renderer/src/utils/message-utils.ts` so persisted tool titles prefer CLI diagnostic-row titles from tool call records, `tool_call_id` lookup, or "calling tool:" content.
- [x] Update unit tests in `tests/unit/electron-transcript-events.test.js` or a nearby helper test so title resolution behavior is locked.

### Phase 3 - Feature implementation

- [x] Refactor `electron/renderer/src/features/chat/ChatTranscript.tsx` to render tool, reasoning, model, warning, and error status cards through a reusable local card component.
- [x] Add independent collapsed state for runtime event cards and persisted tool-related message cards in `electron/renderer/src/features/chat/ChatTranscript.tsx`, defaulting every collapsible card to collapsed.
- [x] Add a right-aligned borderless arrow button beside the status pill in every collapsible tool-card heading, preserving the title/status when collapsed.
- [x] Update `electron/renderer/src/styles.css` so the status and borderless arrow control align on the right and the hidden body does not leave awkward spacing.
- [x] Confirm the implementation did not add a new global setting, data persistence path, or broad card redesign.

### Phase 4 - Tests and verification wiring

- [x] Add or update a human-readable E2E spec in `.docs/tests/test-tool-message-collapse-title.md` for expanding/collapsing an Electron tool card and preserving the global show/hide setting.
- [x] Run `npm run check` and record whether TypeScript accepts the renderer changes.
- [x] Run `npm run test:unit -- tests/unit/electron-transcript-events.test.js` and record helper test results.
- [x] If a narrower renderer component test is already available, run it; otherwise document the manual E2E scenario as the coverage boundary.

### Phase 5 - Documentation and status

- [x] Update this plan with completed task checkboxes only after code, tests, or evidence exists.
- [x] Record final evidence showing per-card collapse and CLI-like tool titles satisfy the requirement.
- [x] Leave unrelated generated outputs and unrelated worktree changes untouched.

## Validation

- `npm run check`
- `npm run test:unit -- tests/unit/electron-transcript-events.test.js`
- Review `.docs/tests/test-tool-message-collapse-title.md` against the implemented UI behavior.

## Execution Evidence

- `npm run check` passed on 2026-06-04 after the final title-glyph removal.
- `npm run electron:renderer:check` passed on 2026-06-04 after replacing the direct CLI import with a browser-safe formatter.
- `npm run test:unit -- tests/unit/electron-transcript-events.test.js` passed on 2026-06-04; the script ran the unit suite and reported 12 files / 117 tests passed.
- `npm run electron:renderer:build` passed on 2026-06-04.
- `.docs/tests/test-tool-message-collapse-title.md` records the manual Electron E2E behavior boundary for per-card collapse and the existing global show/hide setting.

## Rollback / Risk

The risk is localized to renderer transcript cards. Rollback is a revert of the `ChatTranscript.tsx`, helper, CSS, and test/doc changes. The main behavioral risk is unstable collapse keys if events re-render with duplicate timestamps; including type and index in the key keeps the interaction stable for the current rendered list.
