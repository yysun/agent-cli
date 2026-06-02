---
title: "Workspace Root Resolution"
type: "concept"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "AGENTS.md"
  - "cli/src/agent-cli.ts"
  - "core/paths.ts"
  - "core/workspace-environment.ts"
  - "core/workspace-store.ts"
updated_at: "2026-06-02"
---

# Workspace Root Resolution

The workspace root decides where Agent CLI reads `AGENTS.md`, stores `.agent-world`, and finds workspace skills. It must not drift from the user's selected workspace.

## Precedence

The current order is:

1. `--workspace <path>`
2. current working directory

## `.env` Location

`.env` is read from the selected workspace root. It provides credentials and runtime defaults only; it does not choose the workspace.

Only allowlisted keys are copied into `process.env`; see [[configuration-and-runtime-precedence]].

## Storage Guarantee

`.agent-world` must be created under the resolved workspace root.

This is a fragile contract because a cwd/workspace mix-up silently writes chats to the wrong place. Tests cover both explicit `--workspace` selection and cwd fallback.

## Compatibility

No legacy root selector aliases are supported. New code should use workspace terminology.
