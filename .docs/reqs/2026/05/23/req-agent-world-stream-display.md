# Requirement: Agent World CLI Stream Display

## Problem

`agent-world-cli send` currently returns a JSON result after the turn completes. That is useful for scripts, but poor for interactive use: the user sees no assistant text until the end, and tool calls/results are hidden inside the returned object. `agent-cli` already made the correct terminal product decision: stream assistant text as it arrives and show concise tool diagnostics without corrupting the final message.

`agent-world-cli` should behave like a real terminal chat client when it is used interactively. JSON-first commands can remain stable, but direct sends from the interactive shell should not feel stalled or opaque.

## Requirements

- Display streamed assistant text during `agent-world-cli` interactive sends.
- Display tool call and tool result diagnostics using the same formatting conventions as `agent-cli`.
- Reuse common display modules where possible instead of copying formatter logic.
- Keep scripted/JSON command behavior stable for non-interactive usage.
- Preserve existing human-input tool handling in `agent-world-cli`.
- Avoid leaking terminal animation/control output into non-TTY scripted output.
- Preserve chat persistence and queue behavior.

## Acceptance Criteria

- Plain text entered in `agent-world-cli` interactive mode streams assistant text before the send command returns.
- Tool calls/results emitted during a world send are rendered through the shared trace formatter.
- Non-interactive `agent-world-cli send ...` still prints JSON that can be parsed by existing callers.
- Unit coverage verifies streaming text and tool diagnostics from interactive sends.
- Existing agent-world CLI command tests still pass.
