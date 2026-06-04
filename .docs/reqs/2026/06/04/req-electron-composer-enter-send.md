# Electron Composer Enter Send

## Problem

The Electron composer currently behaves like a plain textarea: pressing Enter always inserts a newline unless the user clicks the send button. That is backwards for short chat prompts, where Enter should send immediately. Multi-line prompts still need a deliberate send gesture so users can keep editing without accidentally dispatching partial text.

## Requirement

The Electron message composer must send on plain Enter when the current user input is a single-line message. When the current input contains multiple lines, plain Enter must continue editing and Cmd+Enter on macOS or Ctrl+Enter elsewhere must send.

## Acceptance Criteria

- [ ] Given the composer contains non-empty single-line input, pressing plain Enter submits the trimmed message.
- [ ] Given the composer contains multi-line input, pressing plain Enter does not submit and leaves normal textarea newline editing available.
- [ ] Given the composer contains multi-line input, pressing Cmd+Enter or Ctrl+Enter submits the trimmed message.
- [ ] Empty or whitespace-only input still does not submit from keyboard or button.
- [ ] Pressing Enter while IME text composition is active does not submit a partial message.
- [ ] Existing button submit, edit/resend, busy-state blocking, tool permission, and reasoning effort behavior continue to work.

## Constraints

- Keep the change local to the Electron renderer composer.
- Do not add a browser-wide shortcut or a backend setting for this behavior.
- Preserve textarea editing semantics for multi-line drafts.
- Do not submit while browser text composition is active.
- Prefer targeted unit coverage for the keybinding decision over a new UI test stack.

## Non-Goals

- No composer redesign.
- No configurable keybinding preferences.
- No change to CLI input behavior.
- No change to chat runtime IPC.
