---
title: "LLM Runtime Bridge"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "package.json"
  - "core/runtime-client.ts"
  - "core/paths.ts"
  - "README.md"
  - ".docs/done/2026/05/16/upgrade-llm-runtime-v0-5-0.md"
updated_at: "2026-05-20"
---

# Model Runner Handoff

This module is the handoff point between Agent CLI's saved chat state and the shared model-running library `llm-runtime`. The repo currently pins `llm-runtime` to `0.5.1` and uses the 0.5 completion-loop API directly.

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

The module owns the turn loop through `runCompletionLoop(...)`, not the package's higher-level prompt wrapper. That choice matters because Agent CLI wants local ownership of the exact system prompt: built-in prompt, optional `AGENTS.md`, then skill inventory.

When the model requests tools, `onToolCallsResponse(...)` appends the assistant tool-call message, executes each tool, appends the tool result, and tells the loop to continue. The CLI still owns approval gating before execution, so rejected calls become explicit rejected tool-result artifacts instead of silently disappearing.

The runtime normally receives a provided tool executor from the loop. If it does not, Agent CLI falls back to `executeToolCall(...)` against its own created runtime. That fallback is narrow but important: `load_skill` and other runtime tools still work even when the lower-level callback omits a bound executor.

Tool results are forwarded with their original arguments and duration so [[cli-src-tool-trace-renderer-ts]] can print useful verbose diagnostics without changing the persisted chat-message shape.

## Cleanup

The `llm-runtime` environment is always disposed in a cleanup path, even on failures. That helps prevent leaked runtime state between turns and is covered by unit tests.
