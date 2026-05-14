---
title: "LLM Runtime Bridge"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "core/runtime-client.ts"
  - "core/paths.ts"
  - "README.md"
updated_at: "2026-05-16"
---

# Model Runner Handoff

This module is the handoff point between Agent CLI's saved chat state and the shared model-running library `llm-runtime`.

## Provider Validation

It validates the selected provider and builds the provider-specific config from environment variables. The supported providers are `openai`, `anthropic`, `google`, `azure`, `xai`, `openai-compatible`, and `ollama`.

The validation is strict on purpose: if the required credential variables are missing, startup fails before a turn begins.

## Tool Execution Context

Tool calls run with `workingDirectory: REPO_ROOT`, which means tools follow the same root resolution as prompts, skills, runtime files, and `.agent-world` storage.

That shared root is one of the repo's most important invariants, and it is defined in [[configuration-and-runtime-precedence]].

## Message Layering

Before saved chat messages are added, the runtime prepends:

1. the built-in system prompt
2. optional `AGENTS.md` content
3. the generated skill inventory message

That keeps long-term persisted chat history separate from repo instructions and skill hints.

## Turn Execution

The module uses `respondWithTools(...)` so the model can call `load_skill`, receive the result, and continue the same turn. This is the engine underneath [[chat-turn-lifecycle]].

## Cleanup

The `llm-runtime` environment is always disposed in a cleanup path, even on failures. That helps prevent leaked runtime state between turns and is covered by unit tests.