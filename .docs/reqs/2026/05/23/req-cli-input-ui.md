# Requirement: CLI Pending And Ask-User Input UI

## Problem

Agent CLI currently streams assistant text directly, but silent waits during model/runtime work make the CLI feel stalled. It also has no terminal-native handling for `ask_user_input` style tool calls, so a model that asks for structured user input cannot complete the loop cleanly from the local CLI.

CRM CLI already solved the product feel: show a minimal three-dot pending animation, interrupt it cleanly for tool/status output, then resume assistant text. Agent CLI needs that behavior without importing CRM's server-test architecture.

## Requirements

- Show a three-dot pending animation while a streamed assistant turn is waiting for text.
- Clear the animation before writing assistant text, verbose diagnostics, tool prompts, or final output.
- Keep non-TTY output stable and script-friendly: no terminal animation escape sequences when stdout is not a TTY.
- Add terminal UI for `ask_user_input`-family tool calls:
  - Detect input requests from `ask_user_input`-family tool call arguments.
  - Render the question and numbered options.
  - Support single-select, multiple-select, skip when allowed, and freeform input when allowed.
  - Convert collected answers into tool result payloads that the runtime loop can continue with.
- Preserve existing chat persistence, streaming trace behavior, and verbose diagnostics.
- Keep the implementation local-first; no relay/server dependency for local input UI.

## Acceptance Criteria

- A streamed turn writes assistant text normally, with pending animation only on TTY stdout.
- A mocked `ask_user_input` call can prompt, accept a selection, continue the runtime loop, and persist the resulting tool answer message.
- Verbose tool traces still go to stderr and do not corrupt the pending animation.
- Unit tests cover the pending display and ask-user input behavior.
