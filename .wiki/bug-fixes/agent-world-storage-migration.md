---
title: "Agent-World Storage Migration"
type: "bug-fix"
status: "active"
language: "default"
source_paths:
  - ".docs/done/2026/05/14/agent-world-storage.md"
  - "core/session-store.ts"
  - "core/paths.ts"
  - "tests/unit/session-store.test.js"
  - "tests/e2e/agent-cli-remote.e2e.test.js"
updated_at: "2026-05-16"
---

# Agent-World Storage Migration

The project recently moved from older chat-storage layouts to one clear save folder: `.agent-world`.

## What Changed

- `world.json` became the source of truth for `defaultAgentId` and `currentChatId`
- chat data moved into `.agent-world/chats/{chatId}`
- agent-scoped state and event traces moved into `.agent-world/agents/{agentId}`
- the remote-host lock moved into `.agent-world/remote-host.lock.json`

## Why It Was Necessary

The previous layout mixed current selection state, chat data, and remote state in ways that made chat switching and remote-host consistency harder to follow. The migration fixed that by giving each job its own file layout.

## User-Visible Fixes

- remote `/new` and `/use` now keep the agent's selected chat in sync
- runtime overrides can be split cleanly between repo-wide defaults and default-agent overrides
- docs and build layout now match the real runtime paths

This migration is the foundation behind [[storage-layout]] and the current [[lib-session-store-js]] behavior.