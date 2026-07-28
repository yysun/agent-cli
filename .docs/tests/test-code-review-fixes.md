# E2E Spec: Code Review Fixes

Covers the user-visible flows changed by `code-review-fixes`: tool-approval prompting in both surfaces, default history depth, chat-id rejection, and Electron workspace-switch safety.

Live scenarios use provider `google` with model `gemini-2.5-flash` and require `GOOGLE_API_KEY`, matching the existing `tests/e2e` harnesses. Scenarios that need no model are marked **offline**.

## Scenario: CLI `ask` permission prompts before a tool runs

1. Create a temporary workspace root with an `AGENTS.md` instructing the assistant to call a read-only workspace tool before answering.
2. Run `agent-cli --workspace <root> --tool-permission ask --verbose "List the files in this workspace"` with an attached interactive prompt.
3. Confirm the turn pauses and prints an approval prompt naming the requested tool.
4. Confirm no tool result is emitted while the prompt is unanswered.
5. Answer approve.
6. Confirm the tool executes, the tool result is rendered, and the turn produces a final answer.

## Scenario: CLI approval denial blocks the tool

1. Repeat the setup above.
2. Answer deny at the approval prompt.
3. Confirm the tool does not execute and no tool result is persisted for that call.
4. Confirm the denial reason reaches the runtime and the turn still terminates with an assistant response rather than hanging.

## Scenario: CLI `ask` in a non-interactive run denies instead of hanging (offline)

1. Run `agent-cli --workspace <root> --tool-permission ask "..."` with stdin not a TTY and no interactive prompt supplied.
2. Confirm the run terminates rather than blocking indefinitely.
3. Confirm the tool call is denied with a reason stating interactive approval is unavailable.

## Scenario: Human-input tools prompt once, not twice

1. Use an `AGENTS.md` instructing the assistant to call `ask_user_input` (as `tests/e2e/agent-cli.e2e.test.js` does).
2. Run the CLI with `--tool-permission ask`.
3. Confirm exactly one prompt appears — the human-input question — and no separate tool-approval prompt precedes it.

## Scenario: Default history depth sends the full conversation (offline)

1. Create a workspace with `.env` that omits `AGENT_CLI_PAST_MESSAGES`.
2. Persist a chat with several prior user/assistant messages.
3. Run a turn against a mocked runtime and capture the message array handed to the runtime.
4. Confirm every persisted message is present.
5. Repeat with `AGENT_CLI_PAST_MESSAGES=0` and confirm no prior messages are sent.
6. Repeat with `AGENT_CLI_PAST_MESSAGES=2` and confirm only the last two are sent.

## Scenario: Traversing chat ids are rejected (offline)

1. Create a workspace with a `victim/` directory alongside `.agent-world`.
2. Run the interactive CLI and enter `/use ../../victim`.
3. Confirm the command reports a failure and the session continues.
4. Confirm `victim/` is untouched and no directory was created or removed outside `.agent-world/chats`.
5. Repeat for an absolute path and for an id containing a path separator.

## Scenario: Electron `ask` permission prompts in the renderer

1. Build and launch the Electron app against a temporary workspace whose `AGENTS.md` instructs a read-only tool call.
2. Set the composer tool-permission control to `Ask`.
3. Send a message that triggers the tool.
4. Confirm an approval prompt renders in the chat column naming the tool.
5. Confirm the working status remains active and no tool result card appears while the prompt is open.
6. Click Approve.
7. Confirm the tool executes and the turn completes in the same send.

## Scenario: Electron approval denial blocks the tool

1. Repeat the setup above and click Deny.
2. Confirm no tool result card appears for that call.
3. Confirm the turn completes with an assistant response and the prompt is cleared.

## Scenario: Electron tool-permission control reflects workspace configuration

1. Create a workspace whose `.env` sets `AGENT_CLI_TOOL_PERMISSION=ask`.
2. Launch the Electron app and select that workspace.
3. Confirm the composer tool-permission control shows `Ask` rather than defaulting to `Auto`.

## Scenario: Workspace cannot be switched mid-turn

1. Launch the Electron app and send a message that takes several seconds.
2. While the working status is active, attempt to open a different workspace, create a chat, and select a different chat.
3. Confirm all three controls are inert while the turn is in flight.
4. Confirm the completed turn persists into the original workspace.

## Verification

- Offline scenarios are covered by unit tests in `tests/unit`.
- Live CLI scenarios extend `tests/e2e/agent-cli.e2e.test.js`; live Electron scenarios extend `tests/e2e/electron-ask-user-input.e2e.test.js`.
- Live scenarios are reported as blocked, not passed, when `GOOGLE_API_KEY` is unavailable.
