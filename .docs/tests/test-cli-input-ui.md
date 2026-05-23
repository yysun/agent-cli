# E2E Spec: CLI Pending And Ask-User Input UI

## Scenario: Pending Animation During Streamed Turn

1. Run a local CLI turn in a TTY-like stdout capture.
2. Delay assistant text long enough for the pending display to start.
3. Confirm the pending display shows dot frames and clears before assistant text is written.
4. Confirm non-TTY stdout does not contain cursor-control animation output.

## Scenario: Ask-User Input Tool Flow

1. Start a CLI turn with a mocked runtime that emits an `ask_user_input` request with one question and numbered options.
2. Select one option from the terminal prompt.
3. Confirm the CLI writes a readable question/options checkpoint.
4. Confirm the answer is appended as a tool message and the runtime continues to a final assistant response.
5. Confirm the final chat is persisted with the original user message, assistant tool call, tool answer, and final assistant response.
