---
title: "Storage Layout"
type: "concept"
status: "active"
language: "default"
source_paths:
  - "core/paths.ts"
  - "core/session-store.ts"
  - ".gitignore"
  - "README.md"
  - ".docs/done/2026/05/14/agent-world-storage.md"
updated_at: "2026-05-20"
---

# Storage Layout

This page explains where Agent CLI keeps its saved state on disk. The main folder is `.agent-world/`, and it sits under the same project root that also holds prompts, skills, settings, and `.env`.

The project root can be chosen with `--project <path>`, then `AGENT_CLI_ROOT`, then the current working directory. Once that root is configured, all storage path helpers point at the matching `.agent-world/` tree. That prevents a remote host or one-shot turn from mixing state across projects.

## Top-Level Files And Folders

- `.agent-world/world.json` stores the app-level pointer to the selected chat and default agent.
- `.agent-world/chats/{chatId}/chat.json` stores chat metadata.
- `.agent-world/chats/{chatId}/messages.jsonl` stores the conversation transcript in order.
- `.agent-world/chats/{chatId}/summary.md` is reserved for a shorter recap of the chat.
- `.agent-world/agents/{agentId}/agent.json` stores agent metadata.
- `.agent-world/agents/{agentId}/state.json` stores changeable agent state, including remote-session details.
- `.agent-world/agents/{agentId}/events.jsonl` stores streaming event logs.
- `.agent-world/remote-host.lock.json` prevents two remote hosts from trying to control the same project at once.

## Source Of Truth

`world.json` is the main pointer file for the current chat and the default agent. The repo no longer relies on the older current-chat pointer layout as the main state record.

## What Stays Out Of Git

The save folder is meant to be machine-local working state, so `.agent-world/` is ignored by git. That keeps saved chats, local agent state, and remote locks out of normal source control.

## Why This Model Is Cleaner

It groups saved data by job instead of mixing everything together:

- world data chooses the active context
- chat data stores conversation history
- agent data stores agent-scoped state across turns and chats

That makes it easier for a newcomer to answer simple questions like "which chat is active?" or "where did this remote lock come from?" without hunting through mixed-purpose files.

The module that implements this contract is [[lib-session-store-js]].
