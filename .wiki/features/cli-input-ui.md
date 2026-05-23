---
title: "CLI Input UI"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "cli/src/agent-runtime.ts"
  - "cli/src/human-input-ui.ts"
  - "cli/src/pending-display.ts"
  - "core/agent-runtime.ts"
  - "tests/unit/agent-cli.test.js"
  - "tests/unit/agent-runtime.test.js"
  - ".docs/reqs/2026/05/23/req-cli-input-ui.md"
  - ".docs/plans/2026/05/23/plan-cli-input-ui.md"
  - ".docs/done/2026/05/23/cli-input-ui.md"
  - ".docs/tests/test-cli-input-ui.md"
updated_at: "2026-05-23"
---

# CLI Input UI

This feature fixes two pieces of local terminal friction: silent waits during streamed turns, and model-requested structured input that previously had no CLI-native way to complete.

## Pending Display

`cli/src/pending-display.ts` renders a minimal three-dot pending animation while a streamed turn is waiting for assistant text. The rule is deliberately strict: frames are written only when stdout looks TTY-like.

When assistant text, verbose diagnostics, tool prompts, or final output need to write, the active frame is cleared first. Non-TTY output stays script-friendly and does not receive cursor-control escape sequences.

## Human Input Tools

`cli/src/human-input-ui.ts` recognizes the local human-input tool family:

- `ask_user_input`
- `human_intervention_request`
- `ask_user_question`

It accepts single-question and multi-question payloads, renders readable questions and numbered options, and collects answers through the active terminal prompt. Supported answer styles are single-select, multiple-select, freeform text when allowed, and skip when allowed. Entering `0` cancels the UI request.

The result is returned as a structured tool artifact with status such as `answered`, `skipped`, `cancelled`, or `unavailable`.

## Runtime Boundary

The terminal UI does not live in `core/agent-runtime.ts`. Core runtime exposes a generic `handleToolCall` hook during the `llm-runtime` completion loop. `cli/src/agent-runtime.ts` uses that hook to intercept only the human-input tool family, collect terminal answers, and return a tool result. Normal tools still use the runtime executor path.

That split is important. Core stays responsible for provider validation, message layering, tool-loop continuation, and persistence shape. The CLI layer owns stdout, stderr, TTY animation, and prompts.

## Persistence

The collected answer becomes a normal tool message in the persisted chat. That means a completed input flow keeps the same message structure as other tool calls: original user message, assistant tool-call message, tool answer message, then final assistant response.

This path is part of [[chat-turn-lifecycle]] and depends on the tool loop described in [[model-runner-handoff]].
