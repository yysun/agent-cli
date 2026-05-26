---
title: "Runtime Config Loading And Normalization"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - ".env.example"
  - "core/agent-config.ts"
  - "core/workspace-environment.ts"
updated_at: "2026-05-26"
---

# Runtime Config Loading And Normalization

`core/agent-config.ts` turns raw runtime settings into one clean object the CLI and Electron can pass to the model runtime.

## What It Loads

Runtime defaults come from `AGENT_CLI_*` environment variables, usually populated from invocation cwd `.env` by `core/workspace-environment.ts`. CLI flags and programmatic options can override those defaults.

There is no current `runtime.json`, selected-agent metadata, or selected-agent runtime override file.

## What It Normalizes

- provider and model
- temperature and max token limits
- tool permission and reasoning effort
- web search settings
- past message count
- stream and stream-trace flags

It still accepts older aliases such as `modal`, `tokens`, `permissions`, and `reasoning`, then rewrites them into the current names.

## What It Does Not Do

It does not load provider secrets directly and does not choose the workspace. Credentials are environment values validated later by [[model-runner-handoff]]. Workspace selection is [[workspace-root-resolution]].

## Validation Style

Bad values fail early: invalid numbers, unsupported enum values, and malformed booleans throw clear config errors before a model turn starts.
