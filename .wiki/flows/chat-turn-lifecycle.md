---
title: "Chat Turn Lifecycle"
type: "flow"
status: "active"
language: "default"
source_paths:
  - "cli/src/cli-shell.ts"
  - "cli/src/agent-runtime.ts"
  - "core/runtime-client.ts"
  - "core/session-store.ts"
  - "README.md"
updated_at: "2026-05-16"
---

# Chat Turn Lifecycle

This is the path for a normal local run such as `agent-cli "Summarize this repo"`. In plain terms, it shows how a typed prompt becomes a saved reply on disk.

1. The bundled CLI starts in [[bin-agent-cli-js]] and reads the flags plus the user message.
2. It loads the local `.env` file from the chosen project root, but only copies the allowed credential keys into `process.env`.
3. It merges repo defaults, optional default-agent overrides, and CLI flags through [[lib-agent-config-js]].
4. It checks that the selected provider and model are usable before any turn starts.
5. It loads the built-in prompt, optional `AGENTS.md`, the discovered skill list, and the target chat.
6. `cli/src/agent-runtime.ts` calls `runChatTurn()` in [[lib-runtime-client-js]].
7. The runtime passes the chat into `llm-runtime`, points tools at the resolved project root, and places the system instructions ahead of saved chat history.
8. If the model calls tools, the turn continues through `respondWithTools(...)` until the model produces the final assistant text.
9. Completed messages are saved under `.agent-world/chats/{chatId}` and optional stream-trace events are saved under `.agent-world/agents/{agentId}/events.jsonl`.

## Streaming Behavior

- Text chunks stream to stdout by default.
- Warnings, reasoning, errors, and tool names go to stderr only when `--verbose` is enabled.
- `--stream-off` disables chunked text output and prints only the final assistant response.

## What Does Not Persist

The built-in prompt, `AGENTS.md`, and the generated skill inventory message are request-time inputs only. They shape the turn, but they are not written into the saved chat transcript.

That separation is what lets the repo evolve prompts and skills without rewriting prior chat history. [[configuration-and-runtime-precedence]] and [[storage-layout]] describe the related configuration and file boundaries.