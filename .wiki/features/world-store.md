---
title: "World Store"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "core/paths.ts"
  - "core/world-store.ts"
  - "README.md"
  - ".docs/done/2026/05/14/agent-world-storage.md"
  - ".docs/done/2026/05/20/agent-id-config.md"
  - ".docs/done/2026/05/20/auto-interactive-mode.md"
  - ".docs/done/2026/05/23/agent-world-cli-store-rename.md"
  - ".docs/done/2026/05/23/world-api-runtime.md"
updated_at: "2026-05-23"
---

# World Store

`core/world-store.ts` is the part of the app that saves durable world data to disk. It was renamed from `session-store` because it now owns more than chat transcripts: world metadata, named agents, messages, queues, memory, event logs, and the remote-host lock.

## What It Persists

- `world.json` for the selected chat and default agent
- chat directories under `.agent-world/chats/{chatId}`
- agent directories under `.agent-world/agents/{agentId}`, including `agent.json`, `runtime.json`, state, inbox, events, memory files, and memory logs
- queue files under `.agent-world/queues/{chatId}.json`
- the remote-host coordination lock at `.agent-world/remote-host.lock.json`

[[storage-layout]] breaks down the meaning of each file.

The default world and default agent names are derived from the configured workspace root when storage is bootstrapped. That detail matters now that `--workspace <path>` can choose a workspace without changing the shell's current directory.

Named-agent selection is part of this module's contract. `ensureAgentSelection(...)` initializes the selected agent and updates `world.json.defaultAgentId`, while preserving the `.agent-world/agents/{agentId}` layout described in [[named-agent-selection]].

## Why The Split Matters

The world record answers "which chat and agent are active now?". The chat directory answers "what happened in this conversation?". The agent directory answers "what state and event traces belong to this agent across chats?"

That split made the `.agent-world` migration possible without mixing chat history, remote-session state, per-agent setting overrides, and queued work into one flat directory.

## Persistence Style

- chat IDs are timestamp-based with a short UUID suffix
- JSON and text files are written by saving a temporary file first and renaming it into place, which helps avoid half-written files
- JSONL, meaning one JSON record per line, is used for message and event histories that grow over time
- queues are stored per chat so restart recovery can reason about pending work without scanning every agent

The store also cleans up timestamps so chat ordering stays stable even when messages and chat metadata come from different write paths.

## Remote Coordination

Remote host state is local too. The world store acquires, updates, and releases the remote lock and keeps the selected chat in sync when remote clients use `/new` or `/use`.

That behavior is a core part of [[remote-session-lifecycle]] and one of the main outcomes of [[agent-world-storage-migration]].

The same chat helpers are now used by [[auto-interactive-mode]] for `/new`, `/clear`, `/chats`, and `/use <chatId>`, and by [[agent-world-cli]] for JSON-first world operations. Local terminal chat commands, remote browser chat commands, and world API commands all share the persistence model.
