# E2E Spec: Electron Ask User Input UI

## Scope

These scenarios verify the Electron user-facing flow for runtime `ask_user_input` requests. They are intentionally manual/provider-backed because the real end-to-end behavior depends on a model turn that emits a structured tool call through `core/agent-runtime.ts`.

Record the workspace path, provider, model, app command, and observed evidence for each run. Do not count a scenario as passed from build output alone.

## Executable Live Suite

Run:

```bash
npm run test:e2e:electron
```

Requirements:

- `GOOGLE_API_KEY` must be set.
- The suite builds Electron, launches the real app with Playwright, selects an isolated temp workspace, prompts Gemini `gemini-2.5-flash` to emit `ask_user_input`, submits a rendered single-select prompt, verifies same-turn completion, hides and restores tool-message cards, checks persisted tool output, reloads the chat, and verifies renderer-only model-response cards are not persisted.

Current executable coverage maps to the prompt submission, hidden tool-message, and persisted reload scenarios below. Multiple-select, skip, and cancel/unavailable cleanup remain manual scenarios unless more live cases are added.

## Scenario: Prompt Appears and Answer Continues the Same Turn

1. Start the Electron app from a workspace with valid runtime credentials.
2. Send a message that causes the runtime to call `ask_user_input` with one question and at least two options.
3. Verify the chat column shows an in-app prompt labelled as an agent input request while the turn remains busy.
4. Select exactly one option or enter a freeform answer when freeform is allowed.
5. Submit the prompt.
6. Verify the prompt disappears, the busy indicator remains active until the runtime completes, and the same agent turn produces a final assistant response.
7. Verify the transcript includes visible runtime entries for the tool call, the human-input tool result, and any reasoning/thinking emitted during the turn.
8. Reload or reselect the chat.
9. Verify persisted history contains normal chat/tool messages but does not duplicate renderer-only activity cards from the previous live turn.

## Scenario: Multiple Select and Freeform Rules

1. Trigger an `ask_user_input` request with `type: "multiple-select"`, at least three options, and freeform input allowed.
2. Select two options and submit.
3. Verify the runtime receives one structured answer for the question with both selected options.
4. Trigger another request where `allowFreeformInput: false`.
5. Attempt to submit without selecting an option.
6. Verify the prompt shows a required-answer error and does not send an answer.
7. Select a valid option and submit.
8. Verify the turn continues and the prompt clears.

## Scenario: Prompt Allows Skip

1. Trigger an `ask_user_input` request with `allowSkip: true`.
2. Use the skip action or submit with no selected option and no freeform answer.
3. Verify the runtime receives a structured answer with `status: "skipped"` and skipped selections.
4. Verify the same turn continues without a renderer error.
5. Verify the prompt clears after the skip is accepted.

## Scenario: Cancel or Unavailable Input Clears Stale Prompt

1. Trigger an `ask_user_input` request.
2. Cancel the prompt, or force the unavailable/timeout path in a controlled local run.
3. Verify the runtime receives a structured answer with `status: "cancelled"` or `status: "unavailable"`.
4. Verify the runtime turn completes or fails visibly instead of hanging indefinitely.
5. Verify the renderer does not leave a stale prompt visible after the turn has completed.

## Scenario: Tool Messages Hidden

1. Complete a turn that includes reasoning/thinking, a tool call, a tool result, and a final assistant response.
2. Disable tool-message display in the right panel.
3. Verify tool call, tool result, and model-response runtime entries are hidden.
4. Verify ordinary user messages, final assistant messages, and reasoning/thinking entries remain visible.
5. Re-enable tool-message display.
6. Verify the hidden runtime entries become visible again without re-running the turn.

## Scenario: Existing Chat Workflows Still Work

1. Send a normal chat message that does not request user input.
2. Verify the message persists and the assistant response appears normally.
3. Edit and resend the user message.
4. Verify edit/resend still sends the selected tool permission, reasoning effort, workspace, chat id, and skill-selection settings.
5. Select another chat, then return to the original chat.
6. Verify pending prompt state and renderer-only runtime activity from the previous live turn are not incorrectly shown for the reloaded chat.
