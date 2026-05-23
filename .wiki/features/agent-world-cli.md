---
title: "Agent World CLI"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "package.json"
  - "bin/agent-world-cli.js"
  - "cli/src/agent-world-cli.ts"
  - "core/agent-world-runtime.ts"
  - "core/workspace-environment.ts"
  - "tests/unit/agent-world-cli.test.js"
  - "tests/e2e/agent-world-cli.e2e.test.js"
  - "tests/e2e/agent-world-cli-interactive.e2e.test.js"
  - "tests/e2e/agent-world-cli-flow-matrix.e2e.test.js"
  - ".docs/done/2026/05/23/agent-world-cli-store-rename.md"
  - ".docs/done/2026/05/23/align-agent-world-workspace.md"
updated_at: "2026-05-23"
---

# Agent World CLI

`agent-world-cli` is the local command surface for inspecting and mutating the saved Agent World state. It is not a replacement storage system. It opens the same workspace root as `agent-cli`, then delegates world, agent, chat, message, send, and queue behavior to [[agent-world-runtime]].

## User Contract

- `world` prints a JSON snapshot of the world.
- `agents list/create/delete` manages `.agent-world/agents/{agentId}`.
- `chats list/new/use/delete` manages saved chats and current-chat selection.
- `messages list/edit/delete-from` reads and mutates chat transcripts.
- `send` runs a real model turn unless `--queue` is present.
- `queue list/pause/resume/stop/clear` manages durable per-chat queue rows.
- no arguments or `interactive` starts a slash-command terminal shell.

The output is JSON-first for scripts, while interactive mode reuses the same dispatcher so it does not drift from one-shot behavior.

## Workspace Setup

The CLI accepts `--workspace` as the canonical root flag and keeps `--project` as a compatibility alias. It uses `core/workspace-environment.ts`, the same preparation path as `agent-cli`, so prompt files, runtime files, `.env`, and `.agent-world` resolve from one workspace. [[workspace-root-resolution]] covers the shared root contract.

## Queue Boundary

`send --queue` is intentionally provider-free. It persists a queued user message but does not dispatch it to the model. Direct `send` still uses the real runtime and can require provider credentials.

That distinction matters because queues are local steering state, not hidden remote execution. The storage side lives in [[world-store]].
