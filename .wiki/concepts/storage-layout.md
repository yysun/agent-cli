---
title: "Storage Layout"
type: "concept"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "core/paths.ts"
  - "core/workspace-store.ts"
  - "core/chat-store.ts"
  - ".gitignore"
updated_at: "2026-05-26"
---

# Storage Layout

This page explains where Agent CLI keeps saved state on disk. The current layout is intentionally small: `.agent-world/` under the resolved workspace root, with chats and workspace skills as the only live subtrees.

## Current Shape

```text
.agent-world/
  chats/
    current.json
    {chatId}/
      chat.json
      messages.jsonl
      summary.md
      events.jsonl
  skills/
    .../SKILL.md
```

`core/paths.ts` derives these paths from `WORKSPACE_ROOT`. `core/workspace-store.ts` creates `.agent-world`, `.agent-world/chats`, and `.agent-world/skills`. `core/chat-store.ts` owns chat metadata, transcripts, summaries, trace events, and current-chat selection.

## Workspace Root Matters

The root is selected before storage is created. A `--workspace` flag must put `.agent-world` under that workspace, not under the shell's invocation directory. Without the flag, storage belongs to the current working directory.

That invariant is covered by `tests/unit/chat-store.test.js` and `tests/unit/agent-cli.test.js`.

## What Is Gone

The current product does not support:

- `.chats` compatibility storage
- `.agent-world/worlds`
- workspace registries
- `world.json`
- `.agent-world/agents`
- `agent.json`
- queue files
- remote-host lock files

Those names appear in older wiki pages as stale historical context only.

## What Stays Out Of Git

`.agent-world/` is machine-local working state. It can contain chat transcripts and workspace skills, so it should stay out of normal source control.

## Related Pages

The chat persistence API is [[chat-store]]. Root selection is [[workspace-root-resolution]]. Runtime and env rules are [[configuration-and-runtime-precedence]].
