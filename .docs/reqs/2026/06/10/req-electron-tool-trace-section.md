# Electron Tool Trace Section

## Problem

Electron verbose mode currently renders tool request and tool response diagnostics as separate card-like transcript items. That makes one tool execution look like two separate events and adds visual weight to debug output that should stay secondary to the conversation.

The CRM chat uses a better pattern for server activity: a compact row with a status dot, readable title, collapse control, and details only when expanded. Agent CLI should keep its CLI-like tool titles, but the request/response pair should read as one collapsed trace section.

## Requirement

Electron transcript rendering must consolidate each tool request and matching response into one compact, collapsed-by-default section. The section must not use the existing card treatment. It must preserve verbose-mode filtering, current-turn streaming diagnostics, persisted tool-message diagnostics, and existing CLI-like tool title formatting.

## Acceptance Criteria

- [x] Current-turn `tool_call` plus matching `tool_result` events render as one tool trace section keyed by the shared tool id.
- [x] Persisted assistant tool-call messages plus matching `role: "tool"` responses render as one tool trace section keyed by `tool_call_id`.
- [x] Tool trace sections are collapsed by default and can be expanded to show both request and response details when both exist.
- [x] Tool trace sections use a compact row treatment with no card border/background, while warnings, errors, reasoning, model summaries, and ordinary chat messages keep their existing roles.
- [x] Verbose mode still hides tool/reasoning/model diagnostics when disabled and shows the consolidated tool traces when enabled.
- [x] Regression coverage proves request/result grouping and unmatched request or response fallback behavior.

## Constraints

- Keep the runtime event and persisted chat message contracts unchanged.
- Keep existing CLI-like title formatting, including argument snippets and result timing/line counts where available.
- Keep the change local to the Electron renderer transcript unless a pure helper is needed for testability.
- Do not introduce a feature flag, environment variable, persistence migration, or compatibility path.
- Preserve existing user and assistant message rendering.

## Non-Goals

- Do not change CLI terminal verbose output.
- Do not change `runChatTurn`, tool execution, or IPC event emission.
- Do not redesign the full chat transcript or settings panel.
- Do not make verbose diagnostics visible when verbose mode is disabled.
