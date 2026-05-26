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
updated_at: "2026-05-26"
---

# Workspace Root Resolution

The workspace root decides where Agent CLI reads `AGENTS.md`, stores `.agent-world`, and finds workspace skills. It must not drift from the user's selected workspace.

## Precedence

The current order is:

1. `--workspace <path>`
2. legacy `--project <path>`
3. `AGENT_CLI_WORKSPACE`
4. `AGENT_CLI_WORKSPACE` loaded from the invocation cwd `.env`
5. current working directory

After resolution, the absolute root is published back to `AGENT_CLI_WORKSPACE`.

## `.env` Location

`.env` is read from the invocation cwd, not from the selected workspace. This lets a launch directory choose a workspace and provide credentials or runtime defaults without requiring the selected workspace to contain secrets.

Only allowlisted keys are copied into `process.env`; see [[configuration-and-runtime-precedence]].

## Storage Guarantee

`.agent-world` must be created under the resolved workspace root. `core/workspace-store.ts` re-syncs from `AGENT_CLI_WORKSPACE` before creating directories, which protects against modules imported before the env var is set.

This is a fragile contract because a cwd/workspace mix-up silently writes chats to the wrong place. Tests cover both `--workspace` and `.env` workspace selection paths.

## Compatibility

`--project` and `configureProjectRoot(...)` remain compatibility names. New code should use workspace terminology.
