---
title: "CLI Tool Trace Renderer"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "cli/src/tool-trace-renderer.ts"
  - "cli/src/agent-runtime.ts"
  - "core/runtime-client.ts"
  - "tests/unit/agent-cli.test.js"
  - ".docs/done/2026/05/16/port-trace-renderer.md"
updated_at: "2026-05-20"
---

# CLI Tool Trace Renderer

This file keeps verbose streaming output useful when tools run. The old path exposed tool activity too bluntly: either too little context to understand what happened, or raw payloads that were noisy in a terminal. The new renderer gives compact status rows while preserving the stdout/stderr contract described in [[bin-agent-cli-js]].

## What It Renders

`summarizeToolCall(...)` turns a tool name plus arguments into a short call summary. It has specific handling for shell commands, `load_skill`, path-style tools, file reads, file writes, search tools, and generic JSON-like payloads.

`summarizeToolResult(...)` turns a tool result into success or failure status, optional duration, and a bounded preview. Shell output gets line counts and short previews. Read-file results report requested lines or content line counts. API and content tools get concise saved-path or match-count summaries when that shape is available.

## Display Modes

The renderer supports three modes:

- `default`: compact terminal rows
- `verbose`: compact rows plus bounded JSON payloads
- `debug`: raw call or result fields

Agent CLI currently routes normal `--verbose` streaming diagnostics through the compact default mode. Debug formatting is available inside the renderer but is not exposed as a public CLI flag yet.

## Runtime Boundary

`cli/src/agent-runtime.ts` calls the renderer only for verbose stderr output. Stream trace persistence still records simple event text in `.agent-world/agents/{agentId}/events.jsonl`, so display formatting and saved trace shape do not drift together.

The renderer depends on [[lib-runtime-client-js]] forwarding tool results with duration and original arguments. That context lets it say what actually happened without parsing persisted chat messages after the fact.
