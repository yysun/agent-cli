# Requirement: Auto Interactive Mode

## Story

When a user runs `agent-cli` with no message and without `--remote`, the CLI should start an interactive terminal chat instead of failing with `Missing user message`.

## Acceptance Criteria

- Running `agent-cli` with no positional message and no `--remote` starts an interactive prompt automatically.
- Existing one-shot message behavior is unchanged.
- Existing `--remote` behavior is unchanged.
- Existing `--help` behavior is unchanged and does not start the prompt.
- Interactive mode keeps conversation state across turns in the same process using the existing persisted chat model.
- Interactive mode supports at least `/exit` or `/quit` to leave, `/clear` to start a new empty chat, `/new` to create a new empty chat, `/chats` to list persisted chats, and `/use <chatId>` to switch chats.
- Runtime flags such as `--workspace`, `--provider`, `--model`, `--verbose`, `--stream-off`, and `--past-messages` still apply to interactive turns.
- Failures in a single interactive turn are reported to stderr without terminating the prompt loop.
- The implementation is covered by targeted automated tests and the README describes the new default behavior.

## Non-Goals

- Do not add a new `--interactive` flag.
- Do not replace or remove remote relay mode.
- Do not build a full-screen terminal UI.
- Do not add persistent shell history beyond the existing `.agent-world` chat storage.
