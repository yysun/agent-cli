# Incomplete Tool Calls

## Problem

The runtime has a valid intermediate state, `status: "tool_calls"`, for host-owned tool calls that still need a host response. CLI and Electron currently treat the returned message list as a completed turn, persist it, and report success. That creates a broken transcript: an assistant tool call can be saved without a tool result or final answer.

This is worse in Electron because the renderer clears its busy state and presents the partial turn as done. The CLI can look healthy only because its terminal handler usually resolves `ask_user_input` inline.

## Requirement

CLI and Electron must not persist or return a successful completed-turn response when `runChatTurn` returns unresolved host-owned tool calls. Both hosts must fail clearly with the unresolved tool names so users and tests can distinguish an incomplete host contract from a completed assistant answer.

## Acceptance Criteria

- [x] CLI detects `status: "tool_calls"` after `runChatTurn` and reports a request failure instead of persisting the partial turn as completed.
- [x] Electron detects `status: "tool_calls"` after `runChatTurn` and rejects the IPC turn instead of returning a success-shaped response to the renderer.
- [x] The failure message identifies unresolved tool call names.
- [x] Completed turns still persist and render exactly as before.
- [x] Regression tests cover the shared unresolved-tool-call guard and the CLI persistence failure mode.

## Constraints

- Keep `runChatTurn` behavior intact; `status: "tool_calls"` remains a valid runtime result for lower-level consumers.
- Do not add feature flags, environment variables, compatibility modes, or renderer-only workarounds.
- Keep host-owned `ask_user_input` handling intact when the host can parse and answer the request.
- Keep changes local to CLI/Electron host completion handling and shared core helpers.

## Non-Goals

- Do not implement arbitrary host-owned tool executors.
- Do not redesign Electron human input UX.
- Do not change `llm-runtime` semantics.
- Do not add E2E coverage for this internal contract unless unit coverage cannot prove the failure path.
