# AP: port-trace-renderer

- Story slug: `port-trace-renderer`
- Created: `2026-05-16`
- [x] Implemented
- Related requirement: `./.docs/reqs/2026/05/16/req-port-trace-renderer.md`
- Related test spec: none required for this internal CLI display change

## Goal

Upgrade Agent CLI’s verbose streamed diagnostics to use structured trace rendering modeled on ai-workspace’s trace renderer, while preserving Agent CLI’s existing stdout/stderr split and one-shot execution flow.

## Assumptions

1. The owning display path for streamed diagnostics is `cli/src/turn-executor.ts`, not `cli/src/agent-cli.ts`.
2. The current runtime integration already provides enough streamed information to improve tool-call rendering immediately.
3. Tool-result rendering requires a small runtime plumbing change because the current runtime callback surface exposes tool calls but not tool results.
4. This story is an internal display improvement, so unit coverage is sufficient and no new E2E spec is needed.
5. The remote-control startup text in `core/remote-control.ts` is outside scope unless the implementation accidentally regresses it.

## Key Design Decisions

1. Extract the display formatting into a dedicated CLI-local helper module rather than embedding long formatting branches directly into `turn-executor.ts`.
2. Port the bounded-summary approach from ai-workspace, but adapt it to Agent CLI’s event shapes and existing ASCII-first style.
3. Keep default mode unchanged; only verbose diagnostics become structured.
4. Preserve the stdout/stderr contract:
   - assistant text stays on stdout
   - verbose diagnostics stay on stderr
5. Preserve stream trace event persistence exactly as-is so display and persistence do not drift together.
6. Add one narrow `onToolResult` callback through `core/runtime-client.ts` so the CLI can render summarized tool-result lines without changing persisted message shapes.

## Architecture Review

1. Reusing ai-workspace’s renderer structure is sound because the display concern is already factored there into summarization and rendering helpers.
2. Copying the entire streaming test CLI would be a design mistake because Agent CLI does not own a readline-driven interactive shell.
3. The main risk is coupling the renderer to ai-workspace-specific SSE payload shapes; the port should instead target the normalized `runChatTurn` callback payloads available in Agent CLI.
4. No E2E spec is needed because the story changes terminal formatting for an existing unit-tested streamed CLI path rather than a user-facing browser or relay workflow.
5. Runtime inspection confirms the smallest safe path is to add a tool-result callback at the `executeToolCall(...)` call site rather than fabricating result summaries from persisted chat messages.

## File-Level Plan

1. Add a trace-rendering helper under `cli/src/`.
   - Port the summarization helpers needed for shell, path, file, search, and generic tool payloads.
   - Keep output compact and terminal-friendly.
2. Update `cli/src/turn-executor.ts`.
   - Route verbose warning, reasoning, tool-call, and tool-result display through the new renderer.
   - Keep non-verbose behavior and stream trace persistence unchanged.
   - Add or update the required top comment block.
3. Update runtime plumbing only if needed.
   - Inspect `core/runtime-client.ts` for available tool lifecycle callbacks.
   - Add minimal tool-result forwarding only if the CLI cannot otherwise receive result events.
4. Update tests in `tests/unit/agent-cli.test.js`.
   - Preserve existing assertions for non-verbose behavior.
   - Add or revise assertions for structured verbose tool-call and tool-result output.
   - Add or update the required top comment block if the file is edited.
5. Update docs/status.
   - Mark plan tasks complete as work finishes.
   - Keep REQ/AP aligned with any runtime-plumbing decision discovered during implementation.

## Implementation Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Validation Strategy

1. Run `npm run build:ts` after the implementation changes.
2. Run focused unit coverage for `tests/unit/agent-cli.test.js`.
3. If runtime plumbing changes touch shared behavior, run the narrowest additional unit test file covering that path.
4. Run `git diff --stat` or equivalent review only after executable validation succeeds.

## Risks

1. `llm-runtime` may not currently provide a tool-result callback to Agent CLI, which would make full parity with ai-workspace impossible without a small shared-runtime change.
2. Over-porting the renderer could accidentally introduce Unicode-heavy output or formatting that conflicts with existing tests.
3. Changing stderr formatting too aggressively could break tests that currently assert exact verbose strings; those tests must be updated deliberately rather than relaxed blindly.
4. If generic summarization is too eager, it may expose more payload detail than the existing minimal output. The renderer should prefer bounded summaries and avoid dumping full JSON by default.
