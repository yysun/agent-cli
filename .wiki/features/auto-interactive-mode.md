---
title: "Auto Interactive Mode"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "cli/src/agent-cli.ts"
  - "cli/src/turn-executor.ts"
  - "core/chat-store.ts"
  - "tests/unit/agent-cli.test.js"
  - ".docs/done/2026/05/20/auto-interactive-mode.md"
updated_at: "2026-05-26"
---

# Auto Interactive Mode

Running `agent-cli` with no positional message starts an interactive terminal chat. The old behavior failed with `Missing user message`; the current behavior treats a blank invocation as a deliberate request to keep talking inside the same process.

## User Contract

- `agent-cli` starts the prompt.
- `agent-cli "hello"` still runs a single turn.
- `agent-cli --new-chat` starts interactive mode on a fresh chat.
- `/new` and `/clear` start a fresh chat.
- `/chats` lists persisted chats.
- `/use <chatId>` switches to an existing chat.
- `/exit` and `/quit` close the prompt.

There is no current `--remote` exception.

## Implementation Shape

`cli/src/agent-cli.ts` keeps argument parsing and mode selection in one place. After workspace setup, runtime resolution, prompt loading, skill discovery, and chat loading, the shell creates a normal turn executor. If there is no message, it calls `runInteractiveSession(...)`.

Interactive mode is not a second runtime. Each typed prompt uses the same `createTurnExecutor(...)` path as one-shot turns, and chat commands delegate to [[chat-store]].

## Why It Matters

The user can start with no ceremony, keep the same terminal open, and still get durable chat history under `.agent-world/chats`. The implementation keeps that convenience inside the local CLI instead of adding another product surface.
