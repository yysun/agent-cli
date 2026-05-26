---
title: "CLI Entry And Host Modes"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "package.json"
  - "bin/agent-cli.js"
  - "cli/src/index.ts"
  - "cli/src/agent-cli.ts"
  - "cli/src/turn-executor.ts"
  - "cli/src/human-input-ui.ts"
  - "cli/src/pending-display.ts"
  - "cli/src/tool-trace-renderer.ts"
updated_at: "2026-05-26"
---

# CLI Entry And Host Modes

This is the main front door of the app. `bin/agent-cli.js` is the built file users run, while `cli/src/agent-cli.ts` owns argument parsing and mode selection.

## Main Responsibilities

- read flags such as `--workspace`, `--new-chat`, `--verbose`, `--stream-off`, and runtime overrides
- prepare the workspace and create `.agent-world` storage under that workspace
- resolve runtime config from `.env`, options, and CLI flags
- load `AGENTS.md`, skills, and the target chat
- choose between one-shot chat and [[auto-interactive-mode]]
- save completed turns through [[chat-store]]

## Local Chat Mode

For a normal run, this layer loads prompts, skills, config, and chat state, then hands the actual turn to `cli/src/turn-executor.ts`. The detailed path is [[chat-turn-lifecycle]].

## Interactive Mode

If there is no message, setup still happens and then the CLI starts a line-oriented prompt. `/new`, `/clear`, `/chats`, `/use <chatId>`, `/exit`, and `/quit` are handled locally. This is not a separate product surface; it uses the same turn executor and chat store.

## Removed Modes

There is no current `--remote`, relay host, named-agent setup, or `agent-world-cli` mode. If a page says otherwise, it is stale historical context.

## Output Rules

- assistant text is the only normal stdout content
- `--verbose` sends diagnostics to stderr
- `--stream-off` suppresses chunked output and prints final text
- TTY pending animation appears only while waiting for assistant text
- empty skill scopes are omitted from verbose startup diagnostics

Verbose tool display goes through [[cli-tool-trace-renderer]].
