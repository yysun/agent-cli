---
title: "Chat Turn Lifecycle"
type: "flow"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "cli/src/agent-cli.ts"
  - "cli/src/turn-executor.ts"
  - "core/agent-runtime.ts"
  - "core/chat-store.ts"
  - "core/workspace-environment.ts"
updated_at: "2026-05-26"
---

# Chat Turn Lifecycle

This is the path for a normal local run such as `agent-cli "Summarize this repo"`.

1. `cli/src/agent-cli.ts` parses flags and the user message.
2. `prepareWorkspaceEnvironment()` resolves the workspace and loads allowlisted `.env` keys from the invocation cwd.
3. `ensureWorkspaceWorld()` creates `.agent-world`, `.agent-world/chats`, and `.agent-world/skills` under the resolved workspace.
4. Runtime defaults from `.env` and CLI overrides are normalized by `resolveEffectiveAgentConfig()`.
5. The CLI loads `AGENTS.md`, skill inventory, and the requested chat.
6. `createTurnExecutor()` calls `runChatTurn()` in [[model-runner-handoff]].
7. `core/agent-runtime.ts` validates provider/model settings, creates the `llm-runtime` environment, builds system messages, and runs the completion loop.
8. Tool calls are handled by `llm-runtime`; terminal `ask_user_input` calls are intercepted by the CLI.
9. Completed messages are saved by [[chat-store]] under `.agent-world/chats/{chatId}`.
10. Optional stream-trace events are saved to the chat's `events.jsonl`.

## Interactive Mode

If the CLI has no positional message, setup still happens and then the process enters [[auto-interactive-mode]]. `/new`, `/clear`, `/chats`, and `/use <chatId>` call the same chat-store functions as one-shot turns.

## Streaming Behavior

- Text chunks stream to stdout by default.
- `--stream-off` prints only the final assistant response.
- Verbose diagnostics and tool traces go to stderr.
- Empty skill scopes are omitted from verbose startup diagnostics, so the CLI no longer prints `project: none`.

## What Does Not Persist

The built-in prompt, `AGENTS.md`, and generated skill inventory message are request-time inputs only. They are not written into the chat transcript. [[prompt-and-skill-loading]] explains that boundary.
