---
title: "Configuration And Runtime Precedence"
type: "concept"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - ".env.example"
  - "cli/src/agent-cli.ts"
  - "core/agent-config.ts"
  - "core/agent-runtime.ts"
  - "core/workspace-environment.ts"
updated_at: "2026-05-26"
---

# Configuration And Runtime Precedence

This page explains where the app gets settings and which source wins. The important shift is that runtime defaults now live in `.env` and CLI flags, not in `runtime.json`, `world.json`, or `agent.json`.

## Workspace Selection

The workspace root is selected first:

1. `--workspace <path>`
2. legacy `--project <path>`
3. `AGENT_CLI_WORKSPACE`
4. `AGENT_CLI_WORKSPACE` from the invocation cwd `.env`
5. current working directory

The resolved absolute path is published back to `AGENT_CLI_WORKSPACE`. [[workspace-root-resolution]] covers why this matters for storage and prompt loading.

## Runtime Layers

The effective runtime config is:

1. allowlisted `AGENT_CLI_*` defaults from `.env`
2. programmatic options passed by Electron or tests
3. CLI runtime flags

`core/agent-config.ts` normalizes aliases and validates values such as temperature, max tokens, tool permission, reasoning effort, history count, stream flags, and web search. CLI flags override `.env`.

## What `.env` Can Set

`core/workspace-environment.ts` allowlists provider credentials, runtime defaults, and optional workspace selection. It also creates a cwd `.env.example` when neither `.env` nor `.env.example` exists.

Allowed runtime defaults include:

- `AGENT_CLI_PROVIDER`
- `AGENT_CLI_MODEL`
- `AGENT_CLI_TEMPERATURE`
- `AGENT_CLI_MAX_TOKENS`
- `AGENT_CLI_TOOL_PERMISSION`
- `AGENT_CLI_REASONING_EFFORT`
- `AGENT_CLI_PAST_MESSAGES`
- `AGENT_CLI_STREAM`
- `AGENT_CLI_STREAM_TRACE`
- `AGENT_CLI_WEB_SEARCH`
- `AGENT_CLI_GLOBAL_SKILLS`

Provider validation still happens in `core/agent-runtime.ts` before a turn starts. Missing credentials or model settings fail early.

## What Is Gone

There is no `runtime.json`, `agent.json`, `world.json`, selected-agent config, relay URL config, or remote mode in the current product. Pages that describe those layers are stale historical context.

## Why The Boundary Matters

The `.env` loader is allowlist-based so secrets and supported runtime defaults can be read without turning arbitrary environment values into application state. That keeps local startup predictable and prevents stale product surfaces from sneaking back through config.
