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
  - ".docs/done/2026/05/20/auto-interactive-mode.md"
  - ".docs/done/2026/05/20/agent-id-config.md"
  - ".docs/done/2026/05/23/cli-input-ui.md"
updated_at: "2026-05-23"
---

# Chat Turn Lifecycle

This is the path for a normal local run such as `agent-cli "Summarize this repo"`. In plain terms, it shows how a typed prompt becomes a saved reply on disk.

1. The bundled CLI starts in [[bin-agent-cli-js]] and reads the flags plus the user message.
2. It loads the local `.env` file from the chosen project root, but only copies the allowed credential keys into `process.env`.
3. It selects or initializes the active agent, defaulting to `default` unless [[named-agent-selection]] flags say otherwise.
4. It merges repo defaults, selected-agent metadata, selected-agent runtime overrides, and CLI flags through [[lib-agent-config-js]].
5. It checks that the selected provider and model are usable before any turn starts.
6. It loads the built-in prompt, optional `AGENTS.md`, the discovered skill list, and the target chat.
7. `cli/src/agent-runtime.ts` calls `runChatTurn()` in [[lib-runtime-client-js]].
8. The runtime passes the chat into `llm-runtime`, points tools at the resolved project root, and places the system instructions ahead of saved chat history.
9. If the model calls tools, the turn continues through the `llm-runtime` completion loop until the model produces the final assistant text.
10. Completed messages are saved under `.agent-world/chats/{chatId}` and optional stream-trace events are saved under `.agent-world/agents/{agentId}/events.jsonl`.

When the CLI has no message and is not in remote mode, setup through step 6 still happens and then the shell enters [[auto-interactive-mode]]. Each typed prompt uses the same turn executor and persistence path.

## Streaming Behavior

- Text chunks stream to stdout by default.
- Warnings, reasoning, errors, and tool names go to stderr only when `--verbose` is enabled.
- `--stream-off` disables chunked text output and prints only the final assistant response.
- Streamed TTY turns can show a short pending animation while waiting for text; redirected output does not get animation escape sequences.

## Human Input Tool Calls

When the model calls an `ask_user_input`-family tool, the CLI intercepts that call before default tool execution. [[cli-input-ui]] renders the question/options in the terminal, collects the answer, and returns it as a normal tool result so the same completion loop can continue.

If there is no interactive prompt available, the CLI returns an `unavailable` artifact instead of blocking forever.

## What Does Not Persist

The built-in prompt, `AGENTS.md`, and the generated skill inventory message are request-time inputs only. They shape the turn, but they are not written into the saved chat transcript.

That separation is what lets the repo evolve prompts and skills without rewriting prior chat history. [[configuration-and-runtime-precedence]] and [[storage-layout]] describe the related configuration and file boundaries.
