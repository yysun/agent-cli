---
title: "World, Chat, And Agent Persistence"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "core/paths.ts"
  - "core/session-store.ts"
  - "README.md"
  - ".docs/done/2026/05/14/agent-world-storage.md"
  - ".docs/done/2026/05/20/agent-id-config.md"
  - ".docs/done/2026/05/20/auto-interactive-mode.md"
updated_at: "2026-05-23"
---

# Saved State On Disk

`core/session-store.ts` is the part of the app that saves data to disk. The current save format is `.agent-world` only; the older chat-storage layouts are no longer the active format.

## What It Persists

- `world.json` for the selected chat and default agent
- chat directories under `.agent-world/chats/{chatId}`
- agent directories under `.agent-world/agents/{agentId}`, including `agent.json`, `runtime.json`, state, inbox, events, and memory files
- the remote-host coordination lock at `.agent-world/remote-host.lock.json`

[[storage-layout]] breaks down the meaning of each file.

The default world and default agent names are derived from the configured project root when storage is bootstrapped. That detail matters now that `--project <path>` can choose a project without changing the shell's current directory.

Named-agent selection is part of this module's contract. `ensureAgentSelection(...)` initializes the selected agent and updates `world.json.defaultAgentId`, while preserving the `.agent-world/agents/{agentId}` layout described in [[named-agent-selection]].

## Why The Split Matters

The world record answers "which chat and agent are active now?". The chat directory answers "what happened in this conversation?". The agent directory answers "what state and event traces belong to this agent across chats?"

That split made the `.agent-world` migration possible without mixing chat history, remote-session state, and per-agent setting overrides into one flat directory.

## Persistence Style

- chat IDs are timestamp-based with a short UUID suffix
- JSON and text files are written by saving a temporary file first and renaming it into place, which helps avoid half-written files
- JSONL, meaning one JSON record per line, is used for message and event histories that grow over time

The store also cleans up timestamps so chat ordering stays stable even when messages and chat metadata come from different write paths.

## Remote Coordination

Remote host state is local too. The session store acquires, updates, and releases the remote lock and keeps the selected chat in sync when remote clients use `/new` or `/use`.

That behavior is a core part of [[remote-session-lifecycle]] and one of the main outcomes of [[agent-world-storage-migration]].

The same chat helpers are now used by [[auto-interactive-mode]] for `/new`, `/clear`, `/chats`, and `/use <chatId>`, so local terminal chat commands and remote browser chat commands share the persistence model.
