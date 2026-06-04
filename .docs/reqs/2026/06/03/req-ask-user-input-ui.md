# Requirement: Electron Ask User Input UI

## Story

The Electron app should support agent turns that ask the user for structured input, and it should make tool calls, tool results, and reasoning/thinking visible in the chat experience in a way comparable to the CLI verbose flow.

## Acceptance Criteria

- When the runtime emits an `ask_user_input`-style tool call, the Electron app shows an in-app prompt instead of failing or silently dropping the request.
- The prompt supports single-select, multiple-select, freeform answers, and skip when allowed by the tool request.
- Submitting the prompt returns a structured tool-result artifact to the runtime so the same turn can continue and persist normally.
- Tool calls and tool results are visible in the transcript with useful names, statuses, summaries, and previews.
- Reasoning or thinking stream chunks are visible in the transcript or activity area without replacing final assistant text.
- Existing chat send, edit/resend, workspace selection, skill filtering, and hidden-tool-message behavior continue to work.

## Non-Goals

- Do not add a new remote service or move runtime execution out of the Electron main process.
- Do not change the CLI behavior except for shared helpers if needed.
- Do not persist unfinished in-flight prompt state across app restarts.