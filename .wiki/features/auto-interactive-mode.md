---
title: "Auto Interactive Mode"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "cli/src/agent-cli.ts"
  - "tests/unit/agent-cli.test.js"
  - ".docs/reqs/2026/05/20/req-auto-interactive-mode.md"
  - ".docs/done/2026/05/20/auto-interactive-mode.md"
  - ".docs/tests/test-auto-interactive-mode.md"
updated_at: "2026-05-23"
---

# Auto Interactive Mode

Running `agent-cli` with no positional message and no `--remote` now starts an interactive terminal chat. The old behavior failed with `Missing user message`; the new behavior treats a blank invocation as a deliberate request to keep talking inside the same process.

## User Contract

- `agent-cli` starts a prompt automatically when there is no message.
- `agent-cli "message"` still runs one turn and exits.
- `agent-cli --remote` still starts the remote host path.
- `agent-cli --help` prints usage without entering the prompt.

The point is to make the simplest local command useful without adding another flag. The non-goal is a full-screen terminal UI; this is still the same line-oriented CLI.

## Prompt Commands

Interactive mode supports:

- `/new` to create and select a new empty chat.
- `/clear` to create a new empty chat and print a shorter confirmation.
- `/chats` to list persisted chats with the current chat marked.
- `/use <chatId>` to switch to an existing persisted chat.
- `/exit` and `/quit` to leave.

Unknown slash commands are reported on stderr. A failed model turn is also reported on stderr, but it does not terminate the prompt loop.

## Implementation Shape

`cli/src/agent-cli.ts` keeps argument parsing and mode selection in one place. After workspace root setup, agent selection, runtime resolution, prompt loading, skill discovery, and chat loading, the shell creates a normal turn executor. If there is no message and the CLI is not in remote mode, it calls `runInteractiveSession(...)`.

That is the key design choice: interactive turns reuse the same executor as one-shot turns. Runtime flags such as `--workspace`, legacy `--project`, `--provider`, `--model`, `--verbose`, `--stream-off`, and `--past-messages` still apply because they are resolved before entering the prompt loop.

## Persistence

The prompt starts from the same persisted chat selection described in [[chat-turn-lifecycle]] and [[storage-layout]]. Commands that create or select chats delegate to [[world-store]], so interactive mode does not introduce a second chat model.

This matters because the feature changes the default CLI experience without changing the storage contract.
