---
title: "Chat Store"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "core/paths.ts"
  - "core/workspace-store.ts"
  - "core/chat-store.ts"
  - "README.md"
  - ".docs/done/2026/05/26/global-skills-env.md"
updated_at: "2026-05-26"
---

# Chat Store

`core/chat-store.ts` is the part of the app that saves durable chat data to disk. It used to be named `world-store`, but the product no longer has worlds, persisted agents, queues, or remote host state. The new name matches the real job: chat persistence.

## What It Persists

- `.agent-world/chats/current.json` for current-chat selection
- `.agent-world/chats/{chatId}/chat.json` for chat metadata
- `.agent-world/chats/{chatId}/messages.jsonl` for transcript messages
- `.agent-world/chats/{chatId}/summary.md` as a reserved summary file
- `.agent-world/chats/{chatId}/events.jsonl` for optional stream-trace events

[[storage-layout]] breaks down the meaning of each file.

## Workspace Bootstrap

Chat operations call `ensureWorkspaceWorld()` before touching files. That creates the storage roots under the resolved workspace. `loadRequestedChat({ newChat: true })` also initializes storage, which prevents a new transient chat from skipping `.agent-world` setup.

`core/workspace-store.ts` re-resolves `AGENT_CLI_WORKSPACE` before creating folders. That protects app-style flows where modules were imported before the workspace env var was set.

## Persistence Style

- chat IDs are timestamp-based with a short UUID suffix
- JSON and text files are written through temporary files and atomic rename
- messages and events use JSONL, one JSON record per line
- malformed missing chat files raise clear errors
- current-chat selection is independent from transcript files

The store also normalizes timestamps so chat ordering remains stable when messages and metadata come from different write paths.

## Who Uses It

- `cli/src/agent-cli.ts` loads, creates, lists, and selects chats for interactive commands.
- `cli/src/turn-executor.ts` persists completed turns and trace events.
- `electron/main.ts` uses the same helpers for workspace chat IPC.

That shared store is what keeps one-shot CLI turns, interactive CLI commands, and the Electron shell on one chat model.

## What It Does Not Own

It does not store agents, queues, remote locks, runtime config, provider keys, or skills. Runtime config is [[configuration-and-runtime-precedence]]. Skills are [[prompt-and-skill-loading]].
