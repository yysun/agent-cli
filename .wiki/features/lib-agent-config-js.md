---
title: "Runtime Config Loading And Normalization"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "runtime.json"
  - "core/agent-config.ts"
  - "core/paths.ts"
  - "README.md"
updated_at: "2026-05-16"
---

# Runtime Settings Cleanup

This module takes setting input from files and flags and turns it into one clean set of values the app can trust.

## What It Loads

- repo defaults from `runtime.json`
- optional default-agent overrides from `.agent-world/agents/{agentId}/runtime.json`
- runtime overrides coming from CLI flags

The merged result is the final setting set used by [[bin-agent-cli-js]] and [[lib-runtime-client-js]].

## What It Normalizes

The module understands the main settings used across the repo:

- provider and model
- temperature and max token limits
- tool permission and reasoning effort
- web search settings
- past message count
- stream and stream-trace flags

It also accepts a few older or shorter names such as `modal`, `tokens`, `permissions`, and `reasoning`, then rewrites them into the current names so the rest of the app does not have to care.

## What It Does Not Do

It does not load provider secrets. Credentials still come from `.env` or the process environment, which keeps behavior settings separate from secret values. [[configuration-and-runtime-precedence]] covers that split.

## Validation Style

- strings must be non-empty when present
- integer fields must be positive or non-negative depending on the setting
- enum fields are checked against explicit allowed values
- `webSearch` is flexible on input, but narrows to `true`, `false`, or `{ searchContextSize }`

That checking happens early so bad settings fail before the CLI enters a chat turn or starts a remote host.