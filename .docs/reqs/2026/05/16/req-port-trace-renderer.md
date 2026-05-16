# REQ: port-trace-renderer

- Story slug: `port-trace-renderer`
- Created: `2026-05-16`
- Status: Done

## Summary

Bring the structured tool-trace display style from `../ai-workspace/src/cli/toolTraceRenderer.ts` into Agent CLI so streamed verbose output is concise, readable, and informative without changing the core CLI execution model.

## Problem

Agent CLI currently treats verbose streaming diagnostics as plain stderr lines such as `warning: ...`, `reasoning: ...`, and `tool: ...`. That keeps the default CLI path simple, but it loses most of the display value already proven in the sibling ai-workspace CLI: summarized tool-call arguments, structured tool results, compact previews, consistent formatting, and clearer visual separation between assistant text and diagnostic activity. The requested work is to port the trace-rendering logic, not the entire interactive test harness, so Agent CLI should keep its current one-shot execution flow while improving the verbose display path.

## Requirements

1. Agent CLI must keep its existing non-verbose behavior unchanged.
2. Agent CLI must keep streaming assistant text on stdout as it does today.
3. Agent CLI must keep help text, missing-message handling, remote-mode behavior, and `--stream-off` behavior intact.
4. The port must apply to Agent CLI’s streamed diagnostic output path rather than introducing the ai-workspace interactive readline loop.
5. When verbose mode is enabled during streaming output, Agent CLI must render tool activity using structured summaries rather than only printing the tool name.
6. Verbose tool-call rendering must include the tool name and a concise summary derived from its arguments when a meaningful summary can be produced.
7. Verbose tool-result rendering must include whether the tool result succeeded or failed and a concise summary derived from the result payload when a meaningful summary can be produced.
8. Tool-result rendering may include short previews for useful payloads such as command output, file paths, counts, line counts, or short status text, but it must remain bounded and compact.
9. The rendering logic must support at least the Agent CLI tools that appear in normal streamed output, including generic tools and common path, file, and shell-oriented tools when those result shapes are available.
10. The rendered output must remain textual and terminal-friendly; no browser-only or REPL-only presentation model is required.
11. The port must preserve Agent CLI’s current separation of assistant output and diagnostic output, with assistant text remaining on stdout and verbose diagnostics remaining on stderr.
12. The port must avoid exposing raw full argument payloads or result payloads by default when a concise summary is available.
13. The implementation may reuse ideas and behavior from ai-workspace’s trace renderer, but it must be adapted to Agent CLI’s runtime event shapes rather than assuming ai-workspace’s SSE wrapper.
14. Warning and reasoning diagnostics must remain available in verbose mode.
15. If a tool-call or tool-result payload cannot be summarized safely, Agent CLI may fall back to a compact generic summary rather than failing or printing nothing.
16. Stream trace persistence behavior must remain unchanged; this story is about display logic, not stored event shapes.
17. Existing verbose CLI tests must be updated or expanded so the structured rendering behavior is verified.

## Non-Goals

1. Replacing Agent CLI’s one-shot command model with ai-workspace’s interactive test REPL is not required.
2. Porting ai-workspace’s pending animation, auto-continue loop, human-input checkpoint flow, or slash-command shell is not required.
3. Adding a new debug mode flag or multiple trace modes is not required unless the implementation needs a minimal internal abstraction.
4. Changing persisted chat messages, stream trace events, or remote relay protocols is not required.
5. Reformatting non-verbose output for aesthetic reasons alone is not required.

## Acceptance Criteria

1. Given a normal non-verbose streamed run, assistant text output remains unchanged and structured trace lines are not printed.
2. Given a verbose streamed run with warnings and reasoning content, Agent CLI still prints those diagnostics to stderr.
3. Given a verbose streamed run with at least one tool call, stderr shows a structured tool-call line that includes the tool name and a meaningful summary instead of only `tool: <name>`.
4. Given a verbose streamed run with at least one tool result shape that can be summarized, stderr shows a structured tool-result line that includes success or failure and a bounded summary.
5. Given a verbose streamed run with tool results that include multiline output or file-oriented payloads, stderr output remains compact and does not dump unbounded raw payloads by default.
6. Given `--stream-off`, the CLI still prints only the final assistant text and does not depend on the new trace-rendering path.
7. Given remote mode, startup and session-ready display behavior remains unchanged unless it passes through the same verbose streamed diagnostic path.
8. Unit tests in the existing CLI test suite verify both the preserved default behavior and the new verbose trace formatting behavior.

## Open Questions

1. No open questions remain for the implemented scope.
