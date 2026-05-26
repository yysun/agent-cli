---
title: "Agent World Runtime"
type: "feature"
status: "stale"
language: "default"
source_paths:
  - "core/agent-world-runtime.ts"
  - "core/chat-store.ts"
  - "core/agent-runtime.ts"
  - "core/index.ts"
  - "core/agent-files.ts"
  - "tests/unit/agent-world-runtime.test.js"
  - ".docs/done/2026/05/23/world-api-runtime.md"
  - ".docs/done/2026/05/23/agent-world-runtime-boundary.md"
updated_at: "2026-05-26"
---

# Agent World Runtime

> Stale: `core/agent-world-runtime.ts` and its tests were deleted when the repo was simplified to local `agent-cli`, core runtime, chat storage, and Electron.

`core/agent-world-runtime.ts` is the concrete workspace-local API over Agent CLI's saved world. It gives higher-level callers a stable surface for worlds, agents, chats, messages, queues, skills, events, memory, and sends without replacing the existing chat turn engine.

## What It Owns

- world snapshots and metadata updates
- agent listing, creation, updates, deletion, and memory helpers
- chat listing, creation, selection, deletion, and message mutation
- paragraph-beginning `@agent` routing for sends
- durable per-chat queues
- event emission for messages, runs, tools, agents, chats, and queues

The runtime still calls `runChatTurn()` in [[model-runner-handoff]] for actual model execution. That keeps provider validation, prompt layering, tool execution, and stream handling in one place.

## Boundary Decision

The runtime moved from `cli/src` into `core` so both programmatic callers and [[agent-world-cli]] can use it. Human-in-the-loop terminal UI stayed in the CLI layer. Core accepts a generic tool-call handler hook; it does not import terminal prompt code.

That split is important: core can route and persist world behavior, while shells decide how to ask a human questions.

## Non-Goals

This is not the full orchestration layer from another app. Import/export, SQLite-backed storage, heartbeat scheduling, full branching, and HITL replay either fail explicitly or return inert placeholders until they become product scope.
